"""Monta a `StreamingResponse` de download (PDF/Excel) compartilhada
pelos 4 endpoints de `/relatorios/*` — cada endpoint só monta a
`TabelaRelatorio` (via `relatorio_tabela_builder`) e delega o resto aqui."""

from datetime import date
from io import BytesIO

from fastapi.responses import StreamingResponse

from app.schemas.exportacao import FormatoExportacao
from app.services.exportacao.excel_exportador import ExcelExportador
from app.services.exportacao.pdf_exportador import PdfExportador
from app.services.exportacao.tabela import TabelaRelatorio

_pdf_exportador = PdfExportador()
_excel_exportador = ExcelExportador()

_CONTENT_TYPE = {
    FormatoExportacao.pdf: "application/pdf",
    FormatoExportacao.excel: (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ),
}
_EXTENSAO = {FormatoExportacao.pdf: "pdf", FormatoExportacao.excel: "xlsx"}


def exportar_relatorio(
    formato: FormatoExportacao, slug: str, tabela: TabelaRelatorio
) -> StreamingResponse:
    conteudo = (
        _pdf_exportador.gerar(tabela)
        if formato == FormatoExportacao.pdf
        else _excel_exportador.gerar(tabela)
    )

    nome_arquivo = f"{slug}-{date.today().isoformat()}.{_EXTENSAO[formato]}"

    return StreamingResponse(
        BytesIO(conteudo),
        media_type=_CONTENT_TYPE[formato],
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )
