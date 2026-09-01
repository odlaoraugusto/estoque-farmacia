from sqlalchemy.orm import Session

from app.models.enums import PerfilEnum
from app.models.permissao_perfil import PermissaoPerfil
from app.repositories.permissao_repository import PermissaoRepository
from app.schemas.permissao import MatrizPermissoesUpdate


class PermissaoService:
    def __init__(self):
        self.permissao_repository = PermissaoRepository()

    def listar(self, db: Session) -> list[PermissaoPerfil]:
        return self.permissao_repository.listar(db)

    def atualizar_matriz(self, db: Session, dados: MatrizPermissoesUpdate) -> list[PermissaoPerfil]:
        self.permissao_repository.salvar(db, PerfilEnum.farmaceutico, dados.farmaceutico.model_dump())
        self.permissao_repository.salvar(db, PerfilEnum.atendente, dados.atendente.model_dump())
        return self.permissao_repository.listar(db)
