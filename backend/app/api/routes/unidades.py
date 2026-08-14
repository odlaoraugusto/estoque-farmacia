from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.models.enums import TipoUnidadeEnum
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.unidade import UnidadeOut

router = APIRouter(prefix="/unidades", tags=["Unidades"])

repository = UnidadeRepository()


@router.get("", response_model=list[UnidadeOut], dependencies=[Depends(get_current_user)])
def listar_unidades(
    tipo: TipoUnidadeEnum | None = None,
    db: Session = Depends(get_db),
):
    """Qualquer usuário autenticado pode listar. `tipo=unidade` é o que a
    tela de seleção de unidade ativa do login passa a usar (só as 4
    unidades reais — carrinho nunca é opção de login); `tipo=carrinho` é
    usado na tela de reposição de carrinho. Sem o filtro, continua
    devolvendo tudo (comportamento anterior preservado)."""
    return repository.list(db, tipo=tipo)
