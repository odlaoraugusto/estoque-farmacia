from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import StatusSolicitacaoEnum


class SolicitacaoTransferencia(Base):
    """Solicitação de transferência satélite -> CAF (2026-08-20): a
    unidade satélite pede um medicamento + quantidade pelo sistema, em
    vez do fluxo antigo (só push — a CAF decidia sozinha o que mandar).
    CAF aceita (escolhendo o lote a enviar, o que cria a `Movimentacao`
    de transferência de sempre — reaproveita `TransferenciaService.
    enviar`) ou recusa com motivo. Confirmação de recebimento continua
    sendo o fluxo já existente de `POST /transferencias/{id}/confirmar`
    — esta tabela só cobre o pedido em si, não duplica o rastreio que já
    existe em `movimentacoes`."""

    __tablename__ = "solicitacoes_transferencia"

    id = Column(Integer, primary_key=True)

    unidade_solicitante_id = Column(
        Integer, ForeignKey("unidades.id"), nullable=False, index=True
    )
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"), nullable=False)
    quantidade_desejada = Column(Integer, nullable=False)
    observacao = Column(Text, nullable=True)

    status = Column(
        Enum(
            StatusSolicitacaoEnum,
            name="status_solicitacao_enum",
            native_enum=False,
            length=15,
        ),
        nullable=False,
        default=StatusSolicitacaoEnum.pendente,
        server_default=StatusSolicitacaoEnum.pendente.value,
    )
    motivo_recusa = Column(Text, nullable=True)

    # Preenchido só quando a CAF aceita — aponta para a Movimentacao de
    # transferência criada no ato (mesma linha que aparece em
    # /transferencias/pendentes e na trilha de auditoria).
    movimentacao_id = Column(
        Integer, ForeignKey("movimentacoes.id"), nullable=True
    )

    usuario_solicitante_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario_atendimento_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    data_solicitacao = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    data_atendimento = Column(DateTime(timezone=True), nullable=True)

    # lazy="selectin" (não "joined") pelo mesmo motivo documentado em
    # app/models/lote.py e app/models/movimentacao.py: evita LEFT OUTER
    # JOIN junto de SELECT ... FOR UPDATE nas FKs opcionais.
    unidade_solicitante = relationship(
        "Unidade", foreign_keys=[unidade_solicitante_id], lazy="selectin"
    )
    medicamento = relationship("Medicamento", lazy="selectin")
    movimentacao = relationship("Movimentacao", lazy="selectin")
    usuario_solicitante = relationship(
        "Usuario", foreign_keys=[usuario_solicitante_id], lazy="selectin"
    )
    usuario_atendimento = relationship(
        "Usuario", foreign_keys=[usuario_atendimento_id], lazy="selectin"
    )
