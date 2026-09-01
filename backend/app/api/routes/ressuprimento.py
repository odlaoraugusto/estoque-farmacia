from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_current_user, resolver_unidade_escopo
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.ressuprimento import PontoRessuprimentoOut, PontoRessuprimentoUpsert, StatusRessuprimentoItem
from app.schemas.usuario import UsuarioMe
from app.services.ressuprimento_service import RessuprimentoService

router = APIRouter(prefix="/ressuprimento", tags=["Ressuprimento"])

service = RessuprimentoService()

# Cadastro dos pontos (quantidade padrão/mínima) é exclusivo de
# Farmacêutico/Coordenador (pedido do cliente — não entrou na matriz
# configurável de /permissoes, é fixo igual gestão de usuários).
_PODE_CONFIGURAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.get("/status", response_model=list[StatusRessuprimentoItem])
def listar_status(
    unidade_id: int | None = None,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cruza os pontos configurados com o saldo atual. Farmacêutico/
    Coordenador pode ver qualquer unidade (ou todas, omitindo o filtro —
    usado na aba de configuração); os demais perfis são sempre
    restritos à própria unidade ativa (usado na notificação "precisa
    ressuprir", liberada a qualquer perfil — é o profissional da
    satélite que vai fisicamente pedir o ressuprimento)."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)
    return service.listar_status(db, unidade_escopo)


@router.put("/pontos", response_model=PontoRessuprimentoOut, dependencies=[Depends(_PODE_CONFIGURAR)])
def definir_ponto(dados: PontoRessuprimentoUpsert, db: Session = Depends(get_db)):
    return service.definir_ponto(db, dados)
