from sqlalchemy import Boolean, Column, Enum

from app.database.database import Base
from app.models.enums import PerfilEnum


class PermissaoPerfil(Base):
    """Matriz configurável pelo Admin (tela /permissoes) — uma linha por
    perfil configurável (farmacêutico, atendente; Coordenador e Admin são
    superusuários implícitos, nunca têm linha aqui — ver
    app/api/deps.py::exigir_permissao)."""

    __tablename__ = "permissoes_perfil"

    perfil = Column(Enum(PerfilEnum, name="perfil_enum", native_enum=False, length=20), primary_key=True)
    entrada = Column(Boolean, nullable=False, server_default="false")
    medicamentos = Column(Boolean, nullable=False, server_default="false")
    ajustar_estoque = Column(Boolean, nullable=False, server_default="false")
    corrigir_valor_unitario = Column(Boolean, nullable=False, server_default="false")
    transferencia_enviar = Column(Boolean, nullable=False, server_default="false")
    reposicao_carrinho = Column(Boolean, nullable=False, server_default="false")
    relatorios_financeiro = Column(Boolean, nullable=False, server_default="false")
