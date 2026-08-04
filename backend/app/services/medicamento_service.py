from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.medicamento_repository import MedicamentoRepository
from app.schemas.medicamento import MedicamentoCreate, MedicamentoUpdate


class MedicamentoService:
    """Cadastro de medicamentos — Farmacêutico cadastra sozinho, sem
    aprovação do Coordenador (docs/00_PROJETO.md seção 9, default 5)."""

    def __init__(self):
        self.repository = MedicamentoRepository()

    def create(self, db: Session, dados: MedicamentoCreate):
        return self.repository.create(db, dados)

    def list(self, db: Session, apenas_ativos: bool = True):
        return self.repository.list(db, apenas_ativos)

    def get_by_id(self, db: Session, medicamento_id: int):
        medicamento = self.repository.get_by_id(db, medicamento_id)

        if medicamento is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Medicamento não encontrado.",
            )

        return medicamento

    def update(self, db: Session, medicamento_id: int, dados: MedicamentoUpdate):
        medicamento = self.get_by_id(db, medicamento_id)

        return self.repository.update(db, medicamento, dados)
