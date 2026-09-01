from sqlalchemy.orm import Session

from app.models.ponto_ressuprimento import PontoRessuprimento
from app.repositories.lote_repository import LoteRepository
from app.repositories.ponto_ressuprimento_repository import PontoRessuprimentoRepository
from app.schemas.ressuprimento import (
    PontoRessuprimentoOut,
    PontoRessuprimentoUpsert,
    StatusRessuprimentoItem,
)


class RessuprimentoService:
    """Pontos de ressuprimento (quantidade padrão/mínima) por medicamento
    e unidade satélite — cadastro exclusivo de Farmacêutico/Coordenador
    (checado no router), cruzado com o saldo atual pra decidir quem
    "precisa ressuprir agora" (essa parte é lida por qualquer perfil, é
    a notificação da própria unidade ativa)."""

    def __init__(self):
        self.ponto_repository = PontoRessuprimentoRepository()
        self.lote_repository = LoteRepository()

    def listar_status(self, db: Session, unidade_id: int | None = None) -> list[StatusRessuprimentoItem]:
        pontos = self.ponto_repository.listar(db, unidade_id)
        if not pontos:
            return []

        # Soma de saldo atual por medicamento, só dentro da(s) unidade(s)
        # que têm pelo menos um ponto configurado — evita somar lotes de
        # unidades fora do escopo pedido.
        unidades_com_ponto = {p.unidade_id for p in pontos}
        totais: dict[tuple[int, int], int] = {}
        for uid in unidades_com_ponto:
            for lote in self.lote_repository.listar(db, unidade_id=uid, apenas_disponivel=True, ordenar_fefo=False):
                chave = (lote.medicamento_id, lote.unidade_id)
                totais[chave] = totais.get(chave, 0) + lote.quantidade_atual

        itens = []
        for ponto in pontos:
            atual = totais.get((ponto.medicamento_id, ponto.unidade_id), 0)
            precisa = atual < ponto.quantidade_minima
            sugerida = max(ponto.quantidade_padrao - atual, 0) if precisa else 0

            itens.append(
                StatusRessuprimentoItem(
                    medicamento_id=ponto.medicamento_id,
                    medicamento_nome=ponto.medicamento.nome,
                    unidade_id=ponto.unidade_id,
                    unidade_nome=ponto.unidade.nome,
                    quantidade_atual=atual,
                    quantidade_padrao=ponto.quantidade_padrao,
                    quantidade_minima=ponto.quantidade_minima,
                    precisa_ressuprir=precisa,
                    quantidade_sugerida=sugerida,
                )
            )

        itens.sort(key=lambda i: (i.unidade_nome, i.medicamento_nome))
        return itens

    def definir_ponto(self, db: Session, dados: PontoRessuprimentoUpsert) -> PontoRessuprimentoOut:
        ponto = self.ponto_repository.get_by_medicamento_unidade(db, dados.medicamento_id, dados.unidade_id)

        if ponto is None:
            ponto = PontoRessuprimento(
                medicamento_id=dados.medicamento_id,
                unidade_id=dados.unidade_id,
                quantidade_padrao=dados.quantidade_padrao,
                quantidade_minima=dados.quantidade_minima,
            )
        else:
            ponto.quantidade_padrao = dados.quantidade_padrao
            ponto.quantidade_minima = dados.quantidade_minima

        ponto = self.ponto_repository.salvar(db, ponto)
        return PontoRessuprimentoOut.model_validate(ponto)
