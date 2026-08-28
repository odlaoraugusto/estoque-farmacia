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
