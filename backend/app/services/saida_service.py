from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import CategoriaSaidaEnum, TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import CorrigirPacienteSaidaCreate, CorrigirSetorSaidaCreate, SaidaCreate
from app.schemas.usuario import UsuarioMe
from app.services.paciente_service import PacienteService


class SaidaService:
    """Regra 5: qualquer perfil pode dispensar, desde que o lote esteja
    exatamente na unidade ativa da sessão. Nunca permite saldo negativo.

    Carrinho de emergência é estoque À PARTE da unidade "pai" que o
    hospeda (2026-08-31, pedido do cliente: desvincular de vez — antes
    quem estava logado na unidade real dispensava também o que estivesse
    num carrinho filho dela, o que misturava indevidamente os dois
    estoques). Um carrinho nunca é "unidade ativa" de sessão (não existe
    login nele), então o estoque de um carrinho só é alcançado pelos
    fluxos dedicados — Reposição (CAF -> carrinho) e Devolução
    (carrinho -> CAF), nunca por Saída/Dispensação comum.

    Paciente/prontuário (seção 22 do doc): campo adicional opcional,
    aceito de qualquer perfil (inclusive Atendente — ele está
    registrando a própria dispensação, a restrição de visibilidade do
    dado é só de leitura depois, ver `app/schemas/movimentacao.py`)."""

    def __init__(self):
        self.lote_repository = LoteRepository()
        self.movimentacao_repository = MovimentacaoRepository()
        self.paciente_service = PacienteService()

    @staticmethod
    def _lote_no_escopo_da_unidade(lote, unidade_ativa_id: int) -> bool:
        return lote.unidade_id == unidade_ativa_id

    def registrar(
        self,
        db: Session,
        usuario: UsuarioMe,
        unidade_ativa_id: int,
        dados: SaidaCreate,
    ) -> Movimentacao:
        lote = self.lote_repository.get_by_id_for_update(db, dados.lote_id)

        if lote is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Lote não encontrado."
            )

        if not self._lote_no_escopo_da_unidade(lote, unidade_ativa_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lote não pertence à unidade ativa da sessão.",
            )

        # Obrigatoriedade de setor_consumidor (exceto vencimento) já é
        # validada no schema, ver SaidaCreate.validar_setor_consumidor.

        if dados.quantidade > lote.quantidade_atual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Quantidade solicitada ({dados.quantidade}) maior que o "
                    f"saldo disponível no lote ({lote.quantidade_atual})."
                ),
            )

        # Vigilância de uso por paciente — antimicrobiano (DOT, 2026-08-19)
        # e controlado (2026-08-20, mesma regra): sem paciente/prontuário
        # não dá pra rastrear por paciente, então aqui a regra geral de
        # "opcional" não vale — checagem no service (não no schema)
        # porque só aqui já temos o medicamento do lote carregado.
        if (lote.medicamento.e_antimicrobiano or lote.medicamento.e_controlado) and not (
            dados.paciente_prontuario and dados.paciente_nome
        ):
            classe = "antimicrobiano" if lote.medicamento.e_antimicrobiano else "controlado"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{lote.medicamento.nome} é {classe} — paciente e "
                    "prontuário são obrigatórios nesta saída."
                ),
            )

        lote.quantidade_atual -= dados.quantidade
        self.lote_repository.salvar(db, lote)

        movimentacao = Movimentacao(
            tipo=TipoMovimentacaoEnum.saida,
            lote_id=lote.id,
            quantidade=dados.quantidade,
            unidade_origem_id=unidade_ativa_id,
            setor_consumidor=dados.setor_consumidor.strip() if dados.setor_consumidor else None,
            categoria_saida=dados.categoria,
            destino_externo=dados.destino_externo.strip() if dados.destino_externo else None,
            destinatario=dados.destinatario.strip() if dados.destinatario else None,
            usuario_id=usuario.id,
        )

        # Autopreenchimento por prontuário (seção 22 do doc): resolve
        # ANTES de criar a movimentação, para gravar sempre o nome
        # "oficial" (já cadastrado ou recém-criado), nunca o que veio
        # solto no corpo da requisição — ver decisão em
        # `PacienteService.resolver_para_saida` sobre nome divergente.
        if dados.paciente_prontuario and dados.paciente_nome:
            prontuario, nome = self.paciente_service.resolver_para_saida(
                db, dados.paciente_prontuario, dados.paciente_nome
            )
            movimentacao.paciente_prontuario = prontuario
            movimentacao.paciente_nome = nome

        return self.movimentacao_repository.create(db, movimentacao)

    def corrigir_setor(
        self,
        db: Session,
        usuario: UsuarioMe,
        movimentacao_id: int,
        dados: CorrigirSetorSaidaCreate,
    ) -> Movimentacao:
        """Corrigir o setor consumidor de uma Saída já registrada
        (2026-09-01, pedido do cliente: "conferir e corrigir o que fez")
        — SELF-SERVICE: só quem registrou a saída pode corrigir, qualquer
        perfil (checagem de autoria abaixo, não passa pela matriz de
        permissões nem pelo escopo de unidade)."""
        movimentacao = self.movimentacao_repository.get_by_id_for_update(db, movimentacao_id)

        if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.saida:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Saída não encontrada."
            )

        if movimentacao.usuario_id != usuario.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só quem registrou esta saída pode corrigi-la.",
            )

        if movimentacao.categoria_saida == CategoriaSaidaEnum.vencimento:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Baixa por vencimento não tem setor consumidor.",
            )

        setor_antigo = movimentacao.setor_consumidor
        novo = dados.setor_consumidor.strip()
        if novo == setor_antigo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Setor informado já é o atual — nada para corrigir.",
            )

        movimentacao.setor_consumidor = novo
        self.movimentacao_repository.salvar(db, movimentacao)

        correcao = Movimentacao(
            tipo=TipoMovimentacaoEnum.correcao_valor,
            lote_id=movimentacao.lote_id,
            quantidade=0,
            unidade_origem_id=movimentacao.unidade_origem_id,
            motivo_ajuste=(
                f"Correção da saída #{movimentacao.id}: setor consumidor "
                f"{setor_antigo or '—'} -> {novo}. {dados.motivo.strip()}"
            ),
            usuario_id=usuario.id,
        )
        self.movimentacao_repository.create(db, correcao)

        return movimentacao

    def obter_para_comprovante(self, db: Session, movimentacao_ids: list[int]) -> list[Movimentacao]:
        """Pra imprimir o comprovante do que acabou de ser registrado
        (2026-09-02, pedido do cliente: controle de Empréstimo/Doação/
        Permuta) — o front acumula os ids devolvidos por cada `POST
        /saidas` da lista (uma remessa pode ter vários medicamentos, cada
        um sua própria Movimentacao) e manda todos juntos aqui."""
        if not movimentacao_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ao menos um id de saída."
            )

        movimentacoes = []
        for movimentacao_id in movimentacao_ids:
            movimentacao = self.movimentacao_repository.get_by_id(db, movimentacao_id)
            if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.saida:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Saída #{movimentacao_id} não encontrada.",
                )
            movimentacoes.append(movimentacao)

        return movimentacoes

    def corrigir_paciente(
        self,
        db: Session,
        usuario: UsuarioMe,
        movimentacao_id: int,
        dados: CorrigirPacienteSaidaCreate,
    ) -> Movimentacao:
        """Corrigir paciente/prontuário de uma Saída já registrada
        (2026-09-01, pedido do cliente) — mesma regra de `corrigir_setor`
        (self-service, só quem registrou). NÃO usa `PacienteService.
        resolver_para_saida` de propósito: aquele método, ao achar um
        prontuário já cadastrado, ignora o nome novo e devolve o nome
        antigo (regra pensada pra Saída normal, onde o prontuário já
        identifica o paciente) — aqui é o oposto, o usuário está dizendo
        que o nome/prontuário registrados estavam ERRADOS, então grava
        exatamente o que foi corrigido nesta Saída, sem tocar no cadastro
        compartilhado de `pacientes` (outras Saídas do mesmo prontuário
        não são afetadas)."""
        movimentacao = self.movimentacao_repository.get_by_id_for_update(db, movimentacao_id)

        if movimentacao is None or movimentacao.tipo != TipoMovimentacaoEnum.saida:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Saída não encontrada."
            )

        if movimentacao.usuario_id != usuario.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Só quem registrou esta saída pode corrigi-la.",
            )

        novo_prontuario = dados.paciente_prontuario.strip()
        novo_nome = dados.paciente_nome.strip().upper()

        if novo_prontuario == movimentacao.paciente_prontuario and novo_nome == movimentacao.paciente_nome:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Paciente/prontuário informados já são os atuais — nada para corrigir.",
            )

        movimentacao.paciente_prontuario = novo_prontuario
        movimentacao.paciente_nome = novo_nome
        self.movimentacao_repository.salvar(db, movimentacao)

        # Nunca embutir nome/prontuário de paciente no texto livre da
        # correção (motivo_ajuste não passa pela redação de
        # `visivel_para` — vazaria dado de paciente pra quem não tem
        # acesso, ver MovimentacaoOut.visivel_para).
        correcao = Movimentacao(
            tipo=TipoMovimentacaoEnum.correcao_valor,
            lote_id=movimentacao.lote_id,
            quantidade=0,
            unidade_origem_id=movimentacao.unidade_origem_id,
            motivo_ajuste=(
                f"Correção da saída #{movimentacao.id}: paciente/prontuário "
                f"atualizados. {dados.motivo.strip()}"
            ),
            usuario_id=usuario.id,
        )
        self.movimentacao_repository.create(db, correcao)

        return movimentacao
