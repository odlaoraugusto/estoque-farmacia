from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.enums import TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.medicamento_repository import MedicamentoRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.lote import LoteDetalhadoOut
from app.schemas.movimentacao import MovimentacaoDetalhadaOut
from app.schemas.relatorio import (
    AtividadeRecenteItem,
    DoseAntimicrobianoItem,
    RelatorioAntimicrobianoItem,
    RelatorioAntimicrobianoOut,
    RelatorioAtividadeRecenteOut,
    RelatorioAuditoriaOut,
    RelatorioCustoPorSetorItem,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoItem,
    RelatorioEstoqueConsolidadoOut,
    RelatorioEstoqueCriticoItem,
    RelatorioEstoqueCriticoOut,
    RelatorioMetadados,
    RelatorioVencimentosProximosOut,
)
from app.schemas.usuario import UsuarioMe

TODAS_UNIDADES_LABEL = "Todas as unidades"


class RelatorioService:
    """Cada resposta carrega os metadados do cabeçalho institucional
    (docs/00_PROJETO.md seção 14): hospital, organização, título, data/hora
    de geração, usuário e unidade (ou 'Todas as unidades')."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.medicamento_repository = MedicamentoRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.unidade_repository = UnidadeRepository()

    def _metadados(
        self, usuario: UsuarioMe, titulo: str, unidade_id: int | None, db: Session
    ) -> RelatorioMetadados:
        unidade_label = TODAS_UNIDADES_LABEL

        if unidade_id is not None:
            unidade = self.unidade_repository.get_by_id(db, unidade_id)
            unidade_label = unidade.nome if unidade else "Unidade não encontrada"

        return RelatorioMetadados(
            hospital=settings.HOSPITAL_NOME,
            organizacao=settings.HOSPITAL_ORGANIZACAO,
            titulo_relatorio=titulo,
            gerado_em=datetime.now(timezone.utc),
            gerado_por=usuario.nome,
            unidade=unidade_label,
        )

    def _expandir_escopo(self, db: Session, unidade_id: int | None) -> int | list[int] | None:
        """Amplia um id de unidade real para incluir os carrinhos de
        emergência filhos dela (docs/00_PROJETO.md, carrinhos 2026-08-13).
        `None` (sem filtro de unidade) passa direto — mantém o consolidado
        de todas as unidades já existente."""
        if unidade_id is None:
            return None

        return self.unidade_repository.listar_ids_com_carrinhos(db, unidade_id)

    def estoque_consolidado(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None
    ) -> RelatorioEstoqueConsolidadoOut:
        """Escopo ampliado (2026-08-13): quando filtrado por unidade, inclui
        também os carrinhos de emergência filhos dela — o valor total em
        estoque de uma unidade tem que contar o que está posicionado nos
        carrinhos dela também. `unidade_id` continua sendo o id "de
        exibição" no cabeçalho (label da unidade), só a query de lotes é
        ampliada."""
        escopo = self._expandir_escopo(db, unidade_id)
        lotes = self.lote_repository.listar(
            db, unidade_id=escopo, apenas_disponivel=True, ordenar_fefo=False
        )

        itens = []
        valor_total_geral = Decimal("0")

        for lote in lotes:
            valor_total_lote = Decimal(lote.quantidade_atual) * lote.valor_unitario
            valor_total_geral += valor_total_lote

            itens.append(
                RelatorioEstoqueConsolidadoItem(
                    lote=LoteDetalhadoOut.model_validate(lote),
                    valor_total_lote=valor_total_lote,
                )
            )

        return RelatorioEstoqueConsolidadoOut(
            metadados=self._metadados(
                usuario, "Consolidado Geral de Estoque", unidade_id, db
            ),
            itens=itens,
            valor_total_geral=valor_total_geral,
        )

    def custo_por_setor(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
    ) -> RelatorioCustoPorSetorOut:
        saidas = self.movimentacao_repository.listar_saidas_por_periodo(
            db, data_inicio, data_fim, unidade_id
        )

        agregados: dict[str, dict[str, Decimal | int]] = defaultdict(
            lambda: {"quantidade_total": 0, "valor_total": Decimal("0")}
        )

        for movimentacao in saidas:
            setor = movimentacao.setor_consumidor or "Não informado"
            valor = Decimal(movimentacao.quantidade) * movimentacao.lote.valor_unitario

            agregados[setor]["quantidade_total"] += movimentacao.quantidade
            agregados[setor]["valor_total"] += valor

        itens = [
            RelatorioCustoPorSetorItem(
                setor_consumidor=setor,
                quantidade_total=dados["quantidade_total"],
                valor_total=dados["valor_total"],
            )
            for setor, dados in sorted(agregados.items())
        ]

        valor_total_geral = sum((item.valor_total for item in itens), Decimal("0"))

        return RelatorioCustoPorSetorOut(
            metadados=self._metadados(usuario, "Custo por Setor", unidade_id, db),
            periodo_inicio=data_inicio,
            periodo_fim=data_fim,
            itens=itens,
            valor_total_geral=valor_total_geral,
        )

    def auditoria(
        self,
        db: Session,
        usuario: UsuarioMe,
        tipo: TipoMovimentacaoEnum | None,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
    ) -> RelatorioAuditoriaOut:
        """Só coordenador acessa (garantido no router) — trilha completa,
        nunca filtrada por unidade do usuário logado, só por filtro
        explícito escolhido na tela."""
        movimentacoes = self.movimentacao_repository.listar_auditoria(
            db, tipo, unidade_id, data_inicio, data_fim
        )

        return RelatorioAuditoriaOut(
            metadados=self._metadados(usuario, "Trilha de Auditoria", unidade_id, db),
            # `visivel_para` aplica a regra de paciente/prontuário
            # (seção 22 do doc) — hoje este relatório só é acessível ao
            # Coordenador (regra 7, router `relatorios.py`), então na
            # prática nunca oculta nada aqui, mas usar o mesmo
            # construtor central evita reintroduzir o vazamento se a
            # matriz de permissões deste relatório mudar no futuro.
            itens=[
                MovimentacaoDetalhadaOut.visivel_para(m, usuario)
                for m in movimentacoes
            ],
        )

    def estoque_critico(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None
    ) -> RelatorioEstoqueCriticoOut:
        """Mesmo escopo ampliado dos demais relatórios de estoque (inclui
        carrinhos filhos da unidade filtrada). Soma `quantidade_atual` de
        todos os lotes de cada medicamento no escopo e compara com
        `estoque_minimo` — mesma regra que já existia só no frontend
        (tile "Itens em risco de ruptura" da tela Estoque atual);
        `estoque_minimo == 0` significa "sem controle de mínimo definido",
        nunca entra na lista (não é criticidade real, é ausência de
        configuração)."""
        escopo = self._expandir_escopo(db, unidade_id)
        lotes = self.lote_repository.listar(
            db, unidade_id=escopo, apenas_disponivel=True, ordenar_fefo=False
        )

        # Semeia com TODOS os medicamentos ativos, saldo 0 — não só os que
        # aparecem nos lotes acima. Sem isso, um medicamento com estoque
        # mínimo cadastrado mas ZERO lotes na unidade (o caso mais crítico
        # de todos: prateleira vazia) nunca entraria na lista, porque
        # simplesmente não haveria nenhuma linha de lote pra somar.
        totais: dict[int, dict] = {
            medicamento.id: {
                "nome": medicamento.nome,
                "quantidade_atual": 0,
                "estoque_minimo": medicamento.estoque_minimo,
            }
            for medicamento in self.medicamento_repository.list(db, apenas_ativos=True)
        }
        for lote in lotes:
            agregado = totais.setdefault(
                lote.medicamento_id,
                {
                    "nome": lote.medicamento.nome,
                    "quantidade_atual": 0,
                    "estoque_minimo": lote.medicamento.estoque_minimo,
                },
            )
            agregado["quantidade_atual"] += lote.quantidade_atual

        itens = [
            RelatorioEstoqueCriticoItem(
                medicamento_id=medicamento_id,
                nome=dados["nome"],
                quantidade_atual=dados["quantidade_atual"],
                estoque_minimo=dados["estoque_minimo"],
            )
            for medicamento_id, dados in totais.items()
            if dados["estoque_minimo"] > 0 and dados["quantidade_atual"] < dados["estoque_minimo"]
        ]
        itens.sort(key=lambda item: item.nome)

        return RelatorioEstoqueCriticoOut(
            metadados=self._metadados(usuario, "Estoque Crítico", unidade_id, db),
            itens=itens,
        )

    def antimicrobianos_uso_prolongado(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        dias_minimo: int = 7,
    ) -> RelatorioAntimicrobianoOut:
        """DOT (Days of Therapy) — programa de uso racional de
        antimicrobianos (2026-08-19). Aproximação: conta DATAS DISTINTAS
        de dispensação (Saída) por paciente+medicamento, não confirmação
        real de administração (o hospital não tem eMAR) — é a mesma
        limitação assumida em todo o resto do sistema, que só enxerga o
        que passa pela farmácia.

        "Em uso" = a dispensação mais recente daquele paciente+
        medicamento aconteceu nos últimos `RECENCIA_DIAS` dias (senão é
        histórico, não uso corrente). "Dias consecutivos" = tamanho da
        sequência de datas sem furo terminando na dispensação mais
        recente — só entra na lista quem passar de `dias_minimo`."""
        RECENCIA_DIAS = 2

        escopo = self._expandir_escopo(db, unidade_id)
        saidas = self.movimentacao_repository.listar_saidas_antimicrobianos(db, escopo)

        grupos: dict[tuple[str, int], list[Movimentacao]] = defaultdict(list)
        for mov in saidas:
            grupos[(mov.paciente_prontuario, mov.lote.medicamento_id)].append(mov)

        hoje = datetime.now(timezone.utc).date()
        itens = []

        for (prontuario, medicamento_id), movs in grupos.items():
            datas = sorted({m.data_hora.date() for m in movs})
            data_fim = datas[-1]

            if (hoje - data_fim).days > RECENCIA_DIAS:
                continue  # última dispensação é antiga demais — não é uso corrente

            dias_consecutivos = 1
            cursor = data_fim
            for d in reversed(datas[:-1]):
                if (cursor - d).days != 1:
                    break
                dias_consecutivos += 1
                cursor = d
            data_inicio = cursor

            if dias_consecutivos <= dias_minimo:
                continue

            ultimo_mov = max(movs, key=lambda m: m.data_hora)
            doses = [
                DoseAntimicrobianoItem(
                    data=m.data_hora.date(),
                    quantidade=m.quantidade,
                    numero_lote=m.lote.numero_lote,
                )
                for m in sorted(movs, key=lambda m: m.data_hora)
            ]

            itens.append(
                RelatorioAntimicrobianoItem(
                    paciente_prontuario=prontuario,
                    paciente_nome=ultimo_mov.paciente_nome or "",
                    medicamento_id=medicamento_id,
                    medicamento_nome=ultimo_mov.lote.medicamento.nome,
                    dias_consecutivos=dias_consecutivos,
                    data_inicio=data_inicio,
                    data_fim=data_fim,
                    doses=doses,
                )
            )

        itens.sort(key=lambda item: -item.dias_consecutivos)

        return RelatorioAntimicrobianoOut(
            metadados=self._metadados(
                usuario, "Uso Prolongado de Antimicrobianos", unidade_id, db
            ),
            dias_minimo=dias_minimo,
            itens=itens,
        )

    @staticmethod
    def _detalhe_atividade(m: Movimentacao) -> str:
        if m.tipo == TipoMovimentacaoEnum.descarte:
            return m.motivo_descarte or "—"
        if m.tipo == TipoMovimentacaoEnum.ajuste:
            sinal = f"+{m.quantidade}" if m.quantidade > 0 else str(m.quantidade)
            return f"{sinal} un. — {m.motivo_ajuste or '—'}"
        if m.tipo == TipoMovimentacaoEnum.saida:
            categoria = m.categoria_saida.value if m.categoria_saida else "—"
            return f"{categoria} — setor {m.setor_consumidor or '—'}"
        return "—"

    def atividade_recente(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        dias: int = 7,
    ) -> RelatorioAtividadeRecenteOut:
        """Notificação ao Coordenador (2026-08-19) — substitui a antiga
        autorização prévia de Descarte: supervisão passa a ser depois do
        fato, não mais travando antes. Descartes, Ajustes e Saídas de
        empréstimo/doação dos últimos `dias` dias, com quem fez (já
        gravado em `usuario_id` desde sempre — isto só expõe de forma
        direta, sem precisar abrir a Trilha de Auditoria completa)."""
        escopo = self._expandir_escopo(db, unidade_id)
        desde = datetime.now(timezone.utc) - timedelta(days=dias)
        movimentacoes = self.movimentacao_repository.listar_atividade_recente(
            db, desde, escopo
        )

        itens = [
            AtividadeRecenteItem(
                movimentacao_id=m.id,
                tipo=m.tipo.value,
                detalhe=self._detalhe_atividade(m),
                medicamento_nome=m.lote.medicamento.nome,
                quantidade=m.quantidade,
                usuario_nome=m.usuario.nome,
                unidade_nome=m.unidade_origem.nome if m.unidade_origem else "—",
                data_hora=m.data_hora,
            )
            for m in movimentacoes
        ]

        return RelatorioAtividadeRecenteOut(
            metadados=self._metadados(usuario, "Atividade Recente", unidade_id, db),
            dias_considerados=dias,
            itens=itens,
        )

    def vencimentos_proximos(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None, dias: int
    ) -> RelatorioVencimentosProximosOut:
        """Mesmo escopo ampliado de `estoque_consolidado` — inclui os
        carrinhos filhos da unidade filtrada."""
        escopo = self._expandir_escopo(db, unidade_id)
        lotes = self.lote_repository.listar_vencimento_proximo(db, dias, escopo)

        return RelatorioVencimentosProximosOut(
            metadados=self._metadados(
                usuario, "Vencimentos Próximos", unidade_id, db
            ),
            dias_considerados=dias,
            itens=[LoteDetalhadoOut.model_validate(lote) for lote in lotes],
        )
