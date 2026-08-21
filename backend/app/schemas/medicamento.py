from pydantic import BaseModel, ConfigDict

from app.models.enums import AcondicionamentoEnum, ApresentacaoEnum


class MedicamentoCreate(BaseModel):
    nome: str
    apresentacao: ApresentacaoEnum
    concentracao: str
    acondicionamento: AcondicionamentoEnum
    estoque_minimo: int = 0
    e_antimicrobiano: bool = False
    e_controlado: bool = False


class MedicamentoUpdate(BaseModel):
    nome: str | None = None
    apresentacao: ApresentacaoEnum | None = None
    concentracao: str | None = None
    acondicionamento: AcondicionamentoEnum | None = None
    estoque_minimo: int | None = None
    ativo: bool | None = None
    e_antimicrobiano: bool | None = None
    e_controlado: bool | None = None


class MedicamentoOut(BaseModel):
    id: int
    nome: str
    apresentacao: ApresentacaoEnum
    concentracao: str
    acondicionamento: AcondicionamentoEnum
    estoque_minimo: int
    ativo: bool
    e_antimicrobiano: bool
    e_controlado: bool

    model_config = ConfigDict(from_attributes=True)
