import type { UsuarioMe } from '../types';

/** Entrada só ocorre na unidade CAF (docs/00_PROJETO.md seção 3, validado
 * também no backend em EntradaService, comparação case-insensitive). */
export function unidadeEhCaf(usuario: UsuarioMe | null): boolean {
  return (usuario?.unidade_ativa_nome ?? '').trim().toUpperCase() === 'CAF';
}

/** Espelha exatamente as regras de perfil já aplicadas pela API (routers +
 * services em app/api/routes e app/api/deps.py) — não reinventa a matriz,
 * só reage a ela no frontend para decidir o que mostrar/esconder. */
export function permissoesDe(usuario: UsuarioMe | null) {
  const perfil = usuario?.perfil;
  const farmaceuticoOuCoordenador = perfil === 'farmaceutico' || perfil === 'coordenador';

  return {
    // Entrada — só farmacêutico/coordenador, e só quando a unidade ativa é a CAF.
    entrada: farmaceuticoOuCoordenador && unidadeEhCaf(usuario),

    // Transferência — enviar é restrito; confirmar é liberado a todos os
    // perfis (regra 4 do doc / _confirmar_transferencia em transferencias.py),
    // por isso a tela em si fica visível a todos.
    transferenciaEnviar: farmaceuticoOuCoordenador,

    // Saída/dispensação — qualquer perfil autenticado.
    saida: true,

    // Descarte — ação direta desde 2026-08-19 (era fluxo de 2 etapas
    // solicitar/aprovar), Farmacêutico e Coordenador têm o mesmo acesso.
    // A tela some inteira só para o Atendente.
    descarte: farmaceuticoOuCoordenador,

    // Relatórios — vencimentos-próximos é liberado a todos; os demais têm
    // regras próprias por aba.
    relatoriosFinanceiro: farmaceuticoOuCoordenador,
    relatoriosAuditoria: perfil === 'coordenador',

    // Consolidado multi-unidade nos relatórios/estoque — Farmacêutico e
    // Coordenador (2026-08-19, ampliado; era só Coordenador). Atendente
    // continua restrito à própria unidade ativa.
    consolidadoTodasUnidades: farmaceuticoOuCoordenador,

    // Cadastro de medicamentos — Farmacêutico cadastra sozinho, sem
    // aprovação; Coordenador também tem acesso completo; Atendente sem
    // acesso (docs/00_PROJETO.md seção 9, ver app/api/routes/medicamentos.py).
    medicamentos: farmaceuticoOuCoordenador,

    // Reposição de carrinho de emergência — Farmacêutico e Coordenador
    // (2026-08-19, ampliado; era só Farmacêutico) e só a partir da
    // unidade CAF (regras 1/2 dos carrinhos, ver app/api/routes/
    // transferencias.py, _PODE_REPOR_CARRINHO).
    reporCarrinho: farmaceuticoOuCoordenador && unidadeEhCaf(usuario),

    // Devolução de carrinho -> CAF (seção 22 do doc) — mesma ampliação da
    // reposição (2026-08-19), mas SEM restrição de unidade: qualquer
    // unidade real pode ter carrinhos filhos com saldo pra devolver,
    // diferente da reposição que exige CAF como origem (ver
    // _PODE_DEVOLVER_CARRINHO em app/api/routes/transferencias.py).
    devolverCarrinho: farmaceuticoOuCoordenador,

    // Ajuste de estoque (2026-08-14) — Farmacêutico e Coordenador desde
    // 2026-08-19 (era exclusivo do Coordenador). Corrige saldo fora dos
    // fluxos normais (ex.: divergência de contagem física); ver
    // app/api/routes/ajustes.py.
    ajustarEstoque: farmaceuticoOuCoordenador,

    // Notificação de atividade recente ao Coordenador (2026-08-19) —
    // descartes, ajustes e saídas de empréstimo/doação, com quem fez.
    // Substitui a antiga autorização prévia de Descarte: a supervisão
    // agora é depois do fato, não mais travando antes. Exclusiva do
    // Coordenador (é vigilância, não uma ação operacional).
    notificacaoAtividade: perfil === 'coordenador',

    // Notificação de estoque crítico/vencendo ao logar (2026-08-15,
    // pedido do cliente) — mesmo par de perfis que já vê financeiro
    // (ver app/api/routes/relatorios.py, _PODE_VER_FINANCEIRO), mas é
    // uma regra própria (o dado em si não é financeiro) por isso fica
    // com nome dedicado em vez de reaproveitar `relatoriosFinanceiro`.
    notificacaoEstoqueCritico: farmaceuticoOuCoordenador,

    // Dados de paciente/prontuário (seção 22 do doc, LGPD) — Farmacêutico
    // e Coordenador só, espelha PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE em
    // app/core/permissoes.py. Usado para decidir se a tela de Saída tenta
    // o autopreenchimento por GET /pacientes/{prontuario} (Atendente
    // nunca deve chamar essa rota — daria 403 sempre).
    verDadosPaciente: farmaceuticoOuCoordenador,
  };
}

export type Permissoes = ReturnType<typeof permissoesDe>;
