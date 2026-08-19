from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import AcondicionamentoEnum, ApresentacaoEnum


class Medicamento(Base):
    __tablename__ = "medicamentos"

    id = Column(Integer, primary_key=True)

    nome = Column(String(200), nullable=False)

    # Apresentação é só a forma farmacêutica (comprimido/frasco/suspensão/
    # etc.) — a concentração (ex. "500mg/mL") é campo separado desde
    # 2026-08-01, a pedido do cliente (antes vinha tudo junto em texto
    # livre, ex. "Frasco 10mL").
    apresentacao = Column(
        Enum(
            ApresentacaoEnum,
            name="apresentacao_enum",
            native_enum=False,
            length=30,
        ),
        nullable=False,
    )
    concentracao = Column(String(100), nullable=False)

    acondicionamento = Column(
        Enum(
            AcondicionamentoEnum,
            name="acondicionamento_enum",
            native_enum=False,
            length=20,
        ),
        nullable=False,
    )

    estoque_minimo = Column(Integer, nullable=False, default=0, server_default="0")

    # Programa de uso racional de antimicrobianos (2026-08-19): marca quais
    # medicamentos entram na vigilância de dias consecutivos de uso por
    # paciente (DOT — Days of Therapy). Quando True, Saída desse item passa
    # a EXIGIR paciente/prontuário (SaidaService) — sem isso não dá pra
    # contar dias por paciente. Campo pensado pra deixar aberto: no futuro
    # outras classes (ex. controlados) podem reaproveitar a mesma regra
    # com um campo irmão, sem precisar generalizar isso agora.
    e_antimicrobiano = Column(Boolean, nullable=False, default=False, server_default="false")

    # Não faz parte do doc original, mas evita exclusão física do
    # cadastro (que quebraria FK de lotes históricos) — descontinuar um
    # medicamento vira "inativo" em vez de DELETE.
    ativo = Column(Boolean, nullable=False, default=True, server_default="true")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
