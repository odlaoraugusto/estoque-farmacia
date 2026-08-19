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
    RelatorioAntimicrobianoOut,
    RelatorioAtividadeRecenteOut,
    RelatorioAuditoriaOut,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoOut,
    RelatorioEstoqueCriticoOut,
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

# Regra 7: relatórios financeiros — Farmacêutico e Coordenador, ambos
# com acesso ao consolidado de todas as unidades (2026-08-19, ampliado —
# ver resolver_unidade_escopo); Atendente sem acesso.
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


@router.get("/estoque-critico", response_model=RelatorioEstoqueCriticoOut)
def relatorio_estoque_critico(
    unidade_id: int | None = None,
    usuario: UsuarioMe = Depends(_PODE_VER_FINANCEIRO),
    db: Session = Depends(get_db),
):
    """Alimenta o popup de notificação ao login (pedido do cliente,
    2026-08-15) — por isso restrito a Farmacêutico/Coordenador, mesmo
    perfil de quem já vê o financeiro, embora o dado em si (quantidade
    de medicamento) não seja sensível como paciente/prontuário."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)
    return service.estoque_critico(db, usuario, unidade_escopo)


@router.get("/antimicrobianos", response_model=RelatorioAntimicrobianoOut)
def relatorio_antimicrobianos(
    unidade_id: int | None = None,
    dias_minimo: int = 7,
    usuario: UsuarioMe = Depends(_PODE_VER_FINANCEIRO),
    db: Session = Depends(get_db),
):
    """DOT — programa de uso racional de antimicrobianos (2026-08-19).
    Mesma restrição de perfil dos demais relatórios de estoque, mas o
    conteúdo em si é dado de paciente — só chega quem já é Farmacêutico/
    Coordenador (`pode_ver_dados_paciente`), então não precisa passar
    pelo construtor `visivel_para` (não tem "consultar com dado
    oculto" aqui, é tudo ou nada pelo próprio endpoint)."""
    unidade_escopo = resolver_unidade_escopo(usuario, unidade_id)
    return service.antimicrobianos_uso_prolongado(db, usuario, unidade_escopo, dias_minimo)


@router.get("/atividade-recente", response_model=RelatorioAtividadeRecenteOut)
def relatorio_atividade_recente(
    unidade_id: int | None = None,
    dias: int = 7,
    usuario: UsuarioMe = Depends(_PODE_VER_AUDITORIA),
    db: Session = Depends(get_db),
):
    """Notificação ao Coordenador (2026-08-19) — descartes, ajustes e
    saídas de empréstimo/doação recentes, com quem fez. Exclusivo do
    Coordenador (reaproveita `_PODE_VER_AUDITORIA`: é vigilância, não
    uma tela operacional)."""
    return service.atividade_recente(db, usuario, unidade_id, dias)


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
