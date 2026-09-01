from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_permissao, get_unidade_ativa_id
from app.database.session import get_db
from app.schemas.movimentacao import AjusteCreate, AjusteLoteCreate, AjusteValorCreate, MovimentacaoDetalhadaOut
from app.schemas.usuario import UsuarioMe
from app.services.ajuste_service import AjusteService

router = APIRouter(prefix="/ajustes", tags=["Ajustes"])

service = AjusteService()

# Ajuste de estoque (quantidade): controlado pela matriz de permissões
# (2026-08-31 — antes fixo em farmacêutico/coordenador, ampliado antes
# disso pra incluir atendente também via código; agora tudo isso vira
# configurável pelo Admin). Corrige saldo fora dos fluxos normais (ex.:
# divergência de contagem física); a supervisão é via notificação ao
# Coordenador — ver /relatorios/atividade-recente.
_PODE_AJUSTAR = exigir_permissao("ajustar_estoque")

# Correção de VALOR unitário (financeiro/fiscal — preço pago, não saldo
# físico) é uma chave SEPARADA de ajustar_estoque (2026-08-31: o pedido
# do cliente sobre abrir "ajustar estoque" pro atendente foi
# especificamente sobre a contagem física, não sobre editar valor pago) —
# também configurável, mas o Admin decide as duas independentemente.
_PODE_CORRIGIR_VALOR = exigir_permissao("corrigir_valor_unitario")


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
    usuario: UsuarioMe = Depends(_PODE_CORRIGIR_VALOR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    movimentacao = service.ajustar_valor(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


@router.post("/lote", response_model=MovimentacaoDetalhadaOut)
def corrigir_lote(
    dados: AjusteLoteCreate,
    usuario: UsuarioMe = Depends(_PODE_CORRIGIR_VALOR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Corrigir nº do lote e/ou validade (2026-08-31, pedido do cliente) —
    mesma chave/permissão de corrigir_valor_unitario (mesma categoria:
    corrigir um dado do lote sem mexer no saldo físico)."""
    movimentacao = service.ajustar_lote(db, usuario, unidade_ativa_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)
