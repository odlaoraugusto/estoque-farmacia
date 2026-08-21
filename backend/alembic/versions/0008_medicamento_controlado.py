"""medicamento controlado (vigilancia diaria, igual antimicrobiano)

Revision ID: 0008_medicamento_controlado
Revises: 0007_solicitacao_transferencia
Create Date: 2026-08-20

`medicamentos.e_controlado` — classe irmã de `e_antimicrobiano` (já
prevista no comentário original do model): mesma regra de paciente/
prontuário obrigatório na Saída, mesmo relatório de vigilância diária.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_medicamento_controlado"
down_revision: Union[str, None] = "0007_solicitacao_transferencia"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medicamentos",
        sa.Column(
            "e_controlado",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("medicamentos", "e_controlado")
