from pydantic import BaseModel, ConfigDict

from app.models.enums import PerfilEnum


class PermissaoPerfilOut(BaseModel):
    perfil: PerfilEnum
    entrada: bool
    medicamentos: bool
    ajustar_estoque: bool
    corrigir_valor_unitario: bool
    transferencia_enviar: bool
    reposicao_carrinho: bool
    relatorios_financeiro: bool
    movimentacoes_geral: bool

    model_config = ConfigDict(from_attributes=True)


class PermissaoPerfilUpdate(BaseModel):
    entrada: bool
    medicamentos: bool
    ajustar_estoque: bool
    corrigir_valor_unitario: bool
    transferencia_enviar: bool
    reposicao_carrinho: bool
    relatorios_financeiro: bool
    movimentacoes_geral: bool


class MatrizPermissoesUpdate(BaseModel):
    """Body do `PUT /permissoes` — exclusivo do Admin. Sempre as duas
    linhas juntas: a tela de Permissões sempre manda a matriz inteira,
    nunca uma atualização parcial de um perfil só. Coordenador não
    aparece aqui (superusuário implícito, mesmo grupo do Admin — ver
    migração 0015)."""

    farmaceutico: PermissaoPerfilUpdate
    atendente: PermissaoPerfilUpdate
