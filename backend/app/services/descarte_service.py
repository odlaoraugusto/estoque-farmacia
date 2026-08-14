from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import StatusDescarteEnum, TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import DescarteRejeitarCreate, DescarteSolicitarCreate
from app.schemas.usuario import UsuarioMe


class DescarteService:
    """Regra 6: fluxo de duas etapas — Farmacêutico solicita (não
    decrementa estoque), Coordenador aprova (decrementa) ou rejeita
    (não mexe no estoque). Solicitação aceita lote na unidade ativa OU num
    carrinho de emergência filho dela (2026-08-13), mesma lógica de
    `SaidaService`."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()

    @staticmethod
    def _lote_no_escopo_da_unidade(lote, unidade_ativa_id: int) -> bool:
        return (
            lote.unidade_id == unidade_ativa_id
            or lote.unidade.unidade_pai_id == unidade_ativa_id
        )

    def solicitar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: DescarteSolicitarCreate,
    ) -> Movimentacao:
        lote = self.lote_repository.get_by_id(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if not self._lote_no_escopo_da_unidade(lote, unidade_ativa_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão "
                "nem a um carrinho de emergência dela.",
            )

        if not dados.motivo_descarte or not dados.motivo_descarte.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Motivo do descarte é obrigatório.",
            )

        if dados.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote.quantidade_atual})."
                ),
            )

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.descarte,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            motivo_descarte=dados.motivo_descarte.strip(),
            status=StatusDescarteEnum.pendente_aprovacao,
            usuario_id=usuario.id,
            usuario_solicitante_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)

    def aprovar(self, db: Session, usuario: UsuarioMe, movimentacao_id: int) -> Movimentacao:
        movimentacao = self._buscar_pendente(db, movimentacao_id)

        lote = self.lote_repository.get_by_id_for_update(db, movimentacao.lote_id)
        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if movimentacao.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "O saldo do lote mudou desde a solicitação e não é mais "
                    "suficiente para este descarte. Rejeite e peça nova solicitação."
                ),
            )

        lote.quantidade_atual -= movimentacao.quantidade
        self.lote_repository.salvar(db, lote)

        movimentacao.status = StatusDescarteEnum.aprovado
        movimentacao.usuario_aprovador_id = usuario.id

        return self.movimentacao_repository.salvar(db, movimentacao)

    def rejeitar(
        self,
        db: Session,
        usuario: UsuarioMe,
        movimentacao_id: int,
        dados: DescarteRejeitarCreate | None = None,
    ) -> Movimentacao:
        movimentacao = self._buscar_pendente(db, movimentacao_id)

        movimentacao.status = StatusDescarteEnum.rejeitado
        movimentacao.usuario_aprovador_id = usuario.id

        if dados is not None and dados.motivo_rejeicao:
            movimentacao.motivo_descarte = (
                f"{movimentacao.motivo_descarte}\n\nRejeitado: {dados.motivo_rejeicao}"
            )

        return self.movimentacao_repository.salvar(db, movimentacao)

    def listar_pendentes(self, db: Session, unidade_id: int | None):
        return self.movimentacao_repository.listar_descartes_pendentes(db, unidade_id)

    def _buscar_pendente(self, db: Session, movimentacao_id: int) -> Movimentacao:
        movimentacao = self.movimentacao_repository.get_by_id_for_update(
            db, movimentacao_id
        )

        if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.descarte:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Solicitação de descarte não encontrada.",
            )

        if movimentacao.status != StatusDescarteEnum.pendente_aprovacao:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esta solicitação já foi analisada.",
            )

        return movimentacao
