from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_unidade_ativa_id, resolver_unidade_escopo
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.movimentacao import (
    DescarteRejeitarCreate,
    DescarteSolicitarCreate,
    MovimentacaoDetalhadaOut,
)
from app.schemas.usuario import UsuarioMe
from app.services.descarte_service import DescarteService

router = APIRouter(prefix="/descartes", tags=["Descartes"])

service = DescarteService()

# Regra 6/7: só Farmacêutico solicita (Coordenador NÃO solicita, só aprova/rejeita).
_PODE_SOLICITAR = exigir_perfis(PerfilEnum.farmaceutico)
# Só Coordenador aprova/rejeita.
_PODE_APROVAR = exigir_perfis(PerfilEnum.coordenador)
# Consulta de pendentes: Farmacêutico (própria unidade) e Coordenador (qualquer/todas).
_PODE_CONSULTAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.post("/solicitar", response_model=MovimentacaoDetalhadaOut)
def solicitar_descarte(
    dados: DescarteSolicitarCreate,
    usuario: UsuarioMe = Depends(_PODE_SOLICITAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    return service.solicitar(db, usuario, unidade_ativa_id, dados)


@router.post("/{movimentacao_id}/aprovar", response_model=MovimentacaoDetalhadaOut)
def aprovar_descarte(
    movimentacao_id: int,
    usuario: UsuarioMe = Depends(_PODE_APROVAR),
    db: Session = Depends(get_db),
):
    return service.aprovar(db, usuario, movimentacao_id)


@router.post("/{movimentacao_id}/rejeitar", response_model=MovimentacaoDetalhadaOut)
def rejeitar_descarte(
    movimentacao_id: int,
    dados: DescarteRejeitarCreate | None = None,
    usuario: UsuarioMe = Depends(_PODE_APROVAR),
    db: Session = Depends(get_db),
):
    return service.rejeitar(db, usuario, movimentacao_id, dados)


@router.get("/pendentes", response_model=list[MovimentacaoDetalhadaOut])
def listar_descartes_pendentes(
    unidade_id: int | None = None,
    usuario: UsuarioMe = Depends(_PODE_CONSULTAR),
    db: Session = Depends(get_db),
):
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)

    return service.listar_pendentes(db, unidade_escopo)
