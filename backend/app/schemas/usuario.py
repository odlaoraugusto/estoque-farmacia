from pydantic import BaseModel, ConfigDict

from app.models.enums import PerfilEnum


class UsuarioResumo(BaseModel):
    """Visão mínima de usuário — usada dentro de outras respostas (ex.
    quem registrou uma movimentação), sem expor login/hash."""

    id: int
    nome: str
    perfil: PerfilEnum
    crf: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UsuarioMe(BaseModel):
    id: int
    nome: str
    login: str
    perfil: PerfilEnum
    crf: str | None = None
    unidade_ativa_id: int | None = None
    unidade_ativa_nome: str | None = None
