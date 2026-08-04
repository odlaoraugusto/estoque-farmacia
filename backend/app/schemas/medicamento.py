from pydantic import BaseModel, ConfigDict

from app.models.enums import AcondicionamentoEnum, ApresentacaoEnum


class MedicamentoCreate(BaseModel):
    nome: str
    apresentacao: ApresentacaoEnum
    concentracao: str
    acondicionamento: AcondicionamentoEnum
    estoque_minimo: int = 0


class MedicamentoUpdate(BaseModel):
    nome: str | None = None
    apresentacao: ApresentacaoEnum | None = None
    concentracao: str | None = None
    acondicionamento: AcondicionamentoEnum | None = None
    estoque_minimo: int | None = None
    ativo: bool | None = None


class MedicamentoOut(BaseModel):
    id: int
    nome: str
    apresentacao: ApresentacaoEnum
    concentracao: str
    acondicionamento: AcondicionamentoEnum
    estoque_minimo: int
    ativo: bool

    model_config = ConfigDict(from_attributes=True)
