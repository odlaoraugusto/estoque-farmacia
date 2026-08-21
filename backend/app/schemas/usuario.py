from datetime import datetime

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
    deve_trocar_senha: bool = False


class UsuarioCreate(BaseModel):
    """Gestão de usuários (2026-08-20) — exclusiva do Coordenador. `login`
    só existe aqui, nunca em `UsuarioUpdate`: é a chave que toda a trilha
    de auditoria referencia indiretamente (via `usuario_id`), então não
    faz sentido deixar mudar depois de criado — evita alguém "perder" a
    própria conta por um login digitado errado na hora de editar.

    Sem campo `senha` (2026-08-20): todo usuário novo nasce com a senha
    padrão fixa (`UsuarioService.SENHA_PADRAO_NOVO_USUARIO`) e é
    obrigado a trocá-la no primeiro login — o Coordenador não escolhe
    nem vê a senha de ninguém."""

    nome: str
    login: str
    perfil: PerfilEnum
    crf: str | None = None


class UsuarioUpdate(BaseModel):
    nome: str | None = None
    perfil: PerfilEnum | None = None
    crf: str | None = None
    ativo: bool | None = None
    # Opcional — só reseta a senha quando vem preenchida (fluxo de "voltou
    # do esquecimento de senha"). Nunca devolvida em nenhuma resposta.
    senha: str | None = None


class UsuarioOut(BaseModel):
    id: int
    nome: str
    login: str
    perfil: PerfilEnum
    crf: str | None = None
    ativo: bool
    deve_trocar_senha: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
