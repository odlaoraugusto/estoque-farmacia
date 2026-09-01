from pydantic import BaseModel, ConfigDict, Field

from app.schemas.medicamento import MedicamentoOut
from app.schemas.unidade import UnidadeOut


class PontoRessuprimentoUpsert(BaseModel):
    """Cria ou atualiza o ponto de ressuprimento de um medicamento numa
    unidade — idempotente por (medicamento_id, unidade_id), ver
    ResuprimentoService.definir_ponto."""

    medicamento_id: int
    unidade_id: int
    quantidade_padrao: int = Field(ge=0)
    quantidade_minima: int = Field(ge=0)


class PontoRessuprimentoOut(BaseModel):
    id: int
    medicamento_id: int
    unidade_id: int
    quantidade_padrao: int
    quantidade_minima: int
    medicamento: MedicamentoOut
    unidade: UnidadeOut

    model_config = ConfigDict(from_attributes=True)


class StatusRessuprimentoItem(BaseModel):
    """Um medicamento com ponto de ressuprimento configurado numa
    unidade, já cruzado com o saldo atual — usado tanto na aba de
    configuração (Farmacêutico/Coordenador, todas as unidades) quanto na
    notificação de "precisa ressuprir" (qualquer perfil, só a própria
    unidade ativa)."""

    medicamento_id: int
    medicamento_nome: str
    unidade_id: int
    unidade_nome: str
    quantidade_atual: int
    quantidade_padrao: int
    quantidade_minima: int
    precisa_ressuprir: bool
    # Quanto falta pra voltar à quantidade padrão — só relevante quando
    # `precisa_ressuprir=True` (senão é 0 ou negativo, sem sentido pedir).
    quantidade_sugerida: int
