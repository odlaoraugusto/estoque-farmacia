from pydantic import BaseModel, ConfigDict

from app.models.enums import TipoUnidadeEnum


class UnidadeOut(BaseModel):
    id: int
    nome: str
    tipo: TipoUnidadeEnum
    unidade_pai_id: int | None
    descricao: str | None

    model_config = ConfigDict(from_attributes=True)
