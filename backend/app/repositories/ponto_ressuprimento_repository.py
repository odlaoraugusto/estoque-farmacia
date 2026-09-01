from sqlalchemy.orm import Session

from app.models.ponto_ressuprimento import PontoRessuprimento


class PontoRessuprimentoRepository:
    def listar(self, db: Session, unidade_id: int | None = None) -> list[PontoRessuprimento]:
        query = db.query(PontoRessuprimento)

        if unidade_id is not None:
            query = query.filter(PontoRessuprimento.unidade_id == unidade_id)

        return query.all()

    def get_by_medicamento_unidade(
        self, db: Session, medicamento_id: int, unidade_id: int
    ) -> PontoRessuprimento | None:
        return (
            db.query(PontoRessuprimento)
            .filter(
                PontoRessuprimento.medicamento_id == medicamento_id,
                PontoRessuprimento.unidade_id == unidade_id,
            )
            .first()
        )

    def salvar(self, db: Session, ponto: PontoRessuprimento) -> PontoRessuprimento:
        db.add(ponto)
        db.commit()
        db.refresh(ponto)

        return ponto
