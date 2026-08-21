from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import criar_access_token, hash_senha, verificar_senha
from app.repositories.unidade_repository import UnidadeRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.auth import LoginRequest, SelecionarUnidadeRequest, TokenResponse, TrocarSenhaRequest
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
                deve_trocar_senha=usuario.deve_trocar_senha,
            ),
        )

    def selecionar_unidade(
        self,
        db: Session,
        usuario_atual: UsuarioMe,
        dados: SelecionarUnidadeRequest,
    ) -> TokenResponse:
        # Checagem fresca no banco (não confia só no JWT — o token de
        # login não carrega este flag): bloqueia seleção de unidade
        # enquanto a senha padrão/resetada não foi trocada
        # (`POST /auth/trocar-senha`).
        usuario_db = self.usuario_repository.get_by_id(db, usuario_atual.id)
        if usuario_db is not None and usuario_db.deve_trocar_senha:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Troque sua senha antes de continuar (POST /auth/trocar-senha).",
            )

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

    def trocar_senha(
        self, db: Session, usuario_atual: UsuarioMe, dados: TrocarSenhaRequest
    ) -> None:
        """Troca de senha obrigatória no primeiro login (2026-08-20) —
        exige a senha atual por segurança básica, mesmo já autenticado
        (evita que uma sessão roubada troque a senha sem saber a atual).
        Zera `deve_trocar_senha`, liberando `selecionar_unidade`."""
        usuario = self.usuario_repository.get_by_id(db, usuario_atual.id)
        if usuario is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado."
            )

        if not verificar_senha(dados.senha_atual, usuario.senha_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Senha atual incorreta.",
            )

        usuario.senha_hash = hash_senha(dados.senha_nova)
        usuario.deve_trocar_senha = False
        db.commit()
