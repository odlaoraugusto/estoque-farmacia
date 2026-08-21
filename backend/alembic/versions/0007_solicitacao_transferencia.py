"""solicitacao de transferencia (satelite -> CAF) + destino/procedencia externa

Revision ID: 0007_solicitacao_transferencia
Revises: 0006_farma_igual_coordenacao
Create Date: 2026-08-20

Tabela nova `solicitacoes_transferencia` — satélite pede um medicamento
à CAF pelo sistema (fluxo antigo era só push: a CAF decidia sozinha o
que mandar). `categoria_saida`/`origem` continuam sendo string livre
(nenhuma migração de schema precisa pra aceitar os novos valores
"vencimento"/"permuta"/"emprestimo" nessas colunas) — só
`movimentacoes.destino_externo` e `lotes.procedencia_externa` são
colunas novas de verdade, pra registrar pra onde foi (Saída) ou de onde
veio (Entrada) um empréstimo/doação/permuta.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_solicitacao_transferencia"
down_revision: Union[str, None] = "0006_farma_igual_coordenacao"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "movimentacoes", sa.Column("destino_externo", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "lotes", sa.Column("procedencia_externa", sa.String(length=200), nullable=True)
    )
    op.create_table(
        "solicitacoes_transferencia",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("unidade_solicitante_id", sa.Integer(), nullable=False),
        sa.Column("medicamento_id", sa.Integer(), nullable=False),
        sa.Column("quantidade_desejada", sa.Integer(), nullable=False),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=15), nullable=False, server_default="pendente"),
        sa.Column("motivo_recusa", sa.Text(), nullable=True),
        sa.Column("movimentacao_id", sa.Integer(), nullable=True),
        sa.Column("usuario_solicitante_id", sa.Integer(), nullable=False),
        sa.Column("usuario_atendimento_id", sa.Integer(), nullable=True),
        sa.Column("data_solicitacao", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("data_atendimento", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["unidade_solicitante_id"], ["unidades.id"]),
        sa.ForeignKeyConstraint(["medicamento_id"], ["medicamentos.id"]),
        sa.ForeignKeyConstraint(["movimentacao_id"], ["movimentacoes.id"]),
        sa.ForeignKeyConstraint(["usuario_solicitante_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["usuario_atendimento_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_solicitacoes_transferencia_unidade_solicitante_id",
        "solicitacoes_transferencia",
        ["unidade_solicitante_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_solicitacoes_transferencia_unidade_solicitante_id",
        table_name="solicitacoes_transferencia",
    )
    op.drop_table("solicitacoes_transferencia")
    op.drop_column("lotes", "procedencia_externa")
    op.drop_column("movimentacoes", "destino_externo")
