from sqlalchemy.orm import Session

from app.models.medicamento import Medicamento
from app.schemas.medicamento import MedicamentoCreate, MedicamentoUpdate


class MedicamentoRepository:

    def create(self, db: Session, dados: MedicamentoCreate) -> Medicamento:
        medicamento = Medicamento(**dados.model_dump())

        db.add(medicamento)
        db.commit()
        db.refresh(medicamento)

        return medicamento

    def list(self, db: Session, apenas_ativos: bool = True) -> list[Medicamento]:
        query = db.query(Medicamento)

        if apenas_ativos:
            query = query.filter(Medicamento.ativo.is_(True))

        return query.order_by(Medicamento.nome).all()

    def get_by_id(self, db: Session, medicamento_id: int) -> Medicamento | None:
        return db.query(Medicamento).filter(Medicamento.id == medicamento_id).first()

    def update(
        self, db: Session, medicamento: Medicamento, dados: MedicamentoUpdate
    ) -> Medicamento:
        for campo, valor in dados.model_dump(exclude_unset=True).items():
            setattr(medicamento, campo, valor)

        db.commit()
        db.refresh(medicamento)

        return medicamento
