from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.ajustes import router as ajustes_router
from app.api.routes.auth import router as auth_router
from app.api.routes.config import router as config_router
from app.api.routes.entradas import router as entradas_router
from app.api.routes.lotes import router as lotes_router
from app.api.routes.medicamentos import router as medicamentos_router
from app.api.routes.pacientes import router as pacientes_router
from app.api.routes.permissoes import router as permissoes_router
from app.api.routes.relatorios import router as relatorios_router
from app.api.routes.ressuprimento import router as ressuprimento_router
from app.api.routes.ressuprimento_carrinho import router as ressuprimento_carrinho_router
from app.api.routes.saidas import router as saidas_router
from app.api.routes.solicitacao_devolucao_medicamento import router as devolucao_medicamento_router
from app.api.routes.solicitacoes import router as solicitacoes_router
from app.api.routes.transferencias import router as transferencias_router
from app.api.routes.unidades import router as unidades_router
from app.api.routes.usuarios import router as usuarios_router
from app.core.config import settings
from app.database.database import engine

app = FastAPI(
    title="Estoque Farmácia — API",
    description=(
        f"{settings.HOSPITAL_ORGANIZACAO} — {settings.HOSPITAL_NOME}. "
        "Sistema de gestão de estoque de farmácia hospitalar."
    ),
)

_origens = (
    ["*"]
    if settings.CORS_ORIGINS.strip() == "*"
    else [origem.strip() for origem in settings.CORS_ORIGINS.split(",")]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origens,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(auth_router)
app.include_router(unidades_router)
app.include_router(medicamentos_router)
app.include_router(entradas_router)
app.include_router(transferencias_router)
app.include_router(solicitacoes_router)
app.include_router(saidas_router)
app.include_router(ajustes_router)
app.include_router(lotes_router)
app.include_router(relatorios_router)
app.include_router(pacientes_router)
app.include_router(usuarios_router)
app.include_router(permissoes_router)
app.include_router(ressuprimento_router)
app.include_router(ressuprimento_carrinho_router)
app.include_router(devolucao_medicamento_router)


@app.get("/")
def root():
    return {"message": "Estoque Farmácia API Online"}


@app.get("/health/database")
def health_database():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    return {"database": "online"}
