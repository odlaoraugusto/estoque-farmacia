import re
from datetime import date, datetime, timedelta
from pathlib import Path

from app.schemas.log import LogErroItem, LogErroResultado

# backend/app/services/log_service.py -> parents[2] == backend/
LOGS_DIR = Path(__file__).resolve().parents[2] / "logs"

_NIVEIS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")

# Registro NOVO (2026-09-18: logging_config.json passou a incluir
# `%(asctime)s`) — só as linhas escritas pelos loggers do uvicorn têm
# esse prefixo; o resto do traceback que vier atrás continua sem.
_RE_NOVO = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (" + "|".join(_NIVEIS) + r"):\s*(.*)$"
)
# Registro ANTIGO (antes da mudança acima) — mesmo formato, sem hora.
_RE_ANTIGO = re.compile(r"^(" + "|".join(_NIVEIS) + r"):\s*(.*)$")
# Início de um evento sem NENHUM prefixo de nível (ex.: exceção não
# tratada dentro do event loop do asyncio, como o ConnectionResetError
# de cliente que cai a conexão — vai direto pro stderr via handler
# default do Python). Só "Exception in callback" marca o INÍCIO de um
# evento novo — as linhas "handle: ..." e "Traceback (most recent call
# last):" que vêm logo depois são CONTINUAÇÃO do mesmo evento, não
# eventos novos (senão um traceback só vira 3+ entradas fatiadas).
_RE_BLOCO_SEM_PREFIXO = re.compile(r"^Exception in callback")

# Última linha de um traceback Python é sempre "NomeDaExcecao: mensagem"
# (ou só "NomeDaExcecao" sem dois-pontos, se a exceção não tem args).
_RE_TIPO_EXCECAO = re.compile(r"^([A-Za-z_][\w.]*(?:Error|Exception|Warning)):?\s?(.*)$")

# Linhas 100% operacionais (start/stop do serviço) — nunca são "um bug",
# só ruído de reinício/deploy. Filtradas por padrão na tela
# (`apenas_erros=True`), mas continuam disponíveis desmarcando o filtro.
_RUIDO_PREFIXOS = (
    "Started server process",
    "Waiting for application startup",
    "Application startup complete",
    "Uvicorn running on",
    "Shutting down",
    "Waiting for application shutdown",
    "Application shutdown complete",
    "Finished server process",
    "Started parent process",
    "Stopping parent process",
)


def _arquivos_no_periodo(dias: int) -> list[Path]:
    if not LOGS_DIR.is_dir():
        return []
    limite = datetime.now() - timedelta(days=dias)
    candidatos = [
        p for p in LOGS_DIR.glob("api-erro*.log") if p.stat().st_mtime >= limite.timestamp()
    ]
    return sorted(candidatos, key=lambda p: p.stat().st_mtime)


def _extrair_tipo_excecao(linhas_bloco: list[str]) -> str | None:
    for linha in reversed(linhas_bloco):
        m = _RE_TIPO_EXCECAO.match(linha.strip())
        if m:
            return m.group(1)
    return None


def _eh_ruido(nivel: str, resumo: str) -> bool:
    return nivel == "INFO" and any(resumo.startswith(p) for p in _RUIDO_PREFIXOS)


def _parse_arquivo(caminho: Path) -> list[LogErroItem]:
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    linhas = texto.splitlines()
    mtime_arquivo = datetime.fromtimestamp(caminho.stat().st_mtime)

    itens: list[LogErroItem] = []
    bloco_atual: list[str] | None = None
    ts_atual: datetime | None = None
    nivel_atual: str = "ERROR"

    def fechar_bloco():
        if bloco_atual is None or not bloco_atual:
            return
        resumo = bloco_atual[0].strip()
        if not resumo:
            return
        ts = ts_atual if ts_atual is not None else mtime_arquivo
        itens.append(
            LogErroItem(
                timestamp=ts,
                timestamp_aproximado=ts_atual is None,
                nivel=nivel_atual,
                tipo_excecao=_extrair_tipo_excecao(bloco_atual),
                resumo=resumo[:300],
                detalhe="\n".join(bloco_atual),
                ruido=_eh_ruido(nivel_atual, resumo),
                arquivo=caminho.name,
            )
        )

    for linha in linhas:
        m_novo = _RE_NOVO.match(linha)
        m_antigo = None if m_novo else _RE_ANTIGO.match(linha)
        m_sem_prefixo = None if (m_novo or m_antigo) else _RE_BLOCO_SEM_PREFIXO.match(linha)

        if m_novo:
            fechar_bloco()
            ts_atual = datetime.strptime(m_novo.group(1), "%Y-%m-%d %H:%M:%S")
            nivel_atual = m_novo.group(2)
            bloco_atual = [m_novo.group(3)]
        elif m_antigo:
            fechar_bloco()
            ts_atual = None
            nivel_atual = m_antigo.group(1)
            bloco_atual = [m_antigo.group(2)]
        elif m_sem_prefixo:
            fechar_bloco()
            ts_atual = None
            nivel_atual = "ERROR"
            bloco_atual = [linha]
        elif bloco_atual is not None:
            bloco_atual.append(linha)
        # linha antes de qualquer prefixo reconhecido no arquivo — ignora

    fechar_bloco()
    return itens


def listar_erros(
    dias: int = 30,
    desde: date | None = None,
    ate: date | None = None,
    apenas_erros: bool = True,
) -> LogErroResultado:
    """Lê `logs/api-erro*.log` (arquivo atual + rotações dentro de
    `dias`), separa em eventos individuais e devolve do mais recente pro
    mais antigo. `apenas_erros=True` (padrão) esconde o ruído puramente
    operacional (start/stop do serviço) — ver `_RUIDO_PREFIXOS`."""
    arquivos = _arquivos_no_periodo(dias)
    todos: list[LogErroItem] = []
    for arquivo in arquivos:
        todos.extend(_parse_arquivo(arquivo))

    total_bruto = len(todos)

    if apenas_erros:
        todos = [i for i in todos if not i.ruido]
    if desde is not None:
        todos = [i for i in todos if i.timestamp.date() >= desde]
    if ate is not None:
        todos = [i for i in todos if i.timestamp.date() <= ate]

    todos.sort(key=lambda i: i.timestamp, reverse=True)

    return LogErroResultado(
        itens=todos, total_bruto=total_bruto, arquivos_lidos=[a.name for a in arquivos]
    )
