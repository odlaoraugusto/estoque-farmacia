"""Enums compartilhados entre models e schemas (docs/00_PROJETO.md, seção 6)."""

import enum


class PerfilEnum(str, enum.Enum):
    coordenador = "coordenador"
    farmaceutico = "farmaceutico"
    atendente = "atendente"
    # Administrador global (2026-08-27): só configura o sistema (hoje,
    # gestão de Usuários) — nunca opera estoque/medicamento. Não precisa
    # de unidade ativa (ver AuthContext.tsx no frontend e get_unidade_
    # ativa_id em app/api/deps.py, que essa telas nem usam). Nenhuma
    # migração de banco necessária: `perfil` é VARCHAR + validação em
    # Python (native_enum=False, sem CHECK constraint), decisão já
    # documentada no README do backend justamente para permitir isso.
    admin = "admin"


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
    """`emprestimo` (2026-08-20): item recebido de outra instituição por
    empréstimo — mesma regra de valor zerado/nota fiscal dispensada que
    `doacao`, mas exige `Lote.procedencia_externa` (de onde veio),
    espelhando `destino_externo` do lado da Saída."""

    compra = "compra"
    doacao = "doacao"
    emprestimo = "emprestimo"


class CategoriaSaidaEnum(str, enum.Enum):
    """Categoria de uma Saída (2026-08-19) — além do setor consumidor de
    sempre, marca quando a saída é um empréstimo/doação pra fora (outro
    hospital/instituição) em vez de dispensação normal pra um setor do
    próprio hospital. Não é um fluxo novo — mesma Saída de sempre, só com
    esse metadado a mais, usado pra notificar o Coordenador.

    `vencimento` (2026-08-20): baixa de lote vencido — substitui o antigo
    fluxo de Descarte (removido), que virou só mais uma categoria de
    Saída em vez de uma tela própria.

    `permuta` (2026-08-20): troca com outra instituição (sai um item,
    volta outro depois, fora do sistema) — mesmo grupo de `emprestimo`/
    `doacao` pra fins de tela (aba dedicada "Empréstimo/Doação/Permuta")
    e de notificação ao Coordenador; todas as três exigem
    `destino_externo`."""

    normal = "normal"
    emprestimo = "emprestimo"
    doacao = "doacao"
    vencimento = "vencimento"
    permuta = "permuta"


# Categorias de Saída que saem do hospital pra outra instituição — exigem
# `destino_externo` e alimentam a notificação de atividade ao Coordenador.
# Grupo nomeado porque é referenciado em mais de um lugar (schema de
# validação + repositório de atividade recente), sempre os mesmos três.
CATEGORIAS_SAIDA_EXTERNA = (
    CategoriaSaidaEnum.emprestimo,
    CategoriaSaidaEnum.doacao,
    CategoriaSaidaEnum.permuta,
)


class StatusSolicitacaoEnum(str, enum.Enum):
    """Solicitação de transferência (2026-08-20): satélite pede um
    medicamento à CAF pelo sistema, em vez de a CAF decidir sozinha o que
    enviar. `aceita` só é atingido depois que a CAF de fato despacha a
    transferência (`Movimentacao.tipo=transferencia` vinculada) — a
    confirmação de recebimento em si continua sendo o fluxo já existente
    de `TransferenciaService.confirmar`."""

    pendente = "pendente"
    aceita = "aceita"
    recusada = "recusada"


class StatusTransferenciaEnum(str, enum.Enum):
    em_transito = "em_transito"
    recebido = "recebido"


class TipoMovimentacaoEnum(str, enum.Enum):
    entrada = "entrada"
    transferencia = "transferencia"
    saida = "saida"
    descarte = "descarte"
    ajuste = "ajuste"
    # Correção de valor unitário (2026-08-27) — mesma ideia do `ajuste`,
    # mas pra preço em vez de quantidade: corrige um valor pago digitado
    # errado na Entrada, sem mexer no saldo físico do lote. `quantidade`
    # não se aplica a esse tipo (guarda 0, sempre) — o antes/depois do
    # valor fica descrito em `motivo_ajuste` (mesma coluna, reaproveitada,
    # sem precisar de coluna nova/migração).
    correcao_valor = "correcao_valor"


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
