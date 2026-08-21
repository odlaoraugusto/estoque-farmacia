from sqlalchemy.orm import Session

from app.repositories.lote_repository import LoteRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.lote import LoteDetalhadoOut


class LoteService:
    """Estoque atual e busca por FEFO (First-Expire-First-Out) — regra 5:
    a busca de lote para saída deve ordenar por validade mais próxima e
    sinalizar o lote sugerido."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.unidade_repository = UnidadeRepository()

    def listar_estoque(
        self,
        db: Session,
        unidade_id: int | None,
        medicamento_id: int | None = None,
        numero_nota_fiscal: str | None = None,
        apenas_disponivel: bool = True,
    ) -> list[LoteDetalhadoOut]:
        """Quando `unidade_id` vem preenchido, o escopo é ampliado para
        incluir os carrinhos de emergência filhos dessa unidade (2026-08-13)
        — o estoque posicionado num carrinho tem que aparecer junto do
        estoque da unidade real "pai" dele. `unidade_id=None` (Coordenador
        sem filtro) continua sem filtro nenhum, vendo tudo."""
        escopo = self._expandir_escopo(db, unidade_id)

        lotes = self.lote_repository.listar(
            db,
            unidade_id=escopo,
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
        escopo = self._expandir_escopo(db, unidade_id)
        lotes = self.lote_repository.listar_vencimento_proximo(db, dias, escopo)

        return [LoteDetalhadoOut.model_validate(lote) for lote in lotes]

    def _expandir_escopo(self, db: Session, unidade_id: int | None) -> int | list[int] | None:
        if unidade_id is None:
            return None

        return self.unidade_repository.listar_ids_com_carrinhos(db, unidade_id)

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
