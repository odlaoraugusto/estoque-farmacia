from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.enums import TipoUnidadeEnum
from app.models.unidade import Unidade


class UnidadeRepository:

    def list(self, db: Session, tipo: TipoUnidadeEnum | None = None) -> list[Unidade]:
        query = db.query(Unidade)

        if tipo is not None:
            query = query.filter(Unidade.tipo == tipo)

        return query.order_by(Unidade.nome).all()

    def get_by_id(self, db: Session, unidade_id: int) -> Unidade | None:
        return db.query(Unidade).filter(Unidade.id == unidade_id).first()

    def get_by_nome(self, db: Session, nome: str) -> Unidade | None:
        return db.query(Unidade).filter(Unidade.nome == nome).first()

    def listar_ids_com_carrinhos(self, db: Session, unidade_id: int) -> list[int]:
        """Amplia um id de unidade real para incluir os carrinhos de
        emergência fisicamente posicionados nela (`unidade_pai_id`).

        Usado nos pontos onde o estoque de um carrinho precisa ficar
        visível/acionável por quem está logado na unidade real "pai"
        (Estoque atual, busca FEFO, Saída, Descarte, relatórios de
        estoque/vencimentos) — NUNCA em Entrada ou no envio de
        Transferência normal, que continuam exigindo a unidade ativa
        exata."""
        carrinho_ids = [
            row.id
            for row in db.query(Unidade.id)
            .filter(Unidade.unidade_pai_id == unidade_id)
            .all()
        ]

        return [unidade_id, *carrinho_ids]
