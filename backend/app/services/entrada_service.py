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
            procedencia_externa=(
                dados.procedencia_externa.strip() if dados.procedencia_externa else None
            ),
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

    def obter_para_comprovante(
        self, db: Session, numero_nota_fiscal: str | None, lote_id: int | None
    ) -> list[Lote]:
        """Pra imprimir o comprovante do que acabou de ser registrado
        (2026-09-01, pedido do cliente: "qualquer modalidade") — compra
        tem vários lotes sob a mesma NF (`numero_nota_fiscal`), doação/
        empréstimo é sempre um lote só (`lote_id`, sem NF)."""
        if lote_id is not None:
            lote = self.lote_repository.get_by_id(db, lote_id)
            if lote is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
                )
            return [lote]

        if numero_nota_fiscal:
            lotes = self.lote_repository.listar(
                db, numero_nota_fiscal=numero_nota_fiscal, apenas_disponivel=False
            )
            if not lotes:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Nenhum lote encontrado para esta nota fiscal.",
                )
            return lotes

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe numero_nota_fiscal ou lote_id.",
        )
