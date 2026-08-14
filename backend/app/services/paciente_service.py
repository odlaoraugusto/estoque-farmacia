from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.paciente import Paciente
from app.repositories.paciente_repository import PacienteRepository


class PacienteService:
    """Base de pacientes que cresce organicamente a partir da Saída
    (docs/00_PROJETO.md, seção 22) — sem tela de cadastro própria."""

    def __init__(self):
        self.repository = PacienteRepository()

    def buscar_por_prontuario(self, db: Session, prontuario: str) -> Paciente:
        """Autopreenchimento — usado por `GET /pacientes/{prontuario}`
        (restrito a Farmacêutico/Coordenador no router)."""
        paciente = self.repository.get_by_prontuario(db, prontuario.strip())

        if paciente is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Nenhum paciente cadastrado para este prontuário.",
            )

        return paciente

    def resolver_para_saida(
        self, db: Session, prontuario: str, nome: str
    ) -> tuple[str, str]:
        """Chamado a partir de `SaidaService.registrar` quando a Saída
        vem com paciente/prontuário preenchidos.

        - Prontuário nunca visto: cria o registro em `pacientes`, com o
          nome normalizado em CAIXA ALTA.
        - Prontuário já cadastrado: **ignora silenciosamente** um nome
          divergente enviado junto e devolve o nome já salvo — decisão
          tomada aqui (não 400): prontuário já identifica o paciente de
          forma única, então um nome diferente nessa segunda Saída é
          quase sempre erro de digitação/variação de grafia (ex.
          abreviar um nome do meio), não um paciente diferente. Barrar a
          dispensação com um 400 nesse ponto travaria o fluxo de
          trabalho por um dado que não é a chave (o prontuário já
          resolve a identidade) — o nome "oficial" fica sempre o
          primeiro registrado, e correções de grafia, se necessárias,
          são um ajuste de cadastro (fora do escopo desta rodada, que
          não previu tela de edição de paciente).
        """
        prontuario_normalizado = prontuario.strip()
        nome_normalizado = nome.strip().upper()

        existente = self.repository.get_by_prontuario(db, prontuario_normalizado)
        if existente is not None:
            return existente.prontuario, existente.nome

        novo = self.repository.create(db, prontuario_normalizado, nome_normalizado)

        return novo.prontuario, novo.nome
