from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StatusRessuprimentoCarrinhoEnum
from app.schemas.usuario import UsuarioResumo

# ---- Leitura pública (sem login) — alimenta o formulário ----


class CarrinhoPublicoOut(BaseModel):
    id: int
    nome: str
    unidade_pai_id: int | None

    model_config = ConfigDict(from_attributes=True)


class UnidadePublicaOut(BaseModel):
    id: int
    nome: str

    model_config = ConfigDict(from_attributes=True)


class EstoqueCarrinhoPublicoItem(BaseModel):
    """Um medicamento com saldo > 0 no carrinho selecionado — só o
    suficiente pra montar a lista do formulário público, nada de dado
    financeiro (mesmo espírito do relatório de Movimentação de
    Transferências, já aberto a todos)."""

    medicamento_id: int
    medicamento_nome: str
    quantidade_atual: int
    e_controlado: bool


# ---- Criação pública (sem login) ----


class RessuprimentoCarrinhoItemCreate(BaseModel):
    medicamento_id: int
    quantidade_usada: int = Field(gt=0)


class RessuprimentoCarrinhoCreate(BaseModel):
    """Registrado pelo setor, sem login, quando usa um carrinho de
    emergência — dispara a notificação em pop-up pra farmácia escolhida.
    `paciente_nome`/`paciente_prontuario` obrigatórios quando algum item
    é medicamento controlado (validado no service, que é quem carrega o
    medicamento pra checar `e_controlado`)."""

    setor: str = Field(min_length=1)
    carrinho_id: int
    unidade_destino_id: int
    itens: list[RessuprimentoCarrinhoItemCreate] = Field(min_length=1)
    paciente_nome: str | None = None
    paciente_prontuario: str | None = None


# ---- Confirmação (autenticado — Farmacêutico/Atendente/Coordenador) ----


class ConfirmarItemCarrinho(BaseModel):
    """A farmácia escolhe o lote e pode ajustar a quantidade em relação
    ao que o setor informou (mesma flexibilidade já usada em Atender
    Solicitações — divergência não bloqueia, só fica registrada)."""

    medicamento_id: int
    lote_id: int
    quantidade: int = Field(gt=0)


class ConfirmarSaidaCarrinhoCreate(BaseModel):
    itens: list[ConfirmarItemCarrinho] = Field(min_length=1)


class ConfirmarTransferenciaCarrinhoCreate(BaseModel):
    itens: list[ConfirmarItemCarrinho] = Field(min_length=1)


# ---- Leitura autenticada (fila de pendentes da farmácia) ----


class ItemSolicitacaoOut(BaseModel):
    id: int
    medicamento_id: int
    medicamento_nome: str
    quantidade_usada: int

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, item) -> "ItemSolicitacaoOut":
        return cls(
            id=item.id,
            medicamento_id=item.medicamento_id,
            medicamento_nome=item.medicamento.nome,
            quantidade_usada=item.quantidade_usada,
        )


class SolicitacaoRessuprimentoCarrinhoOut(BaseModel):
    id: int
    data_hora: datetime
    setor: str
    carrinho_id: int
    carrinho_nome: str
    unidade_destino_id: int
    unidade_destino_nome: str
    paciente_nome: str | None
    paciente_prontuario: str | None
    status_saida: StatusRessuprimentoCarrinhoEnum
    status_transferencia: StatusRessuprimentoCarrinhoEnum
    usuario_confirmacao_saida: UsuarioResumo | None
    data_confirmacao_saida: datetime | None
    usuario_confirmacao_transferencia: UsuarioResumo | None
    data_confirmacao_transferencia: datetime | None
    itens: list[ItemSolicitacaoOut]

    @classmethod
    def from_model(cls, s) -> "SolicitacaoRessuprimentoCarrinhoOut":
        return cls(
            id=s.id,
            data_hora=s.data_hora,
            setor=s.setor,
            carrinho_id=s.carrinho_id,
            carrinho_nome=s.carrinho.nome,
            unidade_destino_id=s.unidade_destino_id,
            unidade_destino_nome=s.unidade_destino.nome,
            paciente_nome=s.paciente_nome,
            paciente_prontuario=s.paciente_prontuario,
            status_saida=s.status_saida,
            status_transferencia=s.status_transferencia,
            usuario_confirmacao_saida=(
                UsuarioResumo.model_validate(s.usuario_confirmacao_saida) if s.usuario_confirmacao_saida else None
            ),
            data_confirmacao_saida=s.data_confirmacao_saida,
            usuario_confirmacao_transferencia=(
                UsuarioResumo.model_validate(s.usuario_confirmacao_transferencia)
                if s.usuario_confirmacao_transferencia
                else None
            ),
            data_confirmacao_transferencia=s.data_confirmacao_transferencia,
            itens=[ItemSolicitacaoOut.from_model(item) for item in s.itens],
        )
