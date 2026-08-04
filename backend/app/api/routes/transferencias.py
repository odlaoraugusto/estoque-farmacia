from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import (
    exigir_perfis,
    get_current_user,
    get_unidade_ativa_id,
    resolver_unidade_escopo,
)
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.movimentacao import (
    MovimentacaoDetalhadaOut,
    TransferenciaConfirmarCreate,
    TransferenciaEnviarCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.transferencia_service import TransferenciaService

router = APIRouter(prefix="/transferencias", tags=["Transferências"])

service = TransferenciaService()

# Regra 3: enviar é restrito a farmacêutico/coordenador.
_PODE_ENVIAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.post("/enviar", response_model=MovimentacaoDetalhadaOut)
def enviar_transferencia(
    dados: TransferenciaEnviarCreate,
    usuario: UsuarioMe = Depends(_PODE_ENVIAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    return service.enviar(db, usuario, unidade_ativa_id, dados)


@router.post("/{movimentacao_id}/confirmar", response_model=MovimentacaoDetalhadaOut)
def confirmar_transferencia(
    movimentacao_id: int,
    dados: TransferenciaConfirmarCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Regra 4: qualquer perfil (incluindo atendente) pode confirmar,
    desde que esteja na unidade de destino."""
    return service.confirmar(db, usuario, unidade_ativa_id, movimentacao_id, dados)


@router.get("/pendentes", response_model=list[MovimentacaoDetalhadaOut])
def listar_transferencias_pendentes(
    unidade_destino_id: int | None = None,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Coordenador pode ver pendentes de qualquer unidade (ou de todas,
    omitindo o filtro); os demais perfis só veem as pendentes da própria
    unidade ativa."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_destino_id)

    return service.listar_pendentes(db, unidade_escopo)
