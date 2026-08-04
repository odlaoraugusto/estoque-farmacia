"""Cadastro de usuários iniciais via linha de comando.

Cadastro de usuários está fora do escopo do MVP (docs/00_PROJETO.md,
seção 9, default 4) — sem tela/endpoint de administração por enquanto.
Este script cobre a necessidade de criar os primeiros usuários direto no
banco, na instalação do sistema.

Uso (a partir da pasta backend/, com o venv ativado e o .env configurado):

    python scripts/seed_usuarios.py --nome "Maria Silva" --login maria.silva \
        --senha "TrocarNoPrimeiroAcesso!" --perfil coordenador --crf 12345-SP

    python scripts/seed_usuarios.py --nome "João Souza" --login joao.souza \
        --senha "TrocarNoPrimeiroAcesso!" --perfil atendente

Perfis válidos: coordenador | farmaceutico | atendente
--crf é obrigatório para perfil farmaceutico/coordenador (ambos são
farmacêuticos por formação — docs/00_PROJETO.md seção 6).

Este script também garante a existência das 4 unidades padrão da rede
FESFSUS (CAF, UTI, Centro Cirúrgico, Emergência) caso ainda não existam.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.security import hash_senha  # noqa: E402
from app.database.database import SessionLocal  # noqa: E402
from app.models.enums import PerfilEnum  # noqa: E402
from app.models.unidade import Unidade  # noqa: E402
from app.models.usuario import Usuario  # noqa: E402

UNIDADES_PADRAO = ["CAF", "UTI", "Centro Cirúrgico", "Emergência"]


def garantir_unidades_padrao(db) -> None:
    existentes = {u.nome for u in db.query(Unidade).all()}

    for nome in UNIDADES_PADRAO:
        if nome not in existentes:
            db.add(Unidade(nome=nome))

    db.commit()


def criar_usuario(nome: str, login: str, senha: str, perfil: str, crf: str | None) -> None:
    perfil_enum = PerfilEnum(perfil)

    if perfil_enum in (PerfilEnum.farmaceutico, PerfilEnum.coordenador) and not crf:
        raise SystemExit(
            f"--crf é obrigatório para perfil '{perfil}' "
            "(farmacêutico e coordenador são farmacêuticos por formação)."
        )

    db = SessionLocal()
    try:
        garantir_unidades_padrao(db)

        if db.query(Usuario).filter(Usuario.login == login).first():
            raise SystemExit(f"Já existe um usuário com login '{login}'.")

        usuario = Usuario(
            nome=nome,
            login=login,
            senha_hash=hash_senha(senha),
            perfil=perfil_enum,
            crf=crf,
            ativo=True,
        )
        db.add(usuario)
        db.commit()

        print(f"Usuário '{login}' ({perfil}) criado com sucesso. id={usuario.id}")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cria um usuário inicial do Estoque Farmácia.")
    parser.add_argument("--nome", required=True)
    parser.add_argument("--login", required=True)
    parser.add_argument("--senha", required=True)
    parser.add_argument(
        "--perfil",
        required=True,
        choices=[p.value for p in PerfilEnum],
    )
    parser.add_argument("--crf", required=False, default=None)

    args = parser.parse_args()

    criar_usuario(args.nome, args.login, args.senha, args.perfil, args.crf)


if __name__ == "__main__":
    main()
