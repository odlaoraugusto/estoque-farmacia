from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.schemas.usuario import UsuarioMe
from app.schemas.versao import VersaoInfoOut
from app.services.versao_service import VersaoService

router = APIRouter(prefix="/versao", tags=["Versão"])

service = VersaoService()


@router.get("", response_model=VersaoInfoOut, dependencies=[Depends(get_current_user)])
def obter_versao():
    """Versão atual do sistema + histórico de notas de atualização —
    qualquer usuário autenticado (alimenta o rodapé do menu e o popup
    pós-login)."""
    return service.info()


@router.post("/marcar-lida", status_code=status.HTTP_204_NO_CONTENT)
def marcar_notas_lidas(usuario: UsuarioMe = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fecha o popup de notas = já leu — grava a versão atual como
    última vista por ESTE login, self-service (sem depender de outro
    perfil liberar)."""
    service.marcar_lida(db, usuario)
