"""ajuste de estoque (exclusivo Coordenador)

Revision ID: 0005_ajuste_estoque
Revises: 0004_pacientes_saida
Create Date: 2026-08-14

Novo tipo de movimentação `ajuste` (não é um valor de enum nativo do
Postgres — `tipo` é `Enum(native_enum=False)`, ou seja, apenas uma coluna
varchar sem CHECK constraint no banco, então nenhuma migração de enum é
necessária para o valor em si). Só a coluna `motivo_ajuste` (texto livre,
obrigatório na regra de negócio, validado na camada de service) precisa
existir na tabela.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_ajuste_estoque"
down_revision: Union[str, None] = "0004_pacientes_saida"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "movimentacoes", sa.Column("motivo_ajuste", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("movimentacoes", "motivo_ajuste")
