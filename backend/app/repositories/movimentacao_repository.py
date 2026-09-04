from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.enums import (
    CATEGORIAS_SAIDA_EXTERNA,
    CategoriaSaidaEnum,
    StatusDescarteEnum,
    TipoMovimentacaoEnum,
)
from app.models.lote import Lote
from app.models.medicamento import Medicamento
from app.models.movimentacao import Movimentacao


class MovimentacaoRepository:

    def create(self, db: Session, movimentacao: Movimentacao) -> Movimentacao:
        db.add(movimentacao)
        db.commit()
        db.refresh(movimentacao)

        return movimentacao

    def get_by_id(self, db: Session, movimentacao_id: int) -> Movimentacao | None:
        return (
            db.query(Movimentacao)
            .filter(Movimentacao.id == movimentacao_id)
            .first()
        )

    def get_by_id_for_update(
        self, db: Session, movimentacao_id: int
    ) -> Movimentacao | None:
        return (
            db.query(Movimentacao)
            .filter(Movimentacao.id == movimentacao_id)
            .with_for_update()
            .first()
        )

    def salvar(self, db: Session, movimentacao: Movimentacao) -> Movimentacao:
        db.commit()
        db.refresh(movimentacao)

        return movimentacao

    def listar_por_solicitacao_devolucao(
        self, db: Session, solicitacao_devolucao_id: int
    ) -> list[Movimentacao]:
        """Todos os lotes que resultaram da confirmação de UMA solicitação
        de devolução de medicamento (2026-09-04) — pode ser mais de um
        por item, quando o mesmo medicamento é dividido em lotes
        diferentes na hora de confirmar (ver
        SolicitacaoDevolucaoMedicamentoService.confirmar/
        obter_lotes_para_comprovante)."""
        return (
            db.query(Movimentacao)
            .filter(Movimentacao.solicitacao_devolucao_id == solicitacao_devolucao_id)
            .order_by(Movimentacao.id.asc())
            .all()
        )

    def listar_transferencias_pendentes(
        self, db: Session, unidade_destino_id: int | None = None
    ) -> list[Movimentacao]:
        query = db.query(Movimentacao).filter(
            Movimentacao.tipo == TipoMovimentacaoEnum.transferencia,
            Movimentacao.quantidade_recebida.is_(None),
        )

        if unidade_destino_id is not None:
            query = query.filter(Movimentacao.unidade_destino_id == unidade_destino_id)

        return query.order_by(Movimentacao.data_hora.asc()).all()

    def listar_descartes_pendentes(
        self, db: Session, unidade_id: int | None = None
    ) -> list[Movimentacao]:
        query = db.query(Movimentacao).filter(
            Movimentacao.tipo == TipoMovimentacaoEnum.descarte,
            Movimentacao.status == StatusDescarteEnum.pendente_aprovacao,
        )

        if unidade_id is not None:
            query = query.filter(Movimentacao.lote.has(unidade_id=unidade_id))

        return query.order_by(Movimentacao.data_hora.asc()).all()

    def listar_saidas_por_periodo(
        self,
        db: Session,
        data_inicio: date | None,
        data_fim: date | None,
        unidade_id: int | None = None,
        setor_consumidor: str | None = None,
    ) -> list[Movimentacao]:
        query = db.query(Movimentacao).filter(
            Movimentacao.tipo == TipoMovimentacaoEnum.saida
        )

        if data_inicio is not None:
            query = query.filter(
                Movimentacao.data_hora >= datetime.combine(data_inicio, datetime.min.time())
            )

        if data_fim is not None:
            query = query.filter(
                Movimentacao.data_hora <= datetime.combine(data_fim, datetime.max.time())
            )

        if unidade_id is not None:
            query = query.filter(Movimentacao.unidade_origem_id == unidade_id)

        if setor_consumidor is not None:
            query = query.filter(Movimentacao.setor_consumidor == setor_consumidor)

        return query.all()

    def listar_auditoria(
        self,
        db: Session,
        tipo: TipoMovimentacaoEnum | None = None,
        unidade_id: int | None = None,
        data_inicio: date | None = None,
        data_fim: date | None = None,
        limit: int | None = None,
        offset: int = 0,
        usuario_id: int | None = None,
    ) -> tuple[list[Movimentacao], int]:
        """`limit=None` devolve tudo que bate com o filtro, sem paginar —
        usado só na exportação (PDF/Excel), onde truncar silenciosamente
        seria pior que a tela lenta que a paginação existe pra evitar. A
        tela (JSON puro) sempre manda um `limit`. `total` é a contagem
        ANTES de aplicar limit/offset, pra a tela saber quanto falta.

        `usuario_id` (2026-09-01, pedido do cliente: "Minhas Ações") —
        filtra só o que aquele usuário registrou (`Movimentacao.
        usuario_id`), usado pelo self-service, nunca pela trilha completa
        do Coordenador."""
        query = db.query(Movimentacao)

        if tipo is not None:
            query = query.filter(Movimentacao.tipo == tipo)

        if unidade_id is not None:
            query = query.filter(
                (Movimentacao.unidade_origem_id == unidade_id)
                | (Movimentacao.unidade_destino_id == unidade_id)
            )

        if usuario_id is not None:
            query = query.filter(Movimentacao.usuario_id == usuario_id)

        if data_inicio is not None:
            query = query.filter(
                Movimentacao.data_hora >= datetime.combine(data_inicio, datetime.min.time())
            )

        if data_fim is not None:
            query = query.filter(
                Movimentacao.data_hora <= datetime.combine(data_fim, datetime.max.time())
            )

        total = query.count()

        query = query.order_by(Movimentacao.data_hora.desc())
        if limit is not None:
            query = query.offset(offset).limit(limit)

        return query.all(), total

    def listar_geral(
        self,
        db: Session,
        unidade_id: int | None = None,
        data_inicio: date | None = None,
        data_fim: date | None = None,
    ) -> list[Movimentacao]:
        """Base do Relatório Geral de Movimentações (2026-09-02, pedido do
        cliente) — Entrada, Saída, Transferência, Reposição de Carrinho e
        Devolução de Medicamento juntas numa aba só. As 5 modalidades já
        caem em `tipo` in (entrada, saida, transferencia); descarte/
        ajuste/correcao_valor ficam fora (continuam só na Trilha de
        Auditoria). Reposição de Carrinho e Devolução não são valores
        próprios de `tipo` — são derivadas depois, em
        `RelatorioService._categorizar_movimentacao`, a partir de
        `unidade.tipo`/`Lote.origem` (por isso esta consulta não pagina:
        a paginação real só pode acontecer depois de categorizar cada
        linha, que depende dos relacionamentos já carregados via
        `lazy='selectin'`)."""
        query = db.query(Movimentacao).filter(
            Movimentacao.tipo.in_(
                [TipoMovimentacaoEnum.entrada, TipoMovimentacaoEnum.saida, TipoMovimentacaoEnum.transferencia]
            )
        )

        if unidade_id is not None:
            query = query.filter(
                (Movimentacao.unidade_origem_id == unidade_id)
                | (Movimentacao.unidade_destino_id == unidade_id)
            )

        if data_inicio is not None:
            query = query.filter(
                Movimentacao.data_hora >= datetime.combine(data_inicio, datetime.min.time())
            )

        if data_fim is not None:
            query = query.filter(
                Movimentacao.data_hora <= datetime.combine(data_fim, datetime.max.time())
            )

        return query.order_by(Movimentacao.data_hora.desc()).all()

    def listar_saidas_vigilancia(
        self,
        db: Session,
        categoria: str,
        unidade_id: int | list[int] | None = None,
    ) -> list[Movimentacao]:
        """Alimenta os relatórios de vigilância diária por paciente —
        antimicrobiano (DOT, 2026-08-19) e controlado (2026-08-20, mesma
        mecânica, sem o corte de "uso prolongado" do DOT). `categoria`
        escolhe qual coluna booleana do medicamento filtrar. Só saídas
        com paciente vinculado (sem paciente não dá pra agrupar — na
        prática nunca deveria faltar aqui, `SaidaService` já exige isso
        na origem para ambas as classes)."""
        coluna = Medicamento.e_antimicrobiano if categoria == "antimicrobiano" else Medicamento.e_controlado

        query = (
            db.query(Movimentacao)
            .join(Lote, Movimentacao.lote_id == Lote.id)
            .join(Medicamento, Lote.medicamento_id == Medicamento.id)
            .filter(
                Movimentacao.tipo == TipoMovimentacaoEnum.saida,
                coluna.is_(True),
                Movimentacao.paciente_prontuario.isnot(None),
            )
        )

        if isinstance(unidade_id, list):
            query = query.filter(Movimentacao.unidade_origem_id.in_(unidade_id))
        elif unidade_id is not None:
            query = query.filter(Movimentacao.unidade_origem_id == unidade_id)

        return query.order_by(Movimentacao.data_hora.asc()).all()

    def listar_transferencias(
        self,
        db: Session,
        unidade_id: int | None = None,
        data_inicio: date | None = None,
        data_fim: date | None = None,
    ) -> list[Movimentacao]:
        """Rastreabilidade de transferências entre unidades (2026-08-20) —
        toda transferência (pendente ou já confirmada), não só as
        pendentes (`listar_transferencias_pendentes` já cobre essas).
        `unidade_id` bate em origem OU destino, pra a satélite conseguir
        ver tanto o que pediu quanto o que já recebeu."""
        query = db.query(Movimentacao).filter(
            Movimentacao.tipo == TipoMovimentacaoEnum.transferencia
        )

        if unidade_id is not None:
            query = query.filter(
                (Movimentacao.unidade_origem_id == unidade_id)
                | (Movimentacao.unidade_destino_id == unidade_id)
            )

        if data_inicio is not None:
            query = query.filter(
                Movimentacao.data_hora >= datetime.combine(data_inicio, datetime.min.time())
            )

        if data_fim is not None:
            query = query.filter(
                Movimentacao.data_hora <= datetime.combine(data_fim, datetime.max.time())
            )

        return query.order_by(Movimentacao.data_hora.desc()).all()

    def listar_atividade_recente(
        self,
        db: Session,
        desde: datetime,
        unidade_id: int | list[int] | None = None,
    ) -> list[Movimentacao]:
        """Alimenta a notificação do Coordenador (2026-08-19): ajustes e
        saídas de empréstimo/doação/permuta/vencimento a partir de
        `desde` (`descarte` continua no filtro só por causa de registros
        históricos anteriores a 2026-08-20 — a tela que criava esse tipo
        foi removida, substituída pela categoria `vencimento` de
        Saída)."""
        categorias_notificaveis = (*CATEGORIAS_SAIDA_EXTERNA, CategoriaSaidaEnum.vencimento)
        query = db.query(Movimentacao).filter(
            Movimentacao.data_hora >= desde,
            (
                (Movimentacao.tipo == TipoMovimentacaoEnum.descarte)
                | (Movimentacao.tipo == TipoMovimentacaoEnum.ajuste)
                | (
                    (Movimentacao.tipo == TipoMovimentacaoEnum.saida)
                    & Movimentacao.categoria_saida.in_(categorias_notificaveis)
                )
            ),
        )

        if isinstance(unidade_id, list):
            query = query.filter(Movimentacao.unidade_origem_id.in_(unidade_id))
        elif unidade_id is not None:
            query = query.filter(Movimentacao.unidade_origem_id == unidade_id)

        return query.order_by(Movimentacao.data_hora.desc()).all()
