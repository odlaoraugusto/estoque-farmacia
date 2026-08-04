from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import SaidaCreate
from app.schemas.usuario import UsuarioMe


class SaidaService:
    """Regra 5: qualquer perfil pode dispensar, desde que o lote esteja na
    unidade ativa da sessão. Nunca permite saldo negativo."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()

    def registrar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: SaidaCreate,
    ) -> Movimentacao:
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if lote.unidade_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão.",
            )

        if not dados.setor_consumidor or not dados.setor_consumidor.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Setor consumidor é obrigatório.",
            )

        if dados.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote.quantidade_atual})."
                ),
            )

        lote.quantidade_atual -= dados.quantidade
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.saida,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            setor_consumidor=dados.setor_consumidor.strip(),
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)
