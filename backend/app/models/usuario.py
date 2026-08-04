from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import PerfilEnum


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True)

    nome = Column(String(150), nullable=False)
    login = Column(String(50), unique=True, nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)

    perfil = Column(
        Enum(PerfilEnum, name="perfil_enum", native_enum=False, length=20),
        nullable=False,
    )

    # Preenchido quando perfil = farmaceutico OU coordenador (coordenador
    # também é farmacêutico por formação — docs/00_PROJETO.md seção 6).
    crf = Column(String(20), nullable=True)

    ativo = Column(Boolean, nullable=False, default=True, server_default="true")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
