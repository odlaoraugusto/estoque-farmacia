from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id, resolver_unidade_escopo
from app.database.session import get_db
from app.schemas.lote import LoteDetalhadoOut
from app.schemas.usuario import UsuarioMe
from app.services.lote_service import LoteService

router = APIRouter(prefix="/lotes", tags=["Lotes / Estoque"])

service = LoteService()


@router.get("", response_model=list[LoteDetalhadoOut])
def listar_estoque(
    unidade_id: int | None = None,
    medicamento_id: int | None = None,
    numero_nota_fiscal: str | None = None,
    apenas_disponivel: bool = True,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Estoque atual — Coordenador pode ver qualquer unidade (ou todas);
    os demais perfis são restritos à própria unidade ativa.

    `numero_nota_fiscal` (2026-08-20): conferência dos itens já
    registrados sob uma mesma nota fiscal, na tela de Entrada — ignora
    `apenas_disponivel` (quer ver tudo que entrou, mesmo já consumido).

    Estoque de carrinho de emergência nunca aparece aqui pra ninguém
    (2026-08-31, pedido do cliente: carrinho é estoque à parte da unidade
    "pai") — só é alcançado pelos fluxos dedicados de Reposição/Devolução
    de carrinho."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)

    return service.listar_estoque(db, unidade_escopo, medicamento_id, numero_nota_fiscal, apenas_disponivel)


@router.get("/busca-fefo", response_model=list[LoteDetalhadoOut])
def buscar_fefo(
    medicamento_id: int,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Regra 5: ordena por validade mais próxima (FEFO) e sinaliza o lote
    sugerido, para a tela de Saída/Dispensação da unidade ativa."""
    return service.buscar_fefo(db, unidade_ativa_id, medicamento_id)
