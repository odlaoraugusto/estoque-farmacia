from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import (
    exigir_permissao,
    get_current_user,
    get_unidade_ativa_id,
    resolver_unidade_escopo,
)
from app.database.session import get_db
from app.schemas.movimentacao import (
    DevolverCarrinhoCreate,
    MovimentacaoDetalhadaOut,
    ReporCarrinhoCreate,
    TransferenciaConfirmarCreate,
    TransferenciaEnviarCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.transferencia_service import TransferenciaService

router = APIRouter(prefix="/transferencias", tags=["Transferências"])

service = TransferenciaService()

# Regra 3: enviar — controlado pela matriz de permissões (2026-08-31,
# mesma chave usada em _PODE_ATENDER de solicitacoes.py, é a mesma ação
# de dispensar por baixo dos panos).
_PODE_ENVIAR = exigir_permissao("transferencia_enviar")

# Regras 1/2 dos carrinhos: reposição e devolução — mesma chave
# (2026-08-31: controlado pela matriz; antes fixo em
# farmacêutico/coordenador).
_PODE_REPOR_CARRINHO = exigir_permissao("reposicao_carrinho")
_PODE_DEVOLVER_CARRINHO = exigir_permissao("reposicao_carrinho")


@router.post("/enviar", response_model=MovimentacaoDetalhadaOut)
def enviar_transferencia(
    dados: TransferenciaEnviarCreate,
    usuario: UsuarioMe = Depends(_PODE_ENVIAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    movimentacao = service.enviar(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


@router.post("/repor-carrinho", response_model=MovimentacaoDetalhadaOut)
def repor_carrinho(
    dados: ReporCarrinhoCreate,
    usuario: UsuarioMe = Depends(_PODE_REPOR_CARRINHO),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Reposição de carrinho de emergência (regras 1/2, docs/00_PROJETO.md):
    só farmacêutico, só a partir da CAF, fluxo de uma etapa só — sem
    confirmação separada, o lote já nasce recebido no carrinho destino."""
    movimentacao = service.repor_carrinho(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


@router.post("/devolver-carrinho", response_model=MovimentacaoDetalhadaOut)
def devolver_carrinho(
    dados: DevolverCarrinhoCreate,
    usuario: UsuarioMe = Depends(_PODE_DEVOLVER_CARRINHO),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Devolução de carrinho de emergência -> CAF (seção 22 do doc): só
    farmacêutico, fluxo de DUAS etapas (diferente da reposição) — esta
    etapa só envia (fica pendente); a CAF confirma com o endpoint já
    existente `POST /transferencias/{id}/confirmar`."""
    movimentacao = service.devolver_carrinho(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


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
    movimentacao = service.confirmar(db, usuario, unidade_ativa_id, movimentacao_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


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

    pendentes = service.listar_pendentes(db, unidade_escopo)
    return [MovimentacaoDetalhadaOut.visivel_para(m, usuario) for m in pendentes]
