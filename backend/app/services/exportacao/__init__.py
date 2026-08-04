"""Geração de arquivos (PDF/Excel) dos relatórios — docs/00_PROJETO.md
seção 16, pendência 2.

Módulo isolado dos services de domínio: os services de relatório
(`RelatorioService`) continuam responsáveis só pelos dados; aqui só se
resolve "dados já prontos -> arquivo para download", reaproveitando o
mesmo `RelatorioMetadados` (cabeçalho institucional) que já existe em toda
resposta de `/relatorios/*`.
"""
