from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.permissoes import pode_ver_dados_paciente
from app.models.enums import (
    CATEGORIAS_SAIDA_EXTERNA,
    CategoriaSaidaEnum,
    StatusDescarteEnum,
    TipoMovimentacaoEnum,
)
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

    # Categoria (2026-08-19): normal (default) ou empréstimo/doação pra
    # fora do hospital — mesma Saída de sempre, só com esse metadado a
    # mais, usado pra notificar o Coordenador (ver RelatorioService.
    # atividade_recente).
    categoria: CategoriaSaidaEnum = CategoriaSaidaEnum.normal

    # Destino externo (2026-08-20): obrigatório quando categoria é
    # empréstimo/doação/permuta — pra onde o medicamento foi (outro
    # hospital/instituição). Não se aplica a `normal`/`vencimento`
    # (dispensação interna ou baixa, não têm "destino" fora do hospital).
    destino_externo: str | None = None

    # Destinatário (2026-08-20): pessoa responsável no destino que
    # recebeu — mesma obrigatoriedade de `destino_externo`.
    destinatario: str | None = None

    # Paciente/prontuário (seção 22 do doc): opcional em geral, mas
    # OBRIGATÓRIO quando o medicamento do lote é antimicrobiano (programa
    # de uso racional / DOT, 2026-08-19 — checado em SaidaService, que é
    # quem tem acesso ao medicamento do lote; o schema sozinho não
    # enxerga isso). Quando informado, os dois campos viajam juntos — não
    # faz sentido gravar um nome de paciente sem prontuário para linkar
    # (perderia o autopreenchimento) nem um prontuário sem nome (não
    # daria para cadastrar um paciente novo). O nome em si é normalizado
    # para CAIXA ALTA no service (`PacienteService`), não aqui — este
    # validador só garante que os dois vêm juntos.
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

    @model_validator(mode="after")
    def validar_destino_externo(self) -> "SaidaCreate":
        exige_destino = self.categoria in CATEGORIAS_SAIDA_EXTERNA
        tem_destino = bool(self.destino_externo and self.destino_externo.strip())
        tem_destinatario = bool(self.destinatario and self.destinatario.strip())

        if exige_destino and not tem_destino:
            raise ValueError(
                "destino_externo é obrigatório para saída de empréstimo, doação ou permuta."
            )
        if exige_destino and not tem_destinatario:
            raise ValueError(
                "destinatario é obrigatório para saída de empréstimo, doação ou permuta."
            )

        return self


class AjusteCreate(BaseModel):
    """Ajuste de estoque — Farmacêutico ou Coordenador (2026-08-19; era
    exclusivo do Coordenador até então). `quantidade_nova` é o saldo
    correto do lote depois de uma contagem física; o service calcula o
    delta contra o saldo atual, não o cliente."""

    lote_id: int
    quantidade_nova: int = Field(ge=0)
    motivo_ajuste: str


class AjusteValorCreate(BaseModel):
    """Correção de valor unitário de um lote (2026-08-27) — mesmo espírito
    do ajuste de saldo (motivo obrigatório, trilha de auditoria), mas para
    o valor pago por unidade, não a quantidade física. Não mexe em saldo
    nem gera movimentação de estoque."""

    lote_id: int
    valor_unitario_novo: Decimal = Field(gt=0)
    motivo: str


class MovimentacaoOut(BaseModel):
    id: int
    tipo: TipoMovimentacaoEnum
    lote_id: int
    quantidade: int

    unidade_origem_id: int | None
    unidade_destino_id: int | None
    quantidade_recebida: int | None

    setor_consumidor: str | None
    categoria_saida: CategoriaSaidaEnum | None
    destino_externo: str | None
    destinatario: str | None
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
