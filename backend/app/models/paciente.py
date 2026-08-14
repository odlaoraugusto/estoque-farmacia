from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.database.database import Base


class Paciente(Base):
    """Base de pacientes que cresce organicamente a partir da Saída
    (docs/00_PROJETO.md, seção 22) — não existe tela de cadastro própria.

    Toda vez que uma Saída é registrada com `paciente_prontuario` +
    `paciente_nome` e o prontuário ainda não existe aqui, nasce um
    registro novo. Se o prontuário já existe, o nome já cadastrado é
    reaproveitado (ver decisão documentada em `PacienteService`) — o
    nome nunca é sobrescrito por uma Saída seguinte, para não divergir
    o cadastro de um mesmo paciente com grafias diferentes ao longo do
    tempo.
    """

    __tablename__ = "pacientes"

    id = Column(Integer, primary_key=True)

    prontuario = Column(String(50), unique=True, nullable=False, index=True)

    # Sempre em CAIXA ALTA (normalizado no service antes de gravar — não
    # confia no que o front manda, mesma filosofia de `EntradaCreate`
    # normalizando compra/doação em app/schemas/lote.py).
    nome = Column(String(200), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
