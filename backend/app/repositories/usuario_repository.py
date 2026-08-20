from sqlalchemy.orm import Session

from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioUpdate


class UsuarioRepository:

    def get_by_id(self, db: Session, usuario_id: int) -> Usuario | None:
        return db.query(Usuario).filter(Usuario.id == usuario_id).first()

    def get_by_login(self, db: Session, login: str) -> Usuario | None:
        return db.query(Usuario).filter(Usuario.login == login).first()

    def list(self, db: Session, apenas_ativos: bool = True) -> list[Usuario]:
        query = db.query(Usuario)

        if apenas_ativos:
            query = query.filter(Usuario.ativo.is_(True))

        return query.order_by(Usuario.nome).all()

    def create(self, db: Session, usuario: Usuario) -> Usuario:
        db.add(usuario)
        db.commit()
        db.refresh(usuario)

        return usuario

    def update(self, db: Session, usuario: Usuario, dados: UsuarioUpdate) -> Usuario:
        # `senha` chega em texto puro no schema mas o model só tem
        # `senha_hash` — quem já traduziu senha->hash (UsuarioService) manda
        # aqui só os campos que o model realmente tem, via `exclude={"senha"}`.
        for campo, valor in dados.model_dump(exclude_unset=True, exclude={"senha"}).items():
            setattr(usuario, campo, valor)

        db.commit()
        db.refresh(usuario)

        return usuario
