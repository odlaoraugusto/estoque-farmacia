from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_current_user
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.medicamento import MedicamentoCreate, MedicamentoOut, MedicamentoUpdate
from app.services.medicamento_service import MedicamentoService

router = APIRouter(prefix="/medicamentos", tags=["Medicamentos"])

service = MedicamentoService()

# Cadastro de medicamentos: Farmacêutico cadastra sozinho, sem aprovação
# (docs/00_PROJETO.md seção 9). Coordenador também tem acesso completo.
# Atendente é só leitura (sem acesso a cadastro, matriz de permissões
# seção 6/9 do doc).
_PODE_CADASTRAR = exigir_perfis(PerfilEnum.farmaceutico, PerfilEnum.coordenador)


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
