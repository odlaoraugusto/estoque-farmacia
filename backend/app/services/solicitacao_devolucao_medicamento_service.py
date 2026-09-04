from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import OrigemEnum, StatusDevolucaoMedicamentoEnum, TipoMovimentacaoEnum, TipoUnidadeEnum
from app.models.lote import Lote
from app.models.movimentacao import Movimentacao
from app.models.solicitacao_devolucao_medicamento import (
    SolicitacaoDevolucaoMedicamento,
    SolicitacaoDevolucaoMedicamentoItem,
)
from app.repositories.lote_repository import LoteRepository
from app.repositories.medicamento_repository import MedicamentoRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.solicitacao_devolucao_medicamento_repository import (
    SolicitacaoDevolucaoMedicamentoRepository,
)
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.solicitacao_devolucao_medicamento import (
    ConfirmarDevolucaoMedicamentoCreate,
    DevolucaoMedicamentoCreate,
)
from app.schemas.usuario import UsuarioMe


class SolicitacaoDevolucaoMedicamentoService:
    """Registro público (sem login) de devolução de medicamento físico à
    farmácia/unidade satélite + confirmação (dar entrada de lote novo)
    pela unidade escolhida (2026-09-01, pedido do cliente). Diferente da
    Entrada por compra/doação/empréstimo, NÃO é restrito à CAF — qualquer
    unidade real pode confirmar, desde que seja a `unidade_destino_id` da
    solicitação."""

    def __init__(self):
        self.repository = SolicitacaoDevolucaoMedicamentoRepository()
        self.unidade_repository = UnidadeRepository()
        self.medicamento_repository = MedicamentoRepository()
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()

    # ---- leitura pública ----

    def listar_unidades(self, db: Session):
        return self.unidade_repository.list(db, tipo=TipoUnidadeEnum.unidade)

    def listar_medicamentos(self, db: Session):
        return self.medicamento_repository.list(db, apenas_ativos=True)

    # ---- criação pública ----

    def criar(self, db: Session, dados: DevolucaoMedicamentoCreate) -> SolicitacaoDevolucaoMedicamento:
        unidade_destino = self.unidade_repository.get_by_id(db, dados.unidade_destino_id)
        if unidade_destino is None or unidade_destino.tipo != TipoUnidadeEnum.unidade:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unidade de destino inválida.")

        precisa_paciente = False
        for item in dados.itens:
            medicamento = self.medicamento_repository.get_by_id(db, item.medicamento_id)
            if medicamento is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Medicamento {item.medicamento_id} não encontrado.",
                )
            if medicamento.e_controlado or medicamento.e_antimicrobiano:
                precisa_paciente = True

        if precisa_paciente and not (dados.paciente_nome and dados.paciente_prontuario):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Há medicamento controlado ou antimicrobiano na lista — "
                    "paciente e prontuário são obrigatórios."
                ),
            )

        solicitacao = SolicitacaoDevolucaoMedicamento(
            setor=dados.setor.strip(),
            unidade_destino_id=dados.unidade_destino_id,
            paciente_nome=dados.paciente_nome.strip().upper() if dados.paciente_nome else None,
            paciente_prontuario=dados.paciente_prontuario.strip() if dados.paciente_prontuario else None,
        )
        solicitacao = self.repository.create(db, solicitacao)

        for item in dados.itens:
            self.repository.adicionar_item(
                db,
                SolicitacaoDevolucaoMedicamentoItem(
                    solicitacao_id=solicitacao.id,
                    medicamento_id=item.medicamento_id,
                    quantidade=item.quantidade,
                ),
            )
        db.commit()
        db.refresh(solicitacao)

        return solicitacao

    # ---- leitura autenticada ----

    def listar_pendentes(self, db: Session, unidade_destino_id: int) -> list[SolicitacaoDevolucaoMedicamento]:
        return self.repository.listar_pendentes_por_unidade(db, unidade_destino_id)

    # ---- cancelamento autenticado ----

    def cancelar(self, db: Session, unidade_ativa_id: int, solicitacao_id: int) -> None:
        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

        if solicitacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só a unidade de destino desta solicitação pode cancelá-la.",
            )

        if solicitacao.status != StatusDevolucaoMedicamentoEnum.pendente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível cancelar: esta solicitação já foi confirmada.",
            )

        self.repository.deletar(db, solicitacao)

    # ---- comprovante autenticado ----

    def obter_lotes_para_comprovante(self, db: Session, solicitacao_id: int) -> list[Lote]:
        """Pra imprimir o comprovante depois de confirmar — reaproveita o
        mesmo builder de comprovante de Entrada (`tabela_comprovante_entrada`),
        já que cada item confirmado virou um `Lote` normal com
        `origem=devolucao` (ver `confirmar` abaixo).

        Busca via `Movimentacao.solicitacao_devolucao_id` (2026-09-04),
        não via `item.lote_id` — um mesmo item pode ter virado mais de um
        lote (dividido na confirmação, ex.: 3 unidades devolvidas sendo
        2 de um lote físico e 1 de outro), e `item.lote_id` é uma FK
        única que só guarda o último."""
        solicitacao = self.repository.get_by_id(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

        if solicitacao.status != StatusDevolucaoMedicamentoEnum.confirmada:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Só é possível imprimir o comprovante depois de confirmar a entrada.",
            )

        movimentacoes = self.movimentacao_repository.listar_por_solicitacao_devolucao(db, solicitacao_id)
        lotes = [m.lote for m in movimentacoes if m.lote is not None]
        if not lotes:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum lote encontrado.")
        return lotes

    # ---- confirmação autenticada ----

    def confirmar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        solicitacao_id: int,
        dados: ConfirmarDevolucaoMedicamentoCreate,
    ) -> SolicitacaoDevolucaoMedicamento:
        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

        if solicitacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só a unidade de destino desta solicitação pode confirmar.",
            )

        if solicitacao.status == StatusDevolucaoMedicamentoEnum.confirmada:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solicitação já confirmada.")

        itens_por_id = {item.id: item for item in solicitacao.itens}

        for confirmacao in dados.itens:
            item = itens_por_id.get(confirmacao.item_id)
            if item is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {confirmacao.item_id} não pertence a esta solicitação.",
                )

            lote = Lote(
                medicamento_id=item.medicamento_id,
                unidade_id=unidade_ativa_id,
                numero_lote=confirmacao.numero_lote,
                data_validade=confirmacao.data_validade,
                quantidade_atual=confirmacao.quantidade,
                valor_unitario=confirmacao.valor_unitario,
                origem=OrigemEnum.devolucao,
                usuario_entrada_id=usuario.id,
            )
            lote = self.lote_repository.create(db, lote)

            self.movimentacao_repository.create(
                db,
                Movimentacao(
                    tipo=TipoMovimentacaoEnum.entrada,
                    lote_id=lote.id,
                    quantidade=confirmacao.quantidade,
                    unidade_destino_id=unidade_ativa_id,
                    usuario_id=usuario.id,
                    solicitacao_devolucao_id=solicitacao.id,
                ),
            )

            # Informativo (2026-09-04): quando o mesmo item vira mais de
            # um lote (dividido na confirmação), esta FK única fica com
            # o ÚLTIMO lote criado — não é a fonte de verdade de "todos
            # os lotes desta solicitação" (isso é
            # `Movimentacao.solicitacao_devolucao_id`, usado em
            # `obter_lotes_para_comprovante` abaixo).
            item.lote_id = lote.id
            db.add(item)

        solicitacao.status = StatusDevolucaoMedicamentoEnum.confirmada
        solicitacao.usuario_confirmacao_id = usuario.id
        solicitacao.data_confirmacao = datetime.now(timezone.utc)

        return self.repository.salvar(db, solicitacao)
