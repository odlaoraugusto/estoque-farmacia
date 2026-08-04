from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import OrigemEnum, StatusTransferenciaEnum
from app.schemas.medicamento import MedicamentoOut
from app.schemas.unidade import UnidadeOut


class EntradaCreate(BaseModel):
    """Entrada de estoque — só ocorre na unidade CAF (validado no service,
    a unidade nunca vem do corpo da requisição, sempre da unidade ativa
    da sessão)."""

    medicamento_id: int
    numero_lote: str
    data_validade: date
    quantidade: int = Field(gt=0)
    valor_unitario: Decimal = Decimal("0")
    origem: OrigemEnum
    numero_nota_fiscal: str | None = None
    numero_afm: str | None = None

    @model_validator(mode="after")
    def normalizar_por_origem(self) -> "EntradaCreate":
        """Nunca confia no que o cliente manda para valor/nota fiscal:
        doação sempre zera o valor e dispensa nota fiscal; compra exige
        ambos."""
        if self.origem == OrigemEnum.doacao:
            self.valor_unitario = Decimal("0")
            return self

        if self.origem == OrigemEnum.compra:
            if self.valor_unitario is None or self.valor_unitario <= 0:
                raise ValueError(
                    "valor_unitario é obrigatório e deve ser maior que zero "
                    "para entrada com origem=compra."
                )
            if not self.numero_nota_fiscal:
                raise ValueError(
                    "numero_nota_fiscal é obrigatório para entrada com origem=compra."
                )

        return self


class LoteOut(BaseModel):
    id: int
    medicamento_id: int
    unidade_id: int
    numero_lote: str
    data_validade: date
    quantidade_atual: int
    valor_unitario: Decimal
    origem: OrigemEnum
    numero_nota_fiscal: str | None
    numero_afm: str | None
    data_entrada: datetime
    usuario_entrada_id: int
    status_transferencia: StatusTransferenciaEnum | None
    lote_origem_id: int | None

    model_config = ConfigDict(from_attributes=True)


class LoteDetalhadoOut(LoteOut):
    """Mesma coisa que `LoteOut`, com medicamento/unidade embutidos —
    usado nas telas de estoque atual, busca FEFO e relatórios."""

    medicamento: MedicamentoOut
    unidade: UnidadeOut

    sugerido_fefo: bool = False

    model_config = ConfigDict(from_attributes=True)
