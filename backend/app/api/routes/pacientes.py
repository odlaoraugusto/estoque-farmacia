from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis
from app.core.permissoes import PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE
from app.database.session import get_db
from app.schemas.paciente import PacienteOut
from app.services.paciente_service import PacienteService

router = APIRouter(prefix="/pacientes", tags=["Pacientes"])

service = PacienteService()

# Dado sensível de saúde (LGPD, seção 22 do doc): restrito a
# Farmacêutico/Coordenador — Atendente não consulta paciente de outra
# Saída, só digita o que sabe na hora de registrar a própria (regra
# aplicada em SaidaCreate, não aqui). Mesma constante usada em
# `MovimentacaoOut.visivel_para` (app/core/permissoes.py) — um único
# lugar decide "quem pode ver dado de paciente".
_PODE_CONSULTAR = exigir_perfis(*PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE)


@router.get(
    "/{prontuario}",
    response_model=PacienteOut,
    dependencies=[Depends(_PODE_CONSULTAR)],
)
def buscar_paciente(prontuario: str, db: Session = Depends(get_db)):
    """Autopreenchimento por prontuário na tela de Saída: devolve
    `{prontuario, nome}` se já existir, 404 caso contrário."""
    return service.buscar_por_prontuario(db, prontuario)
