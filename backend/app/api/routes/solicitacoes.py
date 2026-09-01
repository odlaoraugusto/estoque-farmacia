from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id, exigir_permissao
from app.api.exportacao_utils import exportar_relatorio
from app.database.session import get_db
from app.models.enums import StatusSolicitacaoEnum
from app.schemas.exportacao import FormatoExportacao
from app.schemas.solicitacao import (
    SolicitacaoAceitarCreate,
    SolicitacaoCreate,
    SolicitacaoDetalhadaOut,
    SolicitacaoLoteCreate,
    SolicitacaoRecusarCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.relatorio_service import RelatorioService
from app.services.solicitacao_service import SolicitacaoService

router = APIRouter(prefix="/solicitacoes", tags=["Solicitações de Transferência"])

service = SolicitacaoService()
relatorio_service = RelatorioService()

# Aceitar/recusar é, no fundo, a CAF disparando enviar() — mesma chave de
# permissão de quem já pode enviar uma transferência normal (2026-08-31:
# controlado pela matriz do Admin, mesma `transferencia_enviar` de
# transferencias.py).
_PODE_ATENDER = exigir_permissao("transferencia_enviar")


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


@router.post("/lote", response_model=list[SolicitacaoDetalhadaOut])
def criar_solicitacoes_em_lote(
    dados: SolicitacaoLoteCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Pedir vários medicamentos de uma vez (2026-08-31, pedido do
    cliente: "tipo uma lista") — mesma regra de quem pode solicitar
    (`criar_solicitacao` acima), só que para N itens numa chamada só."""
    return service.criar_em_lote(db, usuario, unidade_ativa_id, dados)


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


@router.get("/{solicitacao_id}/comprovante")
def comprovante_solicitacao(
    solicitacao_id: int,
    formato: FormatoExportacao,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """PDF/Excel de UMA solicitação (2026-09-01, pedido do cliente: botão
    "Imprimir" ao lado de "Minhas solicitações") — mesma visibilidade de
    quem pode ver a solicitação (a própria unidade solicitante, ou a CAF
    vendo qualquer uma)."""
    solicitacao = service.obter_para_comprovante(db, unidade_ativa_id, solicitacao_id)
    tabela = relatorio_service.comprovante_solicitacao(db, usuario, solicitacao)
    return exportar_relatorio(formato, f"solicitacao-{solicitacao_id}", tabela)


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
