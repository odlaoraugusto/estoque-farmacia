from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.enums import CategoriaSaidaEnum, OrigemEnum, TipoMovimentacaoEnum, TipoUnidadeEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.medicamento_repository import MedicamentoRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.lote import LoteDetalhadoOut
from app.schemas.movimentacao import CategoriaMovimentacaoGeral, MovimentacaoDetalhadaOut, MovimentacaoGeralOut
from app.schemas.relatorio import (
    AtividadeRecenteItem,
    DoseAntimicrobianoItem,
    RelatorioAntimicrobianoItem,
    RelatorioAntimicrobianoOut,
    RelatorioAtividadeRecenteOut,
    RelatorioAuditoriaOut,
    RelatorioConsumoMedicamentoItem,
    RelatorioConsumoMedicamentosOut,
    RelatorioCustoPorSetorItem,
    RelatorioCustoPorSetorOut,
    RelatorioEstoqueConsolidadoItem,
    RelatorioEstoqueConsolidadoOut,
    RelatorioEstoqueCriticoItem,
    RelatorioEstoqueCriticoOut,
    MovimentacaoTransferenciaItem,
    RelatorioMetadados,
    RelatorioMovimentacaoTransferenciasOut,
    RelatorioMovimentacoesGeralOut,
    RelatorioTransferenciasOut,
    RelatorioVencimentosProximosOut,
)
from app.schemas.usuario import UsuarioMe
from app.services.exportacao.relatorio_tabela_builder import (
    tabela_comprovante_entrada,
    tabela_comprovante_saida,
    tabela_comprovante_solicitacao,
)
from app.services.exportacao.tabela import TabelaRelatorio

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

    def estoque_consolidado(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None
    ) -> RelatorioEstoqueConsolidadoOut:
        """Carrinho de emergência é estoque à parte da unidade que o
        hospeda (2026-08-31, pedido do cliente) — filtrar por uma unidade
        real aqui NÃO inclui mais os carrinhos filhos dela; pra ver o
        estoque de um carrinho específico, filtre pelo id dele direto."""
        lotes = self.lote_repository.listar(
            db, unidade_id=unidade_id, apenas_disponivel=True, ordenar_fefo=False
        )

        # `ordenar_fefo=False` acima não aplica NENHUM `ORDER BY` (ver
        # LoteRepository.listar) — sem isso o Postgres devolve os lotes em
        # ordem física/não determinística, então um lote recém-criado
        # (entrada nova) podia "pular" pro fim da lista em vez de ficar
        # agrupado com os outros do mesmo medicamento (2026-09-02, achado
        # do cliente: entrada de Ivermectina sumindo do meio do
        # Consolidado). Agrupa por nome do medicamento (ordem alfabética,
        # como o usuário já espera ao escanear a lista) e, dentro do
        # mesmo medicamento, pela validade mais próxima primeiro (FEFO).
        lotes = sorted(lotes, key=lambda l: (l.medicamento.nome.lower(), l.data_validade))

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

    def consumo_medicamentos(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
        setor_consumidor: str | None = None,
    ) -> RelatorioConsumoMedicamentosOut:
        """Série histórica mensal de consumo por medicamento e setor
        (2026-08-20, setor de dispensação adicionado) — quanto foi
        efetivamente dispensado internamente, mês a mês, por setor
        clínico. Só conta Saída categoria `normal` (ou sem categoria,
        saídas antigas pré-2026-08-19): baixa por vencimento é perda, não
        consumo; empréstimo/doação/permuta saíram do hospital, não foram
        consumidos internamente."""
        saidas = self.movimentacao_repository.listar_saidas_por_periodo(
            db, data_inicio, data_fim, unidade_id, setor_consumidor
        )

        agregados: dict[tuple[int, str, str], dict] = defaultdict(
            lambda: {"nome": "", "quantidade_total": 0}
        )

        for movimentacao in saidas:
            if movimentacao.categoria_saida not in (None, CategoriaSaidaEnum.normal):
                continue

            medicamento = movimentacao.lote.medicamento
            mes = movimentacao.data_hora.strftime("%Y-%m")
            setor = movimentacao.setor_consumidor or "Não informado"
            agregado = agregados[(medicamento.id, mes, setor)]
            agregado["nome"] = medicamento.nome
            agregado["quantidade_total"] += movimentacao.quantidade

        itens = [
            RelatorioConsumoMedicamentoItem(
                medicamento_id=medicamento_id,
                nome=dados["nome"],
                mes=mes,
                setor=setor,
                quantidade_total=dados["quantidade_total"],
            )
            for (medicamento_id, mes, setor), dados in sorted(
                agregados.items(), key=lambda kv: (kv[1]["nome"], kv[0][1], kv[0][2])
            )
        ]

        return RelatorioConsumoMedicamentosOut(
            metadados=self._metadados(usuario, "Consumo de Medicamentos", unidade_id, db),
            periodo_inicio=data_inicio,
            periodo_fim=data_fim,
            itens=itens,
        )

    def auditoria(
        self,
        db: Session,
        usuario: UsuarioMe,
        tipo: TipoMovimentacaoEnum | None,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
        limit: int | None,
        offset: int = 0,
    ) -> RelatorioAuditoriaOut:
        """Só coordenador acessa (garantido no router) — trilha completa,
        nunca filtrada por unidade do usuário logado, só por filtro
        explícito escolhido na tela.

        Paginação (2026-08-19, diagnóstico de carga): `limit=None` só na
        exportação, que devolve tudo sem truncar; a tela sempre paginada
        (o router já aplica um período padrão quando nenhuma data vem
        informada, então a paginação aqui é sobretudo pro pior caso de
        alguém pedir um período bem largo mesmo assim)."""
        movimentacoes, total = self.movimentacao_repository.listar_auditoria(
            db, tipo, unidade_id, data_inicio, data_fim, limit, offset
        )

        return RelatorioAuditoriaOut(
            metadados=self._metadados(usuario, "Trilha de Auditoria", unidade_id, db),
            total=total,
            limit=limit,
            offset=offset,
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

    def minhas_movimentacoes(
        self,
        db: Session,
        usuario: UsuarioMe,
        tipo: TipoMovimentacaoEnum | None,
        data_inicio: date | None,
        data_fim: date | None,
        limit: int | None,
        offset: int = 0,
    ) -> RelatorioAuditoriaOut:
        """"Minhas Ações" (2026-09-01, pedido do cliente: "conferir as
        coisas que fez") — mesma consulta/paginação de `auditoria()`
        acima, mas ABERTA A QUALQUER PERFIL (não só Coordenador) porque
        `usuario_id` vem sempre forçado ao próprio usuário logado, nunca
        um filtro livre — cada um só vê o que registrou, não a trilha dos
        outros."""
        movimentacoes, total = self.movimentacao_repository.listar_auditoria(
            db, tipo, None, data_inicio, data_fim, limit, offset, usuario_id=usuario.id
        )

        return RelatorioAuditoriaOut(
            metadados=self._metadados(usuario, "Minhas Ações", None, db),
            total=total,
            limit=limit,
            offset=offset,
            itens=[
                MovimentacaoDetalhadaOut.visivel_para(m, usuario)
                for m in movimentacoes
            ],
        )

    def _categorizar_movimentacao(self, m: Movimentacao) -> CategoriaMovimentacaoGeral:
        """Deriva a categoria do Relatório Geral de Movimentações
        (2026-09-02) a partir de dados que já existem — nenhuma das 5
        modalidades pedidas pelo cliente precisou de coluna nova:

        - Devolução de Medicamento: `tipo=entrada` com o lote marcado
          `origem=devolucao` (ver SolicitacaoDevolucaoMedicamentoService.
          confirmar).
        - Reposição de Carrinho: `tipo` saida/transferencia envolvendo
          uma unidade `tipo=carrinho` (origem OU destino) — é o que
          `RessuprimentoCarrinhoService.confirmar_saida`/
          `confirmar_transferencia` gravam.
        - Entrada/Saída/Transferência "puras": o que sobra."""
        if m.tipo == TipoMovimentacaoEnum.entrada:
            return "devolucao" if m.lote.origem == OrigemEnum.devolucao else "entrada"

        origem_carrinho = m.unidade_origem is not None and m.unidade_origem.tipo == TipoUnidadeEnum.carrinho
        destino_carrinho = m.unidade_destino is not None and m.unidade_destino.tipo == TipoUnidadeEnum.carrinho
        if m.tipo in (TipoMovimentacaoEnum.saida, TipoMovimentacaoEnum.transferencia) and (
            origem_carrinho or destino_carrinho
        ):
            return "reposicao_carrinho"

        return "saida" if m.tipo == TipoMovimentacaoEnum.saida else "transferencia"

    def movimentacoes_geral(
        self,
        db: Session,
        usuario: UsuarioMe,
        categoria: CategoriaMovimentacaoGeral | None,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
        limit: int | None,
        offset: int = 0,
    ) -> RelatorioMovimentacoesGeralOut:
        """Entrada, Saída, Transferência, Reposição de Carrinho e
        Devolução de Medicamento numa aba só (2026-09-02, pedido do
        cliente). A paginação só pode acontecer DEPOIS de categorizar —
        `reposicao_carrinho`/`devolucao` não são um `tipo` de linha no
        banco, só dá pra saber quantas linhas viram cada categoria depois
        de olhar cada uma (ver `MovimentacaoRepository.listar_geral`)."""
        movimentacoes = self.movimentacao_repository.listar_geral(db, unidade_id, data_inicio, data_fim)

        categorizadas = [(m, self._categorizar_movimentacao(m)) for m in movimentacoes]
        if categoria is not None:
            categorizadas = [(m, c) for m, c in categorizadas if c == categoria]

        total = len(categorizadas)
        pagina = categorizadas[offset : offset + limit] if limit is not None else categorizadas

        return RelatorioMovimentacoesGeralOut(
            metadados=self._metadados(usuario, "Relatório Geral de Movimentações", unidade_id, db),
            total=total,
            limit=limit,
            offset=offset,
            itens=[MovimentacaoGeralOut.visivel_para(m, usuario, c) for m, c in pagina],
        )

    def estoque_critico(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None
    ) -> RelatorioEstoqueCriticoOut:
        """Carrinho de emergência não entra aqui (2026-08-31) — soma
        `quantidade_atual` só dos lotes na unidade filtrada (nunca
        carrinhos filhos dela) e compara com `estoque_minimo` — mesma
        regra que já existia só no frontend (tile "Estoque Crítico" da
        tela Estoque atual); `estoque_minimo == 0` significa "sem
        controle de mínimo definido", nunca entra na lista (não é
        criticidade real, é ausência de configuração)."""
        lotes = self.lote_repository.listar(
            db, unidade_id=unidade_id, apenas_disponivel=True, ordenar_fefo=False
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
        antimicrobianos (2026-08-19)."""
        return self._vigilancia_paciente(
            db, usuario, unidade_id, dias_minimo, "antimicrobiano", "Uso Prolongado de Antimicrobianos"
        )

    def controlados_dispensacao(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        dias_minimo: int = 0,
    ) -> RelatorioAntimicrobianoOut:
        """Vigilância diária de medicamentos controlados (2026-08-20) —
        mesma mecânica do DOT, mas sem exigir "uso prolongado": o padrão
        é `dias_minimo=0`, então qualquer dispensação aparece, não só
        sequências de vários dias (a farmácia quer ver TODA dispensação
        de controlado, não só as recorrentes)."""
        return self._vigilancia_paciente(
            db, usuario, unidade_id, dias_minimo, "controlado", "Dispensação de Controlados"
        )

    def _vigilancia_paciente(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        dias_minimo: int,
        categoria: str,
        titulo: str,
    ) -> RelatorioAntimicrobianoOut:
        """Aproximação: conta DATAS DISTINTAS de dispensação (Saída) por
        paciente+medicamento, não confirmação real de administração (o
        hospital não tem eMAR) — é a mesma limitação assumida em todo o
        resto do sistema, que só enxerga o que passa pela farmácia.

        "Em uso" = a dispensação mais recente daquele paciente+
        medicamento aconteceu nos últimos `RECENCIA_DIAS` dias (senão é
        histórico, não uso corrente). "Dias consecutivos" = tamanho da
        sequência de datas sem furo terminando na dispensação mais
        recente — só entra na lista quem passar de `dias_minimo`."""
        RECENCIA_DIAS = 2

        saidas = self.movimentacao_repository.listar_saidas_vigilancia(db, categoria, unidade_id)

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
            metadados=self._metadados(usuario, titulo, unidade_id, db),
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
            detalhe = f"{categoria} — setor {m.setor_consumidor or '—'}"
            if m.destino_externo:
                detalhe += f" — destino: {m.destino_externo}"
                if m.destinatario:
                    detalhe += f" (a/c {m.destinatario})"
            return detalhe
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
        desde = datetime.now(timezone.utc) - timedelta(days=dias)
        movimentacoes = self.movimentacao_repository.listar_atividade_recente(
            db, desde, unidade_id
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

    def transferencias(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
    ) -> RelatorioTransferenciasOut:
        """Rastreabilidade de transferências entre unidades (2026-08-20) —
        toda transferência no período (pendente ou já confirmada), pra
        confirmar que um medicamento realmente saiu de uma unidade e
        chegou na outra. Divergência entre `quantidade` (enviada) e
        `quantidade_recebida` fica visível item a item, sem cálculo à
        parte — o front decide como destacar."""
        movimentacoes = self.movimentacao_repository.listar_transferencias(
            db, unidade_id, data_inicio, data_fim
        )

        return RelatorioTransferenciasOut(
            metadados=self._metadados(usuario, "Rastreabilidade de Transferências", unidade_id, db),
            periodo_inicio=data_inicio,
            periodo_fim=data_fim,
            itens=[MovimentacaoDetalhadaOut.visivel_para(m, usuario) for m in movimentacoes],
        )

    def movimentacao_transferencias(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_id: int | None,
        data_inicio: date | None,
        data_fim: date | None,
    ) -> RelatorioMovimentacaoTransferenciasOut:
        """Mesma consulta de `transferencias()` acima, mas sem nenhum dado
        financeiro no retorno (2026-08-31, pedido do cliente: "todos têm
        acesso") — por isso liberado a qualquer perfil, não só
        Farmacêutico/Coordenador."""
        movimentacoes = self.movimentacao_repository.listar_transferencias(
            db, unidade_id, data_inicio, data_fim
        )

        itens = [
            MovimentacaoTransferenciaItem(
                movimentacao_id=m.id,
                medicamento_nome=m.lote.medicamento.nome,
                numero_lote=m.lote.numero_lote,
                unidade_origem=m.unidade_origem.nome if m.unidade_origem else "—",
                unidade_destino=m.unidade_destino.nome if m.unidade_destino else "—",
                quantidade_enviada=m.quantidade,
                quantidade_recebida=m.quantidade_recebida,
                usuario_envio=m.usuario.nome,
                usuario_confirmacao=m.usuario_confirmacao.nome if m.usuario_confirmacao else None,
                data_hora=m.data_hora,
                data_confirmacao=m.data_confirmacao,
            )
            for m in movimentacoes
        ]

        return RelatorioMovimentacaoTransferenciasOut(
            metadados=self._metadados(usuario, "Movimentação de Transferências", unidade_id, db),
            periodo_inicio=data_inicio,
            periodo_fim=data_fim,
            itens=itens,
        )

    def comprovante_solicitacao(
        self, db: Session, usuario: UsuarioMe, solicitacao
    ) -> TabelaRelatorio:
        """Comprovante imprimível de UMA solicitação (2026-09-01, pedido
        do cliente: botão "Imprimir" ao lado de "Minhas solicitações" em
        ResuprimentoPage.tsx) — `solicitacao` já vem carregada e validada
        por `SolicitacaoService.obter_para_comprovante`."""
        metadados = self._metadados(
            usuario, f"Comprovante de Solicitação #{solicitacao.id}", solicitacao.unidade_solicitante_id, db
        )
        return tabela_comprovante_solicitacao(metadados, solicitacao)

    def comprovante_entrada(self, db: Session, usuario: UsuarioMe, lotes: list) -> TabelaRelatorio:
        """Comprovante imprimível do que acabou de ser registrado em
        Entrada, qualquer modalidade (2026-09-01, pedido do cliente) —
        `lotes` já vem carregado e validado por
        `EntradaService.obter_para_comprovante`."""
        metadados = self._metadados(usuario, "Comprovante de Entrada", lotes[0].unidade_id, db)
        return tabela_comprovante_entrada(metadados, lotes)

    def comprovante_saida(self, db: Session, usuario: UsuarioMe, movimentacoes: list) -> TabelaRelatorio:
        """Comprovante imprimível de uma ou mais Saídas (2026-09-02,
        pedido do cliente: controle de Empréstimo/Doação/Permuta —
        "precisamos do registro pra controle") — `movimentacoes` já vem
        carregada e validada por `SaidaService.obter_para_comprovante`."""
        metadados = self._metadados(
            usuario, "Comprovante de Saída", movimentacoes[0].unidade_origem_id, db
        )
        return tabela_comprovante_saida(metadados, movimentacoes)

    def vencimentos_proximos(
        self, db: Session, usuario: UsuarioMe, unidade_id: int | None, dias: int
    ) -> RelatorioVencimentosProximosOut:
        """Carrinho não entra aqui (2026-08-31) — mesmo critério de
        `estoque_consolidado`, só a unidade filtrada."""
        lotes = self.lote_repository.listar_vencimento_proximo(db, dias, unidade_id)

        return RelatorioVencimentosProximosOut(
            metadados=self._metadados(
                usuario, "Vencimentos Próximos", unidade_id, db
            ),
            dias_considerados=dias,
            itens=[LoteDetalhadoOut.model_validate(lote) for lote in lotes],
        )
