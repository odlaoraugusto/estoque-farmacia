from sqlalchemy.orm import Session

from app.models.paciente import Paciente


class PacienteRepository:

    def get_by_prontuario(self, db: Session, prontuario: str) -> Paciente | None:
        return db.query(Paciente).filter(Paciente.prontuario == prontuario).first()

    def create(self, db: Session, prontuario: str, nome: str) -> Paciente:
        paciente = Paciente(prontuario=prontuario, nome=nome)

        db.add(paciente)
        db.commit()
        db.refresh(paciente)

        return paciente
