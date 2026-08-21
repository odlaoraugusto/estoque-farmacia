from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.schemas.auth import LoginRequest, SelecionarUnidadeRequest, TokenResponse, TrocarSenhaRequest
from app.schemas.usuario import UsuarioMe
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Autenticação"])

service = AuthService()


@router.post("/login", response_model=TokenResponse)
def login(dados: LoginRequest, db: Session = Depends(get_db)):
    return service.login(db, dados)


@router.post("/selecionar-unidade", response_model=TokenResponse)
def selecionar_unidade(
    dados: SelecionarUnidadeRequest,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Emite um novo token com `unidade_ativa_id` embutido e assinado —
    ver app/api/deps.py para a justificativa desse desenho de sessão."""
    return service.selecionar_unidade(db, usuario, dados)


@router.get("/me", response_model=UsuarioMe)
def me(usuario: UsuarioMe = Depends(get_current_user)):
    return usuario


@router.post("/trocar-senha", status_code=204)
def trocar_senha(
    dados: TrocarSenhaRequest,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Troca de senha obrigatória no primeiro login (senha padrão ou
    resetada pelo Coordenador) — não exige unidade ativa selecionada,
    só sessão válida."""
    service.trocar_senha(db, usuario, dados)
