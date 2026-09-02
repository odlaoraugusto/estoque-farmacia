"""Converte cada um dos 4 `*Out` de `app/schemas/relatorio.py` (já
validados/preenchidos pelo `RelatorioService`) numa `TabelaRelatorio`
genérica, pronta para os exportadores desenharem."""

from app.models.enums import OrigemEnum, StatusDescarteEnum, TipoMovimentacaoEnum
from app.schemas.relatorio import (
    RelatorioAntimicrobianoOut,
    RelatorioAuditoriaOut,
    RelatorioConsumoMedicamentosOut,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoOut,
    RelatorioEstoqueCriticoOut,
    RelatorioMetadados,
    RelatorioMovimentacaoTransferenciasOut,
    RelatorioMovimentacoesGeralOut,
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
    OrigemEnum.emprestimo: "Empréstimo",
    OrigemEnum.devolucao: "Devolução",
}

_TIPO_MOVIMENTACAO_LABEL = {
    TipoMovimentacaoEnum.entrada: "Entrada",
    TipoMovimentacaoEnum.transferencia: "Transferência",
    TipoMovimentacaoEnum.saida: "Saída",
    TipoMovimentacaoEnum.descarte: "Descarte",
}

_CATEGORIA_MOVIMENTACAO_GERAL_LABEL = {
    "entrada": "Entrada",
    "saida": "Saída",
    "transferencia": "Transferência",
    "reposicao_carrinho": "Reposição de Carrinho",
    "devolucao": "Devolução de Medicamento",
}

_STATUS_DESCARTE_LABEL = {
    StatusDescarteEnum.pendente_aprovacao: "Pendente aprovação",
    StatusDescarteEnum.aprovado: "Aprovado",
    StatusDescarteEnum.rejeitado: "Rejeitado",
}

def _texto(valor) -> str:
    return "" if valor is None else str(valor)


def _apresentacao_e_concentracao(medicamento) -> str:
    """'FA · 100UI/mL' — apresentação (forma farmacêutica, texto livre
    desde 2026-08-28) e concentração (opcional) combinadas numa coluna só
    no relatório impresso, mais legível do que duas colunas separadas."""
    apresentacao = medicamento.apresentacao or ""
    return f"{apresentacao} · {medicamento.concentracao}" if medicamento.concentracao else apresentacao


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


def tabela_movimentacao_transferencias(relatorio: RelatorioMovimentacaoTransferenciasOut) -> TabelaRelatorio:
    """Mesmas colunas de `tabela_transferencias`, sem nenhum dado
    financeiro — este relatório é liberado a qualquer perfil."""
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
            formatar_data_hora(item.data_hora),
            item.medicamento_nome,
            item.numero_lote,
            item.unidade_origem,
            item.unidade_destino,
            str(item.quantidade_enviada),
            _texto(item.quantidade_recebida),
            item.usuario_envio,
            item.usuario_confirmacao or "",
        ]
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
        larguras_relativas=[1.3, 1.6, 0.9, 1.0, 1.0, 0.8, 0.8, 1.1, 1.1],
    )


_STATUS_SOLICITACAO_LABEL = {
    "pendente": "Pendente",
    "aceita": "Aceita",
    "recusada": "Recusada",
}


def tabela_comprovante_entrada(metadados: RelatorioMetadados, lotes) -> TabelaRelatorio:
    """Comprovante do que acabou de ser registrado em Entrada, qualquer
    modalidade (2026-09-01, pedido do cliente) — uma linha por lote;
    compra normalmente traz vários lotes (mesma NF), doação/empréstimo
    sempre um só. `lotes` é uma lista de `Lote` (relações já carregadas
    via `lazy="selectin"`, ver app/models/lote.py)."""
    colunas = [
        "Medicamento",
        "Lote",
        "Validade",
        "Quantidade",
        "Valor Unitário",
        "Origem",
        "Nº NF",
        "Nº AFM",
        "Procedência",
    ]
    linhas = [
        [
            lote.medicamento.nome,
            lote.numero_lote,
            formatar_data(lote.data_validade),
            str(lote.quantidade_atual),
            formatar_moeda(lote.valor_unitario),
            _ORIGEM_LABEL.get(lote.origem, lote.origem.value),
            lote.numero_nota_fiscal or "",
            lote.numero_afm or "",
            lote.procedencia_externa or "",
        ]
        for lote in lotes
    ]

    informacoes_extra = [f"Registrado por: {lotes[0].usuario_entrada.nome}"]

    return TabelaRelatorio(
        metadados=metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=informacoes_extra,
        larguras_relativas=[1.4, 0.9, 0.9, 0.8, 1.0, 0.9, 0.9, 0.8, 1.1],
    )


_CATEGORIA_SAIDA_LABEL = {
    "normal": "Normal",
    "emprestimo": "Empréstimo",
    "doacao": "Doação",
    "vencimento": "Vencimento",
    "permuta": "Permuta",
}


