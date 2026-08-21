"""destinatario na saida de emprestimo/doacao/permuta

Revision ID: 0009_saida_destinatario
Revises: 0008_medicamento_controlado
Create Date: 2026-08-20

`movimentacoes.destinatario` — pessoa responsável no destino que
recebeu, ao lado de `destino_externo` (a instituição). Mesma
obrigatoriedade nas categorias emprestimo/doacao/permuta.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_saida_destinatario"
down_revision: Union[str, None] = "0008_medicamento_controlado"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "movimentacoes", sa.Column("destinatario", sa.String(length=200), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("movimentacoes", "destinatario")
