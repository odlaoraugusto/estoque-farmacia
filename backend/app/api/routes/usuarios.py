from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import exigir_perfis
from app.database.session import get_db
from app.models.enums import PerfilEnum
from app.schemas.usuario import UsuarioCreate, UsuarioMe, UsuarioOut, UsuarioUpdate
from app.services.usuario_service import UsuarioService

router = APIRouter(prefix="/usuarios", tags=["Usuários"])

service = UsuarioService()

# Gestão de usuários (2026-08-20) — exclusiva do Coordenador; Admin
# (2026-08-27) também tem acesso — é a única tela que esse perfil usa,
# já que ele existe só para configuração, sem tocar em estoque/medicamento.
# É a ação administrativa mais sensível do sistema (controla quem tem
# acesso a tudo o mais), por isso não entrou na equalização
# Farmacêutico=Coordenador da seção 27 do doc.
_PODE_GERIR = exigir_perfis(PerfilEnum.coordenador, PerfilEnum.admin)


@router.get("", response_model=list[UsuarioOut], dependencies=[Depends(_PODE_GERIR)])
def listar_usuarios(apenas_ativos: bool = True, db: Session = Depends(get_db)):
    return service.listar(db, apenas_ativos)


@router.post("", response_model=UsuarioOut, dependencies=[Depends(_PODE_GERIR)])
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db)):
    return service.criar(db, dados)


@router.put("/{usuario_id}", response_model=UsuarioOut)
def atualizar_usuario(
    usuario_id: int,
    dados: UsuarioUpdate,
    usuario: UsuarioMe = Depends(_PODE_GERIR),
    db: Session = Depends(get_db),
):
    return service.atualizar(db, usuario, usuario_id, dados)
