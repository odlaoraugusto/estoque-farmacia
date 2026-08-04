from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import StatusTransferenciaEnum, TipoMovimentacaoEnum
from app.models.lote import Lote
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.movimentacao import (
    TransferenciaConfirmarCreate,
    TransferenciaEnviarCreate,
)
from app.schemas.usuario import UsuarioMe


class TransferenciaService:

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.unidade_repository = UnidadeRepository()

    def enviar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: TransferenciaEnviarCreate,
    ) -> Movimentacao:
        """Regra 3: só farmacêutico/coordenador (checado no router), a
        unidade de origem é sempre a unidade ativa da sessão — nunca um
        campo vindo do corpo da requisição."""
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if lote.unidade_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão.",
            )

        if dados.unidade_destino_id == unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A unidade de destino deve ser diferente da unidade de origem.",
            )

        destino = self.unidade_repository.get_by_id(db, dados.unidade_destino_id)
        if destino is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unidade de destino não encontrada.",
            )

        if dados.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote.quantidade_atual})."
                ),
            )

        lote.quantidade_atual -= dados.quantidade
        lote.status_transferencia = StatusTransferenciaEnum.em_transito
        lote = self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.transferencia,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            unidade_destino_id=destino.id,
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)

    def confirmar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        movimentacao_id: int,
        dados: TransferenciaConfirmarCreate,
    ) -> Movimentacao:
        """Regra 4: qualquer perfil (incluindo atendente) na unidade de
        destino. Cria um NOVO lote no destino; a quantidade recebida pode
        divergir da enviada sem bloquear — só registra a divergência."""
        movimentacao = self.movimentacao_repository.get_by_id_for_update(
            db, movimentacao_id
        )

        if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.transferencia:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transferência não encontrada.",
            )

        if movimentacao.quantidade_recebida is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esta transferência já foi confirmada.",
            )

        if movimentacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Confirmação de recebimento só pode ser feita pela unidade de destino.",
            )

        lote_origem = self.lote_repository.get_by_id_for_update(db, movimentacao.lote_id)
        if lote_origem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lote de origem não encontrado.",
            )

        novo_lote = Lote(
            medicamento_id=lote_origem.medicamento_id,
            unidade_id=unidade_ativa_id,
            numero_lote=lote_origem.numero_lote,
            data_validade=lote_origem.data_validade,
            quantidade_atual=dados.quantidade_recebida,
            valor_unitario=lote_origem.valor_unitario,
            origem=lote_origem.origem,
            # Copiar do lote pai — não só o que a seção 6 do doc lista
            # explicitamente. Faltar `numero_nota_fiscal` aqui viola
            # `ck_lotes_nota_fiscal_obrigatoria_compra` sempre que
            # origem=compra (achado em revisão 2026-08-01: confirmar
            # recebimento de qualquer transferência de lote comprado
            # dava 500).
            numero_nota_fiscal=lote_origem.numero_nota_fiscal,
            numero_afm=lote_origem.numero_afm,
            usuario_entrada_id=usuario.id,
            lote_origem_id=lote_origem.id,
        )
        self.lote_repository.create(db, novo_lote)

        lote_origem.status_transferencia = StatusTransferenciaEnum.recebido
        self.lote_repository.salvar(db, lote_origem)

        movimentacao.quantidade_recebida = dados.quantidade_recebida
        movimentacao.usuario_confirmacao_id = usuario.id
        movimentacao.data_confirmacao = datetime.now(timezone.utc)

        return self.movimentacao_repository.salvar(db, movimentacao)

    def listar_pendentes(self, db: Session, unidade_destino_id: int | None):
        return self.movimentacao_repository.listar_transferencias_pendentes(
            db, unidade_destino_id
        )
