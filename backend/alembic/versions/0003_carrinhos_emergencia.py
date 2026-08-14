"""carrinhos de emergência viram unidades filhas rastreáveis

Revision ID: 0003_carrinhos_emergencia
Revises: 0002_apresentacao_concentracao
Create Date: 2026-08-13

Pedido do cliente (2026-08-13): os 18 carrinhos de emergência físicos do
hospital passam a ser locais de estoque rastreáveis — cada um vira uma
linha em `unidades` com `tipo=carrinho` e `unidade_pai_id` apontando para
a unidade real (CAF/UTI/Centro Cirúrgico/Emergência) onde está fisicamente
posicionado. Carrinho NUNCA gera acesso de sessão (não é opção de login).

`unidade_pai_id` é resolvido em tempo de migração via SELECT pelo nome da
unidade real (não hardcoda id) — assume que as 4 unidades reais já existem
(seed padrão do projeto, `scripts/seed_usuarios.py`). Se alguma não
existir, a migração falha alto e claro em vez de criar um carrinho órfão.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_carrinhos_emergencia"
down_revision: Union[str, None] = "0002_apresentacao_concentracao"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (nome do carrinho, nome da unidade real pai, descrição do kit interno)
_CARRINHOS = [
    ("Carro de Emergência Unidade Canguru", "CAF", None),
    (
        "Carro de Emergência Centro de Parto Normal",
        "CAF",
        "Kit de Emergência Hemorrágico Centro de Parto Normal (CPN)",
    ),
    (
        "Carro de Emergência Alojamento Conjunto",
        "CAF",
        "Kit de Emergência Hemorrágico ALCON Posto 1 e Posto 2",
    ),
    ("Carro de Emergência UTI Neonatal Nº 1", "UTI", None),
    ("Carro de Emergência UTI Neonatal Nº 2", "UTI", None),
    ("Carro de Emergência UTI Pediátrica 1", "UTI", None),
    ("Carro de Emergência UTI Pediátrica 2", "UTI", None),
    ("Carro de Emergência UCI Neonatal", "UTI", None),
    ("Carro de Emergência do Ambulatório", "Emergência", None),
    ("Maleta UTI Neo/UCINCO", "Emergência", None),
    ("Carro de Emergência Enfermaria Pediátrica", "Emergência", None),
    ("Carro de Emergência Pronto Socorro Obstétrico", "Emergência", None),
    (
        "Carro de Emergência Centro Obstétrico",
        "Emergência",
        "Kit de Emergência Hemorrágico Centro Obstétrico Nº 1 e Nº 2",
    ),
    ("Carro de Emergência Sala da Tomografia", "Emergência", None),
    ("Carro de Emergência Sala Exame Pediátrico", "Emergência", None),
    (
        "Carro de Emergência: Urgência e Emergência Pediátrica",
        "Emergência",
        "Kit de Emergência Hemorrágico Emergência Obstétrica",
    ),
    ("Carro de Emergência Centro Cirúrgico Nº 1", "Centro Cirúrgico", None),
    ("Carro de Emergência Centro Cirúrgico Nº 2", "Centro Cirúrgico", None),
]


def upgrade() -> None:
    op.add_column(
        "unidades",
        sa.Column(
            "tipo",
            sa.Enum(
                "unidade",
                "carrinho",
                name="tipo_unidade_enum",
                native_enum=False,
                length=10,
            ),
            nullable=False,
            server_default="unidade",
        ),
    )
    op.add_column(
        "unidades",
        sa.Column(
            "unidade_pai_id",
            sa.Integer(),
            sa.ForeignKey("unidades.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "unidades", sa.Column("descricao", sa.String(length=255), nullable=True)
    )
    op.create_index(
        "ix_unidades_unidade_pai_id", "unidades", ["unidade_pai_id"]
    )

    op.alter_column(
        "unidades",
        "nome",
        type_=sa.String(length=150),
        existing_type=sa.String(length=50),
        existing_nullable=False,
    )

    # Default só serve para o backfill das 4 linhas existentes acima — daqui
    # em diante o valor sempre vem explícito da aplicação (mesmo padrão
    # adotado em 0002_apresentacao_concentracao para `concentracao`).
    op.alter_column("unidades", "tipo", server_default=None)

    conn = op.get_bind()

    for nome, unidade_pai_nome, descricao in _CARRINHOS:
        pai_id = conn.execute(
            sa.text("SELECT id FROM unidades WHERE nome = :nome"),
            {"nome": unidade_pai_nome},
        ).scalar()

        if pai_id is None:
            raise RuntimeError(
                f"Unidade pai '{unidade_pai_nome}' não encontrada — não é "
                f"possível criar o carrinho '{nome}' sem ela. Rode o seed "
                "padrão das 4 unidades (scripts/seed_usuarios.py) antes "
                "desta migração."
            )

        conn.execute(
            sa.text(
                "INSERT INTO unidades (nome, tipo, unidade_pai_id, descricao) "
                "VALUES (:nome, 'carrinho', :pai_id, :descricao)"
            ),
            {"nome": nome, "pai_id": pai_id, "descricao": descricao},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM unidades WHERE tipo = 'carrinho'"))

    op.alter_column(
        "unidades",
        "nome",
        type_=sa.String(length=50),
        existing_type=sa.String(length=150),
        existing_nullable=False,
    )

    op.drop_index("ix_unidades_unidade_pai_id", table_name="unidades")
    op.drop_column("unidades", "descricao")
    op.drop_column("unidades", "unidade_pai_id")
    op.drop_column("unidades", "tipo")
