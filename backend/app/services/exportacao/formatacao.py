"""Formatação de valores no padrão brasileiro para exportação de
relatórios (moeda, data, data/hora). Não existe equivalente no backend
ainda — o formato análogo em `frontend/src/lib/formato.ts` é só para a
tela; aqui é a mesma ideia aplicada a PDF/Excel."""

from datetime import date, datetime
from decimal import Decimal


def formatar_moeda(valor: Decimal | int | float | None) -> str:
    """Ex.: Decimal('1234.5') -> 'R$ 1.234,50'."""
    if valor is None:
        return ""

    texto = f"{Decimal(valor):,.2f}"
    texto = texto.replace(",", "§").replace(".", ",").replace("§", ".")
    return f"R$ {texto}"


def formatar_data(valor: date | None) -> str:
    if valor is None:
        return ""

    return valor.strftime("%d/%m/%Y")


def formatar_data_hora(valor: datetime | None) -> str:
    if valor is None:
        return ""

    return valor.strftime("%d/%m/%Y %H:%M")
