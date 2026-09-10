from decimal import Decimal

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
    ) -> tuple[Lote, Movimentacao]:
        """Se já existe um lote com a MESMA identidade física (medicamento
        + unidade + nº de lote + validade + origem + NF/AFM), soma nele
        em vez de criar linha nova (2026-09-09, pedido do cliente: "se
        for o mesmo lote, integra aquele estoque") — ver
        `LoteRepository.buscar_para_merge` pro critério exato. Cria a
        `Movimentacao` de qualquer forma, então o rastro de auditoria
        por evento continua intacto mesmo quando o lote em si é
        reaproveitado; é ela (não `lote.quantidade_atual`) que o
        comprovante usa pra saber a quantidade desta operação
        específica."""
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

        lote = self.lote_repository.buscar_para_merge(
            db,
            dados.medicamento_id,
            unidade.id,
            dados.numero_lote,
            dados.data_validade,
            dados.numero_nota_fiscal,
            dados.numero_afm,
        )

        if lote is not None:
            lote.quantidade_atual += dados.quantidade
            if lote.valor_unitario in (None, Decimal("0")) and dados.valor_unitario:
                lote.valor_unitario = dados.valor_unitario
            lote = self.lote_repository.salvar(db, lote)
        else:
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
        movimentacao = self.movimentacao_repository.create(db, movimentacao)

        return lote, movimentacao

    def obter_para_comprovante(self, db: Session, movimentacao_ids: list[int]) -> list[Movimentacao]:
        """Pra imprimir o comprovante do que acabou de ser registrado
        (2026-09-01, pedido do cliente: "qualquer modalidade") — chaveado
        pelas `Movimentacao` desta operação específica (2026-09-09, não
        mais por `numero_nota_fiscal`/`lote_id`), já que um lote pode ter
        recebido merge de uma entrada anterior e `lote.quantidade_atual`
        deixou de refletir só o que chegou agora. Mesmo padrão de
        `SaidaService.obter_para_comprovante` (o front acumula os ids
        devolvidos por cada `POST /entradas` da lista — compra registra
        vários medicamentos, um `POST` por item — e manda todos juntos
        aqui)."""
        if not movimentacao_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ao menos um id de entrada."
            )

        movimentacoes = []
        for movimentacao_id in movimentacao_ids:
            movimentacao = self.movimentacao_repository.get_by_id(db, movimentacao_id)
            if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.entrada:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Entrada #{movimentacao_id} não encontrada.",
                )
            movimentacoes.append(movimentacao)

        return movimentacoes
