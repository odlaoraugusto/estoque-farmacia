from sqlalchemy.orm import Session

from app.models.enums import StatusRessuprimentoCarrinhoEnum
from app.models.solicitacao_ressuprimento_carrinho import (
    SolicitacaoRessuprimentoCarrinho,
    SolicitacaoRessuprimentoCarrinhoItem,
)


class SolicitacaoRessuprimentoCarrinhoRepository:
    def create(self, db: Session, solicitacao: SolicitacaoRessuprimentoCarrinho) -> SolicitacaoRessuprimentoCarrinho:
        db.add(solicitacao)
        db.commit()
        db.refresh(solicitacao)
        return solicitacao

    def get_by_id_for_update(self, db: Session, solicitacao_id: int) -> SolicitacaoRessuprimentoCarrinho | None:
        return (
            db.query(SolicitacaoRessuprimentoCarrinho)
            .filter(SolicitacaoRessuprimentoCarrinho.id == solicitacao_id)
            .with_for_update()
            .first()
        )

    def listar_pendentes_por_unidade(
        self, db: Session, unidade_destino_id: int
    ) -> list[SolicitacaoRessuprimentoCarrinho]:
        """Pendente aqui significa "ainda tem pelo menos uma das duas
        ações não confirmada" — some do popup só quando as duas já
        foram feitas."""
        return (
            db.query(SolicitacaoRessuprimentoCarrinho)
            .filter(
                SolicitacaoRessuprimentoCarrinho.unidade_destino_id == unidade_destino_id,
                (
                    (SolicitacaoRessuprimentoCarrinho.status_saida == StatusRessuprimentoCarrinhoEnum.pendente)
                    | (
                        SolicitacaoRessuprimentoCarrinho.status_transferencia
                        == StatusRessuprimentoCarrinhoEnum.pendente
                    )
                ),
            )
            .order_by(SolicitacaoRessuprimentoCarrinho.data_hora.asc())
            .all()
        )

    def salvar(self, db: Session, solicitacao: SolicitacaoRessuprimentoCarrinho) -> SolicitacaoRessuprimentoCarrinho:
        db.commit()
        db.refresh(solicitacao)
        return solicitacao

    def deletar(self, db: Session, solicitacao: SolicitacaoRessuprimentoCarrinho) -> None:
        for item in list(solicitacao.itens):
            db.delete(item)
        db.delete(solicitacao)
        db.commit()

    def adicionar_item(self, db: Session, item: SolicitacaoRessuprimentoCarrinhoItem) -> None:
        db.add(item)
