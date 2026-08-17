"""Enums compartilhados entre models e schemas (docs/00_PROJETO.md, seção 6)."""

import enum


class PerfilEnum(str, enum.Enum):
    coordenador = "coordenador"
    farmaceutico = "farmaceutico"
    atendente = "atendente"


class AcondicionamentoEnum(str, enum.Enum):
    ambiente = "ambiente"
    geladeira = "geladeira"


class ApresentacaoEnum(str, enum.Enum):
    """Forma farmacêutica — só o tipo de apresentação, sem a
    concentração (que virou campo próprio, `Medicamento.concentracao`),
    a pedido do cliente em 2026-08-01."""

    comprimido = "comprimido"
    capsula = "capsula"
    solucao_oral = "solucao_oral"
    xarope = "xarope"
    suspensao = "suspensao"
    solucao_injetavel = "solucao_injetavel"
    ampola = "ampola"
    frasco_ampola = "frasco_ampola"
    pomada = "pomada"
    creme = "creme"
    gel = "gel"
    spray = "spray"
    supositorio = "supositorio"
    adesivo = "adesivo"
    bolsa = "bolsa"


class OrigemEnum(str, enum.Enum):
    compra = "compra"
    doacao = "doacao"


class StatusTransferenciaEnum(str, enum.Enum):
    em_transito = "em_transito"
    recebido = "recebido"


class TipoMovimentacaoEnum(str, enum.Enum):
    entrada = "entrada"
    transferencia = "transferencia"
    saida = "saida"
    descarte = "descarte"
    ajuste = "ajuste"


class StatusDescarteEnum(str, enum.Enum):
    pendente_aprovacao = "pendente_aprovacao"
    aprovado = "aprovado"
    rejeitado = "rejeitado"


class TipoUnidadeEnum(str, enum.Enum):
    """Carrinhos de emergência (2026-08-13): viraram um local de estoque
    rastreável (`Unidade.tipo = carrinho`), fisicamente dentro de uma das
    4 unidades reais (`unidade_pai_id`), mas SEM acesso de sessão — só as
    unidades tipo `unidade` aparecem na seleção de unidade ativa do
    login."""

    unidade = "unidade"
    carrinho = "carrinho"
