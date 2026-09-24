"""Notas de atualização mostradas ao usuário logo após o login (popup,
"já li" ao fechar) e a versão exibida no rodapé do menu.

Atualizar a cada entrega: subir `VERSAO_ATUAL` e acrescentar uma entrada
NOVA no início de `NOTAS` (lista sempre da mais recente para a mais
antiga). Escrever em linguagem objetiva, para o usuário final — sem
jargão técnico, sem mencionar como o pedido foi feito."""

VERSAO_ATUAL = "1.1.0"

NOTAS: list[dict] = [
    {
        "versao": "1.1.0",
        "data": "2026-09-24",
        "mudancas": [
            {
                "tipo": "novidade",
                "descricao": (
                    "No atendimento de solicitações de ressuprimento, agora é "
                    "possível liberar a solicitação mesmo sem ter estoque disponível "
                    "(0 unidades enviadas), em vez de precisar recusar."
                ),
            },
            {
                "tipo": "novidade",
                "descricao": (
                    "Opção de baixar comprovante em PDF ao atender uma solicitação "
                    "de ressuprimento ou repor um carrinho de emergência, para controle."
                ),
            },
        ],
    },
    {
        "versao": "1.0.0",
        "data": "2026-09-22",
        "mudancas": [
            {
                "tipo": "correcao",
                "descricao": (
                    "Corrigida a saída por empréstimo/doação de medicamento controlado "
                    "ou antimicrobiano, que estava sendo bloqueada indevidamente."
                ),
            },
            {
                "tipo": "correcao",
                "descricao": (
                    "Corrigido o atendimento de solicitações de ressuprimento: agora é "
                    "possível enviar usando mais de um lote do mesmo medicamento numa "
                    "mesma resposta."
                ),
            },
            {
                "tipo": "novidade",
                "descricao": (
                    "Validade do lote agora aparece junto com o nome do medicamento em "
                    "todas as buscas do sistema (antes só aparecia na Dispensação)."
                ),
            },
            {
                "tipo": "novidade",
                "descricao": (
                    "Colunas de paciente e prontuário no Relatório Geral de "
                    "Movimentações (Farmacêutico e Coordenador)."
                ),
            },
            {
                "tipo": "novidade",
                "descricao": (
                    "A CAF agora pode repor qualquer carrinho de emergência, além dos "
                    "que já hospeda diretamente."
                ),
            },
            {
                "tipo": "novidade",
                "descricao": "Edição do valor unitário direto na lista de lotes da tela de Estoque.",
            },
            {
                "tipo": "novidade",
                "descricao": "Nova tela de Logs de Erro, exclusiva do Admin, para acompanhamento técnico.",
            },
        ],
    },
]
