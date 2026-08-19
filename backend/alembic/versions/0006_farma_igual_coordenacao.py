"""antimicrobiano + categoria de saida (Farmaceutico = Coordenador)

Revision ID: 0006_farma_igual_coordenacao
Revises: 0005_ajuste_estoque
Create Date: 2026-08-19

Duas colunas novas, sem quebrar dado existente:
- medicamentos.e_antimicrobiano (bool, default false) — vigilância de uso
  racional de antimicrobianos (DOT). Passa a exigir paciente/prontuário na
  Saída quando True (regra aplicada em SaidaService, não no banco).
- movimentacoes.categoria_saida (varchar, nullable) — normal/emprestimo/
  doacao, só preenchida em Saída daqui pra frente; saídas antigas ficam
  NULL (não é "normal" por default retroativo, é "não informado").

O resto do pedido do cliente (Descarte virar ação direta, Ajuste/carrinho/
consolidado abrindo pro Farmacêutico) é só mudança de regra de permissão
em código — não mexe em schema.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_farma_igual_coordenacao"
down_revision: Union[str, None] = "0005_ajuste_estoque"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medicamentos",
        sa.Column(
            "e_antimicrobiano",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "movimentacoes", sa.Column("categoria_saida", sa.String(length=15), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("movimentacoes", "categoria_saida")
    op.drop_column("medicamentos", "e_antimicrobiano")
