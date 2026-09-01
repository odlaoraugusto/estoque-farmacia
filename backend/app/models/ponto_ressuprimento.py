from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.database import Base


class PontoRessuprimento(Base):
    """Ponto de ressuprimento de um medicamento numa unidade satélite
    (UTI, Centro Cirúrgico, Emergência — nunca CAF): `quantidade_padrao`
    é o saldo que a unidade deveria manter; `quantidade_minima` é o
    gatilho — abaixo dela, a unidade precisa pedir ressuprimento até
    voltar à quantidade padrão (tela Ressuprimento, aba exclusiva de
    Farmacêutico/Coordenador)."""

    __tablename__ = "pontos_ressuprimento"

    id = Column(Integer, primary_key=True)
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"), nullable=False)
    unidade_id = Column(Integer, ForeignKey("unidades.id"), nullable=False)
    quantidade_padrao = Column(Integer, nullable=False)
    quantidade_minima = Column(Integer, nullable=False)

    medicamento = relationship("Medicamento", lazy="selectin")
    unidade = relationship("Unidade", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("medicamento_id", "unidade_id", name="uq_pontos_ressuprimento_medicamento_unidade"),
    )
