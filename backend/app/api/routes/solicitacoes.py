from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id, exigir_perfis
from app.database.session import get_db
from app.models.enums import PerfilEnum, StatusSolicitacaoEnum
from app.schemas.solicitacao import (
    SolicitacaoAceitarCreate,
    SolicitacaoCreate,
    SolicitacaoDetalhadaOut,
    SolicitacaoRecusarCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.solicitacao_service import SolicitacaoService

router = APIRouter(prefix="/solicitacoes", tags=["Solicitações de Transferência"])

service = SolicitacaoService()

# Aceitar/recusar é, no fundo, a CAF disparando enviar() — mesma regra
# de permissão de quem já pode enviar uma transferência normal.
_PODE_ATENDER = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


@router.post("", response_model=SolicitacaoDetalhadaOut)
def criar_solicitacao(
    dados: SolicitacaoCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Qualquer perfil da unidade ativa pode solicitar (2026-08-20) —
    mesma lógica de quem já registra Saída ou confirma recebimento de
    transferência."""
    return service.criar(db, usuario, unidade_ativa_id, dados)


@router.get("", response_model=list[SolicitacaoDetalhadaOut])
def listar_solicitacoes(
    status: StatusSolicitacaoEnum | None = None,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """CAF vê a fila de todas as unidades; qualquer outra unidade vê só
    as próprias solicitações."""
    return service.listar(db, usuario, unidade_ativa_id, status)


@router.post("/{solicitacao_id}/aceitar", response_model=SolicitacaoDetalhadaOut)
def aceitar_solicitacao(
    solicitacao_id: int,
    dados: SolicitacaoAceitarCreate,
    usuario: UsuarioMe = Depends(_PODE_ATENDER),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    return service.aceitar(db, usuario, unidade_ativa_id, solicitacao_id, dados)


@router.post("/{solicitacao_id}/recusar", response_model=SolicitacaoDetalhadaOut)
def recusar_solicitacao(
    solicitacao_id: int,
    dados: SolicitacaoRecusarCreate,
    usuario: UsuarioMe = Depends(_PODE_ATENDER),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    return service.recusar(db, usuario, unidade_ativa_id, solicitacao_id, dados)
