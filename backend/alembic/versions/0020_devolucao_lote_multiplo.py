"""liga Movimentacao à solicitação de devolução (lote dividido)

Revision ID: 0020_devolucao_lote_multiplo
Revises: 0019_perm_movimentacoes_geral
Create Date: 2026-09-04

Pedido do cliente: um mesmo medicamento devolvido pode vir em mais de um
lote físico (ex.: enfermagem devolve 3 unidades de Ácido Tranexâmico,
2 de um lote e 1 de outro) — a farmácia precisa poder dar entrada de
cada lote separadamente na confirmação de UM item da solicitação.

O backend de `confirmar()` já aceitava múltiplas entradas com o mesmo
`item_id` (cada uma vira seu próprio Lote/Movimentacao) sem precisar de
mudança — o que faltava era uma forma de reencontrar TODOS os lotes de
uma solicitação depois, pro comprovante em PDF (antes vinha só de
`item.lote_id`, que é uma FK única e ficava sobrescrita quando um item
gerava mais de um lote).

`movimentacoes.solicitacao_devolucao_id` (nullable, só preenchido em
`tipo=entrada` vindo de devolução) resolve isso — mesmo padrão já usado
no projeto irmão Almoxarifado (`pedido_item_id`/`emprestimo_id` em
`movimentacoes` de lá)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0020_devolucao_lote_multiplo"
down_revision: Union[str, None] = "0019_perm_movimentacoes_geral"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "movimentacoes",
        sa.Column(
            "solicitacao_devolucao_id",
            sa.Integer(),
            sa.ForeignKey("solicitacoes_devolucao_medicamento.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("movimentacoes", "solicitacao_devolucao_id")
