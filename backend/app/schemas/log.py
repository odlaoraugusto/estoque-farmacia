from datetime import datetime

from pydantic import BaseModel


class LogErroItem(BaseModel):
    """Um evento do log de erro do backend (stderr do processo uvicorn,
    NSSM redireciona pra `logs/api-erro.log` + rotações antigas) —
    normalmente uma exceção/traceback, mas também cobre as linhas de
    start/stop do serviço (`ruido=True`, filtradas por padrão na tela)."""

    timestamp: datetime | None
    # Quando a linha em si não carrega horário (log de antes de
    # 2026-09-18, quando o formatter ainda não incluía `%(asctime)s`) —
    # usa o horário de rotação/modificação do ARQUIVO como aproximação e
    # marca isso aqui, pra nunca fingir precisão que não existe.
    timestamp_aproximado: bool
    nivel: str
    tipo_excecao: str | None
    resumo: str
    detalhe: str
    ruido: bool
    arquivo: str


class LogErroResultado(BaseModel):
    itens: list[LogErroItem]
    total_bruto: int
    arquivos_lidos: list[str]
