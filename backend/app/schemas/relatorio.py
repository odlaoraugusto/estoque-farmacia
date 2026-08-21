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


class RelatorioConsumoMedicamentoItem(BaseModel):
    medicamento_id: int
    nome: str
    mes: str  # "2026-08" — série histórica mensal
    setor: str
    quantidade_total: int


class RelatorioConsumoMedicamentosOut(BaseModel):
    """Consumo por medicamento num período (2026-08-20) — só conta Saída
    categoria `normal` (ou sem categoria, saídas antigas pré-2026-08-19):
    baixa por vencimento é perda, não consumo; empréstimo/doação/permuta
    saíram do hospital, não foram consumidos internamente."""

    metadados: RelatorioMetadados
    periodo_inicio: date | None
    periodo_fim: date | None
    itens: list[RelatorioConsumoMedicamentoItem]


class RelatorioAuditoriaOut(BaseModel):
    metadados: RelatorioMetadados
    # Paginação (2026-08-19, diagnóstico de carga): `total` é quanto bate
    # com o filtro aplicado (pode ser bem maior que `len(itens)`); `limit`
    # é `None` só na exportação (PDF/Excel), que devolve tudo sem truncar.
    total: int
    limit: int | None
    offset: int
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


class DoseAntimicrobianoItem(BaseModel):
    """Uma dispensação individual — a "dose" no sentido que dá pra
    enxergar a partir do dado que a farmácia registra (evento de Saída,
    não confirmação de administração à beira do leito)."""

    data: date
    quantidade: int
    numero_lote: str


class RelatorioAntimicrobianoItem(BaseModel):
    """DOT (Days of Therapy) por paciente/medicamento — aproximação a
    partir de dispensações da farmácia (não é registro de administração
    real, o hospital não tem eMAR). `dias_consecutivos` conta datas
    distintas de dispensação em sequência, sem furo, terminando na
    dispensação mais recente."""

    paciente_prontuario: str
    paciente_nome: str
    medicamento_id: int
    medicamento_nome: str
    dias_consecutivos: int
    data_inicio: date
    data_fim: date
    doses: list[DoseAntimicrobianoItem]


class RelatorioAntimicrobianoOut(BaseModel):
    metadados: RelatorioMetadados
    dias_minimo: int
    itens: list[RelatorioAntimicrobianoItem]


class AtividadeRecenteItem(BaseModel):
    """Um evento de Descarte/Ajuste/Saída-empréstimo-doação recente —
    alimenta a notificação do Coordenador (2026-08-19). Todo o "log de
    quem fez" já existe na trilha de auditoria (`usuario_id`); isto só
    expõe de forma direta, sem precisar abrir a Trilha de Auditoria
    completa pra achar."""

    movimentacao_id: int
    tipo: str
    detalhe: str
    medicamento_nome: str
    quantidade: int
    usuario_nome: str
    unidade_nome: str
    data_hora: datetime


class RelatorioAtividadeRecenteOut(BaseModel):
    metadados: RelatorioMetadados
    dias_considerados: int
    itens: list[AtividadeRecenteItem]


class RelatorioTransferenciasOut(BaseModel):
    """Rastreabilidade de transferências entre unidades (2026-08-20) —
    confirma se um medicamento realmente saiu de uma unidade e chegou na
    outra: origem, destino, quantidade enviada x recebida (divergência
    fica visível comparando as duas), quem enviou/confirmou e quando."""

    metadados: RelatorioMetadados
    periodo_inicio: date | None
    periodo_fim: date | None
    itens: list[MovimentacaoDetalhadaOut]
