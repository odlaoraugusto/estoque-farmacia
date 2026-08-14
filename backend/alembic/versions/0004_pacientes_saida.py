"""paciente/prontuário opcional na Saída + tabela pacientes

Revision ID: 0004_pacientes_saida
Revises: 0003_carrinhos_emergencia
Create Date: 2026-08-14

Pedido do cliente (seção 22 de docs/00_PROJETO.md): Saída ganha vínculo
opcional com paciente/prontuário (dado sensível de saúde, LGPD). Nova
tabela `pacientes` que cresce organicamente a partir da própria Saída
(sem tela de cadastro dedicada) + 2 colunas nullable em `movimentacoes`
para gravar o nome/prontuário usados naquela Saída específica (histórico
imutável, mesmo que o cadastro do paciente seja depois corrigido).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_pacientes_saida"
down_revision: Union[str, None] = "0003_carrinhos_emergencia"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pacientes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prontuario", sa.String(length=50), nullable=False),
        sa.Column("nome", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index("ix_pacientes_prontuario", "pacientes", ["prontuario"], unique=True)

    op.add_column(
        "movimentacoes", sa.Column("paciente_nome", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "movimentacoes",
        sa.Column("paciente_prontuario", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("movimentacoes", "paciente_prontuario")
    op.drop_column("movimentacoes", "paciente_nome")

    op.drop_index("ix_pacientes_prontuario", table_name="pacientes")
    op.drop_table("pacientes")
