"""matriz de permissões configurável (farmacêutico/atendente)

Revision ID: 0015_matriz_permissoes
Revises: 0014_apresentacao_livre
Create Date: 2026-08-31

Pedido do cliente: o usuário Admin global (já existente desde
0010_usuario_trocar_senha... na verdade introduzido só em Python, sem
migração própria — ver nota em app/models/enums.py, perfil é VARCHAR sem
CHECK constraint) ganha uma tela própria para controlar o que Atendente e
Farmacêutico podem fazer além do básico, em vez de ficar fixo no código
(`exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)`
espalhado pelos routers).

Mesmo padrão já usado no projeto irmão (Almoxarifado, migração
`0005_admin_e_permissoes`), com duas diferenças de propósito:

1. Coordenador NÃO entra na matriz aqui — pedido do cliente foi
   especificamente sobre Atendente e Farmacêutico; Coordenador continua
   superusuário implícito (igual Admin), sempre com tudo liberado, nunca
   com linha própria em `permissoes_perfil` (ver
   `app/api/deps.py::exigir_permissao`).
2. Chaves diferentes, específicas do domínio da farmácia (ver
   `_COLUNAS_PERMISSAO` abaixo) — não inclui nada que toque em dado de
   paciente (antimicrobianos/controlados) nem em vigilância/auditoria do
   Coordenador (trilha de auditoria, atividade recente, gestão de
   usuários): essas continuam hardcoded, fora da matriz, por serem
   supervisão/LGPD, não decisão operacional do dia a dia.

Semeada com o comportamento que já estava em produção nesta sessão (ver
`docs/GUIA_IMPLANTACAO_SERVIDOR.md` e o histórico de mudanças de
2026-08-31): Farmacêutico nasce com tudo liberado (já era igual ao
Coordenador em tudo, doc 00_PROJETO.md seção 27); Atendente nasce com
`ajustar_estoque`/`transferencia_enviar` liberados (mudanças pedidas
horas antes desta) e o resto bloqueado — para não mudar nada até o Admin
mexer na tela `/permissoes`.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0015_matriz_permissoes"
down_revision: Union[str, None] = "0014_apresentacao_livre"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUNAS_PERMISSAO = (
    "entrada",
    "medicamentos",
    "ajustar_estoque",
    "corrigir_valor_unitario",
    "transferencia_enviar",
    "reposicao_carrinho",
    "relatorios_financeiro",
)

# Estado já vigente em produção antes desta migração (ver mensagem acima).
_ATENDENTE_JA_LIBERADO = {"ajustar_estoque", "transferencia_enviar"}


def upgrade() -> None:
    op.create_table(
        "permissoes_perfil",
        sa.Column(
            "perfil",
            sa.Enum(
                "coordenador", "farmaceutico", "atendente", "admin", name="perfil_enum",
                native_enum=False, length=20,
            ),
            primary_key=True,
        ),
        *(
            sa.Column(coluna, sa.Boolean(), nullable=False, server_default=sa.text("false"))
            for coluna in _COLUNAS_PERMISSAO
        ),
    )
    op.create_check_constraint(
        "permissoes_perfil_perfil_enum",
        "permissoes_perfil",
        sa.column("perfil").in_(("coordenador", "farmaceutico", "atendente", "admin")),
    )

    permissoes_perfil = sa.table(
        "permissoes_perfil",
        sa.column("perfil", sa.String),
        *(sa.column(c, sa.Boolean) for c in _COLUNAS_PERMISSAO),
    )
    op.bulk_insert(
        permissoes_perfil,
        [
            {"perfil": "farmaceutico", **{c: True for c in _COLUNAS_PERMISSAO}},
            {
                "perfil": "atendente",
                **{c: (c in _ATENDENTE_JA_LIBERADO) for c in _COLUNAS_PERMISSAO},
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("permissoes_perfil")
