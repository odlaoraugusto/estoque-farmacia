from sqlalchemy.orm import Session

from app.repositories.lote_repository import LoteRepository
from app.schemas.lote import LoteDetalhadoOut


class LoteService:
    """Estoque atual e busca por FEFO (First-Expire-First-Out) — regra 5:
    a busca de lote para saída deve ordenar por validade mais próxima e
    sinalizar o lote sugerido.

    Carrinho de emergência é estoque À PARTE da unidade "pai" que o
    hospeda (2026-08-31, pedido do cliente: desvincular de vez — antes o
    escopo de uma unidade era ampliado para incluir os carrinhos filhos
    dela em Estoque atual/FEFO/relatórios, misturando os dois estoques).
    `unidade_id` aqui sempre significa só aquela unidade, nunca ela +
    carrinhos."""

    def __init__(self):
        self.lote_repository = LoteRepository()

    def listar_estoque(
        self,
        db: Session,
        unidade_id: int | None,
        medicamento_id: int | None = None,
        numero_nota_fiscal: str | None = None,
        apenas_disponivel: bool = True,
    ) -> list[LoteDetalhadoOut]:
        """`unidade_id=None` (Coordenador sem filtro) continua sem filtro
        nenhum, vendo tudo — inclusive carrinhos, se quiser filtrar por
        um especificamente passando o id dele direto."""
        lotes = self.lote_repository.listar(
            db,
            unidade_id=unidade_id,
            medicamento_id=medicamento_id,
            numero_nota_fiscal=numero_nota_fiscal,
            apenas_disponivel=apenas_disponivel,
            ordenar_fefo=True,
        )

        return self._marcar_sugerido_fefo(lotes)

    def buscar_fefo(
        self, db: Session, unidade_id: int, medicamento_id: int
    ) -> list[LoteDetalhadoOut]:
        return self.listar_estoque(
            db, unidade_id=unidade_id, medicamento_id=medicamento_id, apenas_disponivel=True
        )

    def listar_vencimentos_proximos(
        self, db: Session, dias: int, unidade_id: int | None = None
    ) -> list[LoteDetalhadoOut]:
        lotes = self.lote_repository.listar_vencimento_proximo(db, dias, unidade_id)

        return [LoteDetalhadoOut.model_validate(lote) for lote in lotes]

    def _marcar_sugerido_fefo(self, lotes) -> list[LoteDetalhadoOut]:
        """Sinaliza o primeiro lote (menor validade) de cada medicamento
        como sugerido — o front usa isso para pré-selecionar na tela de
        Saída/Dispensação."""
        ja_sugerido: set[int] = set()
        resultado: list[LoteDetalhadoOut] = []

        for lote in lotes:
            item = LoteDetalhadoOut.model_validate(lote)

            if lote.medicamento_id not in ja_sugerido:
                item.sugerido_fefo = True
                ja_sugerido.add(lote.medicamento_id)

            resultado.append(item)

        return resultado
