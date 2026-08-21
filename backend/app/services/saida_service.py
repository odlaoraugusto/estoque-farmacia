from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import TipoMovimentacaoEnum
from app.models.movimentacao import Movimentacao
from app.repositories.lote_repository import LoteRepository
from app.repositories.movimentacao_repository import MovimentacaoRepository
from app.schemas.movimentacao import SaidaCreate
from app.schemas.usuario import UsuarioMe
from app.services.paciente_service import PacienteService


class SaidaService:
    """Regra 5: qualquer perfil pode dispensar, desde que o lote esteja na
    unidade ativa da sessão OU num carrinho de emergência filho dela
    (2026-08-13 — carrinhos são local de estoque sem acesso de sessão
    próprio, então quem está logado na unidade real "pai" dispensa por
    eles). Nunca permite saldo negativo.

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
        return (
            lote.unidade_id == unidade_ativa_id
            or lote.unidade.unidade_pai_id == unidade_ativa_id
        )

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
                detail="O lote não pertence à unidade ativa da sessão "
                "nem a um carrinho de emergência dela.",
            )

        if not dados.setor_consumidor or not dados.setor_consumidor.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Setor consumidor é obrigatório.",
            )

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
            setor_consumidor=dados.setor_consumidor.strip(),
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
