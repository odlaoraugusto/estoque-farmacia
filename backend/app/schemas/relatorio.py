from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.lote import LoteDetalhadoOut
from app.schemas.movimentacao import MovimentacaoDetalhadaOut


class RelatorioMetadados(BaseModel):
    """Cabeçalho institucional exigido em toda tela/exportação de
    relatório (docs/00_PROJETO.md seção 14): hospital, organização,
    título, data/hora de geração, usuário e unidade (ou 'Todas as
    unidades' para o consolidado do coordenador)."""

    hospital: str
    organizacao: str
    titulo_relatorio: str
    gerado_em: datetime
    gerado_por: str
    unidade: str


class RelatorioEstoqueConsolidadoItem(BaseModel):
    lote: LoteDetalhadoOut
    valor_total_lote: Decimal


class RelatorioEstoqueConsolidadoOut(BaseModel):
    metadados: RelatorioMetadados
    itens: list[RelatorioEstoqueConsolidadoItem]
    valor_total_geral: Decimal


class RelatorioCustoPorSetorItem(BaseModel):
    setor_consumidor: str
    quantidade_total: int
    valor_total: Decimal


class RelatorioCustoPorSetorOut(BaseModel):
    metadados: RelatorioMetadados
    periodo_inicio: date | None
    periodo_fim: date | None
    itens: list[RelatorioCustoPorSetorItem]
    valor_total_geral: Decimal


class RelatorioAuditoriaOut(BaseModel):
    metadados: RelatorioMetadados
    itens: list[MovimentacaoDetalhadaOut]


class RelatorioVencimentosProximosOut(BaseModel):
    metadados: RelatorioMetadados
    dias_considerados: int
    itens: list[LoteDetalhadoOut]


class RelatorioEstoqueCriticoItem(BaseModel):
    """Um medicamento cuja soma de `quantidade_atual` (todos os lotes no
    escopo) ficou abaixo do `estoque_minimo` cadastrado nele."""

    medicamento_id: int
    nome: str
    quantidade_atual: int
    estoque_minimo: int


class RelatorioEstoqueCriticoOut(BaseModel):
    metadados: RelatorioMetadados
    itens: list[RelatorioEstoqueCriticoItem]
