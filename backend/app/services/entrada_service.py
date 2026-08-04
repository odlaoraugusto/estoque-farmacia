from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import TipoMovimentacaoEnum
from app.models.lote import Lote
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.medicamento_repository import MedicamentoRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.lote import EntradaCreate
from app.schemas.usuario import UsuarioMe

NOME_UNIDADE_CAF = "CAF"


class EntradaService:
    """Regra 1 e 2 (docs/00_PROJETO.md seção 3): entrada só na CAF, e só
    para perfil farmacêutico/coordenador — a checagem de perfil já ocorre
    na dependência do router (`exigir_perfis`), mas a checagem de unidade
    é 100% deste serviço, pois depende de dado de sessão + banco."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.unidade_repository = UnidadeRepository()
        self.medicamento_repository = MedicamentoRepository()

    def registrar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: EntradaCreate,
    ) -> Lote:
        unidade = self.unidade_repository.get_by_id(db, unidade_ativa_id)

        if unidade is None or unidade.nome.strip().upper() != NOME_UNIDADE_CAF:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Entrada de estoque só pode ser registrada na unidade CAF.",
            )

        medicamento = self.medicamento_repository.get_by_id(db, dados.medicamento_id)
        if medicamento is None or not medicamento.ativo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Medicamento não encontrado ou inativo.",
            )

        if dados.quantidade <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantidade deve ser maior que zero.",
            )

        lote = Lote(
            medicamento_id=dados.medicamento_id,
            unidade_id=unidade.id,
            numero_lote=dados.numero_lote,
            data_validade=dados.data_validade,
            quantidade_atual=dados.quantidade,
            valor_unitario=dados.valor_unitario,
            origem=dados.origem,
            numero_nota_fiscal=dados.numero_nota_fiscal,
            numero_afm=dados.numero_afm,
            usuario_entrada_id=usuario.id,
        )
        lote = self.lote_repository.create(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.entrada,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_destino_id=unidade.id,
            usuario_id=usuario.id,
        )
        self.movimentacao_repository.create(db, movimentacao)

        return lote
