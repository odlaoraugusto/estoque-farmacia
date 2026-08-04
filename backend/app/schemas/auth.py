from pydantic import BaseModel

from app.schemas.usuario import UsuarioMe


class LoginRequest(BaseModel):
    login: str
    senha: str


class SelecionarUnidadeRequest(BaseModel):
    unidade_id: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioMe
