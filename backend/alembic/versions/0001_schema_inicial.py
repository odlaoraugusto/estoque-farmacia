"""schema inicial — usuarios, unidades, medicamentos, lotes, movimentacoes

Revision ID: 0001_schema_inicial
Revises:
Create Date: 2026-07-31

Cria o schema completo descrito em docs/00_PROJETO.md, seção 6.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_schema_inicial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=150), nullable=False),
        sa.Column("login", sa.String(length=50), nullable=False),
        sa.Column("senha_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "perfil",
            sa.Enum(
                "coordenador",
                "farmaceutico",
                "atendente",
                name="perfil_enum",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("crf", sa.String(length=20), nullable=True),
        sa.Column(
            "ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("login", name="uq_usuarios_login"),
    )
    op.create_index("ix_usuarios_login", "usuarios", ["login"])

    op.create_table(
        "unidades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=50), nullable=False),
        sa.UniqueConstraint("nome", name="uq_unidades_nome"),
    )

    op.create_table(
        "medicamentos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=200), nullable=False),
        sa.Column("apresentacao", sa.String(length=150), nullable=False),
        sa.Column(
            "acondicionamento",
            sa.Enum(
                "ambiente",
                "geladeira",
                name="acondicionamento_enum",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "estoque_minimo", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "lotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "medicamento_id",
            sa.Integer(),
            sa.ForeignKey("medicamentos.id"),
            nullable=False,
        ),
        sa.Column(
            "unidade_id", sa.Integer(), sa.ForeignKey("unidades.id"), nullable=False
        ),
        sa.Column("numero_lote", sa.String(length=50), nullable=False),
        sa.Column("data_validade", sa.Date(), nullable=False),
        sa.Column("quantidade_atual", sa.Integer(), nullable=False),
        sa.Column(
            "valor_unitario", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column(
            "origem",
            sa.Enum(
                "compra",
                "doacao",
                name="origem_enum",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column("numero_nota_fiscal", sa.String(length=50), nullable=True),
        sa.Column("numero_afm", sa.String(length=50), nullable=True),
        sa.Column(
            "data_entrada",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "usuario_entrada_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=False,
        ),
        sa.Column(
            "status_transferencia",
            sa.Enum(
                "em_transito",
                "recebido",
                name="status_transferencia_enum",
                native_enum=False,
                length=20,
            ),
            nullable=True,
        ),
        sa.Column(
            "lote_origem_id", sa.Integer(), sa.ForeignKey("lotes.id"), nullable=True
        ),
        sa.CheckConstraint(
            "quantidade_atual >= 0", name="ck_lotes_quantidade_nao_negativa"
        ),
        sa.CheckConstraint(
            "origem <> 'compra' OR numero_nota_fiscal IS NOT NULL",
            name="ck_lotes_nota_fiscal_obrigatoria_compra",
        ),
    )
    op.create_index("ix_lotes_medicamento_id", "lotes", ["medicamento_id"])
    op.create_index("ix_lotes_unidade_id", "lotes", ["unidade_id"])

    op.create_table(
        "movimentacoes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tipo",
            sa.Enum(
                "entrada",
                "transferencia",
                "saida",
                "descarte",
                name="tipo_movimentacao_enum",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("lote_id", sa.Integer(), sa.ForeignKey("lotes.id"), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.Column(
            "unidade_origem_id",
            sa.Integer(),
            sa.ForeignKey("unidades.id"),
            nullable=True,
        ),
        sa.Column(
            "unidade_destino_id",
            sa.Integer(),
            sa.ForeignKey("unidades.id"),
            nullable=True,
        ),
        sa.Column("quantidade_recebida", sa.Integer(), nullable=True),
        sa.Column("setor_consumidor", sa.String(length=100), nullable=True),
        sa.Column("motivo_descarte", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pendente_aprovacao",
                "aprovado",
                "rejeitado",
                name="status_descarte_enum",
                native_enum=False,
                length=25,
            ),
            nullable=True,
        ),
        sa.Column(
            "usuario_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=False
        ),
        sa.Column(
            "usuario_solicitante_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=True,
        ),
        sa.Column(
            "usuario_aprovador_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=True,
        ),
        sa.Column(
            "usuario_confirmacao_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=True,
        ),
        sa.Column(
            "data_hora",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("data_confirmacao", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_movimentacoes_tipo", "movimentacoes", ["tipo"])
    op.create_index("ix_movimentacoes_lote_id", "movimentacoes", ["lote_id"])


def downgrade() -> None:
    op.drop_index("ix_movimentacoes_lote_id", table_name="movimentacoes")
    op.drop_index("ix_movimentacoes_tipo", table_name="movimentacoes")
    op.drop_table("movimentacoes")

    op.drop_index("ix_lotes_unidade_id", table_name="lotes")
    op.drop_index("ix_lotes_medicamento_id", table_name="lotes")
    op.drop_table("lotes")

    op.drop_table("medicamentos")
    op.drop_table("unidades")

    op.drop_index("ix_usuarios_login", table_name="usuarios")
    op.drop_table("usuarios")
