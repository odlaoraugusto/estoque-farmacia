from pydantic import BaseModel, ConfigDict


class UnidadeOut(BaseModel):
    id: int
    nome: str

    model_config = ConfigDict(from_attributes=True)
