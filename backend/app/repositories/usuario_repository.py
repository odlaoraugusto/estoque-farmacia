from sqlalchemy.orm import Session

from app.models.usuario import Usuario


class UsuarioRepository:

    def get_by_id(self, db: Session, usuario_id: int) -> Usuario | None:
        return db.query(Usuario).filter(Usuario.id == usuario_id).first()

    def get_by_login(self, db: Session, login: str) -> Usuario | None:
        return db.query(Usuario).filter(Usuario.login == login).first()

    def create(self, db: Session, usuario: Usuario) -> Usuario:
        db.add(usuario)
        db.commit()
        db.refresh(usuario)

        return usuario
