"""kits de emergência hemorrágica viram carrinhos próprios

Revision ID: 0012_kits_hemorragicos
Revises: 0011_medicamento_fabricante
Create Date: 2026-08-28

Pedido do cliente (2026-08-28): os kits de emergência hemorrágica —
mencionados desde a seção 21 do doc só como descrição textual dentro de
outros carrinhos, sem virar unidade de estoque própria — agora precisam
de estoque rastreável próprio, cada um seu carrinho.

Unidade-mãe de cada kit resolvida pelo carrinho onde ele era citado como
descrição na migration 0003 (`_CARRINHOS`): ALCON Posto 1/2 e CPN vinham
do "Carro de Emergência Alojamento Conjunto"/"Centro de Parto Normal"
(ambos CAF); CO nº 1/nº 2 e Emergência Obstétrica vinham do "Carro de
Emergência Centro Obstétrico"/":Urgência e Emergência Pediátrica" (ambos
Emergência).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012_kits_hemorragicos"
down_revision: Union[str, None] = "0011_medicamento_fabricante"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_KITS = [
    ("Kit de Emergência Hemorrágico ALCON Posto 1", "CAF"),
    ("Kit de Emergência Hemorrágico ALCON Posto 2", "CAF"),
    ("Kit de Emergência Hemorrágico CPN", "CAF"),
    ("Kit de Emergência Hemorrágico CO nº 1", "Emergência"),
    ("Kit de Emergência Hemorrágico CO nº 2", "Emergência"),
    ("Kit de Emergência Hemorrágico Emergência Obstétrica", "Emergência"),
]


def upgrade() -> None:
    conn = op.get_bind()

    for nome, unidade_pai_nome in _KITS:
        pai_id = conn.execute(
            sa.text("SELECT id FROM unidades WHERE nome = :nome"),
            {"nome": unidade_pai_nome},
        ).scalar()

        if pai_id is None:
            raise RuntimeError(
                f"Unidade pai '{unidade_pai_nome}' não encontrada — não é "
                f"possível criar o kit '{nome}' sem ela."
            )

        conn.execute(
            sa.text(
                "INSERT INTO unidades (nome, tipo, unidade_pai_id) "
                "VALUES (:nome, 'carrinho', :pai_id)"
            ),
            {"nome": nome, "pai_id": pai_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM unidades WHERE nome = ANY(:nomes)"),
        {"nomes": [nome for nome, _ in _KITS]},
    )
