from pydantic import BaseModel, ConfigDict

from app.models.enums import AcondicionamentoEnum


class MedicamentoCreate(BaseModel):
    nome: str
    # Texto livre (2026-08-28) — era um enum fechado de 15 formas
    # farmacêuticas; o cliente passou a usar siglas próprias, que não
    # cabiam na lista fechada.
    apresentacao: str
    concentracao: str | None = None
    fabricante: str | None = None
    acondicionamento: AcondicionamentoEnum | None = None
    estoque_minimo: int = 0
    e_antimicrobiano: bool = False
    e_controlado: bool = False


class MedicamentoUpdate(BaseModel):
    nome: str | None = None
    apresentacao: str | None = None
    concentracao: str | None = None
    fabricante: str | None = None
    acondicionamento: AcondicionamentoEnum | None = None
    estoque_minimo: int | None = None
    ativo: bool | None = None
    e_antimicrobiano: bool | None = None
    e_controlado: bool | None = None


class MedicamentoOut(BaseModel):
    id: int
    nome: str
    apresentacao: str
    concentracao: str | None
    fabricante: str | None
    acondicionamento: AcondicionamentoEnum | None
    estoque_minimo: int
    ativo: bool
    e_antimicrobiano: bool
    e_controlado: bool

    model_config = ConfigDict(from_attributes=True)


class MedicamentoImportarValorAtualizado(BaseModel):
    """Uma linha da planilha que bateu com exatamente um medicamento
    ativo (por nome) e teve o valor unitário aplicado a todos os lotes
    ATIVOS (com saldo) daquele medicamento, em qualquer unidade — não
    existe um "valor do medicamento" único (o preço mora no lote, que
    varia por compra), então a planilha vale como "preço atual desse
    medicamento" e é aplicada em cada lote com saldo (2026-09-18, pedido
    do cliente)."""

    nome: str
    lotes_atualizados: int
    valor_novo: str


class MedicamentoImportarValorLinhaInvalida(BaseModel):
    linha: int
    motivo: str


class MedicamentoImportarValorResultado(BaseModel):
    atualizados: list[MedicamentoImportarValorAtualizado]
    nao_encontrados: list[str]
    ambiguos: list[str]
    # Nome bateu com um medicamento ativo, mas ele não tem nenhum lote
    # com saldo agora — nada pra atualizar, reportado à parte de
    # "não encontrado" pra não confundir as duas causas.
    sem_lote_ativo: list[str]
    invalidas: list[MedicamentoImportarValorLinhaInvalida]
