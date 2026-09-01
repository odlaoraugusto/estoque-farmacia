from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id
from app.database.session import get_db
from app.schemas.ressuprimento_carrinho import (
    CarrinhoPublicoOut,
    ConfirmarSaidaCarrinhoCreate,
    ConfirmarTransferenciaCarrinhoCreate,
    EstoqueCarrinhoPublicoItem,
    RessuprimentoCarrinhoCreate,
    SolicitacaoRessuprimentoCarrinhoOut,
    UnidadePublicaOut,
)
from app.schemas.usuario import UsuarioMe
from app.services.ressuprimento_carrinho_service import RessuprimentoCarrinhoService

router = APIRouter(prefix="/ressuprimento-carrinho", tags=["Ressuprimento de Carrinho"])

service = RessuprimentoCarrinhoService()


# ---- público (sem login) — formulário de uso de carrinho ----


@router.get("/publico/carrinhos", response_model=list[CarrinhoPublicoOut])
def listar_carrinhos_publico(db: Session = Depends(get_db)):
    return service.listar_carrinhos(db)


@router.get("/publico/unidades", response_model=list[UnidadePublicaOut])
def listar_unidades_publico(db: Session = Depends(get_db)):
    return service.listar_unidades(db)


@router.get("/publico/carrinhos/{carrinho_id}/estoque", response_model=list[EstoqueCarrinhoPublicoItem])
def estoque_carrinho_publico(carrinho_id: int, db: Session = Depends(get_db)):
    return service.estoque_carrinho(db, carrinho_id)


@router.post("/publico", response_model=SolicitacaoRessuprimentoCarrinhoOut, status_code=201)
def criar_solicitacao_publico(dados: RessuprimentoCarrinhoCreate, db: Session = Depends(get_db)):
    solicitacao = service.criar(db, dados)
    return SolicitacaoRessuprimentoCarrinhoOut.from_model(solicitacao)


# ---- autenticado — a farmácia responsável confirma ----


@router.get("/pendentes", response_model=list[SolicitacaoRessuprimentoCarrinhoOut])
def listar_pendentes(
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Qualquer perfil da unidade responsável (Atendente incluído — é
    quem vai fisicamente atender, pedido do cliente)."""
    pendentes = service.listar_pendentes(db, unidade_ativa_id)
    return [SolicitacaoRessuprimentoCarrinhoOut.from_model(s) for s in pendentes]


@router.post("/{solicitacao_id}/confirmar-saida", response_model=SolicitacaoRessuprimentoCarrinhoOut)
def confirmar_saida(
    solicitacao_id: int,
    dados: ConfirmarSaidaCarrinhoCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    solicitacao = service.confirmar_saida(db, usuario, unidade_ativa_id, solicitacao_id, dados)
    return SolicitacaoRessuprimentoCarrinhoOut.from_model(solicitacao)


@router.post("/{solicitacao_id}/confirmar-transferencia", response_model=SolicitacaoRessuprimentoCarrinhoOut)
def confirmar_transferencia(
    solicitacao_id: int,
    dados: ConfirmarTransferenciaCarrinhoCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    solicitacao = service.confirmar_transferencia(db, usuario, unidade_ativa_id, solicitacao_id, dados)
    return SolicitacaoRessuprimentoCarrinhoOut.from_model(solicitacao)


@router.delete("/{solicitacao_id}", status_code=204)
def cancelar_solicitacao(
    solicitacao_id: int,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Mesma regra de quem confirma (qualquer perfil da unidade
    responsável, Atendente incluído) — só liberado enquanto nenhuma das
    duas ações foi confirmada (ver RessuprimentoCarrinhoService.cancelar)."""
    service.cancelar(db, unidade_ativa_id, solicitacao_id)
