from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id
from app.api.exportacao_utils import exportar_relatorio
from app.database.session import get_db
from app.schemas.exportacao import FormatoExportacao
from app.schemas.movimentacao import (
    CorrigirPacienteSaidaCreate,
    CorrigirSetorSaidaCreate,
    MovimentacaoDetalhadaOut,
    SaidaCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.relatorio_service import RelatorioService
from app.services.saida_service import SaidaService

router = APIRouter(prefix="/saidas", tags=["Saídas / Dispensação"])

service = SaidaService()
relatorio_service = RelatorioService()


@router.post("", response_model=MovimentacaoDetalhadaOut)
def registrar_saida(
    dados: SaidaCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Regra 5: qualquer perfil pode dispensar."""
    return service.registrar(db, usuario, unidade_ativa_id, dados)


@router.get("/comprovante")
def comprovante_saida(
    ids: str,
    formato: FormatoExportacao,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """PDF/Excel de uma ou mais Saídas já registradas (2026-09-02, pedido
    do cliente: controle de Empréstimo/Doação/Permuta) — `ids` é uma
    lista de ids de Movimentacao separados por vírgula (uma remessa pode
    cobrir vários medicamentos, cada um sua própria saída)."""
    movimentacao_ids = [int(item) for item in ids.split(",") if item.strip()]
    movimentacoes = service.obter_para_comprovante(db, movimentacao_ids)
    tabela = relatorio_service.comprovante_saida(db, usuario, movimentacoes)
    return exportar_relatorio(formato, "saida", tabela)


@router.post("/{movimentacao_id}/corrigir-setor", response_model=MovimentacaoDetalhadaOut)
def corrigir_setor_saida(
    movimentacao_id: int,
    dados: CorrigirSetorSaidaCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service (2026-09-01, pedido do cliente: "Minhas Ações") — só
    quem registrou a saída pode corrigi-la, qualquer perfil; checagem de
    autoria dentro do service."""
    movimentacao = service.corrigir_setor(db, usuario, movimentacao_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)


@router.post("/{movimentacao_id}/corrigir-paciente", response_model=MovimentacaoDetalhadaOut)
def corrigir_paciente_saida(
    movimentacao_id: int,
    dados: CorrigirPacienteSaidaCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service, mesma regra de `corrigir_setor_saida`."""
    movimentacao = service.corrigir_paciente(db, usuario, movimentacao_id, dados)
    return MovimentacaoDetalhadaOut.visivel_para(movimentacao, usuario)
