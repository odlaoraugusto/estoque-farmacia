from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_unidade_ativa_id
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.lote import EntradaCreate, LoteDetalhadoOut
from app.schemas.usuario import UsuarioMe
from app.services.entrada_service import EntradaService

router = APIRouter(prefix="/entradas", tags=["Entradas"])

service = EntradaService()

# Regra 2: só farmacêutico/coordenador registram entrada.
_PODE_REGISTRAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.post("", response_model=LoteDetalhadoOut, status_code=status.HTTP_201_CREATED)
def registrar_entrada(
    dados: EntradaCreate,
    usuario: UsuarioMe = Depends(_PODE_REGISTRAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    return service.registrar(db, usuario, unidade_ativa_id, dados)
