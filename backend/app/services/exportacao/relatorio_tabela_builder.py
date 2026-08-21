"""Converte cada um dos 4 `*Out` de `app/schemas/relatorio.py` (já
validados/preenchidos pelo `RelatorioService`) numa `TabelaRelatorio`
genérica, pronta para os exportadores desenharem."""

from app.models.enums import ApresentacaoEnum, OrigemEnum, StatusDescarteEnum, TipoMovimentacaoEnum
from app.schemas.relatorio import (
    RelatorioAntimicrobianoOut,
    RelatorioAuditoriaOut,
    RelatorioConsumoMedicamentosOut,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoOut,
    RelatorioEstoqueCriticoOut,
    RelatorioTransferenciasOut,
    RelatorioVencimentosProximosOut,
)
from app.services.exportacao.formatacao import (
    formatar_data,
    formatar_data_hora,
    formatar_moeda,
)
from app.services.exportacao.tabela import TabelaRelatorio

_ORIGEM_LABEL = {
    OrigemEnum.compra: "Compra",
    OrigemEnum.doacao: "Doação",
}

_TIPO_MOVIMENTACAO_LABEL = {
    TipoMovimentacaoEnum.entrada: "Entrada",
    TipoMovimentacaoEnum.transferencia: "Transferência",
    TipoMovimentacaoEnum.saida: "Saída",
    TipoMovimentacaoEnum.descarte: "Descarte",
}

_STATUS_DESCARTE_LABEL = {
    StatusDescarteEnum.pendente_aprovacao: "Pendente aprovação",
    StatusDescarteEnum.aprovado: "Aprovado",
    StatusDescarteEnum.rejeitado: "Rejeitado",
}

_APRESENTACAO_LABEL = {
    ApresentacaoEnum.comprimido: "Comprimido",
    ApresentacaoEnum.capsula: "Cápsula",
    ApresentacaoEnum.solucao_oral: "Solução oral",
    ApresentacaoEnum.xarope: "Xarope",
    ApresentacaoEnum.suspensao: "Suspensão",
    ApresentacaoEnum.solucao_injetavel: "Solução injetável",
    ApresentacaoEnum.ampola: "Ampola",
    ApresentacaoEnum.frasco_ampola: "Frasco-ampola",
    ApresentacaoEnum.pomada: "Pomada",
    ApresentacaoEnum.creme: "Creme",
    ApresentacaoEnum.gel: "Gel",
    ApresentacaoEnum.spray: "Spray",
    ApresentacaoEnum.supositorio: "Supositório",
    ApresentacaoEnum.adesivo: "Adesivo",
    ApresentacaoEnum.bolsa: "Bolsa",
}


def _texto(valor) -> str:
    return "" if valor is None else str(valor)


def _apresentacao_e_concentracao(medicamento) -> str:
    """'Frasco-ampola · 100UI/mL' — apresentação (forma farmacêutica) e
    concentração são campos separados no cadastro desde 2026-08-01, mas o
    relatório impresso combina os dois numa coluna só, mais legível."""
    label = _APRESENTACAO_LABEL.get(medicamento.apresentacao, medicamento.apresentacao.value)
    return f"{label} · {medicamento.concentracao}" if medicamento.concentracao else label


def tabela_estoque_consolidado(relatorio: RelatorioEstoqueConsolidadoOut) -> TabelaRelatorio:
    colunas = [
        "Medicamento",
        "Apresentação",
        "Unidade",
        "Nº Lote",
        "Validade",
        "Qtd. Atual",
        "Valor Unitário",
        "Valor Total do Lote",
        "Origem",
    ]
    linhas = [
        [
            item.lote.medicamento.nome,
            _apresentacao_e_concentracao(item.lote.medicamento),
            item.lote.unidade.nome,
            item.lote.numero_lote,
            formatar_data(item.lote.data_validade),
            str(item.lote.quantidade_atual),
            formatar_moeda(item.lote.valor_unitario),
            formatar_moeda(item.valor_total_lote),
            _ORIGEM_LABEL.get(item.lote.origem, item.lote.origem.value),
        ]
        for item in relatorio.itens
    ]

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        rodape=[f"Valor total geral em estoque: {formatar_moeda(relatorio.valor_total_geral)}"],
        larguras_relativas=[1.6, 1.3, 1.0, 0.9, 0.9, 0.8, 1.0, 1.1, 0.8],
    )


