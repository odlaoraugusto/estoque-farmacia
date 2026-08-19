from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.enums import CategoriaSaidaEnum, StatusDescarteEnum, TipoMovimentacaoEnum
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
    ) -> tuple[list[Movimentacao], int]:
        """`limit=None` devolve tudo que bate com o filtro, sem paginar —
        usado só na exportação (PDF/Excel), onde truncar silenciosamente
        seria pior que a tela lenta que a paginação existe pra evitar. A
        tela (JSON puro) sempre manda um `limit`. `total` é a contagem
        ANTES de aplicar limit/offset, pra a tela saber quanto falta."""
        query = db.query(Movimentacao)

        if tipo is not None:
            query = query.filter(Movimentacao.tipo == tipo)

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

        total = query.count()

        query = query.order_by(Movimentacao.data_hora.desc())
        if limit is not None:
            query = query.offset(offset).limit(limit)

        return query.all(), total

    def listar_saidas_antimicrobianos(
        self, db: Session, unidade_id: int | list[int] | None = None
    ) -> list[Movimentacao]:
        """Alimenta o DOT (Days of Therapy, 2026-08-19): toda Saída de um
        medicamento marcado `e_antimicrobiano`, com paciente vinculado
        (sem paciente não dá pra agrupar por paciente — na prática nunca
        deveria faltar aqui, `SaidaService` já exige isso na origem)."""
        query = (
            db.query(Movimentacao)
            .join(Lote, Movimentacao.lote_id == Lote.id)
            .join(Medicamento, Lote.medicamento_id == Medicamento.id)
            .filter(
                Movimentacao.tipo == TipoMovimentacaoEnum.saida,
                Medicamento.e_antimicrobiano.is_(True),
                Movimentacao.paciente_prontuario.isnot(None),
            )
        )

        if isinstance(unidade_id, list):
            query = query.filter(Movimentacao.unidade_origem_id.in_(unidade_id))
        elif unidade_id is not None:
            query = query.filter(Movimentacao.unidade_origem_id == unidade_id)

        return query.order_by(Movimentacao.data_hora.asc()).all()

    def listar_atividade_recente(
        self,
        db: Session,
        desde: datetime,
        unidade_id: int | list[int] | None = None,
    ) -> list[Movimentacao]:
        """Alimenta a notificação do Coordenador (2026-08-19): descartes,
        ajustes e saídas de empréstimo/doação a partir de `desde`."""
        query = db.query(Movimentacao).filter(
            Movimentacao.data_hora >= desde,
            (
                (Movimentacao.tipo == TipoMovimentacaoEnum.descarte)
                | (Movimentacao.tipo == TipoMovimentacaoEnum.ajuste)
                | (
                    (Movimentacao.tipo == TipoMovimentacaoEnum.saida)
                    & Movimentacao.categoria_saida.in_(
                        [CategoriaSaidaEnum.emprestimo, CategoriaSaidaEnum.doacao]
                    )
                )
            ),
        )

        if isinstance(unidade_id, list):
            query = query.filter(Movimentacao.unidade_origem_id.in_(unidade_id))
        elif unidade_id is not None:
            query = query.filter(Movimentacao.unidade_origem_id == unidade_id)

        return query.order_by(Movimentacao.data_hora.desc()).all()
