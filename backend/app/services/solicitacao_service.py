from datetime import datetime, timezone

from fastapi import HTTPException, status

from sqlalchemy.orm import Session

from app.models.enums import StatusSolicitacaoEnum
from app.models.solicitacao_transferencia import SolicitacaoTransferencia
from app.repositories.medicamento_repository import MedicamentoRepository
from app.repositories.solicitacao_repository import SolicitacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.movimentacao import TransferenciaEnviarCreate
from app.schemas.solicitacao import (
    SolicitacaoAceitarCreate,
    SolicitacaoCreate,
    SolicitacaoRecusarCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.transferencia_service import NOME_UNIDADE_CAF, TransferenciaService


class SolicitacaoService:
    """Solicitação de transferência satélite -> CAF (2026-08-20): qualquer
    perfil da unidade solicitante pode pedir (mesmo padrão de quem já
    registra Saída/confirma recebimento de transferência); aceitar/
    recusar fica restrito a Farmacêutico/Coordenador na CAF, porque
    aceitar É, no fundo, disparar `TransferenciaService.enviar` — mesma
    regra de quem já pode enviar uma transferência normal."""

    def __init__(self):
        self.repository = SolicitacaoRepository()
        self.unidade_repository = UnidadeRepository()
        self.medicamento_repository = MedicamentoRepository()
        self.transferencia_service = TransferenciaService()

    @staticmethod
    def _eh_caf(unidade) -> bool:
        return unidade is not None and unidade.nome.strip().upper() == NOME_UNIDADE_CAF

    def criar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: SolicitacaoCreate,
    ) -> SolicitacaoTransferencia:
        unidade_ativa = self.unidade_repository.get_by_id(db, unidade_ativa_id)
        if unidade_ativa is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unidade ativa não encontrada.",
            )

        if self._eh_caf(unidade_ativa):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A CAF é quem atende solicitações — não solicita "
                "transferência para si mesma.",
            )

        medicamento = self.medicamento_repository.get_by_id(db, dados.medicamento_id)
        if medicamento is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Medicamento não encontrado.",
            )

        solicitacao = SolicitacaoTransferencia(
            unidade_solicitante_id=unidade_ativa_id,
            medicamento_id=dados.medicamento_id,
            quantidade_desejada=dados.quantidade_desejada,
            observacao=dados.observacao,
            usuario_solicitante_id=usuario.id,
        )

        return self.repository.create(db, solicitacao)

    def listar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        status_filtro: StatusSolicitacaoEnum | None,
    ) -> list[SolicitacaoTransferencia]:
        """CAF vê a fila inteira (de todas as satélites); qualquer outra
        unidade só vê as próprias solicitações — mesma ideia de escopo
        de `resolver_unidade_escopo`, mas aqui invertida (quem enxerga
        "tudo" é sempre a CAF, não depende do perfil de quem está
        logado)."""
        unidade_ativa = self.unidade_repository.get_by_id(db, unidade_ativa_id)
        unidade_filtro = None if self._eh_caf(unidade_ativa) else unidade_ativa_id

        return self.repository.listar(
            db, unidade_solicitante_id=unidade_filtro, status=status_filtro
        )

    def aceitar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        solicitacao_id: int,
        dados: SolicitacaoAceitarCreate,
    ) -> SolicitacaoTransferencia:
        unidade_ativa = self.unidade_repository.get_by_id(db, unidade_ativa_id)
        if not self._eh_caf(unidade_ativa):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só a CAF pode aceitar uma solicitação de transferência.",
            )

        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Solicitação não encontrada.",
            )

        if solicitacao.status != StatusSolicitacaoEnum.pendente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esta solicitação já foi atendida.",
            )

        # Reaproveita o fluxo de sempre — a solicitação só decide QUEM
        # é o destino; o lote/quantidade enviados continuam sendo
        # escolha da CAF na hora de aceitar.
        movimentacao = self.transferencia_service.enviar(
            db,
            usuario,
            unidade_ativa_id,
            TransferenciaEnviarCreate(
                lote_id=dados.lote_id,
                quantidade=dados.quantidade,
                unidade_destino_id=solicitacao.unidade_solicitante_id,
            ),
        )

        solicitacao.status = StatusSolicitacaoEnum.aceita
        solicitacao.movimentacao_id = movimentacao.id
        solicitacao.usuario_atendimento_id = usuario.id
        solicitacao.data_atendimento = datetime.now(timezone.utc)

        return self.repository.salvar(db, solicitacao)

    def recusar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        solicitacao_id: int,
        dados: SolicitacaoRecusarCreate,
    ) -> SolicitacaoTransferencia:
        unidade_ativa = self.unidade_repository.get_by_id(db, unidade_ativa_id)
        if not self._eh_caf(unidade_ativa):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só a CAF pode recusar uma solicitação de transferência.",
            )

        if not dados.motivo_recusa or not dados.motivo_recusa.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Motivo da recusa é obrigatório.",
            )

        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Solicitação não encontrada.",
            )

        if solicitacao.status != StatusSolicitacaoEnum.pendente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esta solicitação já foi atendida.",
            )

        solicitacao.status = StatusSolicitacaoEnum.recusada
        solicitacao.motivo_recusa = dados.motivo_recusa.strip()
        solicitacao.usuario_atendimento_id = usuario.id
        solicitacao.data_atendimento = datetime.now(timezone.utc)

        return self.repository.salvar(db, solicitacao)
