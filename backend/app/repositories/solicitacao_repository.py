from sqlalchemy.orm import Session

from app.models.enums import StatusSolicitacaoEnum
from app.models.solicitacao_transferencia import SolicitacaoTransferencia


class SolicitacaoRepository:

    def create(
        self, db: Session, solicitacao: SolicitacaoTransferencia
    ) -> SolicitacaoTransferencia:
        db.add(solicitacao)
        db.commit()
        db.refresh(solicitacao)

        return solicitacao

    def get_by_id_for_update(
        self, db: Session, solicitacao_id: int
    ) -> SolicitacaoTransferencia | None:
        return (
            db.query(SolicitacaoTransferencia)
            .filter(SolicitacaoTransferencia.id == solicitacao_id)
            .with_for_update()
            .first()
        )

    def salvar(
        self, db: Session, solicitacao: SolicitacaoTransferencia
    ) -> SolicitacaoTransferencia:
        db.commit()
        db.refresh(solicitacao)

        return solicitacao

    def listar(
        self,
        db: Session,
        unidade_solicitante_id: int | None = None,
        status: StatusSolicitacaoEnum | None = None,
    ) -> list[SolicitacaoTransferencia]:
        """`unidade_solicitante_id=None` devolve de todas as unidades — é
        assim que a CAF enxerga a fila inteira; qualquer outra unidade
        sempre manda o próprio id (ver SolicitacaoService.listar)."""
        query = db.query(SolicitacaoTransferencia)

        if unidade_solicitante_id is not None:
            query = query.filter(
                SolicitacaoTransferencia.unidade_solicitante_id == unidade_solicitante_id
            )

        if status is not None:
            query = query.filter(SolicitacaoTransferencia.status == status)

        return query.order_by(SolicitacaoTransferencia.data_solicitacao.desc()).all()

    def get_by_id(self, db: Session, solicitacao_id: int) -> SolicitacaoTransferencia | None:
        return (
            db.query(SolicitacaoTransferencia)
            .filter(SolicitacaoTransferencia.id == solicitacao_id)
            .first()
        )
