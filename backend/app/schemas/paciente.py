from pydantic import BaseModel, ConfigDict


class PacienteOut(BaseModel):
    """Resposta do autopreenchimento por prontuário
    (`GET /pacientes/{prontuario}`) — só `prontuario` + `nome`, nada
    além disso é armazenado sobre o paciente neste sistema."""

    prontuario: str
    nome: str

    model_config = ConfigDict(from_attributes=True)
