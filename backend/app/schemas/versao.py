from pydantic import BaseModel


class VersaoMudanca(BaseModel):
    tipo: str  # "correcao" | "novidade"
    descricao: str


class VersaoNota(BaseModel):
    versao: str
    data: str
    mudancas: list[VersaoMudanca]


class VersaoInfoOut(BaseModel):
    atual: str
    notas: list[VersaoNota]
