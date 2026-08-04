from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.unidade import UnidadeOut

router = APIRouter(prefix="/unidades", tags=["Unidades"])

repository = UnidadeRepository()


@router.get("", response_model=list[UnidadeOut], dependencies=[Depends(get_current_user)])
def listar_unidades(db: Session = Depends(get_db)):
    """Qualquer usuário autenticado pode listar — usado na tela de
    seleção de unidade ativa, logo após o login."""
    return repository.list(db)
