from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.enums import TipoUnidadeEnum
from app.models.unidade import Unidade


class UnidadeRepository:

    def list(self, db: Session, tipo: TipoUnidadeEnum | None = None) -> list[Unidade]:
        query = db.query(Unidade)

        if tipo is not None:
            query = query.filter(Unidade.tipo == tipo)

        return query.order_by(Unidade.nome).all()

    def get_by_id(self, db: Session, unidade_id: int) -> Unidade | None:
        return db.query(Unidade).filter(Unidade.id == unidade_id).first()

    def get_by_nome(self, db: Session, nome: str) -> Unidade | None:
        return db.query(Unidade).filter(Unidade.nome == nome).first()
