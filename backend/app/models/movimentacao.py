from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import StatusDescarteEnum, TipoMovimentacaoEnum


class Movimentacao(Base):
    """Trilha de auditoria — nunca se apaga uma linha desta tabela."""

    __tablename__ = "movimentacoes"

    id = Column(Integer, primary_key=True)

    tipo = Column(
        Enum(
            TipoMovimentacaoEnum,
            name="tipo_movimentacao_enum",
            native_enum=False,
            length=20,
        ),
        nullable=False,
        index=True,
    )

    lote_id = Column(Integer, ForeignKey("lotes.id"), nullable=False, index=True)
    quantidade = Column(Integer, nullable=False)

    unidade_origem_id = Column(Integer, ForeignKey("unidades.id"), nullable=True)
    unidade_destino_id = Column(Integer, ForeignKey("unidades.id"), nullable=True)

    # Preenchido só na confirmação de transferência; presença deste valor
    # (não nulo) é o que marca a transferência como "recebida" — não há
    # uma coluna "status" genérica de transferência, só a de descarte
    # (ver abaixo), conforme docs/00_PROJETO.md seção 6.
    quantidade_recebida = Column(Integer, nullable=True)

    setor_consumidor = Column(String(100), nullable=True)  # obrigatório em saída
    motivo_descarte = Column(Text, nullable=True)  # obrigatório em descarte

    # Paciente/prontuário (seção 22 do doc) — opcional, só usado em
    # Saída. Sempre em CAIXA ALTA (normalizado no service, nunca confia
    # no que vem do front). Dado sensível de saúde (LGPD): a leitura
    # desses 2 campos é restrita a Farmacêutico/Coordenador na camada de
    # serialização (`app/schemas/movimentacao.py`,
    # `MovimentacaoOut.visivel_para`), não aqui no model — o banco
    # sempre guarda o dado completo, quem filtra é a resposta da API.
    paciente_nome = Column(String(200), nullable=True)
    paciente_prontuario = Column(String(50), nullable=True)

    status = Column(
        Enum(
            StatusDescarteEnum,
            name="status_descarte_enum",
            native_enum=False,
            length=25,
        ),
        nullable=True,  # só usado quando tipo = descarte
    )

    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    usuario_solicitante_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario_aprovador_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario_confirmacao_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    data_hora = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    data_confirmacao = Column(DateTime(timezone=True), nullable=True)

    # lazy="selectin" (não "joined") pelo mesmo motivo documentado em
    # app/models/lote.py: `get_by_id_for_update()` usa `SELECT ... FOR
    # UPDATE`, que o Postgres recusa quando a query tem LEFT OUTER JOIN
    # em FK opcional (a maioria das FKs de usuário aqui é nullable).
    lote = relationship("Lote", lazy="selectin")
    unidade_origem = relationship(
        "Unidade", foreign_keys=[unidade_origem_id], lazy="selectin"
    )
    unidade_destino = relationship(
        "Unidade", foreign_keys=[unidade_destino_id], lazy="selectin"
    )
    usuario = relationship("Usuario", foreign_keys=[usuario_id], lazy="selectin")
    usuario_solicitante = relationship(
        "Usuario", foreign_keys=[usuario_solicitante_id], lazy="selectin"
    )
    usuario_aprovador = relationship(
        "Usuario", foreign_keys=[usuario_aprovador_id], lazy="selectin"
    )
    usuario_confirmacao = relationship(
        "Usuario", foreign_keys=[usuario_confirmacao_id], lazy="selectin"
    )
