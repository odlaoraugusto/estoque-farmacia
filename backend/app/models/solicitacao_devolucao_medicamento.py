from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import StatusDevolucaoMedicamentoEnum


class SolicitacaoDevolucaoMedicamento(Base):
    """Registro público (sem login) de devolução de medicamento à
    farmácia/unidade satélite (2026-09-01, pedido do cliente) — o setor
    devolve item físico não usado, QUALQUER unidade real pode ser
    escolhida como destino (não é exclusivo da CAF, diferente da entrada
    por compra/doação/empréstimo). A farmácia/unidade escolhida confirma
    dando entrada de um lote novo (lote/validade digitados na hora).

    Não confundir com "Devolução de Carrinho" (TransferenciaService.
    devolver_carrinho) — aquilo é o carrinho devolvendo excesso de
    estoque (lote já existente) pra sua unidade-mãe; isto aqui é um
    setor devolvendo item físico à farmácia, virando lote novo."""

    __tablename__ = "solicitacoes_devolucao_medicamento"

    id = Column(Integer, primary_key=True)
    data_hora = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Setor clínico que está devolvendo (texto livre, mesma lista de
    # SETORES_DISPENSACAO já usada na Saída normal e no ressuprimento de
    # carrinho) — não é FK, é informativo.
    setor = Column(String(100), nullable=False)

    # Farmácia/unidade escolhida pelo setor no formulário público —
    # qualquer unidade real (satélite ou CAF), sem sugestão automática,
    # mesma liberdade de unidade_destino_id em SolicitacaoRessuprimentoCarrinho.
    unidade_destino_id = Column(Integer, ForeignKey("unidades.id"), nullable=False)

    # Obrigatórios (validado no service) quando algum item é medicamento
    # controlado OU antimicrobiano — mesma regra de SaidaService, mas
    # cobrindo os dois campos (o formulário de carrinho só olha
    # e_controlado).
    paciente_nome = Column(String(200), nullable=True)
    paciente_prontuario = Column(String(50), nullable=True)

    status = Column(
        Enum(
            StatusDevolucaoMedicamentoEnum,
            name="status_devolucao_medicamento_enum",
            native_enum=False,
            length=15,
        ),
        nullable=False,
        default=StatusDevolucaoMedicamentoEnum.pendente,
    )

    usuario_confirmacao_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    data_confirmacao = Column(DateTime(timezone=True), nullable=True)

    unidade_destino = relationship("Unidade", foreign_keys=[unidade_destino_id], lazy="selectin")
    usuario_confirmacao = relationship(
        "Usuario", foreign_keys=[usuario_confirmacao_id], lazy="selectin"
    )
    itens = relationship(
        "SolicitacaoDevolucaoMedicamentoItem", lazy="selectin", back_populates="solicitacao"
    )


class SolicitacaoDevolucaoMedicamentoItem(Base):
    """Um medicamento devolvido, com a quantidade informada pelo setor —
    o mesmo registro cobre vários medicamentos de uma vez. `lote_id` é
    preenchido só na confirmação, quando o lote novo é criado."""

    __tablename__ = "solicitacoes_devolucao_medicamento_itens"

    id = Column(Integer, primary_key=True)
    solicitacao_id = Column(
        Integer, ForeignKey("solicitacoes_devolucao_medicamento.id"), nullable=False, index=True
    )
    medicamento_id = Column(Integer, ForeignKey("medicamentos.id"), nullable=False)
    quantidade = Column(Integer, nullable=False)
    lote_id = Column(Integer, ForeignKey("lotes.id"), nullable=True)

    medicamento = relationship("Medicamento", lazy="selectin")
    lote = relationship("Lote", lazy="selectin")
    solicitacao = relationship(
        "SolicitacaoDevolucaoMedicamento", lazy="selectin", back_populates="itens"
    )
