"""chave de matriz para o Relatório Geral de Movimentações

Revision ID: 0019_perm_movimentacoes_geral
Revises: 0018_devolucao_medicamento
Create Date: 2026-09-02

Pedido do cliente: uma aba única de relatório reunindo Entrada, Saída,
Transferência, Reposição de Carrinho e Devolução de Medicamento,
filtrável por qualquer uma delas — e que o acesso a essa aba seja
controlado pela matriz configurável de `/permissoes` (Admin decide quem
vê), igual `relatorios_financeiro`/`reposicao_carrinho`. Sem seed
especial: nasce `false` para farmacêutico e atendente, o Admin libera
depois pela tela (mesma cautela de toda chave nova adicionada depois da
migração original `0015_matriz_permissoes`)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0019_perm_movimentacoes_geral"
down_revision: Union[str, None] = "0018_devolucao_medicamento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "permissoes_perfil",
        sa.Column("movimentacoes_geral", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("permissoes_perfil", "movimentacoes_geral")
