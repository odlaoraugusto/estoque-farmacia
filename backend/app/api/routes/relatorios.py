from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_current_user, resolver_unidade_escopo
from app.api.exportacao_utils import exportar_relatorio
from app.core.config import settings
from app.database.session import get_db
from app.models.enums import PerfilEnum, TipoMovimentacaoEnum
from app.schemas.exportacao import FormatoExportacao
from app.schemas.relatorio import (
    RelatorioAuditoriaOut,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoOut,
    RelatorioVencimentosProximosOut,
)
from app.schemas.usuario import UsuarioMe
from app.services.exportacao.relatorio_tabela_builder import (
    tabela_auditoria,
    tabela_custo_por_setor,
    tabela_estoque_consolidado,
    tabela_vencimentos_proximos,
)
from app.services.relatorio_service import RelatorioService

router = APIRouter(prefix="/relatorios", tags=["Relatórios"])

service = RelatorioService()

# Regra 7: relatórios financeiros — Coordenador (todas as unidades) e
# Farmacêutico (só a própria unidade ativa); Atendente sem acesso.
_PODE_VER_FINANCEIRO = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)
# Trilha de auditoria completa: só Coordenador.
_PODE_VER_AUDITORIA = exigir_perfis(PerfilEnum.coordenador)


@router.get("/estoque-consolidado", response_model=RelatorioEstoqueConsolidadoOut)
def relatorio_estoque_consolidado(
    unidade_id: int | None = None,
    formato: FormatoExportacao | None = None,
    usuario: UsuarioMe = Depends(_PODE_VER_FINANCEIRO),
    db: Session = Depends(get_db),
):
    """`formato` ausente (default) devolve o JSON de sempre — o frontend
    atual continua funcionando sem alteração. `formato=pdf` ou
    `formato=excel` devolve o arquivo pronto para download, reaproveitando
    a mesma checagem de permissão e o mesmo filtro de unidade acima."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)
    relatorio = service.estoque_consolidado(db, usuario, unidade_escopo)

    if formato is None:
        return relatorio

    return exportar_relatorio(
        formato, "consolidado-estoque", tabela_estoque_consolidado(relatorio)
    )


@router.get("/custo-por-setor", response_model=RelatorioCustoPorSetorOut)
def relatorio_custo_por_setor(
    unidade_id: int | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    formato: FormatoExportacao | None = None,
    usuario: UsuarioMe = Depends(_PODE_VER_FINANCEIRO),
    db: Session = Depends(get_db),
):
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)
    relatorio = service.custo_por_setor(db, usuario, unidade_escopo, data_inicio, data_fim)

    if formato is None:
        return relatorio

    return exportar_relatorio(formato, "custo-por-setor", tabela_custo_por_setor(relatorio))


@router.get("/auditoria", response_model=RelatorioAuditoriaOut)
def relatorio_auditoria(
    tipo: TipoMovimentacaoEnum | None = None,
    unidade_id: int | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    formato: FormatoExportacao | None = None,
    usuario: UsuarioMe = Depends(_PODE_VER_AUDITORIA),
    db: Session = Depends(get_db),
):
    """Regra 7: só Coordenador — filtro de unidade aqui é livre (não
    passa por `resolver_unidade_escopo`, pois quem chega até aqui já é
    coordenador e pode ver qualquer unidade ou todas)."""
    relatorio = service.auditoria(db, usuario, tipo, unidade_id, data_inicio, data_fim)

    if formato is None:
        return relatorio

    return exportar_relatorio(formato, "auditoria", tabela_auditoria(relatorio))


@router.get("/vencimentos-proximos", response_model=RelatorioVencimentosProximosOut)
def relatorio_vencimentos_proximos(
    unidade_id: int | None = None,
    dias: int = settings.RELATORIO_VENCIMENTO_DIAS,
    formato: FormatoExportacao | None = None,
    usuario: UsuarioMe = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Relatório operacional — todos os perfis têm acesso de leitura,
    inclusive Atendente, escopado à própria unidade ativa."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)
    relatorio = service.vencimentos_proximos(db, usuario, unidade_escopo, dias)

    if formato is None:
        return relatorio

    return exportar_relatorio(
        formato, "vencimentos-proximos", tabela_vencimentos_proximos(relatorio)
    )
