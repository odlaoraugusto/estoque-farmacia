"""Regras de visibilidade por perfil compartilhadas entre a camada de
autorização de rota (`app/api/deps.py`, via `exigir_perfis`) e a camada de
serialização (`app/schemas/movimentacao.py`).

Existe para não duplicar a lista "quem pode ver isso" em dois lugares
diferentes — um único ponto de verdade, reaproveitado tanto para bloquear
o endpoint de consulta de paciente (`GET /pacientes/{prontuario}`) quanto
para decidir se `paciente_nome`/`paciente_prontuario` saem preenchidos ou
nulos numa resposta de `Movimentacao` (docs/00_PROJETO.md, seção 22 —
dado sensível de saúde, LGPD).
"""

from app.models.enums import PerfilEnum

PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE = (PerfilEnum.farmaceutico, PerfilEnum.coordenador)


def pode_ver_dados_paciente(perfil: PerfilEnum) -> bool:
    """Farmacêutico e Coordenador veem nome/prontuário de paciente;
    Atendente nunca — nem em relatório, nem em listagem, mesmo que o
    dado exista no banco (a restrição é de leitura, não de escrita: o
    próprio Atendente pode registrar uma Saída com esses campos)."""
    return perfil in PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE
