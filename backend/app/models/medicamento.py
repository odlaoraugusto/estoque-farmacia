from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String
from sqlalchemy.sql import func

from app.database.database import Base
from app.models.enums import AcondicionamentoEnum


class Medicamento(Base):
    __tablename__ = "medicamentos"

    id = Column(Integer, primary_key=True)

    nome = Column(String(200), nullable=False)

    # Apresentação é a forma farmacêutica (comprimido/frasco/suspensão/
    # etc.). Era um enum fechado de 15 valores até 2026-08-28; virou texto
    # livre a pedido do cliente, que usa siglas próprias em vez da lista
    # fechada (migration 0014 também derrubou o CHECK constraint
    # `apresentacao_enum` que existia no banco).
    apresentacao = Column(String(50), nullable=False)

    # Opcional desde 2026-08-28 (antes obrigatório) — nem todo cadastro
    # do cliente informa a concentração na hora.
    concentracao = Column(String(100), nullable=True)

    # Fabricante (2026-08-27) — dado de catálogo, não obrigatório (nem
    # todo cadastro/planilha do cliente traz essa informação).
    fabricante = Column(String(150), nullable=True)

    # Opcional desde 2026-08-28 (antes obrigatório) — continua sendo o
    # enum fechado ambiente/geladeira quando informado.
    acondicionamento = Column(
        Enum(
            AcondicionamentoEnum,
            name="acondicionamento_enum",
            native_enum=False,
            length=20,
        ),
        nullable=True,
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

    # Medicamento controlado (2026-08-20) — a classe "irmã" antecipada no
    # comentário acima: mesma regra de paciente/prontuário obrigatório na
    # Saída (SaidaService), mesmo relatório de vigilância diária
    # (RelatorioService, mas sem o corte de "dias mínimo" do DOT — aqui
    # todo dia de dispensação importa, não só uso prolongado).
    e_controlado = Column(Boolean, nullable=False, default=False, server_default="false")

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
