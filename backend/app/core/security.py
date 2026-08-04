"""Hash de senha e emissão/verificação de JWT.

Usa `bcrypt` diretamente (sem passlib) para evitar o problema conhecido de
incompatibilidade entre passlib 1.7.x e bcrypt >= 4.1 (passlib chama
`bcrypt.__about__`, removido nas versões recentes do pacote `bcrypt`).
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(senha.encode("utf-8"), senha_hash.encode("utf-8"))


def criar_access_token(dados: dict[str, Any]) -> str:
    payload = dados.copy()

    expira_em = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload["exp"] = expira_em

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decodificar_access_token(token: str) -> dict[str, Any]:
    """Levanta `jwt.PyJWTError` (token inválido/expirado) — tratado na camada de deps."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
