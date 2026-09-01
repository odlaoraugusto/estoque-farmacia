from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import StatusRessuprimentoCarrinhoEnum


class SolicitacaoRessuprimentoCarrinho(Base):
    """Registro público (sem login) de uso de um carrinho de emergência —
    o setor informa o que usou, a farmácia é notificada e confirma DUAS
    ações independentes: a saída direta do carrinho (baixa do que foi
    usado) e a transferência de reposição pra ele (reabastecimento).
    Cada uma tem seu próprio status/usuário/data de confirmação porque
    podem acontecer em momentos diferentes (2026-08-31, pedido do
    cliente)."""

    __tablename__ = "solicitacoes_ressuprimento_carrinho"

    id = Column(Integer, primary_key=True)
    data_hora = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Setor clínico que usou o carrinho (texto livre, mesma lista de
    # SETORES_DISPENSACAO já usada na Saída normal) — não é FK, é
    # informativo, igual setor_consumidor de Movimentacao.
    setor = Column(String(100), nullable=False)

    carrinho_id = Column(Integer, ForeignKey("unidades.id"), nullable=False)
    # Farmácia escolhida pelo setor no formulário público — qualquer
    # unidade real (satélite ou a própria CAF), sem sugestão automática
    # (pedido do cliente: sempre perguntar, sem pré-selecionar).
    unidade_destino_id = Column(Integer, ForeignKey("unidades.id"), nullable=False)

    # Obrigatórios (validado no service) quando algum item é medicamento
    # controlado — mesma regra de SaidaService para saída normal.
    paciente_nome = Column(String(200), nullable=True)
    paciente_prontuario = Column(String(50), nullable=True)

    status_saida = Column(
        Enum(StatusRessuprimentoCarrinhoEnum, name="status_ressuprimento_carrinho_enum", native_enum=False, length=15),
        nullable=False,
        default=StatusRessuprimentoCarrinhoEnum.pendente,
    )
    status_transferencia = Column(
        Enum(StatusRessuprimentoCarrinhoEnum, name="status_ressuprimento_carrinho_enum", native_enum=False, length=15),
        nullable=False,
        default=StatusRessuprimentoCarrinhoEnum.pendente,
    )

    usuario_confirmacao_saida_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    data_confirmacao_saida = Column(DateTime(timezone=True), nullable=True)
    usuario_confirmacao_transferencia_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    data_confirmacao_transferencia = Column(DateTime(timezone=True), nullable=True)

    carrinho = relationship("Unidade", foreign_keys=[carrinho_id], lazy="selectin")
    unidade_destino = relationship("Unidade", foreign_keys=[unidade_destino_id], lazy="selectin")
    usuario_confirmacao_saida = relationship(
        "Usuario", foreign_keys=[usuario_confirmacao_saida_id], lazy="selectin"
    )
    usuario_confirmacao_transferencia = relationship(
        "Usuario", foreign_keys=[usuario_confirmacao_transferencia_id], lazy="selectin"
    )
    itens = relationship(
        "SolicitacaoRessuprimentoCarrinhoItem", lazy="selectin", back_populates="solicitacao"
    )


class SolicitacaoRessuprimentoCarrinhoItem(Base):
    """Um medicamento usado do carrinho, com a quantidade informada pelo
    setor — o mesmo registro cobre vários medicamentos de uma vez."""

    __tablename__ = "solicitacoes_ressuprimento_carrinho_itens"

    id = Column(Integer, primary_key=True)
    solicitacao_id = Column(
        Integer, ForeignKey("solicitacoes_ressuprimento_carrinho.id"), nullable=False, index=True
    )
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"), nullable=False)
    quantidade_usada = Column(Integer, nullable=False)

    medicamento = relationship("Medicamento", lazy="selectin")
    solicitacao = relationship(
        "SolicitacaoRessuprimentoCarrinho", lazy="selectin", back_populates="itens"
    )
