from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import criar_access_token, verificar_senha
from app.repositories.unidade_repository import UnidadeRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.auth import LoginRequest, SelecionarUnidadeRequest, TokenResponse
from app.schemas.usuario import UsuarioMe


class AuthService:

    def __init__(self):
        self.usuario_repository = UsuarioRepository()
        self.unidade_repository = UnidadeRepository()

    def login(self, db: Session, dados: LoginRequest) -> TokenResponse:
        usuario = self.usuario_repository.get_by_login(db, dados.login)

        credenciais_invalidas = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login ou senha inválidos.",
        )

        if usuario is None or not verificar_senha(dados.senha, usuario.senha_hash):
            raise credenciais_invalidas

        if not usuario.ativo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuário inativo. Procure a coordenação.",
            )

        token = criar_access_token(
            {
                "sub": str(usuario.id),
                "perfil": usuario.perfil.value,
            }
        )

        return TokenResponse(
            access_token=token,
            usuario=UsuarioMe(
                id=usuario.id,
                nome=usuario.nome,
                login=usuario.login,
                perfil=usuario.perfil,
                crf=usuario.crf,
                unidade_ativa_id=None,
                unidade_ativa_nome=None,
            ),
        )

    def selecionar_unidade(
        self,
        db: Session,
        usuario_atual: UsuarioMe,
        dados: SelecionarUnidadeRequest,
    ) -> TokenResponse:
        unidade = self.unidade_repository.get_by_id(db, dados.unidade_id)

        if unidade is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unidade não encontrada.",
            )

        token = criar_access_token(
            {
                "sub": str(usuario_atual.id),
                "perfil": usuario_atual.perfil.value,
                "unidade_ativa_id": unidade.id,
                "unidade_ativa_nome": unidade.nome,
            }
        )

        return TokenResponse(
            access_token=token,
            usuario=UsuarioMe(
                id=usuario_atual.id,
                nome=usuario_atual.nome,
                login=usuario_atual.login,
                perfil=usuario_atual.perfil,
                crf=usuario_atual.crf,
                unidade_ativa_id=unidade.id,
                unidade_ativa_nome=unidade.nome,
            ),
        )
