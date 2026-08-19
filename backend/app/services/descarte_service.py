from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import StatusDescarteEnum, TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import DescarteCreate
from app.schemas.usuario import UsuarioMe


class DescarteService:
    """Descarte (2026-08-19) — ação direta, sem fluxo de aprovação: quem
    registra (Farmacêutico ou Coordenador) já decrementa o estoque na
    hora, igual Entrada/Saída/Ajuste. Antes disso era um fluxo de 2
    etapas (Farmacêutico solicitava, Coordenador aprovava/rejeitava);
    virou 1 etapa a pedido do cliente — em troca, o Coordenador passou a
    ser notificado de todo descarte registrado (ver
    `RelatorioService.atividade_recente`), então a supervisão continua
    existindo, só que depois do fato em vez de travando antes.

    `status` fica sempre `aprovado` nos registros novos — o campo
    continua existindo no model só por causa dos registros antigos
    (criados quando o fluxo ainda era de aprovação), que preservam o
    status histórico que tinham."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()

    @staticmethod
    def _lote_no_escopo_da_unidade(lote, unidade_ativa_id: int) -> bool:
        return (
            lote.unidade_id == unidade_ativa_id
            or lote.unidade.unidade_pai_id == unidade_ativa_id
        )

    def registrar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: DescarteCreate,
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

        lote.quantidade_atual -= dados.quantidade
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.descarte,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            motivo_descarte=dados.motivo_descarte.strip(),
            status=StatusDescarteEnum.aprovado,
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)
