from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import OrigemEnum, StatusTransferenciaEnum


class Lote(Base):
    """Estoque físico: cada lote pertence a UM medicamento e UMA unidade.

    Transferência parcial gera um novo registro de lote no destino
    (`lote_origem_id` aponta para o lote pai) — o lote de origem apenas
    tem `quantidade_atual` reduzida, nunca é duplicado na origem.
    """

    __tablename__ = "lotes"

    id = Column(Integer, primary_key=True)

    medicamento_id = Column(
        Integer, ForeignKey("medicamentos.id"), nullable=False, index=True
    )
    unidade_id = Column(Integer, ForeignKey("unidades.id"), nullable=False, index=True)

    numero_lote = Column(String(50), nullable=False)
    data_validade = Column(Date, nullable=False)

    quantidade_atual = Column(Integer, nullable=False)
    valor_unitario = Column(Numeric(12, 2), nullable=False, default=0)

    origem = Column(
        Enum(OrigemEnum, name="origem_enum", native_enum=False, length=10),
        nullable=False,
    )

    # Obrigatório se origem = compra (validado no service; reforçado aqui
    # via CHECK para não depender só da camada de aplicação).
    numero_nota_fiscal = Column(String(50), nullable=True)
    numero_afm = Column(String(50), nullable=True)

    # Procedência externa (2026-08-20) — obrigatório se origem=emprestimo
    # (de qual instituição veio); espelha `Movimentacao.destino_externo`
    # do lado da Saída. Nulo para compra/doação.
    procedencia_externa = Column(String(200), nullable=True)

    data_entrada = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    usuario_entrada_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    # nulo | em_transito | recebido — reflete o status da transferência
    # mais recente que envolveu este registro de lote (ver README, seção
    # "Decisões técnicas" sobre a interpretação adotada para este campo).
    status_transferencia = Column(
        Enum(
            StatusTransferenciaEnum,
            name="status_transferencia_enum",
            native_enum=False,
            length=20,
        ),
        nullable=True,
    )

    lote_origem_id = Column(Integer, ForeignKey("lotes.id"), nullable=True)

    # lazy="selectin" (não "joined"): consultas separadas por IN, em vez de
    # JOIN na query principal — necessário porque `get_by_id_for_update()`
    # usa `SELECT ... FOR UPDATE` e o Postgres recusa aplicar FOR UPDATE
    # quando a query tem LEFT OUTER JOIN em FK opcional (erro real
    # encontrado em revisão: "FOR UPDATE cannot be applied to the
    # nullable side of an outer join"). selectin evita N+1 igual ao
    # joined, só que como queries adicionais em vez de JOIN.
    medicamento = relationship("Medicamento", lazy="selectin")
    unidade = relationship("Unidade", foreign_keys=[unidade_id], lazy="selectin")
    usuario_entrada = relationship(
        "Usuario", foreign_keys=[usuario_entrada_id], lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("quantidade_atual >= 0", name="ck_lotes_quantidade_nao_negativa"),
        CheckConstraint(
            "origem <> 'compra' OR numero_nota_fiscal IS NOT NULL",
            name="ck_lotes_nota_fiscal_obrigatoria_compra",
        ),
    )
