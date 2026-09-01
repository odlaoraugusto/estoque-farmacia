"""solicitação pública de devolução de medicamento

Revision ID: 0018_devolucao_medicamento
Revises: 0017_ressuprimento_carrinho
Create Date: 2026-09-01

Pedido do cliente: segunda função no mesmo formulário público (sem
login) do ressuprimento de carrinho — o setor devolve medicamento físico
não usado à farmácia/unidade satélite (não é o carrinho, e não é
exclusivo da CAF: qualquer unidade real pode ser escolhida como
destino). A unidade escolhida confirma dando entrada de um lote novo
(lote/validade digitados na hora, como uma Entrada de Estoque comum, só
que liberada em qualquer unidade — a regra "entrada só na CAF" vale só
para compra/doação/empréstimo).

Duas tabelas: `solicitacoes_devolucao_medicamento` (cabeçalho — setor,
unidade destino, paciente/prontuário quando tem controlado/
antimicrobiano, status) e `solicitacoes_devolucao_medicamento_itens` (um
medicamento + quantidade por linha, com `lote_id` preenchido só na
confirmação — rastreia qual lote novo nasceu de qual item)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0018_devolucao_medicamento"
down_revision: Union[str, None] = "0017_ressuprimento_carrinho"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "solicitacoes_devolucao_medicamento",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("data_hora", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("setor", sa.String(length=100), nullable=False),
        sa.Column("unidade_destino_id", sa.Integer(), sa.ForeignKey("unidades.id"), nullable=False),
        sa.Column("paciente_nome", sa.String(length=200), nullable=True),
        sa.Column("paciente_prontuario", sa.String(length=50), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pendente", "confirmada", name="status_devolucao_medicamento_enum", native_enum=False, length=15),
            nullable=False,
            server_default="pendente",
        ),
        sa.Column("usuario_confirmacao_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("data_confirmacao", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "solicitacoes_devolucao_medicamento_itens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "solicitacao_id",
            sa.Integer(),
            sa.ForeignKey("solicitacoes_devolucao_medicamento.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("medicamento_id", sa.Integer(), sa.ForeignKey("medicamentos.id"), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.Column("lote_id", sa.Integer(), sa.ForeignKey("lotes.id"), nullable=True),
        sa.CheckConstraint("quantidade > 0", name="ck_devolucao_medicamento_itens_quantidade_positiva"),
    )


def downgrade() -> None:
    op.drop_table("solicitacoes_devolucao_medicamento_itens")
    op.drop_table("solicitacoes_devolucao_medicamento")
