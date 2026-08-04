"""Representação tabular intermediária entre os schemas de relatório
(`app/schemas/relatorio.py`) e os exportadores (Excel/PDF) — cada
exportador só sabe desenhar uma `TabelaRelatorio`, sem conhecer a forma
específica de cada um dos 4 relatórios."""

from dataclasses import dataclass, field

from app.schemas.relatorio import RelatorioMetadados


@dataclass
class TabelaRelatorio:
    metadados: RelatorioMetadados
    colunas: list[str]
    linhas: list[list[str]]

    # Linhas de contexto exibidas entre o cabeçalho institucional e a
    # tabela (ex.: período do filtro, dias considerados nos vencimentos).
    informacoes_extra: list[str] = field(default_factory=list)

    # Linhas de fechamento exibidas após a tabela (ex.: valor total geral).
    rodape: list[str] = field(default_factory=list)

    # Peso relativo de cada coluna (mesma ordem de `colunas`) — usado só
    # pelo PDF para dar mais espaço a colunas com texto mais longo
    # (ex.: nome de medicamento) do que a colunas curtas (ex.: quantidade).
    # `None` = todas as colunas com a mesma largura.
    larguras_relativas: list[float] | None = None
