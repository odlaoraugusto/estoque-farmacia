"""maleta UTI Pediátrica vira carrinho próprio

Revision ID: 0013_maleta_uti_pediatrica
Revises: 0012_kits_hemorragicos
Create Date: 2026-08-28

Pedido do cliente (2026-08-28). Unidade-mãe: UTI — mesmo padrão dos
carrinhos "Carro de Emergência UTI Pediátrica 1/2", já cadastrados sob
UTI na migration 0003 (a "Maleta UTI Neo/UCINCO" existente é um carrinho
diferente, parenteado a Emergência desde a origem — não serve de
referência pra este).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013_maleta_uti_pediatrica"
down_revision: Union[str, None] = "0012_kits_hemorragicos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NOME = "Maleta UTI Pediátrica"
_UNIDADE_PAI_NOME = "UTI"


def upgrade() -> None:
    conn = op.get_bind()

    pai_id = conn.execute(
        sa.text("SELECT id FROM unidades WHERE nome = :nome"),
        {"nome": _UNIDADE_PAI_NOME},
    ).scalar()

    if pai_id is None:
        raise RuntimeError(
            f"Unidade pai '{_UNIDADE_PAI_NOME}' não encontrada — não é "
            f"possível criar o carrinho '{_NOME}' sem ela."
        )

    conn.execute(
        sa.text(
            "INSERT INTO unidades (nome, tipo, unidade_pai_id) "
            "VALUES (:nome, 'carrinho', :pai_id)"
        ),
        {"nome": _NOME, "pai_id": pai_id},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM unidades WHERE nome = :nome"), {"nome": _NOME})
