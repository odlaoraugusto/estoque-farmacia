from sqlalchemy.orm import Session

from app.models.enums import StatusDevolucaoMedicamentoEnum
from app.models.solicitacao_devolucao_medicamento import (
    SolicitacaoDevolucaoMedicamento,
    SolicitacaoDevolucaoMedicamentoItem,
)


class SolicitacaoDevolucaoMedicamentoRepository:
    def create(
        self, db: Session, solicitacao: SolicitacaoDevolucaoMedicamento
    ) -> SolicitacaoDevolucaoMedicamento:
        db.add(solicitacao)
        db.commit()
        db.refresh(solicitacao)
        return solicitacao

    def get_by_id(self, db: Session, solicitacao_id: int) -> SolicitacaoDevolucaoMedicamento | None:
        return (
            db.query(SolicitacaoDevolucaoMedicamento)
            .filter(SolicitacaoDevolucaoMedicamento.id == solicitacao_id)
            .first()
        )

    def get_by_id_for_update(
        self, db: Session, solicitacao_id: int
    ) -> SolicitacaoDevolucaoMedicamento | None:
        return (
            db.query(SolicitacaoDevolucaoMedicamento)
            .filter(SolicitacaoDevolucaoMedicamento.id == solicitacao_id)
            .with_for_update()
            .first()
        )

    def listar_pendentes_por_unidade(
        self, db: Session, unidade_destino_id: int
    ) -> list[SolicitacaoDevolucaoMedicamento]:
        return (
            db.query(SolicitacaoDevolucaoMedicamento)
            .filter(
                SolicitacaoDevolucaoMedicamento.unidade_destino_id == unidade_destino_id,
                SolicitacaoDevolucaoMedicamento.status == StatusDevolucaoMedicamentoEnum.pendente,
            )
            .order_by(SolicitacaoDevolucaoMedicamento.data_hora.asc())
            .all()
        )

    def salvar(
        self, db: Session, solicitacao: SolicitacaoDevolucaoMedicamento
    ) -> SolicitacaoDevolucaoMedicamento:
        db.commit()
        db.refresh(solicitacao)
        return solicitacao

    def deletar(self, db: Session, solicitacao: SolicitacaoDevolucaoMedicamento) -> None:
        for item in list(solicitacao.itens):
            db.delete(item)
        db.delete(solicitacao)
        db.commit()

    def adicionar_item(self, db: Session, item: SolicitacaoDevolucaoMedicamentoItem) -> None:
        db.add(item)
