from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StatusSolicitacaoEnum
from app.schemas.medicamento import MedicamentoOut
from app.schemas.unidade import UnidadeOut
from app.schemas.usuario import UsuarioResumo


class SolicitacaoCreate(BaseModel):
    medicamento_id: int
    quantidade_desejada: int = Field(gt=0)
    observacao: str | None = None


class SolicitacaoAceitarCreate(BaseModel):
    """A CAF escolhe QUAL lote enviar e a quantidade — pode divergir da
    `quantidade_desejada` (atendimento parcial), mesma flexibilidade que
    já existe numa Transferência normal."""

    lote_id: int
    quantidade: int = Field(gt=0)


class SolicitacaoRecusarCreate(BaseModel):
    motivo_recusa: str


class SolicitacaoOut(BaseModel):
    id: int
    unidade_solicitante_id: int
    medicamento_id: int
    quantidade_desejada: int
    observacao: str | None
    status: StatusSolicitacaoEnum
    motivo_recusa: str | None
    movimentacao_id: int | None
    usuario_solicitante_id: int
    usuario_atendimento_id: int | None
    data_solicitacao: datetime
    data_atendimento: datetime | None

    model_config = ConfigDict(from_attributes=True)


class SolicitacaoDetalhadaOut(SolicitacaoOut):
    unidade_solicitante: UnidadeOut
    medicamento: MedicamentoOut
    usuario_solicitante: UsuarioResumo
    usuario_atendimento: UsuarioResumo | None

    model_config = ConfigDict(from_attributes=True)
