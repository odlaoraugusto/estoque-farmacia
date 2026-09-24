from datetime import date

from fastapi import APIRouter, Depends

from app.api.deps import exigir_perfis
from app.models.enums import PerfilEnum
from app.schemas.log import LogErroResultado
from app.services.log_service import listar_erros

router = APIRouter(prefix="/admin/logs", tags=["Admin — Logs"])

# Exclusivo do Admin (2026-09-18, pedido do cliente) — diferente das
# outras permissões do sistema, essa não passa pela matriz configurável:
# é acesso a log de erro cru do servidor, não uma ação operacional.
_PODE_VER_LOGS = exigir_perfis(PerfilEnum.admin)


@router.get("/erros", response_model=LogErroResultado, dependencies=[Depends(_PODE_VER_LOGS)])
def listar_erros_route(
    dias: int = 30,
    desde: date | None = None,
    ate: date | None = None,
    apenas_erros: bool = True,
):
    """Log de erro do backend (stderr do processo, ver `log_service.py`
    para o critério de parsing) — exclusivo do Admin."""
    return listar_erros(dias=dias, desde=desde, ate=ate, apenas_erros=apenas_erros)
