"""usuario deve trocar senha (senha padrao no primeiro login)

Revision ID: 0010_usuario_trocar_senha
Revises: 0009_saida_destinatario
Create Date: 2026-08-20

`usuarios.deve_trocar_senha` — server_default 'false' para não afetar
usuários já existentes (inclusive os de teste/bootstrap já em uso). A
partir de agora, todo usuário criado pela tela de Usuários nasce com
este flag True e senha padrão "Senha123!" (UsuarioService.criar), e um
reset manual de senha (UsuarioService.atualizar) liga o flag de novo.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_usuario_trocar_senha"
down_revision: Union[str, None] = "0009_saida_destinatario"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column(
            "deve_trocar_senha",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("usuarios", "deve_trocar_senha")
