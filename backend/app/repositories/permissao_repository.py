from sqlalchemy.orm import Session

from app.models.enums import PerfilEnum
from app.models.permissao_perfil import PermissaoPerfil


class PermissaoRepository:
    def listar(self, db: Session) -> list[PermissaoPerfil]:
        return db.query(PermissaoPerfil).order_by(PermissaoPerfil.perfil).all()

    def get_by_perfil(self, db: Session, perfil: PerfilEnum) -> PermissaoPerfil | None:
        return db.query(PermissaoPerfil).filter(PermissaoPerfil.perfil == perfil).first()

    def salvar(self, db: Session, perfil: PerfilEnum, dados: dict) -> PermissaoPerfil:
        registro = self.get_by_perfil(db, perfil)
        for chave, valor in dados.items():
            setattr(registro, chave, valor)
        db.commit()
        db.refresh(registro)
        return registro
