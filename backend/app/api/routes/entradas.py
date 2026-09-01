from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import exigir_permissao, get_current_user, get_unidade_ativa_id
from app.api.exportacao_utils import exportar_relatorio
from app.database.session import get_db
from app.schemas.exportacao import FormatoExportacao
from app.schemas.lote import EntradaCreate, LoteDetalhadoOut
from app.schemas.usuario import UsuarioMe
from app.services.entrada_service import EntradaService
from app.services.relatorio_service import RelatorioService

router = APIRouter(prefix="/entradas", tags=["Entradas"])

service = EntradaService()
relatorio_service = RelatorioService()

# Regra 2: controlado pela matriz de permissões (2026-08-31 — antes fixo
# em farmacêutico/coordenador). CAF continua obrigatória, checada dentro
# de EntradaService (regra estrutural, não uma permissão de perfil).
_PODE_REGISTRAR = exigir_permissao("entrada")


@router.post("", response_model=LoteDetalhadoOut, status_code=status.HTTP_201_CREATED)
def registrar_entrada(
    dados: EntradaCreate,
    usuario: UsuarioMe = Depends(_PODE_REGISTRAR),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    return service.registrar(db, usuario, unidade_ativa_id, dados)


@router.get("/comprovante")
def comprovante_entrada(
    formato: FormatoExportacao,
    numero_nota_fiscal: str | None = None,
    lote_id: int | None = None,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """PDF/Excel do que acabou de ser registrado em Entrada, qualquer
    modalidade (2026-09-01, pedido do cliente) — compra passa
    `numero_nota_fiscal` (vários lotes sob a mesma NF); doação/empréstimo
    passa `lote_id` direto (um lote só, sem NF)."""
    lotes = service.obter_para_comprovante(db, numero_nota_fiscal, lote_id)
    tabela = relatorio_service.comprovante_entrada(db, usuario, lotes)
    return exportar_relatorio(formato, "entrada", tabela)
