from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import AjusteCreate, AjusteLoteCreate, AjusteValorCreate
from app.schemas.usuario import UsuarioMe


class AjusteService:
    """Ajuste de estoque — Farmacêutico ou Coordenador (router garante o
    perfil). Corrige o saldo de um lote fora dos fluxos normais (ex.:
    divergência encontrada numa contagem física), sempre com motivo
    obrigatório e registrado na trilha de auditoria (Coordenador é
    notificado de todo ajuste, ver `RelatorioService.atividade_recente`).

    Escopo de unidade: o lote precisa estar exatamente na unidade ativa
    da sessão (2026-08-31 — carrinho de emergência é estoque à parte da
    unidade que o hospeda, não entra mais aqui; mesma regra de
    `SaidaService`)."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()

    @staticmethod
    def _lote_no_escopo_da_unidade(lote, unidade_ativa_id: int) -> bool:
        return lote.unidade_id == unidade_ativa_id

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
                detail="O lote não pertence à unidade ativa da sessão.",
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

    def ajustar_valor(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: AjusteValorCreate,
    ) -> Movimentacao:
        """Corrige o valor unitário pago de um lote (ex.: erro de digitação
        na Entrada) — não mexe em saldo, só no valor usado nos relatórios
        financeiros (Consolidado geral, Custo por setor)."""
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if not self._lote_no_escopo_da_unidade(lote, unidade_ativa_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão.",
            )

        if not dados.motivo or not dados.motivo.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Motivo da correção é obrigatório.",
            )

        valor_antigo = lote.valor_unitario
        if dados.valor_unitario_novo == valor_antigo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O valor informado já é o valor unitário atual do lote — nada para corrigir.",
            )

        lote.valor_unitario = dados.valor_unitario_novo
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.correcao_valor,
            lote_id=lote.id,
            quantidade=0,
            unidade_origem_id=unidade_ativa_id,
            motivo_ajuste=(
                f"Valor unitário: R$ {valor_antigo:.2f} -> R$ {dados.valor_unitario_novo:.2f}. "
                f"{dados.motivo.strip()}"
            ),
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)

    def ajustar_lote(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: AjusteLoteCreate,
    ) -> Movimentacao:
        """Corrige nº do lote e/ou validade (2026-08-31, pedido do
        cliente: erro de digitação na Entrada) — não mexe em saldo nem em
        valor, só nesses dois campos de identificação do lote. Mesmo
        padrão de `ajustar_valor`: motivo obrigatório, registrado como
        `correcao_valor` na trilha (reaproveita o tipo já existente — não
        é uma correção de quantidade física, é a mesma categoria de
        "corrigir um dado do lote sem mexer no saldo")."""
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if not self._lote_no_escopo_da_unidade(lote, unidade_ativa_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão.",
            )

        if not dados.motivo or not dados.motivo.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Motivo da correção é obrigatório.",
            )

        numero_lote_antigo = lote.numero_lote
        data_validade_antiga = lote.data_validade

        if dados.numero_lote == numero_lote_antigo and dados.data_validade == data_validade_antiga:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nº do lote e validade informados já são os valores atuais — nada para corrigir.",
            )

        lote.numero_lote = dados.numero_lote
        lote.data_validade = dados.data_validade
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.correcao_valor,
            lote_id=lote.id,
            quantidade=0,
            unidade_origem_id=unidade_ativa_id,
            motivo_ajuste=(
                f"Nº lote: {numero_lote_antigo or 's/ nº'} -> {dados.numero_lote or 's/ nº'}. "
                f"Validade: {data_validade_antiga or 'sem validade'} -> {dados.data_validade or 'sem validade'}. "
                f"{dados.motivo.strip()}"
            ),
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)
