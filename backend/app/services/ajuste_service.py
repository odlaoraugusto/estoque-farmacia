from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import AjusteCreate
from app.schemas.usuario import UsuarioMe


class AjusteService:
    """Ajuste de estoque — Farmacêutico ou Coordenador (router garante o
    perfil). Corrige o saldo de um lote fora dos fluxos normais (ex.:
    divergência encontrada numa contagem física), sempre com motivo
    obrigatório e registrado na trilha de auditoria (Coordenador é
    notificado de todo ajuste, ver `RelatorioService.atividade_recente`).
    Mesmo escopo de unidade dos outros fluxos de escrita: o lote precisa
    estar na unidade ativa da sessão ou num carrinho de emergência filho
    dela."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()

    @staticmethod
    def _lote_no_escopo_da_unidade(lote, unidade_ativa_id: int) -> bool:
        return (
            lote.unidade_id == unidade_ativa_id
            or lote.unidade.unidade_pai_id == unidade_ativa_id
        )

    def ajustar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: AjusteCreate,
    ) -> Movimentacao:
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

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

        if not dados.motivo_ajuste or not dados.motivo_ajuste.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Motivo do ajuste é obrigatório.",
            )

        diferenca = dados.quantidade_nova - lote.quantidade_atual
        if diferenca == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A quantidade informada já é o saldo atual do lote — nada para ajustar.",
            )

        lote.quantidade_atual = dados.quantidade_nova
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.ajuste,
            lote_id=lote.id,
            quantidade=diferenca,
            unidade_origem_id=unidade_ativa_id,
            motivo_ajuste=dados.motivo_ajuste.strip(),
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)
