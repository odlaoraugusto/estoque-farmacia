from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import exigir_permissao, get_current_user
from app.database.session import get_db
from app.schemas.medicamento import MedicamentoCreate, MedicamentoOut, MedicamentoUpdate
from app.services.medicamento_service import MedicamentoService

router = APIRouter(prefix="/medicamentos", tags=["Medicamentos"])

service = MedicamentoService()

# Cadastro de medicamentos: controlado pela matriz de permissões
# (2026-08-31 — antes fixo em farmacêutico/coordenador). Coordenador
# sempre tem acesso completo (superusuário implícito); Atendente por
# padrão é só leitura, até o Admin liberar.
_PODE_CADASTRAR = exigir_permissao("medicamentos")


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
