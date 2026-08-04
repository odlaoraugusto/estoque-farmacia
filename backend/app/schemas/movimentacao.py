from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StatusDescarteEnum, TipoMovimentacaoEnum
from app.schemas.lote import LoteDetalhadoOut
from app.schemas.unidade import UnidadeOut
from app.schemas.usuario import UsuarioResumo


class TransferenciaEnviarCreate(BaseModel):
    lote_id: int
    quantidade: int = Field(gt=0)
    unidade_destino_id: int


class TransferenciaConfirmarCreate(BaseModel):
    quantidade_recebida: int = Field(gt=0)


class SaidaCreate(BaseModel):
    lote_id: int
    quantidade: int = Field(gt=0)
    setor_consumidor: str


class DescarteSolicitarCreate(BaseModel):
    lote_id: int
    quantidade: int = Field(gt=0)
    motivo_descarte: str


class DescarteRejeitarCreate(BaseModel):
    motivo_rejeicao: str | None = None


class MovimentacaoOut(BaseModel):
    id: int
    tipo: TipoMovimentacaoEnum
    lote_id: int
    quantidade: int

    unidade_origem_id: int | None
    unidade_destino_id: int | None
    quantidade_recebida: int | None

    setor_consumidor: str | None
    motivo_descarte: str | None
    status: StatusDescarteEnum | None

    usuario_id: int
    usuario_solicitante_id: int | None
    usuario_aprovador_id: int | None
    usuario_confirmacao_id: int | None

    data_hora: datetime
    data_confirmacao: datetime | None

    model_config = ConfigDict(from_attributes=True)


class MovimentacaoDetalhadaOut(MovimentacaoOut):
    lote: LoteDetalhadoOut
    unidade_origem: UnidadeOut | None
    unidade_destino: UnidadeOut | None
    usuario: UsuarioResumo
    usuario_solicitante: UsuarioResumo | None
    usuario_aprovador: UsuarioResumo | None
    usuario_confirmacao: UsuarioResumo | None

    model_config = ConfigDict(from_attributes=True)