def tabela_comprovante_saida(metadados: RelatorioMetadados, movimentacoes) -> TabelaRelatorio:
    """Comprovante de uma ou mais Saídas (2026-09-02, pedido do cliente:
    controle de Empréstimo/Doação/Permuta, "precisamos do registro pra
    controle") — uma linha por medicamento; uma remessa inteira pode
    cobrir vários (mesmo destino/destinatário), cada um sua própria
    `Movimentacao`. Sem colunas de paciente/prontuário de propósito —
    Empréstimo/Doação/Permuta nunca carrega esse dado (só a dispensação
    normal usa), então não há necessidade de aplicar a regra de
    visibilidade LGPD aqui."""
    colunas = [
        "Medicamento",
        "Lote",
        "Quantidade",
        "Categoria",
        "Setor Responsável",
        "Destino",
        "Destinatário",
        "Data/Hora",
    ]
    linhas = [
        [
            m.lote.medicamento.nome,
            m.lote.numero_lote,
            str(m.quantidade),
            _CATEGORIA_SAIDA_LABEL.get(
                m.categoria_saida.value if m.categoria_saida else "normal", "Normal"
            ),
            m.setor_consumidor or "",
            m.destino_externo or "",
            m.destinatario or "",
            formatar_data_hora(m.data_hora),
        ]
        for m in movimentacoes
    ]

    informacoes_extra = [f"Registrado por: {movimentacoes[0].usuario.nome}"]

    return TabelaRelatorio(
        metadados=metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=informacoes_extra,
        larguras_relativas=[1.4, 0.9, 0.7, 0.9, 1.1, 1.3, 1.1, 1.3],
    )


def tabela_comprovante_solicitacao(metadados: RelatorioMetadados, solicitacao) -> TabelaRelatorio:
    """Comprovante de UMA solicitação de ressuprimento (2026-09-01,
    pedido do cliente: botão "Imprimir" ao lado de "Minhas
    solicitações") — mesmo mecanismo de exportação dos relatórios, só
    que sempre uma linha só. `solicitacao` é o modelo ORM
    `SolicitacaoTransferencia` (relações já carregadas via
    `lazy="selectin"`, ver app/models/solicitacao_transferencia.py)."""
    colunas = [
        "Protocolo",
        "Data/Hora",
        "Unidade Solicitante",
        "Medicamento",
        "Qtd. Desejada",
        "Status",
        "Solicitado Por",
        "Atendido Por",
    ]
    linhas = [
        [
            f"#{solicitacao.id}",
            formatar_data_hora(solicitacao.data_solicitacao),
            solicitacao.unidade_solicitante.nome,
            solicitacao.medicamento.nome,
            str(solicitacao.quantidade_desejada),
            _STATUS_SOLICITACAO_LABEL.get(solicitacao.status.value, solicitacao.status.value),
            solicitacao.usuario_solicitante.nome,
            solicitacao.usuario_atendimento.nome if solicitacao.usuario_atendimento else "",
        ]
    ]

    informacoes_extra = []
    if solicitacao.observacao:
        informacoes_extra.append(f"Observação: {solicitacao.observacao}")
    if solicitacao.status.value == "recusada" and solicitacao.motivo_recusa:
        informacoes_extra.append(f"Motivo da recusa: {solicitacao.motivo_recusa}")
    if solicitacao.data_atendimento:
        informacoes_extra.append(f"Atendido em: {formatar_data_hora(solicitacao.data_atendimento)}")

    return TabelaRelatorio(
        metadados=metadados,
        colunas=colunas,
        linhas=linhas,
        informacoes_extra=informacoes_extra,
        larguras_relativas=[0.8, 1.2, 1.2, 1.4, 0.8, 0.9, 1.0, 1.0],
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


def tabela_movimentacoes_geral(relatorio: RelatorioMovimentacoesGeralOut) -> TabelaRelatorio:
    """Entrada, Saída, Transferência, Reposição de Carrinho e Devolução
    de Medicamento numa aba só (2026-09-02, pedido do cliente) — cópia de
    `tabela_auditoria` acima, com a categoria derivada (`item.categoria`,
    ver RelatorioService._categorizar_movimentacao) no lugar de `tipo`
    cru, e com Medicamento/Quantidade em destaque (o foco aqui é "o que"
    e "quanto" moveu, não só a trilha de auditoria bruta)."""
    colunas = [
        "Categoria",
        "Data/Hora",
        "Medicamento",
        "Nº Lote",
        "Quantidade",
        "Unid. Origem",
        "Unid. Destino",
        "Setor Consumidor",
        "Usuário",
    ]
    linhas = [
        [
            _CATEGORIA_MOVIMENTACAO_GERAL_LABEL.get(m.categoria, m.categoria),
            formatar_data_hora(m.data_hora),
            m.lote.medicamento.nome,
            m.lote.numero_lote,
            str(m.quantidade),
            m.unidade_origem.nome if m.unidade_origem else "",
            m.unidade_destino.nome if m.unidade_destino else "",
            _texto(m.setor_consumidor),
            m.usuario.nome,
        ]
        for m in relatorio.itens
    ]

    return TabelaRelatorio(
        metadados=relatorio.metadados,
        colunas=colunas,
        linhas=linhas,
        larguras_relativas=[1.2, 1.3, 1.6, 0.9, 0.8, 1.0, 1.0, 1.1, 1.1],
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
