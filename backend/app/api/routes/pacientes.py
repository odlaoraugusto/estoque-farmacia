from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database.session import get_db
from app.schemas.paciente import PacienteOut
from app.services.paciente_service import PacienteService

router = APIRouter(prefix="/pacientes", tags=["Pacientes"])

service = PacienteService()


@router.get(
    "/{prontuario}",
    response_model=PacienteOut,
    dependencies=[Depends(get_current_user)],
)
def buscar_paciente(prontuario: str, db: Session = Depends(get_db)):
    """Autopreenchimento por prontuário na tela de Saída (2026-08-20:
    liberado a qualquer perfil autenticado, incluindo Atendente — é
    consulta para a PRÓPRIA dispensação que ele está registrando agora,
    mesma categoria de exceção já aplicada ao eco imediato de POST
    /saidas, não a restrição mais ampla de "ver dado de paciente de
    outra Saída" (essa continua só em `MovimentacaoOut.visivel_para`,
    para relatórios/auditoria). Devolve `{prontuario, nome}` se já
    existir, 404 caso contrário."""
    return service.buscar_por_prontuario(db, prontuario)
