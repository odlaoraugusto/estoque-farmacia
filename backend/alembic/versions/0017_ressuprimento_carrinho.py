"""solicitação pública de ressuprimento de carrinho de emergência

Revision ID: 0017_ressuprimento_carrinho
Revises: 0016_pontos_ressuprimento
Create Date: 2026-08-31

Pedido do cliente: painel público (sem login), no estilo do formulário de
pedido do projeto irmão Almoxarifado, para o setor registrar quando usou
um carrinho de emergência/maleta/kit — o quê, quanto, e pra qual farmácia
(satélite ou CAF) pedir o ressuprimento. Isso vira uma notificação em
pop-up pra farmácia, com DUAS ações independentes de confirmação:
1. Saída direta do carrinho (baixa real do que foi usado).
2. Transferência da farmácia responsável para o carrinho (reabastecer).

Duas tabelas: `solicitacoes_ressuprimento_carrinho` (cabeçalho — setor,
carrinho, farmácia destino, paciente/prontuário quando tem controlado, e
o status de cada uma das duas ações) e
`solicitacoes_ressuprimento_carrinho_itens` (um medicamento + quantidade
usada por linha — o mesmo pedido pode cobrir vários medicamentos de uma
vez)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0017_ressuprimento_carrinho"
down_revision: Union[str, None] = "0016_pontos_ressuprimento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "solicitacoes_ressuprimento_carrinho",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("data_hora", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("setor", sa.String(length=100), nullable=False),
        sa.Column("carrinho_id", sa.Integer(), sa.ForeignKey("unidades.id"), nullable=False),
        sa.Column("unidade_destino_id", sa.Integer(), sa.ForeignKey("unidades.id"), nullable=False),
        sa.Column("paciente_nome", sa.String(length=200), nullable=True),
        sa.Column("paciente_prontuario", sa.String(length=50), nullable=True),
        sa.Column(
            "status_saida",
            sa.Enum("pendente", "confirmada", name="status_ressuprimento_carrinho_enum", native_enum=False, length=15),
            nullable=False,
            server_default="pendente",
        ),
        sa.Column(
            "status_transferencia",
            sa.Enum("pendente", "confirmada", name="status_ressuprimento_carrinho_enum", native_enum=False, length=15),
            nullable=False,
            server_default="pendente",
        ),
        sa.Column("usuario_confirmacao_saida_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("data_confirmacao_saida", sa.DateTime(timezone=True), nullable=True),
        sa.Column("usuario_confirmacao_transferencia_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("data_confirmacao_transferencia", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "solicitacoes_ressuprimento_carrinho_itens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "solicitacao_id",
            sa.Integer(),
            sa.ForeignKey("solicitacoes_ressuprimento_carrinho.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("medicamento_id", sa.Integer(), sa.ForeignKey("medicamentos.id"), nullable=False),
        sa.Column("quantidade_usada", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantidade_usada > 0", name="ck_ressuprimento_carrinho_itens_quantidade_positiva"),
    )


def downgrade() -> None:
    op.drop_table("solicitacoes_ressuprimento_carrinho_itens")
    op.drop_table("solicitacoes_ressuprimento_carrinho")
