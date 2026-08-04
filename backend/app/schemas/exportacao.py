"""Formato de exportação aceito pelos endpoints de relatório
(docs/00_PROJETO.md seção 16, pendência 2: exportação PDF/Excel).

Query param opcional `formato` nos endpoints existentes de `/relatorios/*`:
ausente (default) → resposta JSON de sempre, sem quebrar o frontend atual;
`pdf`/`excel` → arquivo para download (`StreamingResponse`), reaproveitando
a mesma checagem de permissão e os mesmos filtros do endpoint JSON.
"""

import enum


class FormatoExportacao(str, enum.Enum):
    pdf = "pdf"
    excel = "excel"
