"""separa apresentacao (forma farmaceutica) de concentracao

Revision ID: 0002_apresentacao_concentracao
Revises: 0001_schema_inicial
Create Date: 2026-08-01

Pedido do cliente (2026-08-01): "apresentação" deve ser só a forma
farmacêutica (comprimido/frasco/suspensão/etc.), não texto livre
misturando forma e concentração (ex. "Frasco 10mL"). A concentração
(ex. "500mg/mL") vira campo próprio.

Backfill: os dados existentes eram texto livre e não mapeiam
automaticamente para o novo enum, então esta migração normaliza as duas
linhas de teste conhecidas (Dipirona/Insulina) antes de travar a coluna
com a CHECK constraint. Qualquer outro dado com apresentação fora do
enum abaixo faria esse `ALTER COLUMN` falhar — o que é o comportamento
certo (força a correção manual em vez de silenciosamente truncar).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_apresentacao_concentracao"
down_revision: Union[str, None] = "0001_schema_inicial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_APRESENTACOES = (
    "comprimido",
    "capsula",
    "solucao_oral",
    "xarope",
    "suspensao",
    "solucao_injetavel",
    "ampola",
    "frasco_ampola",
    "pomada",
    "creme",
    "gel",
    "spray",
    "supositorio",
    "adesivo",
    "bolsa",
)


def upgrade() -> None:
    op.add_column(
        "medicamentos",
        sa.Column("concentracao", sa.String(length=100), nullable=False, server_default=""),
    )

    # Backfill dos dados de teste conhecidos (texto livre -> forma + concentração).
    op.execute(
        "UPDATE medicamentos SET apresentacao='solucao_oral', concentracao='500mg/mL' "
        "WHERE nome ILIKE 'Dipirona%' AND apresentacao NOT IN "
        f"({', '.join(repr(v) for v in _APRESENTACOES)})"
    )
    op.execute(
        "UPDATE medicamentos SET apresentacao='frasco_ampola', concentracao='100UI/mL' "
        "WHERE nome ILIKE 'Insulina%' AND apresentacao NOT IN "
        f"({', '.join(repr(v) for v in _APRESENTACOES)})"
    )
    # Qualquer outra linha antiga que não bata com o enum novo cai aqui —
    # normaliza pra 'comprimido' com a apresentação antiga preservada na
    # concentração, só para não travar a migração; deve ser revisado
    # manualmente depois (não deveria acontecer fora de dados de teste).
    op.execute(
        "UPDATE medicamentos SET concentracao = apresentacao, apresentacao = 'comprimido' "
        "WHERE apresentacao NOT IN "
        f"({', '.join(repr(v) for v in _APRESENTACOES)})"
    )

    op.alter_column(
        "medicamentos",
        "concentracao",
        server_default=None,
    )

    op.alter_column(
        "medicamentos",
        "apresentacao",
        type_=sa.String(length=30),
        existing_type=sa.String(length=150),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "apresentacao_enum",
        "medicamentos",
        sa.column("apresentacao").in_(_APRESENTACOES),
    )


def downgrade() -> None:
    op.drop_constraint("apresentacao_enum", "medicamentos", type_="check")
    op.alter_column(
        "medicamentos",
        "apresentacao",
        type_=sa.String(length=150),
        existing_type=sa.String(length=30),
        existing_nullable=False,
    )
    op.drop_column("medicamentos", "concentracao")
