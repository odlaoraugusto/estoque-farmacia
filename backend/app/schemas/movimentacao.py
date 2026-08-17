from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.permissoes import pode_ver_dados_paciente
from app.models.enums import StatusDescarteEnum, TipoMovimentacaoEnum
from app.schemas.lote import LoteDetalhadoOut
from app.schemas.unidade import UnidadeOut
from app.schemas.usuario import UsuarioMe, UsuarioResumo


class TransferenciaEnviarCreate(BaseModel):
    lote_id: int
    quantidade: int = Field(gt=0)
    unidade_destino_id: int


class TransferenciaConfirmarCreate(BaseModel):
    quantidade_recebida: int = Field(gt=0)


class ReporCarrinhoCreate(BaseModel):
    """Reposição de carrinho de emergência: fluxo de uma etapa só, exclusivo
    CAF -> carrinho (regras 1/2 dos carrinhos, docs/00_PROJETO.md)."""

    lote_id: int
    quantidade: int = Field(gt=0)
    carrinho_destino_id: int


class DevolverCarrinhoCreate(BaseModel):
    """Devolução de lote de um carrinho de emergência para a CAF —
    espelho de `ReporCarrinhoCreate`, mas ao contrário e em DUAS etapas
    (docs/00_PROJETO.md, seção 22): o destino é sempre a CAF, implícito
    (não vem no corpo — igual a reposição não pede a origem CAF)."""

    lote_id: int
    quantidade: int = Field(gt=0)


class SaidaCreate(BaseModel):
    lote_id: int
    quantidade: int = Field(gt=0)
    setor_consumidor: str

    # Paciente/prontuário (seção 22 do doc): opcional, adicional ao
    # setor consumidor (que continua obrigatório). Quando informado, os
    # dois campos viajam juntos — não faz sentido gravar um nome de
    # paciente sem prontuário para linkar (perderia o autopreenchimento)
    # nem um prontuário sem nome (não daria para cadastrar um paciente
    # novo). O nome em si é normalizado para CAIXA ALTA no service
    # (`PacienteService`), não aqui — este validador só garante que os
    # dois vêm juntos.
    paciente_nome: str | None = None
    paciente_prontuario: str | None = None

    @model_validator(mode="after")
    def validar_paciente_e_prontuario_juntos(self) -> "SaidaCreate":
        tem_nome = bool(self.paciente_nome and self.paciente_nome.strip())
        tem_prontuario = bool(self.paciente_prontuario and self.paciente_prontuario.strip())

        if tem_nome != tem_prontuario:
            raise ValueError(
                "paciente_nome e paciente_prontuario devem ser enviados "
                "juntos, ou nenhum dos dois."
            )

        return self


class DescarteSolicitarCreate(BaseModel):
    lote_id: int
    quantidade: int = Field(gt=0)
    motivo_descarte: str


class DescarteRejeitarCreate(BaseModel):
    motivo_rejeicao: str | None = None


class AjusteCreate(BaseModel):
    """Ajuste de estoque — exclusivo do Coordenador (regra de negócio,
    aplicada em `AjusteService`/`app/api/routes/ajustes.py`). `quantidade_
    nova` é o saldo correto do lote depois de uma contagem física; o
    service calcula o delta contra o saldo atual, não o cliente."""

    lote_id: int
    quantidade_nova: int = Field(ge=0)
    motivo_ajuste: str


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
    motivo_ajuste: str | None
    status: StatusDescarteEnum | None

    # Paciente/prontuário (seção 22 do doc) — nullable, só preenchido em
    # Saída. IMPORTANTE: dado sensível de saúde (LGPD), visibilidade
    # restrita a Farmacêutico/Coordenador. Nunca popular estes 2 campos
    # via `MovimentacaoOut(...)`/`model_validate()` direto num contexto
    # de leitura por outro perfil — use o construtor `visivel_para`
    # abaixo, que é o único lugar onde essa regra é aplicada (evita
    # duplicar a checagem em cada router/service que devolve
    # Movimentacao).
    paciente_nome: str | None = None
    paciente_prontuario: str | None = None

    usuario_id: int
    usuario_solicitante_id: int | None
    usuario_aprovador_id: int | None
    usuario_confirmacao_id: int | None

    data_hora: datetime
    data_confirmacao: datetime | None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def visivel_para(cls, movimentacao: Any, usuario: UsuarioMe):
        """Constrói o schema a partir do model ORM já aplicando a regra
        de visibilidade de paciente (seção 22 do doc): oculta
        (`None`) `paciente_nome`/`paciente_prontuario` quando o perfil
        de quem está consultando não é Farmacêutico/Coordenador — o
        dado nem chega a trafegar na resposta HTTP, não é só uma
        questão de esconder na tela.

        Decisão de arquitetura: centralizar a regra aqui (schema), não
        em cada router/service que devolve `Movimentacao` — os
        endpoints de leitura (relatórios, listagens de pendentes)
        chamam este construtor em vez de `model_validate`/
        `response_model` automático. A única exceção é o eco imediato
        de `POST /saidas`: quem acabou de registrar a própria Saída vê
        de volta exatamente o que digitou (a restrição do doc é sobre
        "consultar depois", não sobre a resposta do próprio registro) —
        por isso `SaidaService`/`saidas.py` seguem usando
        `model_validate` puro, sem passar por este método."""
        instancia = cls.model_validate(movimentacao)

        if not pode_ver_dados_paciente(usuario.perfil):
            instancia.paciente_nome = None
            instancia.paciente_prontuario = None

        return instancia


class MovimentacaoDetalhadaOut(MovimentacaoOut):
    lote: LoteDetalhadoOut
    unidade_origem: UnidadeOut | None
    unidade_destino: UnidadeOut | None
    usuario: UsuarioResumo
    usuario_solicitante: UsuarioResumo | None
    usuario_aprovador: UsuarioResumo | None
    usuario_confirmacao: UsuarioResumo | None

    model_config = ConfigDict(from_attributes=True)
