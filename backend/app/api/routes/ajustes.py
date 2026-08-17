from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_unidade_ativa_id
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.movimentacao import AjusteCreate, MovimentacaoDetalhadaOut
from app.schemas.usuario import UsuarioMe
from app.services.ajuste_service import AjusteService

router = APIRouter(prefix="/ajustes", tags=["Ajustes"])

service = AjusteService()

# Ajuste de estoque é exclusivo do Coordenador — pedido do cliente
# (2026-08-14): corrige saldo fora dos fluxos normais (ex.: divergência
# de contagem física), então fica restrito a quem tem autoridade de
# aprovação no resto do sistema (mesmo perfil que aprova Descarte).
_PODE_AJUSTAR = exigir_perfis(PerfilEnum.coordenador)


@router.post("", response_model=MovimentacaoDetalhadaOut)
def ajustar_estoque(
    dados: AjusteCreate,
    usuario: UsuarioMe = Depends(_PODE_AJUSTAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    movimentacao = service.ajustar(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)
