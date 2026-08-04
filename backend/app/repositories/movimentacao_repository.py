from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.enums import StatusDescarteEnum, TipoMovimentacaoEnum
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
    ) -> list[Movimentacao]:
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

        return query.order_by(Movimentacao.data_hora.desc()).all()
