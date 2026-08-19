from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_unidade_ativa_id
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.movimentacao import DescarteCreate, MovimentacaoDetalhadaOut
from app.schemas.usuario import UsuarioMe
from app.services.descarte_service import DescarteService

router = APIRouter(prefix="/descartes", tags=["Descartes"])

service = DescarteService()

# Descarte é ação direta desde 2026-08-19 — Farmacêutico e Coordenador têm
# o mesmo acesso (fluxo de aprovação de 2 etapas foi removido a pedido do
# cliente; supervisão agora é via notificação, ver /relatorios/atividade-
# recente, exclusivo do Coordenador).
_PODE_DESCARTAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.post("", response_model=MovimentacaoDetalhadaOut)
def registrar_descarte(
    dados: DescarteCreate,
    usuario: UsuarioMe = Depends(_PODE_DESCARTAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    movimentacao = service.registrar(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)
