from pydantic import BaseModel

from app.schemas.usuario import UsuarioMe


class LoginRequest(BaseModel):
    login: str
    senha: str


class SelecionarUnidadeRequest(BaseModel):
    unidade_id: int


class TrocarSenhaRequest(BaseModel):
    """Troca de senha obrigatória no primeiro login (2026-08-20) — exige a
    senha atual (a padrão "Senha123!" ou uma que já tenha sido trocada
    antes) por segurança básica, mesmo com o usuário já autenticado."""

    senha_atual: str
    senha_nova: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioMe
