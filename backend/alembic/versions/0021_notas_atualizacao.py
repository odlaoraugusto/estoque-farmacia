"""versao de notas de atualizacao vista pelo usuario

Revision ID: 0021_notas_atualizacao
Revises: 0020_devolucao_lote_multiplo
Create Date: 2026-09-22

Pedido do cliente: popup de notas de atualização (correções/novidades)
assim que o usuário loga, some depois de fechar (conta como "já leu") e
só reaparece numa versão nova. `usuarios.versao_notas_vista` guarda a
última versão que aquele login já fechou — comparada contra
`app.core.changelog.VERSAO_ATUAL` (não é coluna de tabela nenhuma, é
constante no código, atualizada a cada release)."""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0021_notas_atualizacao"
down_revision: Union[str, None] = "0020_devolucao_lote_multiplo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("usuarios", sa.Column("versao_notas_vista", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("usuarios", "versao_notas_vista")
