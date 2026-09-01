"""pontos de ressuprimento por medicamento/unidade satélite

Revision ID: 0016_pontos_ressuprimento
Revises: 0015_matriz_permissoes
Create Date: 2026-08-31

Pedido do cliente: módulo "Ressuprimento" — cada medicamento tem, por
unidade satélite (UTI, Centro Cirúrgico, Emergência — nunca CAF, que é a
origem), uma quantidade padrão (o que a unidade deveria ter em estoque
normalmente) e uma quantidade mínima (o gatilho: quando o saldo atual cai
abaixo dela, a unidade precisa pedir ressuprimento até voltar à
quantidade padrão).

Tabela nova `pontos_ressuprimento` — uma linha por (medicamento, unidade)
configurado; nem todo medicamento precisa ter ponto definido em toda
unidade (cadastro incremental, farmacêutico/coordenador vai preenchendo
conforme a necessidade real de cada satélite)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0016_pontos_ressuprimento"
down_revision: Union[str, None] = "0015_matriz_permissoes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pontos_ressuprimento",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("medicamento_id", sa.Integer(), sa.ForeignKey("medicamentos.id"), nullable=False),
        sa.Column("unidade_id", sa.Integer(), sa.ForeignKey("unidades.id"), nullable=False),
        sa.Column("quantidade_padrao", sa.Integer(), nullable=False),
        sa.Column("quantidade_minima", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantidade_padrao >= 0", name="ck_pontos_ressuprimento_padrao_nao_negativo"),
        sa.CheckConstraint("quantidade_minima >= 0", name="ck_pontos_ressuprimento_minima_nao_negativa"),
    )
    op.create_unique_constraint(
        "uq_pontos_ressuprimento_medicamento_unidade",
        "pontos_ressuprimento",
        ["medicamento_id", "unidade_id"],
    )


def downgrade() -> None:
    op.drop_table("pontos_ressuprimento")
