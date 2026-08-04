from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.enums import TipoMovimentacaoEnum
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.lote import LoteDetalhadoOut
from app.schemas.movimentacao import MovimentacaoDetalhadaOut
from app.schemas.relatorio import (
    RelatorioAuditoriaOut,
    RelatorioCustoPorSetorItem,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoItem,
    RelatorioEstoqueConsolidadoOut,
    RelatorioMetadados,
    RelatorioVencimentosProximosOut,
)
from app.schemas.usuario import UsuarioMe

TODAS_UNIDADES_LABEL = "Todas as unidades"


class RelatorioService:
    """Cada resposta carrega os metadados do cabeçalho institucional
    (docs/00_PROJETO.md seção 14): hospital, organização, título, data/hora
    de geração, usuário e unidade (ou 'Todas as unidades')."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.unidade_repository = UnidadeRepository()

    def _metadados(
        self, usuario: UsuarioMe, titulo: str, unidade_id: int | None, db: Session
    ) -> RelatorioMetadados:
        unidade_label = TODAS_UNIDADES_LABEL

        if unidade_id is not None:
            unidade = self.unidade_repository.get_by_id(db, unidade_id)
            unidade_label = unidade.nome if unidade else "Unidade não encontrada"

        return RelatorioMetadados(
            hospital=settings.HOSPITAL_NOME,
            organizacao=settings.HOSPITAL_ORGANIZACAO,
            titulo_relatorio=titulo,
            gerado_em=datetime.now(timezone.utc),
            gerado_por=usuario.nome,
            unidade=unidade_label,
        )

    def estoque_consolidado(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None
    ) -> RelatorioEstoqueConsolidadoOut:
        lotes = self.lote_repository.listar(
            db, unidade_id=unidade_id, apenas_disponivel=True, ordenar_fefo=False
        )

        itens = []
        valor_total_geral = Decimal("0")

        for lote in lotes:
            valor_total_lote = Decimal(lote.quantidade_atual) * lote.valor_unitario
            valor_total_geral += valor_total_lote

            itens.append(
                RelatorioEstoqueConsolidadoItem(
                    lote=LoteDetalhadoOut.model_validate(lote),
                    valor_total_lote=valor_total_lote,
                )
            )

        return RelatorioEstoqueConsolidadoOut(
            metadados=self._metadados(
                usuario, "Consolidado Geral de Estoque", unidade_id, db
            ),
            itens=itens,
            valor_total_geral=valor_total_geral,
        )

    def custo_por_setor(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
    ) -> RelatorioCustoPorSetorOut:
        saidas = self.movimentacao_repository.listar_saidas_por_periodo(
            db, data_inicio, data_fim, unidade_id
        )

        agregados: dict[str, dict[str, Decimal | int]] = defaultdict(
            lambda: {"quantidade_total": 0, "valor_total": Decimal("0")}
        )

        for movimentacao in saidas:
            setor = movimentacao.setor_consumidor or "Não informado"
            valor = Decimal(movimentacao.quantidade) * movimentacao.lote.valor_unitario

            agregados[setor]["quantidade_total"] += movimentacao.quantidade
            agregados[setor]["valor_total"] += valor

        itens = [
            RelatorioCustoPorSetorItem(
                setor_consumidor=setor,
                quantidade_total=dados["quantidade_total"],
                valor_total=dados["valor_total"],
            )
            for setor, dados in sorted(agregados.items())
        ]

        valor_total_geral = sum((item.valor_total for item in itens), Decimal("0"))

        return RelatorioCustoPorSetorOut(
            metadados=self._metadados(usuario, "Custo por Setor", unidade_id, db),
            periodo_inicio=data_inicio,
            periodo_fim=data_fim,
            itens=itens,
            valor_total_geral=valor_total_geral,
        )

    def auditoria(
        self,
        db: Session,
        usuario: UsuarioMe,
        tipo: TipoMovimentacaoEnum | None,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
    ) -> RelatorioAuditoriaOut:
        """Só coordenador acessa (garantido no router) — trilha completa,
        nunca filtrada por unidade do usuário logado, só por filtro
        explícito escolhido na tela."""
        movimentacoes = self.movimentacao_repository.listar_auditoria(
            db, tipo, unidade_id, data_inicio, data_fim
        )

        return RelatorioAuditoriaOut(
            metadados=self._metadados(usuario, "Trilha de Auditoria", unidade_id, db),
            itens=[
                MovimentacaoDetalhadaOut.model_validate(m) for m in movimentacoes
            ],
        )

    def vencimentos_proximos(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None, dias: int
    ) -> RelatorioVencimentosProximosOut:
        lotes = self.lote_repository.listar_vencimento_proximo(db, dias, unidade_id)

        return RelatorioVencimentosProximosOut(
            metadados=self._metadados(
                usuario, "Vencimentos Próximos", unidade_id, db
            ),
            dias_considerados=dias,
            itens=[LoteDetalhadoOut.model_validate(lote) for lote in lotes],
        )
