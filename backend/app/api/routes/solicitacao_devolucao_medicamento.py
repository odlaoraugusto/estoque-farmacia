from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_unidade_ativa_id
from app.api.exportacao_utils import exportar_relatorio
from app.database.session import get_db
from app.schemas.exportacao import FormatoExportacao
from app.schemas.ressuprimento_carrinho import UnidadePublicaOut
from app.schemas.solicitacao_devolucao_medicamento import (
    ConfirmarDevolucaoMedicamentoCreate,
    DevolucaoMedicamentoCreate,
    MedicamentoDevolucaoPublicoOut,
    SolicitacaoDevolucaoMedicamentoOut,
)
from app.schemas.usuario import UsuarioMe
from app.services.relatorio_service import RelatorioService
from app.services.solicitacao_devolucao_medicamento_service import SolicitacaoDevolucaoMedicamentoService

router = APIRouter(prefix="/devolucao-medicamento", tags=["Devolução de Medicamento"])

service = SolicitacaoDevolucaoMedicamentoService()
relatorio_service = RelatorioService()


# ---- público (sem login) — formulário de devolução ----


@router.get("/publico/unidades", response_model=list[UnidadePublicaOut])
def listar_unidades_publico(db: Session = Depends(get_db)):
    return service.listar_unidades(db)


@router.get("/publico/medicamentos", response_model=list[MedicamentoDevolucaoPublicoOut])
def listar_medicamentos_publico(db: Session = Depends(get_db)):
    return service.listar_medicamentos(db)


@router.post("/publico", response_model=SolicitacaoDevolucaoMedicamentoOut, status_code=201)
def criar_solicitacao_publico(dados: DevolucaoMedicamentoCreate, db: Session = Depends(get_db)):
    solicitacao = service.criar(db, dados)
    return SolicitacaoDevolucaoMedicamentoOut.from_model(solicitacao)


# ---- autenticado — a unidade de destino confirma ----


@router.get("/pendentes", response_model=list[SolicitacaoDevolucaoMedicamentoOut])
def listar_pendentes(
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    """Qualquer perfil da unidade responsável (Atendente incluído — é
    quem vai fisicamente confirmar), qualquer unidade real, não só CAF."""
    pendentes = service.listar_pendentes(db, unidade_ativa_id)
    return [SolicitacaoDevolucaoMedicamentoOut.from_model(s) for s in pendentes]


@router.post("/{solicitacao_id}/confirmar", response_model=SolicitacaoDevolucaoMedicamentoOut)
def confirmar(
    solicitacao_id: int,
    dados: ConfirmarDevolucaoMedicamentoCreate,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    solicitacao = service.confirmar(db, usuario, unidade_ativa_id, solicitacao_id, dados)
    return SolicitacaoDevolucaoMedicamentoOut.from_model(solicitacao)


@router.get("/{solicitacao_id}/comprovante")
def comprovante_devolucao(
    solicitacao_id: int,
    formato: FormatoExportacao,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """PDF/Excel da devolução já confirmada — reaproveita o mesmo
    comprovante de Entrada, já que cada item confirmado vira um `Lote`
    normal (2026-09-01, pedido do cliente: farmácia poder imprimir)."""
    lotes = service.obter_lotes_para_comprovante(db, solicitacao_id)
    tabela = relatorio_service.comprovante_entrada(db, usuario, lotes)
    return exportar_relatorio(formato, "devolucao", tabela)


@router.delete("/{solicitacao_id}", status_code=204)
def cancelar_solicitacao(
    solicitacao_id: int,
    usuario: UsuarioMe = Depends(get_current_user),
    unidade_ativa_id: int = Depends(get_unidade_ativa_id),
    db: Session = Depends(get_db),
):
    service.cancelar(db, unidade_ativa_id, solicitacao_id)
