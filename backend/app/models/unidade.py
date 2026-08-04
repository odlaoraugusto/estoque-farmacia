from sqlalchemy import Column, Integer, String

from app.database.database import Base


class Unidade(Base):
    __tablename__ = "unidades"

    id = Column(Integer, primary_key=True)

    # CAF | UTI | Centro Cirúrgico | Emergência (livre, não é enum fechado
    # para não exigir migração se a rede FESFSUS abrir mais unidades).
    nome = Column(String(50), unique=True, nullable=False)
