"""Dependências de autenticação/autorização compartilhadas pelos routers.

Decisão técnica: sessão via JWT assinado pelo servidor. O token de login
não carrega unidade ativa; o endpoint `POST /auth/selecionar-unidade`
valida a unidade no banco e emite um NOVO token com `unidade_ativa_id`
embutido. Como o token é assinado com `JWT_SECRET_KEY` (o cliente não
consegue forjar/alterar o payload sem invalidar a assinatura), a unidade
ativa passa a ser um dado de sessão verificável no servidor a cada
requisição — não um campo solto que o front manda sem checagem.
"""

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decodificar_access_token
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.usuario import UsuarioMe

_security = HTTPBearer(auto_error=True)
_usuario_repository = UsuarioRepository()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    db: Session = Depends(get_db),
) -> UsuarioMe:
    try:
        payload = decodificar_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada. Faça login novamente.",
        )

    usuario_id = payload.get("sub")
    if usuario_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida.",
        )

    usuario = _usuario_repository.get_by_id(db, int(usuario_id))
    if usuario is None or not usuario.ativo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário inexistente ou inativo.",
        )

    return UsuarioMe(
        id=usuario.id,
        nome=usuario.nome,
        login=usuario.login,
        perfil=usuario.perfil,
        crf=usuario.crf,
        unidade_ativa_id=payload.get("unidade_ativa_id"),
        unidade_ativa_nome=payload.get("unidade_ativa_nome"),
    )


def get_unidade_ativa_id(
    usuario: UsuarioMe = Depends(get_current_user),
) -> int:
    """Garante que a sessão já selecionou uma unidade ativa — obrigatório
    para Entrada, Transferência-enviar, Saída, Descarte e relatórios
    escopados por unidade."""
    if usuario.unidade_ativa_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecione uma unidade ativa antes de continuar "
            "(POST /auth/selecionar-unidade).",
        )

    return usuario.unidade_ativa_id


def resolver_unidade_escopo(
    usuario: UsuarioMe, unidade_id_solicitado: int | None
) -> int | None:
    """Aplica a regra "só Coordenador enxerga consolidado de todas as
    unidades" (docs/00_PROJETO.md seção 9, default 3): os demais perfis
    são sempre restritos à própria unidade ativa nos relatórios/listagens
    escopadas por unidade, mesmo que tentem informar outro `unidade_id`
    na query string — o valor da query é ignorado nesse caso."""
    if usuario.perfil == PerfilEnum.coordenador:
        return unidade_id_solicitado

    if usuario.unidade_ativa_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecione uma unidade ativa antes de continuar "
            "(POST /auth/selecionar-unidade).",
        )

    return usuario.unidade_ativa_id


def exigir_perfis(*perfis_permitidos: PerfilEnum):
    """Factory de dependência para restringir um endpoint a um subconjunto
    de perfis. Uso: `Depends(exigir_perfis(PerfilEnum.coordenador))`."""

    def verificador(usuario: UsuarioMe = Depends(get_current_user)) -> UsuarioMe:
        if usuario.perfil not in perfis_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Perfil sem permissão para esta operação.",
            )

        return usuario

    return verificador
