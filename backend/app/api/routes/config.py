from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(prefix="/config", tags=["Configuração"])


class ConfigInstalacaoOut(BaseModel):
    hospital_nome: str
    organizacao: str


@router.get("", response_model=ConfigInstalacaoOut)
def config_instalacao():
    """Endpoint público (sem autenticação) — o frontend usa isso para
    montar o cabeçalho institucional já na tela de login."""
    return ConfigInstalacaoOut(
        hospital_nome=settings.HOSPITAL_NOME,
        organizacao=settings.HOSPITAL_ORGANIZACAO,
    )
