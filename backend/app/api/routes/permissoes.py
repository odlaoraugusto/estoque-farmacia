from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis, get_current_user
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.permissao import MatrizPermissoesUpdate, PermissaoPerfilOut
from app.services.permissao_service import PermissaoService

router = APIRouter(prefix="/permissoes", tags=["Permissões"])

service = PermissaoService()

# Só o Admin edita a matriz — ver app/api/deps.py::exigir_permissao.
_PODE_GERIR_PERMISSOES = exigir_perfis(PerfilEnum.admin)


@router.get("", response_model=list[PermissaoPerfilOut], dependencies=[Depends(get_current_user)])
def listar_permissoes(db: Session = Depends(get_db)):
    """Leitura liberada pra qualquer perfil autenticado — o frontend
    precisa da matriz pra decidir o que mostrar/esconder na própria
    sessão de Farmacêutico/Atendente (`lib/permissoes.ts`)."""
    return service.listar(db)


@router.put("", response_model=list[PermissaoPerfilOut], dependencies=[Depends(_PODE_GERIR_PERMISSOES)])
def atualizar_permissoes(dados: MatrizPermissoesUpdate, db: Session = Depends(get_db)):
    return service.atualizar_matriz(db, dados)
