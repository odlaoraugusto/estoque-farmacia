from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import (
    StatusTransferenciaEnum,
    TipoMovimentacaoEnum,
    TipoUnidadeEnum,
)
from app.models.lote import Lote
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.repositories.unidade_repository import UnidadeRepository
from app.schemas.movimentacao import (
    DevolverCarrinhoCreate,
    ReporCarrinhoCreate,
    TransferenciaConfirmarCreate,
    TransferenciaEnviarCreate,
)
from app.schemas.usuario import UsuarioMe

# Mesmo padrão de checagem usado em app/services/entrada_service.py
# (regra "Entrada só ocorre na CAF") — reposição de carrinho também só sai
# da CAF.
NOME_UNIDADE_CAF = "CAF"


class TransferenciaService:

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.unidade_repository = UnidadeRepository()

    def enviar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: TransferenciaEnviarCreate,
    ) -> Movimentacao:
        """Regra 3: só farmacêutico/coordenador (checado no router), a
        unidade de origem é sempre a unidade ativa da sessão — nunca um
        campo vindo do corpo da requisição."""
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if lote.unidade_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão.",
            )

        if dados.unidade_destino_id == unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A unidade de destino deve ser diferente da unidade de origem.",
            )

        destino = self.unidade_repository.get_by_id(db, dados.unidade_destino_id)
        if destino is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unidade de destino não encontrada.",
            )

        if destino.tipo != TipoUnidadeEnum.unidade:
            # Regra 5 dos carrinhos: carrinho nunca é destino de
            # Transferência normal (só do fluxo dedicado de reposição
            # CAF -> carrinho, `repor_carrinho`) — carrinho não tem sessão
            # própria para confirmar o recebimento, então uma transferência
            # normal para lá ficaria pendente para sempre.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Carrinho de emergência não é um destino válido para "
                "Transferência normal — use a reposição de carrinho "
                "(POST /transferencias/repor-carrinho).",
            )

        if dados.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote.quantidade_atual})."
                ),
            )

        lote.quantidade_atual -= dados.quantidade
        lote.status_transferencia = StatusTransferenciaEnum.em_transito
        lote = self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.transferencia,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            unidade_destino_id=destino.id,
            usuario_id=usuario.id,
        )

        return self.movimentacao_repository.create(db, movimentacao)

    def confirmar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        movimentacao_id: int,
        dados: TransferenciaConfirmarCreate,
    ) -> Movimentacao:
        """Regra 4: qualquer perfil (incluindo atendente) na unidade de
        destino. Cria um NOVO lote no destino; a quantidade recebida pode
        divergir da enviada sem bloquear — só registra a divergência."""
        movimentacao = self.movimentacao_repository.get_by_id_for_update(
            db, movimentacao_id
        )

        if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.transferencia:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transferência não encontrada.",
            )

        if movimentacao.quantidade_recebida is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esta transferência já foi confirmada.",
            )

        if movimentacao.unidade_destino_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Confirmação de recebimento só pode ser feita pela unidade de destino.",
            )

        lote_origem = self.lote_repository.get_by_id_for_update(db, movimentacao.lote_id)
        if lote_origem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lote de origem não encontrado.",
            )

        novo_lote = Lote(
            medicamento_id=lote_origem.medicamento_id,
            unidade_id=unidade_ativa_id,
            numero_lote=lote_origem.numero_lote,
            data_validade=lote_origem.data_validade,
            quantidade_atual=dados.quantidade_recebida,
            valor_unitario=lote_origem.valor_unitario,
            origem=lote_origem.origem,
            # Copiar do lote pai — não só o que a seção 6 do doc lista
            # explicitamente. Faltar `numero_nota_fiscal` aqui viola
            # `ck_lotes_nota_fiscal_obrigatoria_compra` sempre que
            # origem=compra (achado em revisão 2026-08-01: confirmar
            # recebimento de qualquer transferência de lote comprado
            # dava 500).
            numero_nota_fiscal=lote_origem.numero_nota_fiscal,
            numero_afm=lote_origem.numero_afm,
            usuario_entrada_id=usuario.id,
            lote_origem_id=lote_origem.id,
        )
        self.lote_repository.create(db, novo_lote)

        lote_origem.status_transferencia = StatusTransferenciaEnum.recebido
        self.lote_repository.salvar(db, lote_origem)

        movimentacao.quantidade_recebida = dados.quantidade_recebida
        movimentacao.usuario_confirmacao_id = usuario.id
        movimentacao.data_confirmacao = datetime.now(timezone.utc)

        return self.movimentacao_repository.salvar(db, movimentacao)

    def listar_pendentes(self, db: Session, unidade_destino_id: int | None):
        return self.movimentacao_repository.listar_transferencias_pendentes(
            db, unidade_destino_id
        )

    def repor_carrinho(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: ReporCarrinhoCreate,
    ) -> Movimentacao:
        """Reposição de carrinho de emergência (regras 1/2 dos carrinhos):
        só a CAF pode repor, só farmacêutico (checado no router), e é um
        fluxo de UMA ETAPA SÓ — o estoque já entra "recebido" no carrinho
        destino no mesmo ato, sem confirmação separada. Caminho dedicado,
        deliberadamente à parte de `enviar`/`confirmar` (que têm a
        semântica de duas etapas da Transferência normal)."""
        unidade_ativa = self.unidade_repository.get_by_id(db, unidade_ativa_id)

        if unidade_ativa is None or unidade_ativa.nome.strip().upper() != NOME_UNIDADE_CAF:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reposição de carrinho só pode ser feita a partir da unidade CAF.",
            )

        carrinho = self.unidade_repository.get_by_id(db, dados.carrinho_destino_id)
        if carrinho is None or carrinho.tipo != TipoUnidadeEnum.carrinho:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Carrinho de destino inválido — informe um carrinho de emergência existente.",
            )

        lote_origem = self.lote_repository.get_by_id_for_update(db, dados.lote_id)
        if lote_origem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if lote_origem.unidade_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa (CAF).",
            )

        if dados.quantidade > lote_origem.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote_origem.quantidade_atual})."
                ),
            )

        lote_origem.quantidade_atual -= dados.quantidade
        lote_origem.status_transferencia = StatusTransferenciaEnum.recebido
        self.lote_repository.salvar(db, lote_origem)

        novo_lote = Lote(
            medicamento_id=lote_origem.medicamento_id,
            unidade_id=carrinho.id,
            numero_lote=lote_origem.numero_lote,
            data_validade=lote_origem.data_validade,
            quantidade_atual=dados.quantidade,
            valor_unitario=lote_origem.valor_unitario,
            origem=lote_origem.origem,
            numero_nota_fiscal=lote_origem.numero_nota_fiscal,
            numero_afm=lote_origem.numero_afm,
            usuario_entrada_id=usuario.id,
            lote_origem_id=lote_origem.id,
        )
        self.lote_repository.create(db, novo_lote)

        agora = datetime.now(timezone.utc)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.transferencia,
            lote_id=lote_origem.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            unidade_destino_id=carrinho.id,
            # Já nasce confirmada — fluxo de uma etapa só (regra 2).
            quantidade_recebida=dados.quantidade,
            usuario_id=usuario.id,
            usuario_confirmacao_id=usuario.id,
            data_confirmacao=agora,
        )

        return self.movimentacao_repository.create(db, movimentacao)

    def devolver_carrinho(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: DevolverCarrinhoCreate,
    ) -> Movimentacao:
        """Devolução de carrinho de emergência -> CAF (seção 22 do doc):
        espelho de `repor_carrinho`, só que ao contrário e em DUAS
        ETAPAS (diferente da reposição, que é uma etapa só) — a CAF
        confere o que está voltando antes de aceitar de volta no
        estoque central, então esta etapa só envia; a confirmação
        reaproveita `confirmar()` sem alteração nenhuma (o destino
        sendo CAF é só mais uma unidade normal de sessão).

        Só farmacêutico (checado no router, igual reposição — Coordenador
        não devolve). O farmacêutico logado na unidade real só pode
        devolver lotes de carrinhos que são FILHOS dela — não pode
        devolver o carrinho de outra unidade só por saber o `lote_id`."""
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        carrinho = lote.unidade
        if carrinho.tipo != TipoUnidadeEnum.carrinho:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote informado não está em um carrinho de emergência.",
            )

        if carrinho.unidade_pai_id != unidade_ativa_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este carrinho não pertence à unidade ativa da sessão — "
                "só é possível devolver lotes de carrinhos filhos da "
                "própria unidade.",
            )

        if dados.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote.quantidade_atual})."
                ),
            )

        caf = self.unidade_repository.get_by_nome(db, NOME_UNIDADE_CAF)
        if caf is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unidade CAF não está cadastrada — devolução indisponível.",
            )

        lote.quantidade_atual -= dados.quantidade
        lote.status_transferencia = StatusTransferenciaEnum.em_transito
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.transferencia,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            # Decisão: `unidade_origem_id` aponta para o CARRINHO (e não
            # para a unidade real "pai"). Motivo: mantém o mesmo
            # invariante já usado em `enviar()`/`repor_carrinho()` — a
            # origem de uma transferência é sempre o id da unidade dona
            # do lote no momento do decremento, e aqui quem realmente
            # perde o estoque é o carrinho, não a unidade real. Carrinho
            # é uma linha normal de `unidades` (a FK aceita) e a trilha
            # de auditoria fica mais precisa: dá pra saber de qual
            # carrinho específico o item voltou, não só de qual unidade.
            unidade_origem_id=carrinho.id,
            unidade_destino_id=caf.id,
            usuario_id=usuario.id,
            # quantidade_recebida fica None — pendente. Fica visível em
            # GET /transferencias/pendentes para quem estiver logado na
            # CAF, e é fechada por POST /transferencias/{id}/confirmar
            # (endpoint já existente, sem alteração).
        )

        return self.movimentacao_repository.create(db, movimentacao)
