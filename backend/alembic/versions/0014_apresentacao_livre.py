"""apresentação vira texto livre; concentração e acondicionamento opcionais

Revision ID: 0014_apresentacao_livre
Revises: 0013_maleta_uti_pediatrica
Create Date: 2026-08-28

Pedido do cliente (2026-08-28): a lista fechada de 15 formas
farmacêuticas não cobria as siglas próprias que o hospital usa — vira
texto livre. `concentracao` e `acondicionamento` deixam de ser
obrigatórios (nem todo cadastro do cliente informa os dois na hora).

`apresentacao` tinha um CHECK constraint de verdade no banco (achado ao
conferir antes de mexer — diferente de `perfil`/`admin`, que não tinha
nenhum) — precisa ser derrubado, senão qualquer sigla fora da lista
antiga quebra a Entrada/cadastro com erro de banco.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0014_apresentacao_livre"
down_revision: Union[str, None] = "0013_maleta_uti_pediatrica"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VALORES_ANTIGOS = (
    "comprimido", "capsula", "solucao_oral", "xarope", "suspensao",
    "solucao_injetavel", "ampola", "frasco_ampola", "pomada", "creme",
    "gel", "spray", "supositorio", "adesivo", "bolsa",
)


def upgrade() -> None:
    op.drop_constraint("apresentacao_enum", "medicamentos", type_="check")
    op.alter_column(
        "medicamentos",
        "apresentacao",
        existing_type=sa.String(length=30),
        type_=sa.String(length=50),
        existing_nullable=False,
    )
    op.alter_column(
        "medicamentos",
        "concentracao",
        existing_type=sa.String(length=100),
        nullable=True,
    )
    op.alter_column(
        "medicamentos",
        "acondicionamento",
        existing_type=sa.String(length=20),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "medicamentos",
        "acondicionamento",
        existing_type=sa.String(length=20),
        nullable=False,
    )
    op.alter_column(
        "medicamentos",
        "concentracao",
        existing_type=sa.String(length=100),
        nullable=False,
    )
    op.alter_column(
        "medicamentos",
        "apresentacao",
        existing_type=sa.String(length=50),
        type_=sa.String(length=30),
        existing_nullable=False,
    )
    valores_sql = ", ".join(f"'{v}'" for v in _VALORES_ANTIGOS)
    op.create_check_constraint(
        "apresentacao_enum",
        "medicamentos",
        f"apresentacao IN ({valores_sql})",
    )
