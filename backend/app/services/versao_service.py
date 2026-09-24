from sqlalchemy.orm import Session

from app.core.changelog import NOTAS, VERSAO_ATUAL
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.usuario import UsuarioMe
from app.schemas.versao import VersaoInfoOut


class VersaoService:
    """Notas de atualização (popup pós-login) + versão do rodapé — ver
    app/core/changelog.py pro conteúdo em si."""

    def __init__(self):
        self.usuario_repository = UsuarioRepository()

    def info(self) -> VersaoInfoOut:
        return VersaoInfoOut(atual=VERSAO_ATUAL, notas=NOTAS)

    def marcar_lida(self, db: Session, usuario: UsuarioMe) -> None:
        registro = self.usuario_repository.get_by_id(db, usuario.id)
        if registro is None:
            return
        registro.versao_notas_vista = VERSAO_ATUAL
        db.commit()
