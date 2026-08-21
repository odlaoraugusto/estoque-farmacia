from sqlalchemy import Column, Enum, ForeignKey, Integer, String

from app.database.database import Base
from app.models.enums import TipoUnidadeEnum


class Unidade(Base):
    __tablename__ = "unidades"

    id = Column(Integer, primary_key=True)

    # CAF | UTI | Centro Cirúrgico | Emergência (livre, não é enum fechado
    # para não exigir migração se o hospital abrir mais unidades) —
    # mais, desde 2026-08-13, os 18 carrinhos de emergência (tipo=carrinho).
    # String(150): alguns nomes de carrinho passam de 50 caracteres.
    nome = Column(String(150), unique=True, nullable=False)

    # unidade: uma das 4 unidades reais (login/sessão possível).
    # carrinho: local de estoque rastreável sem acesso de sessão — nunca
    # aparece na seleção de unidade ativa nem como destino de Transferência
    # normal (só no fluxo dedicado de reposição CAF -> carrinho).
    tipo = Column(
        Enum(TipoUnidadeEnum, name="tipo_unidade_enum", native_enum=False, length=10),
        nullable=False,
        default=TipoUnidadeEnum.unidade,
        server_default=TipoUnidadeEnum.unidade.value,
    )

    # Preenchido só para carrinhos: id da unidade real onde o carrinho está
    # fisicamente posicionado. Nulo para as 4 unidades reais.
    unidade_pai_id = Column(
        Integer, ForeignKey("unidades.id"), nullable=True, index=True
    )

    # Texto livre para o kit interno do carrinho, quando houver (ex. "Kit
    # de Emergência Hemorrágico Centro Obstétrico Nº 1 e Nº 2").
    descricao = Column(String(255), nullable=True)
