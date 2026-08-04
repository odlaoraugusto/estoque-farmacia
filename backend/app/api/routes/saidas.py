from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id
from app.database.session import get_db
from app.schemas.movimentacao import MovimentacaoDetalhadaOut, SaidaCreate
from app.schemas.usuario import UsuarioMe
from app.services.saida_service import SaidaService

router = APIRouter(prefix="/saidas", tags=["Saídas / Dispensação"])

service = SaidaService()


@router.post("", response_model=MovimentacaoDetalhadaOut)
def registrar_saida(
    dados: SaidaCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Regra 5: qualquer perfil pode dispensar."""
    return service.registrar(db, usuario, unidade_ativa_id, dados)
