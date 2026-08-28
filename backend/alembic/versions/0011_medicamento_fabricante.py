"""fabricante do medicamento (opcional)

Revision ID: 0011_medicamento_fabricante
Revises: 0010_usuario_trocar_senha
Create Date: 2026-08-27

Pedido do cliente (2026-08-27): campo de catálogo pra registrar o
fabricante do medicamento. Não obrigatório — nem todo cadastro/planilha
de importação traz essa informação.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_medicamento_fabricante"
down_revision: Union[str, None] = "0010_usuario_trocar_senha"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medicamentos",
        sa.Column("fabricante", sa.String(length=150), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("medicamentos", "fabricante")
