from sqlalchemy.orm import Session

from app.models.unidade import Unidade


class UnidadeRepository:

    def list(self, db: Session) -> list[Unidade]:
        return db.query(Unidade).order_by(Unidade.nome).all()

    def get_by_id(self, db: Session, unidade_id: int) -> Unidade | None:
        return db.query(Unidade).filter(Unidade.id == unidade_id).first()

    def get_by_nome(self, db: Session, nome: str) -> Unidade | None:
        return db.query(Unidade).filter(Unidade.nome == nome).first()
