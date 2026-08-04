"""Gera o `.pdf` de uma `TabelaRelatorio` — cabeçalho institucional
(docs/00_PROJETO.md seção 14) desenhado via callback `onFirstPage`/
`onLaterPages` do `SimpleDocTemplate`, repetido automaticamente em toda
página (não é cópia manual por página), com a tabela de dados abaixo.
Página em paisagem para acomodar relatórios com mais colunas (ex.
auditoria)."""

from functools import partial
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.schemas.relatorio import RelatorioMetadados
from app.services.exportacao.formatacao import formatar_data_hora
from app.services.exportacao.tabela import TabelaRelatorio

_MARGEM = 1.5 * cm
_MARGEM_SUPERIOR = 3.8 * cm
_COR_CABECALHO_TABELA = colors.HexColor("#2F5233")
_COR_LINHA_ALTERNADA = colors.HexColor("#F2F2F2")
_COR_LINHA_GRADE = colors.HexColor("#999999")


class PdfExportador:
    def __init__(self):
        estilos = getSampleStyleSheet()
        self._estilo_info = ParagraphStyle(
            "info_relatorio", parent=estilos["Normal"], fontSize=9, leading=11
        )
        self._estilo_rodape = ParagraphStyle(
            "rodape_relatorio",
            parent=estilos["Normal"],
            fontSize=10,
            fontName="Helvetica-Bold",
            spaceBefore=8,
        )
        self._estilo_cabecalho_coluna = ParagraphStyle(
            "cabecalho_coluna",
            parent=estilos["Normal"],
            fontSize=7.5,
            fontName="Helvetica-Bold",
            textColor=colors.white,
            leading=9,
        )
        self._estilo_celula = ParagraphStyle(
            "celula_tabela", parent=estilos["Normal"], fontSize=7, leading=8.5
        )

    def gerar(self, tabela: TabelaRelatorio) -> bytes:
        buffer = BytesIO()
        tamanho_pagina = landscape(A4)

        documento = SimpleDocTemplate(
            buffer,
            pagesize=tamanho_pagina,
            leftMargin=_MARGEM,
            rightMargin=_MARGEM,
            topMargin=_MARGEM_SUPERIOR,
            bottomMargin=1.6 * cm,
            title=tabela.metadados.titulo_relatorio,
        )

        elementos = self._montar_conteudo(tabela, tamanho_pagina[0])
        callback_cabecalho = partial(self._desenhar_cabecalho, metadados=tabela.metadados)

        documento.build(elementos, onFirstPage=callback_cabecalho, onLaterPages=callback_cabecalho)
        return buffer.getvalue()

    def _montar_conteudo(self, tabela: TabelaRelatorio, largura_pagina: float) -> list:
        elementos = []

        for info in tabela.informacoes_extra:
            elementos.append(Paragraph(escape(info), self._estilo_info))
        if tabela.informacoes_extra:
            elementos.append(Spacer(1, 0.3 * cm))

        elementos.append(self._montar_tabela(tabela, largura_pagina))

        for texto in tabela.rodape:
            elementos.append(Paragraph(escape(texto), self._estilo_rodape))

        return elementos

    def _montar_tabela(self, tabela: TabelaRelatorio, largura_pagina: float) -> Table:
        # `escape()` é obrigatório aqui: reportlab.Paragraph interpreta uma
        # mini-linguagem XML/HTML (<b>, <font>, etc.) no texto que recebe.
        # Sem isso, texto livre digitado por usuário (nome de medicamento,
        # setor consumidor, motivo de descarte) podia quebrar ou deformar
        # o PDF de qualquer relatório que incluísse aquele dado — achado de
        # revisão de segurança 2026-08-01, confirmado ao vivo (nome de
        # medicamento com "<b>" derrubava a exportação com 500).
        cabecalho = [Paragraph(escape(coluna), self._estilo_cabecalho_coluna) for coluna in tabela.colunas]
        linhas = [
            [
                Paragraph(escape(valor) if valor else "-", self._estilo_celula)
                for valor in dados_linha
            ]
            for dados_linha in tabela.linhas
        ]
        dados = [cabecalho] + linhas

        largura_util = largura_pagina - 2 * _MARGEM
        num_colunas = max(len(tabela.colunas), 1)
        if tabela.larguras_relativas and len(tabela.larguras_relativas) == num_colunas:
            soma = sum(tabela.larguras_relativas)
            larguras = [largura_util * (peso / soma) for peso in tabela.larguras_relativas]
        else:
            larguras = [largura_util / num_colunas] * num_colunas

        tabela_flowable = Table(dados, colWidths=larguras, repeatRows=1)
        tabela_flowable.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), _COR_CABECALHO_TABELA),
                    ("GRID", (0, 0), (-1, -1), 0.4, _COR_LINHA_GRADE),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _COR_LINHA_ALTERNADA]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        return tabela_flowable

    @staticmethod
    def _desenhar_cabecalho(canvas, documento, metadados: RelatorioMetadados) -> None:
        """Callback padrão do reportlab (`onFirstPage`/`onLaterPages`) —
        chamado automaticamente pelo `SimpleDocTemplate` uma vez por
        página no momento em que ela é renderizada, garantindo o
        letterhead em toda página sem duplicar conteúdo manualmente."""
        canvas.saveState()
        largura, altura = documento.pagesize
        topo = altura - _MARGEM

        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(_MARGEM, topo - 0.4 * cm, metadados.organizacao)

        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(_MARGEM, topo - 0.9 * cm, metadados.hospital)

        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(_MARGEM, topo - 1.5 * cm, metadados.titulo_relatorio)

        canvas.setFont("Helvetica", 8.5)
        linha_meta = (
            f"Gerado em {formatar_data_hora(metadados.gerado_em)}  ·  "
            f"{metadados.gerado_por}  ·  Unidade: {metadados.unidade}"
        )
        canvas.drawString(_MARGEM, topo - 2.0 * cm, linha_meta)

        canvas.setStrokeColor(_COR_CABECALHO_TABELA)
        canvas.setLineWidth(1)
        canvas.line(_MARGEM, topo - 2.25 * cm, largura - _MARGEM, topo - 2.25 * cm)

        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(largura - _MARGEM, _MARGEM / 2, f"Página {documento.page}")
        canvas.restoreState()