def tabela_custo_por_setor(relatorio: RelatorioCustoPorSetorOut) -> TabelaRelatorio:
    colunas = ["Setor Consumidor", "Quantidade Total", "Valor Total"]
    linhas = [
        [item.setor_consumidor, str(item.quantidade_total), formatar_moeda(item.valor_total)]
        for item in relatorio.itens
    ]

    informacoes_extra = []
    if relatorio.periodo_inicio or relatorio.periodo_fim:
        inicio = formatar_data(relatorio.periodo_inicio) or "início do histórico"
        fim = formatar_data(relatorio.periodo_fim) or "hoje"
        informacoes_extra.append(f"Período considerado: {inicio} até {fim}")

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=informacoes_extra,
        rodape=[f"Valor total geral: {formatar_moeda(relatorio.valor_total_geral)}"],
        larguras_relativas=[2.0, 1.0, 1.0],
    )


def tabela_consumo_medicamentos(relatorio: RelatorioConsumoMedicamentosOut) -> TabelaRelatorio:
    colunas = ["Medicamento", "Setor", "Mês", "Quantidade Consumida"]
    linhas = [
        [item.nome, item.setor, item.mes, str(item.quantidade_total)]
        for item in relatorio.itens
    ]

    informacoes_extra = []
    if relatorio.periodo_inicio or relatorio.periodo_fim:
        inicio = formatar_data(relatorio.periodo_inicio) or "início do histórico"
        fim = formatar_data(relatorio.periodo_fim) or "hoje"
        informacoes_extra.append(f"Período considerado: {inicio} até {fim}")

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=informacoes_extra,
        larguras_relativas=[1.8, 1.6, 0.8, 1.0],
    )


def tabela_estoque_critico(relatorio: RelatorioEstoqueCriticoOut) -> TabelaRelatorio:
    colunas = ["Medicamento", "Qtd. Atual", "Estoque Mínimo", "Déficit"]
    linhas = [
        [item.nome, str(item.quantidade_atual), str(item.estoque_minimo), str(item.estoque_minimo - item.quantidade_atual)]
        for item in relatorio.itens
    ]

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        larguras_relativas=[2.0, 1.0, 1.0, 1.0],
    )


def tabela_antimicrobianos(relatorio: RelatorioAntimicrobianoOut) -> TabelaRelatorio:
    """Uma linha por DOSE (dispensação individual), não por paciente —
    dado achatado (2026-08-20) pra caber numa planilha/PDF sem estrutura
    aninhada; `dias_consecutivos`/`data_inicio`/`data_fim` se repetem em
    toda dose do mesmo paciente+medicamento, pra contexto sem precisar
    abrir duas tabelas."""
    colunas = [
        "Paciente",
        "Prontuário",
        "Medicamento",
        "Data da Dose",
        "Quantidade",
        "Nº Lote",
        "Dias Consecutivos",
        "Início do Uso",
        "Última Dose",
    ]
    linhas = [
        [
            item.paciente_nome,
            item.paciente_prontuario,
            item.medicamento_nome,
            formatar_data(dose.data),
            str(dose.quantidade),
            dose.numero_lote,
            str(item.dias_consecutivos),
            formatar_data(item.data_inicio),
            formatar_data(item.data_fim),
        ]
        for item in relatorio.itens
        for dose in item.doses
    ]

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=[f"Dias mínimo considerado: {relatorio.dias_minimo}"],
        larguras_relativas=[1.4, 0.9, 1.6, 1.0, 0.8, 0.9, 1.0, 1.0, 1.0],
    )


def tabela_transferencias(relatorio: RelatorioTransferenciasOut) -> TabelaRelatorio:
    colunas = [
        "Data/Hora",
        "Medicamento",
        "Nº Lote",
        "Origem",
        "Destino",
        "Qtd. Enviada",
        "Qtd. Recebida",
        "Enviado Por",
        "Confirmado Por",
    ]
    linhas = [
        [
            formatar_data_hora(m.data_hora),
            m.lote.medicamento.nome,
            m.lote.numero_lote,
            m.unidade_origem.nome if m.unidade_origem else "",
            m.unidade_destino.nome if m.unidade_destino else "",
            str(m.quantidade),
            _texto(m.quantidade_recebida),
            m.usuario.nome,
            m.usuario_confirmacao.nome if m.usuario_confirmacao else "",
        ]
        for m in relatorio.itens
    ]

    informacoes_extra = []
    if relatorio.periodo_inicio or relatorio.periodo_fim:
        inicio = formatar_data(relatorio.periodo_inicio) or "início do histórico"
        fim = formatar_data(relatorio.periodo_fim) or "hoje"
        informacoes_extra.append(f"Período considerado: {inicio} até {fim}")

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=informacoes_extra,
        larguras_relativas=[1.3, 1.6, 0.9, 1.0, 1.0, 0.8, 0.8, 1.1, 1.1],
    )


def tabela_auditoria(relatorio: RelatorioAuditoriaOut) -> TabelaRelatorio:
    colunas = [
        "Data/Hora",
        "Tipo",
        "Medicamento",
        "Nº Lote",
        "Unid. Origem",
        "Unid. Destino",
        "Quantidade",
        "Qtd. Recebida",
        "Setor Consumidor",
        "Motivo Descarte",
        "Status",
        "Usuário",
        "Solicitante",
        "Aprovador",
        "Confirmação",
        "Data Confirmação",
    ]
    linhas = [
        [
            formatar_data_hora(m.data_hora),
            _TIPO_MOVIMENTACAO_LABEL.get(m.tipo, m.tipo.value),
            m.lote.medicamento.nome,
            m.lote.numero_lote,
            m.unidade_origem.nome if m.unidade_origem else "",
            m.unidade_destino.nome if m.unidade_destino else "",
            str(m.quantidade),
            _texto(m.quantidade_recebida),
            _texto(m.setor_consumidor),
            _texto(m.motivo_descarte),
            _STATUS_DESCARTE_LABEL.get(m.status, "") if m.status else "",
            m.usuario.nome,
            m.usuario_solicitante.nome if m.usuario_solicitante else "",
            m.usuario_aprovador.nome if m.usuario_aprovador else "",
            m.usuario_confirmacao.nome if m.usuario_confirmacao else "",
            formatar_data_hora(m.data_confirmacao) if m.data_confirmacao else "",
        ]
        for m in relatorio.itens
    ]

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        larguras_relativas=[
            1.3, 0.8, 1.6, 0.8, 1.0, 1.0, 0.7, 0.8, 1.1, 1.3, 0.9, 1.1, 1.1, 1.1, 1.1, 1.3,
        ],
    )


def tabela_vencimentos_proximos(relatorio: RelatorioVencimentosProximosOut) -> TabelaRelatorio:
    colunas = [
        "Medicamento",
        "Apresentação",
        "Unidade",
        "Nº Lote",
        "Validade",
        "Qtd. Atual",
        "Valor Unitário",
        "Origem",
    ]
    linhas = [
        [
            lote.medicamento.nome,
            _apresentacao_e_concentracao(lote.medicamento),
            lote.unidade.nome,
            lote.numero_lote,
            formatar_data(lote.data_validade),
            str(lote.quantidade_atual),
            formatar_moeda(lote.valor_unitario),
            _ORIGEM_LABEL.get(lote.origem, lote.origem.value),
        ]
        for lote in relatorio.itens
    ]

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=[
            f"Considerando lotes que vencem nos próximos {relatorio.dias_considerados} dias"
        ],
        larguras_relativas=[1.6, 1.3, 1.0, 0.9, 0.9, 0.8, 1.0, 0.8],
    )
