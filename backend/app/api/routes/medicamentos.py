from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import exigir_permissao, get_current_user
from app.database.session import get_db
from app.schemas.medicamento import (
    MedicamentoCreate,
    MedicamentoImportarValorResultado,
    MedicamentoOut,
    MedicamentoUpdate,
)
from app.services.medicamento_service import MedicamentoService

router = APIRouter(prefix="/medicamentos", tags=["Medicamentos"])

service = MedicamentoService()

# Cadastro de medicamentos: controlado pela matriz de permissões
# (2026-08-31 — antes fixo em farmacêutico/coordenador). Coordenador
# sempre tem acesso completo (superusuário implícito); Atendente por
# padrão é só leitura, até o Admin liberar.
_PODE_CADASTRAR = exigir_permissao("medicamentos")

# Importação de valor unitário em massa é a mesma categoria de
# "corrigir valor pago, não o cadastro do medicamento" que já existe em
# POST /ajustes/valor — chave separada de `medicamentos` de propósito
# (ver app/api/routes/ajustes.py).
_PODE_IMPORTAR_VALOR = exigir_permissao("corrigir_valor_unitario")


@router.get(
    "", response_model=list[MedicamentoOut], dependencies=[Depends(get_current_user)]
)
def listar_medicamentos(apenas_ativos: bool = True, db: Session = Depends(get_db)):
    return service.list(db, apenas_ativos)


@router.get(
    "/{medicamento_id}",
    response_model=MedicamentoOut,
    dependencies=[Depends(get_current_user)],
)
def obter_medicamento(medicamento_id: int, db: Session = Depends(get_db)):
    return service.get_by_id(db, medicamento_id)


@router.post(
    "",
    response_model=MedicamentoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_PODE_CADASTRAR)],
)
def criar_medicamento(dados: MedicamentoCreate, db: Session = Depends(get_db)):
    return service.create(db, dados)


@router.put(
    "/{medicamento_id}",
    response_model=MedicamentoOut,
    dependencies=[Depends(_PODE_CADASTRAR)],
)
def atualizar_medicamento(
    medicamento_id: int, dados: MedicamentoUpdate, db: Session = Depends(get_db)
):
    return service.update(db, medicamento_id, dados)


@router.get("/template-valor-unitario", dependencies=[Depends(_PODE_IMPORTAR_VALOR)])
def baixar_template_valor_unitario(db: Session = Depends(get_db)):
    """Planilha .xlsx pronta pra editar (nome de cada medicamento ativo)
    e reenviar em `POST /medicamentos/importar-valor-unitario`."""
    buffer = service.gerar_template_valor_unitario(db)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modelo_valor_unitario_farmacia.xlsx"'},
    )


@router.post(
    "/importar-valor-unitario",
    response_model=MedicamentoImportarValorResultado,
    dependencies=[Depends(_PODE_IMPORTAR_VALOR)],
)
async def importar_valor_unitario(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    """Aplica `valor_unitario` a todos os lotes ATIVOS de cada medicamento
    casado por NOME — ver `MedicamentoService.importar_valor_unitario`
    para o critério de match e o que acontece quando uma linha não bate."""
    conteudo = await arquivo.read()
    return service.importar_valor_unitario(db, conteudo)
