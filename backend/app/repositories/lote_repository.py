from datetime import date

from sqlalchemy.orm import Session

from app.models.lote import Lote


class LoteRepository:

    def create(self, db: Session, lote: Lote) -> Lote:
        db.add(lote)
        db.commit()
        db.refresh(lote)

        return lote

    def get_by_id(self, db: Session, lote_id: int) -> Lote | None:
        return db.query(Lote).filter(Lote.id == lote_id).first()

    def get_by_id_for_update(self, db: Session, lote_id: int) -> Lote | None:
        """Bloqueia a linha do lote até o fim da transação (`SELECT ... FOR
        UPDATE`) — evita duas estações decrementando o mesmo lote ao
        mesmo tempo (condição de corrida citada em docs/00_PROJETO.md
        seção 2, "evitar conflito de concorrência")."""
        return (
            db.query(Lote)
            .filter(Lote.id == lote_id)
            .with_for_update()
            .first()
        )

    def listar(
        self,
        db: Session,
        unidade_id: int | list[int] | None = None,
        medicamento_id: int | None = None,
        apenas_disponivel: bool = True,
        ordenar_fefo: bool = True,
    ) -> list[Lote]:
        """`unidade_id` aceita uma lista (além de um único id) para cobrir o
        escopo ampliado unidade real + carrinhos-filho dela (carrinhos de
        emergência, docs/00_PROJETO.md) — quem decide se amplia ou não é a
        camada de service, aqui só aplicamos o filtro que vier."""
        query = db.query(Lote)

        if isinstance(unidade_id, list):
            query = query.filter(Lote.unidade_id.in_(unidade_id))
        elif unidade_id is not None:
            query = query.filter(Lote.unidade_id == unidade_id)

        if medicamento_id is not None:
            query = query.filter(Lote.medicamento_id == medicamento_id)

        if apenas_disponivel:
            query = query.filter(Lote.quantidade_atual > 0)

        if ordenar_fefo:
            query = query.order_by(Lote.data_validade.asc())

        return query.all()

    def listar_vencimento_proximo(
        self,
        db: Session,
        dias: int,
        unidade_id: int | list[int] | None = None,
    ) -> list[Lote]:
        limite = date.today()
        from datetime import timedelta

        limite = limite + timedelta(days=dias)

        query = db.query(Lote).filter(
            Lote.quantidade_atual > 0,
            Lote.data_validade <= limite,
        )

        if isinstance(unidade_id, list):
            query = query.filter(Lote.unidade_id.in_(unidade_id))
        elif unidade_id is not None:
            query = query.filter(Lote.unidade_id == unidade_id)

        return query.order_by(Lote.data_validade.asc()).all()

    def salvar(self, db: Session, lote: Lote) -> Lote:
        db.commit()
        db.refresh(lote)

        return lote
