from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_senha
from app.models.enums import PerfilEnum
from app.models.usuario import Usuario
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.usuario import UsuarioCreate, UsuarioMe, UsuarioUpdate


class UsuarioService:
    """Gestão de usuários (2026-08-20) — exclusiva do Coordenador (router
    garante o perfil). Antes disso só existia via script de linha de
    comando (`scripts/seed_usuarios.py`, mantido pro cadastro inicial na
    instalação — este service cobre o dia a dia depois do sistema no ar).
    """

    # Senha padrão de todo usuário novo (2026-08-20) — o Coordenador não
    # escolhe nem vê a senha de ninguém; o usuário é obrigado a trocá-la
    # no primeiro login (`deve_trocar_senha`, checado em
    # `AuthService.selecionar_unidade`).
    SENHA_PADRAO_NOVO_USUARIO = "Senha123!"

    def __init__(self):
        self.usuario_repository = UsuarioRepository()

    @staticmethod
    def _exige_crf(perfil: PerfilEnum) -> bool:
        return perfil in (PerfilEnum.farmaceutico, PerfilEnum.coordenador)

    def listar(self, db: Session, apenas_ativos: bool) -> list[Usuario]:
        return self.usuario_repository.list(db, apenas_ativos)

    def criar(self, db: Session, dados: UsuarioCreate) -> Usuario:
        if self.usuario_repository.get_by_login(db, dados.login):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Já existe um usuário com login '{dados.login}'.",
            )

        if self._exige_crf(dados.perfil) and not (dados.crf and dados.crf.strip()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CRF é obrigatório para perfil farmacêutico ou coordenador.",
            )

        usuario = Usuario(
            nome=dados.nome,
            login=dados.login,
            senha_hash=hash_senha(self.SENHA_PADRAO_NOVO_USUARIO),
            perfil=dados.perfil,
            crf=dados.crf,
            ativo=True,
            deve_trocar_senha=True,
        )

        return self.usuario_repository.create(db, usuario)

    def atualizar(
        self, db: Session, usuario_logado: UsuarioMe, usuario_id: int, dados: UsuarioUpdate
    ) -> Usuario:
        usuario = self.usuario_repository.get_by_id(db, usuario_id)
        if usuario is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado."
            )

        # Trava de segurança: ninguém edita o próprio acesso por aqui —
        # evita o Coordenador se desativar ou se rebaixar de perfil sem
        # querer e ficar trancado pra fora da própria gestão de usuários
        # (numa farmácia pequena, pode não ter um segundo coordenador pra
        # desfazer). Nome/CRF do próprio usuário continuam editáveis.
        if usuario_logado.id == usuario_id:
            if dados.ativo is False:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Você não pode desativar a própria conta.",
                )
            if dados.perfil is not None and dados.perfil != usuario.perfil:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Você não pode alterar o próprio perfil de acesso.",
                )

        perfil_resultante = dados.perfil if dados.perfil is not None else usuario.perfil
        crf_resultante = dados.crf if dados.crf is not None else usuario.crf
        if self._exige_crf(perfil_resultante) and not (crf_resultante and crf_resultante.strip()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CRF é obrigatório para perfil farmacêutico ou coordenador.",
            )

        if dados.senha:
            usuario.senha_hash = hash_senha(dados.senha)
            # Reset manual pelo Coordenador (ex.: usuário esqueceu a senha)
            # exige troca no próximo login, mesma regra do usuário recém-
            # criado — nunca fica uma senha só o Coordenador conhece em uso
            # indefinidamente.
            usuario.deve_trocar_senha = True

        return self.usuario_repository.update(db, usuario, dados)
