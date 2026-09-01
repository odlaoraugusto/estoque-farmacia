from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StatusDevolucaoMedicamentoEnum
from app.schemas.ressuprimento_carrinho import UnidadePublicaOut
from app.schemas.usuario import UsuarioResumo

# ---- Leitura pública (sem login) — alimenta o formulário ----


class MedicamentoDevolucaoPublicoOut(BaseModel):
    """Catálogo ativo inteiro (sem filtro de estoque — diferente do
    ressuprimento de carrinho, que só lista o que o carrinho tem em
    saldo) — o setor pode devolver qualquer medicamento que tenha em
    mãos."""

    id: int
    nome: str
    apresentacao: str
    concentracao: str | None
    e_controlado: bool
    e_antimicrobiano: bool

    model_config = ConfigDict(from_attributes=True)


# ---- Criação pública (sem login) ----


class DevolucaoMedicamentoItemCreate(BaseModel):
    medicamento_id: int
    quantidade: int = Field(gt=0)


class DevolucaoMedicamentoCreate(BaseModel):
    """Registrado pelo setor, sem login, ao devolver medicamento físico
    não usado — qualquer unidade real pode ser escolhida como destino
    (satélite ou CAF, sem restrição). `paciente_nome`/
    `paciente_prontuario` obrigatórios quando algum item é controlado OU
    antimicrobiano (validado no service)."""

    setor: str = Field(min_length=1)
    unidade_destino_id: int
    itens: list[DevolucaoMedicamentoItemCreate] = Field(min_length=1)
    paciente_nome: str | None = None
    paciente_prontuario: str | None = None


# ---- Confirmação (autenticado — qualquer perfil da unidade destino) ----


class ConfirmarItemDevolucaoMedicamento(BaseModel):
    """A unidade confere fisicamente e digita lote/validade — cria um
    lote novo (diferente da confirmação de ressuprimento de carrinho,
    que escolhe um lote já existente)."""

    item_id: int
    numero_lote: str = Field(min_length=1)
    data_validade: date
    quantidade: int = Field(gt=0)
    valor_unitario: Decimal = Decimal("0")


class ConfirmarDevolucaoMedicamentoCreate(BaseModel):
    itens: list[ConfirmarItemDevolucaoMedicamento] = Field(min_length=1)


# ---- Leitura autenticada (fila de pendentes da unidade) ----


class ItemSolicitacaoDevolucaoMedicamentoOut(BaseModel):
    id: int
    medicamento_id: int
    medicamento_nome: str
    quantidade: int
    e_controlado: bool
    e_antimicrobiano: bool
    lote_id: int | None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "ItemSolicitacaoDevolucaoMedicamentoOut":
        return cls(
            id=item.id,
            medicamento_id=item.medicamento_id,
            medicamento_nome=item.medicamento.nome,
            quantidade=item.quantidade,
            e_controlado=item.medicamento.e_controlado,
            e_antimicrobiano=item.medicamento.e_antimicrobiano,
            lote_id=item.lote_id,
        )


class SolicitacaoDevolucaoMedicamentoOut(BaseModel):
    id: int
    data_hora: datetime
    setor: str
    unidade_destino_id: int
    unidade_destino_nome: str
    paciente_nome: str | None
    paciente_prontuario: str | None
    status: StatusDevolucaoMedicamentoEnum
    usuario_confirmacao: UsuarioResumo | None
    data_confirmacao: datetime | None
    itens: list[ItemSolicitacaoDevolucaoMedicamentoOut]

    @classmethod
    def from_model(cls, s) -> "SolicitacaoDevolucaoMedicamentoOut":
        return cls(
            id=s.id,
            data_hora=s.data_hora,
            setor=s.setor,
            unidade_destino_id=s.unidade_destino_id,
            unidade_destino_nome=s.unidade_destino.nome,
            paciente_nome=s.paciente_nome,
            paciente_prontuario=s.paciente_prontuario,
            status=s.status,
            usuario_confirmacao=(
                UsuarioResumo.model_validate(s.usuario_confirmacao) if s.usuario_confirmacao else None
            ),
            data_confirmacao=s.data_confirmacao,
            itens=[ItemSolicitacaoDevolucaoMedicamentoOut.from_model(item) for item in s.itens],
        )
