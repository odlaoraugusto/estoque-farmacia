from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_unidade_ativa_id
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.movimentacao import AjusteCreate, AjusteValorCreate, MovimentacaoDetalhadaOut
from app.schemas.usuario import UsuarioMe
from app.services.ajuste_service import AjusteService

router = APIRouter(prefix="/ajustes", tags=["Ajustes"])

service = AjusteService()

# Ajuste de estoque: Farmacêutico e Coordenador (2026-08-19 — era
# exclusivo do Coordenador desde 2026-08-14, ampliado quando o cliente
# igualou o nível de acesso do Farmacêutico ao do Coordenador). Corrige
# saldo fora dos fluxos normais (ex.: divergência de contagem física); a
# supervisão agora é via notificação ao Coordenador, não mais restrição
# de quem pode agir — ver /relatorios/atividade-recente.
_PODE_AJUSTAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.post("", response_model=MovimentacaoDetalhadaOut)
def ajustar_estoque(
    dados: AjusteCreate,
    usuario: UsuarioMe = Depends(_PODE_AJUSTAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    movimentacao = service.ajustar(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


@router.post("/valor", response_model=MovimentacaoDetalhadaOut)
def corrigir_valor_unitario(
    dados: AjusteValorCreate,
    usuario: UsuarioMe = Depends(_PODE_AJUSTAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    movimentacao = service.ajustar_valor(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)
