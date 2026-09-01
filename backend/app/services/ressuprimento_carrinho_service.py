from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import (
    StatusRessuprimentoCarrinhoEnum,
    TipoMovimentacaoEnum,
    TipoUnidadeEnum,
)
from app.models.movimentacao import Movimentacao
from app.models.solicitacao_ressuprimento_carrinho import (
    SolicitacaoRessuprimentoCarrinho,
    SolicitacaoRessuprimentoCarrinhoItem,
)
from app.repositories.lote_repository import LoteRepository
from app.repositories.medicamento_repository import MedicamentoRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.solicitacao_ressuprimento_carrinho_repository import (
    SolicitacaoRessuprimentoCarrinhoRepository,
)
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.movimentacao import ReporCarrinhoCreate
from app.schemas.ressuprimento_carrinho import (
    ConfirmarSaidaCarrinhoCreate,
    ConfirmarTransferenciaCarrinhoCreate,
    RessuprimentoCarrinhoCreate,
)
from app.schemas.usuario import UsuarioMe
from app.services.transferencia_service import TransferenciaService


class RessuprimentoCarrinhoService:
    """Registro público (sem login) de uso de carrinho de emergência +
    confirmação das duas ações resultantes pela farmácia responsável
    (2026-08-31, pedido do cliente)."""

    def __init__(self):
        self.repository = SolicitacaoRessuprimentoCarrinhoRepository()
        self.unidade_repository = UnidadeRepository()
        self.medicamento_repository = MedicamentoRepository()
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.transferencia_service = TransferenciaService()

    # ---- leitura pública ----

    def listar_carrinhos(self, db: Session):
        return self.unidade_repository.list(db, tipo=TipoUnidadeEnum.carrinho)

    def listar_unidades(self, db: Session):
        return self.unidade_repository.list(db, tipo=TipoUnidadeEnum.unidade)

    def estoque_carrinho(self, db: Session, carrinho_id: int) -> list[dict]:
        carrinho = self.unidade_repository.get_by_id(db, carrinho_id)
        if carrinho is None or carrinho.tipo != TipoUnidadeEnum.carrinho:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrinho não encontrado.")

        lotes = self.lote_repository.listar(db, unidade_id=carrinho_id, apenas_disponivel=True, ordenar_fefo=False)

        totais: dict[int, dict] = {}
        for lote in lotes:
            agregado = totais.setdefault(
                lote.medicamento_id,
                {"medicamento_nome": lote.medicamento.nome, "quantidade_atual": 0, "e_controlado": lote.medicamento.e_controlado},
            )
            agregado["quantidade_atual"] += lote.quantidade_atual

        itens = [
            {"medicamento_id": medicamento_id, **dados}
            for medicamento_id, dados in totais.items()
        ]
        itens.sort(key=lambda i: i["medicamento_nome"])
        return itens

    # ---- criação pública ----

    def criar(self, db: Session, dados: RessuprimentoCarrinhoCreate) -> SolicitacaoRessuprimentoCarrinho:
        carrinho = self.unidade_repository.get_by_id(db, dados.carrinho_id)
        if carrinho is None or carrinho.tipo != TipoUnidadeEnum.carrinho:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Carrinho inválido.")

        unidade_destino = self.unidade_repository.get_by_id(db, dados.unidade_destino_id)
        if unidade_destino is None or unidade_destino.tipo != TipoUnidadeEnum.unidade:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Farmácia de destino inválida.")

        medicamentos = {}
        precisa_paciente = False
        for item in dados.itens:
            medicamento = self.medicamento_repository.get_by_id(db, item.medicamento_id)
            if medicamento is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Medicamento {item.medicamento_id} não encontrado.",
                )
            medicamentos[item.medicamento_id] = medicamento
            if medicamento.e_controlado:
                precisa_paciente = True

        if precisa_paciente and not (dados.paciente_nome and dados.paciente_prontuario):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Há medicamento controlado na lista — paciente e prontuário são obrigatórios.",
            )

        solicitacao = SolicitacaoRessuprimentoCarrinho(
            setor=dados.setor.strip(),
            carrinho_id=dados.carrinho_id,
            unidade_destino_id=dados.unidade_destino_id,
            paciente_nome=dados.paciente_nome.strip().upper() if dados.paciente_nome else None,
            paciente_prontuario=dados.paciente_prontuario.strip() if dados.paciente_prontuario else None,
        )
        solicitacao = self.repository.create(db, solicitacao)

        for item in dados.itens:
            self.repository.adicionar_item(
                db,
                SolicitacaoRessuprimentoCarrinhoItem(
                    solicitacao_id=solicitacao.id,
                    medicamento_id=item.medicamento_id,
                    quantidade_usada=item.quantidade_usada,
                ),
            )
        db.commit()
        db.refresh(solicitacao)

        return solicitacao

    # ---- leitura autenticada ----

    def listar_pendentes(self, db: Session, unidade_destino_id: int) -> list[SolicitacaoRessuprimentoCarrinho]:
        return self.repository.listar_pendentes_por_unidade(db, unidade_destino_id)

    # ---- cancelamento autenticado ----

    def cancelar(
        self, db: Session, unidade_ativa_id: int, solicitacao_id: int
    ) -> None:
        """Exclui um registro do formulário público (2026-09-01, pedido do
        cliente: setor pode ter enganado o carrinho/farmácia, ou duplicado
        o envio). Só permitido enquanto NENHUMA das duas ações foi
        confirmada ainda — depois disso já existe baixa/transferência real
        de estoque presa a esta solicitação, e apagar o cabeçalho deixaria
        essa trilha órfã."""
        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

        if solicitacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só a farmácia de destino desta solicitação pode cancelá-la.",
            )

        if (
            solicitacao.status_saida != StatusRessuprimentoCarrinhoEnum.pendente
            or solicitacao.status_transferencia != StatusRessuprimentoCarrinhoEnum.pendente
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível cancelar: já há uma confirmação registrada nesta solicitação.",
            )

        self.repository.deletar(db, solicitacao)

    # ---- confirmação autenticada ----

    def confirmar_saida(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        solicitacao_id: int,
        dados: ConfirmarSaidaCarrinhoCreate,
    ) -> SolicitacaoRessuprimentoCarrinho:
        """Baixa direto do estoque do CARRINHO (não da unidade ativa da
        sessão) — carrinho nunca é "unidade ativa" de ninguém, por isso
        não reaproveita `SaidaService.registrar` (que exige lote na
        própria unidade ativa). Quem confirma precisa estar logado na
        farmácia responsável (`unidade_destino_id` da solicitação)."""
        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

        if solicitacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só a farmácia de destino desta solicitação pode confirmar.",
            )

        if solicitacao.status_saida == StatusRessuprimentoCarrinhoEnum.confirmada:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Saída já confirmada.")

        for item in dados.itens:
            lote = self.lote_repository.get_by_id_for_update(db, item.lote_id)
            if lote is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado.")
            if lote.unidade_id != solicitacao.carrinho_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"O lote {lote.numero_lote or lote.id} não pertence ao carrinho desta solicitação.",
                )
            if item.quantidade > lote.quantidade_atual:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Quantidade ({item.quantidade}) maior que o saldo disponível "
                        f"no lote ({lote.quantidade_atual})."
                    ),
                )

            lote.quantidade_atual -= item.quantidade
            self.lote_repository.salvar(db, lote)

            db.add(
                Movimentacao(
                    tipo=TipoMovimentacaoEnum.saida,
                    lote_id=lote.id,
                    quantidade=item.quantidade,
                    unidade_origem_id=solicitacao.carrinho_id,
                    setor_consumidor=solicitacao.setor,
                    paciente_nome=solicitacao.paciente_nome,
                    paciente_prontuario=solicitacao.paciente_prontuario,
                    usuario_id=usuario.id,
                )
            )

        solicitacao.status_saida = StatusRessuprimentoCarrinhoEnum.confirmada
        solicitacao.usuario_confirmacao_saida_id = usuario.id
        solicitacao.data_confirmacao_saida = datetime.now(timezone.utc)

        return self.repository.salvar(db, solicitacao)

    def confirmar_transferencia(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        solicitacao_id: int,
        dados: ConfirmarTransferenciaCarrinhoCreate,
    ) -> SolicitacaoRessuprimentoCarrinho:
        """Reabastece o carrinho a partir do estoque da farmácia
        responsável — reaproveita `TransferenciaService.repor_carrinho`
        item a item (mesma validação de "só quem hospeda o carrinho pode
        repor ele", já generalizada além da CAF)."""
        solicitacao = self.repository.get_by_id_for_update(db, solicitacao_id)
        if solicitacao is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação não encontrada.")

        if solicitacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só a farmácia de destino desta solicitação pode confirmar.",
            )

        if solicitacao.status_transferencia == StatusRessuprimentoCarrinhoEnum.confirmada:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transferência já confirmada.")

        for item in dados.itens:
            self.transferencia_service.repor_carrinho(
                db,
                usuario,
                unidade_ativa_id,
                ReporCarrinhoCreate(
                    lote_id=item.lote_id,
                    quantidade=item.quantidade,
                    carrinho_destino_id=solicitacao.carrinho_id,
                ),
            )

        solicitacao.status_transferencia = StatusRessuprimentoCarrinhoEnum.confirmada
        solicitacao.usuario_confirmacao_transferencia_id = usuario.id
        solicitacao.data_confirmacao_transferencia = datetime.now(timezone.utc)

        return self.repository.salvar(db, solicitacao)
