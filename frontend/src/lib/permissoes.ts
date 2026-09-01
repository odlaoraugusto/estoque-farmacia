import type { PermissaoPerfil, UsuarioMe } from '../types';

/** Entrada só ocorre na unidade CAF (docs/00_PROJETO.md seção 3, validado
 * também no backend em EntradaService, comparação case-insensitive). */
export function unidadeEhCaf(usuario: UsuarioMe | null): boolean {
  return (usuario?.unidade_ativa_nome ?? '').trim().toUpperCase() === 'CAF';
}

/** Resolve uma chave da matriz configurável (tela Permissões, exclusiva do
 * Admin) para o perfil do usuário logado. Coordenador e Admin são
 * superusuários implícitos — sempre `true`, nunca consultam a matriz
 * (mesma regra do backend, ver app/api/deps.py::exigir_permissao).
 * Farmacêutico/Atendente dependem da linha correspondente; se a matriz
 * ainda não carregou (`null`) ou não tem linha pro perfil, fica `false`
 * por padrão — nunca libera por engano enquanto a chamada a GET
 * /permissoes não voltou. */
function temPermissao(
  usuario: UsuarioMe | null,
  matriz: PermissaoPerfil[] | null,
  chave: keyof Omit<PermissaoPerfil, 'perfil'>,
): boolean {
  const perfil = usuario?.perfil;
  if (perfil === 'coordenador' || perfil === 'admin') return true;
  if (!perfil || !matriz) return false;

  const linha = matriz.find((p) => p.perfil === perfil);
  return linha?.[chave] === true;
}

/** Espelha as regras de perfil já aplicadas pela API (routers + services em
 * app/api/routes e app/api/deps.py) — não reinventa a matriz, só reage a
 * ela (e à matriz configurável de `/permissoes`) no frontend para decidir
 * o que mostrar/esconder. A validação de verdade continua no backend. */
export function permissoesDe(usuario: UsuarioMe | null, matriz: PermissaoPerfil[] | null) {
  const perfil = usuario?.perfil;

  // Admin global (2026-08-27): só configura o sistema (Usuários,
  // Permissões) — nunca opera estoque/medicamento, não seleciona unidade
  // (ver AuthContext.tsx). Usado abaixo pra tirar esse perfil das telas
  // operacionais que, de outra forma, seriam `true` pra "qualquer perfil
  // autenticado".
  const admin = perfil === 'admin';

  const relatoriosFinanceiro = temPermissao(usuario, matriz, 'relatorios_financeiro');

  return {
    // Entrada (2026-08-31: controlado pela matriz, chave `entrada`) — e
    // só quando a unidade ativa é a CAF (regra estrutural, não muda com
    // a matriz).
    entrada: temPermissao(usuario, matriz, 'entrada') && unidadeEhCaf(usuario),

    // Transferência — enviar (2026-08-31: controlado pela matriz, chave
    // `transferencia_enviar`). Confirmar já era liberado a todos os
    // perfis (regra 4 do doc / _confirmar_transferencia em
    // transferencias.py) e continua sendo, sem entrar na matriz.
    transferenciaEnviar: temPermissao(usuario, matriz, 'transferencia_enviar'),

    // Saída/dispensação — qualquer perfil autenticado, exceto Admin (só
    // configura, não opera estoque). Não entra na matriz — é o "básico"
    // liberado a qualquer login, igual ver estoque/vencimentos.
    saida: !admin,

    // Empréstimo/Doação/Permuta (2026-08-20) — aba própria, separada da
    // dispensação normal; mesma regra de acesso da Saída normal (é a
    // mesma rota POST /saidas por trás), com a mesma exceção do Admin.
    saidaExterna: !admin,

    // Telas sem tela própria de permissão (Estoque atual, Transferência,
    // Relatórios) hoje aparecem pra "qualquer perfil autenticado" no
    // menu — Admin é a exceção: não vê nenhuma delas, só Usuários/Permissões.
    telasOperacionais: !admin,

    // Relatórios financeiros (2026-08-31: controlado pela matriz, chave
    // `relatorios_financeiro`) — vencimentos-próximos é liberado a todos
    // à parte, sem entrar aqui.
    relatoriosFinanceiro,
    relatoriosAuditoria: perfil === 'coordenador',

    // Consolidado multi-unidade nos relatórios/estoque — continua fixo em
    // Farmacêutico/Coordenador (NÃO entrou na matriz, 2026-08-31: decisão
    // deliberada — mesmo que o Admin libere `relatorios_financeiro` pro
    // Atendente, ele continua restrito à própria unidade ativa, nunca
    // passa a enxergar o hospital inteiro; espelha
    // `resolver_unidade_escopo` em app/api/deps.py, que também ficou
    // hardcoded de propósito).
    consolidadoTodasUnidades: perfil === 'farmaceutico' || perfil === 'coordenador',

    // Cadastro de medicamentos (2026-08-31: controlado pela matriz, chave
    // `medicamentos`).
    medicamentos: temPermissao(usuario, matriz, 'medicamentos'),

    // Reposição de carrinho de emergência (2026-08-31: controlado pela
    // matriz, chave `reposicao_carrinho`) — a partir de QUALQUER unidade
    // real que seja "pai" de algum carrinho (2026-08-31: antes só a CAF
    // podia repor; agora cada satélite repõe os carrinhos dela mesma,
    // com o próprio estoque — a tela filtra pra só mostrar os carrinhos
    // filhos da unidade ativa; o backend também garante isso).
    reporCarrinho: temPermissao(usuario, matriz, 'reposicao_carrinho'),

    // Devolução de carrinho -> CAF (seção 22 do doc) — mesma chave da
    // reposição (2026-08-31), mas SEM restrição de unidade: qualquer
    // unidade real pode ter carrinhos filhos com saldo pra devolver,
    // diferente da reposição que exige CAF como origem.
    devolverCarrinho: temPermissao(usuario, matriz, 'reposicao_carrinho'),

    // Devolução de MEDICAMENTO (2026-09-01, pedido do cliente) — não
    // confundir com devolverCarrinho acima (conceito diferente: aqui é
    // um setor devolvendo item físico à farmácia, virando lote novo).
    // Liberada a qualquer perfil autenticado não-Admin, em QUALQUER
    // unidade (não exclusiva da CAF, diferente de `entrada`) — mesmo
    // grupo básico de `saida`/`saidaExterna`/`telasOperacionais`, NÃO
    // entra na matriz configurável (decisão explícita do cliente: não
    // depende do Admin liberar nada).
    devolucaoMedicamento: !admin,

    // Solicitação de transferência satélite -> CAF (2026-08-20) —
    // qualquer perfil da unidade solicitante pode pedir (mesma lógica de
    // quem já registra Saída/confirma recebimento); não entra na matriz —
    // só não faz sentido a própria CAF se autossolicitar (ver
    // SolicitacaoService.criar).
    solicitarTransferencia: !unidadeEhCaf(usuario),

    // Atender (aceitar/recusar) solicitação — mesma chave de
    // transferenciaEnviar (2026-08-31: aceitar dispara `enviar()` por
    // baixo dos panos, ver app/api/routes/solicitacoes.py, _PODE_ATENDER),
    // e só na CAF (regra estrutural).
    atenderSolicitacao: temPermissao(usuario, matriz, 'transferencia_enviar') && unidadeEhCaf(usuario),

    // Ajuste de estoque — quantidade (2026-08-31: controlado pela matriz,
    // chave `ajustar_estoque`). Corrige saldo fora dos fluxos normais
    // (ex.: divergência de contagem física).
    ajustarEstoque: temPermissao(usuario, matriz, 'ajustar_estoque'),

    // Correção de valor unitário — financeiro/fiscal (2026-08-31:
    // controlado pela matriz, chave SEPARADA `corrigir_valor_unitario` —
    // o Admin decide as duas independentemente).
    corrigirValorUnitario: temPermissao(usuario, matriz, 'corrigir_valor_unitario'),

    // Notificação de atividade recente ao Coordenador (2026-08-19) —
    // descartes, ajustes e saídas de empréstimo/doação, com quem fez.
    // Substitui a antiga autorização prévia de Descarte: a supervisão
    // agora é depois do fato, não mais travando antes. Exclusiva do
    // Coordenador (é vigilância, não uma ação operacional — NÃO entra na
    // matriz).
    notificacaoAtividade: perfil === 'coordenador',

    // Gestão de usuários (2026-08-20) — Coordenador; Admin (2026-08-27)
    // também, é uma das duas telas que esse perfil usa (a outra é
    // Permissões). Ação administrativa mais sensível do sistema (controla
    // quem tem acesso a tudo o mais) — NÃO entra na matriz configurável.
    gestaoUsuarios: perfil === 'coordenador' || admin,

    // Gerenciar permissões (2026-08-31) — exclusivo do Admin, nunca
    // configurável (não faria sentido o Admin se autolimitar via uma
    // matriz que ele mesmo edita).
    gerenciarPermissoes: admin,

    // Configurar pontos de ressuprimento (quantidade padrão/mínima por
    // medicamento e unidade satélite, 2026-08-31, pedido do cliente) —
    // fixo em Farmacêutico/Coordenador, igual gestão de usuários, NÃO
    // entra na matriz configurável. A notificação de "precisa
    // ressuprir" em si é liberada a qualquer perfil (ver
    // ResuprimentoPage.tsx) — só a configuração dos pontos é restrita.
    configurarRessuprimento: perfil === 'farmaceutico' || perfil === 'coordenador',

    // Notificação de estoque crítico/vencendo ao logar (2026-08-15,
    // pedido do cliente) — mesma chave de relatoriosFinanceiro
    // (2026-08-31: o endpoint /relatorios/estoque-critico usa a mesma
    // `_PODE_VER_FINANCEIRO` configurável).
    notificacaoEstoqueCritico: relatoriosFinanceiro,

    // Dados de paciente/prontuário (seção 22 do doc, LGPD) — Farmacêutico
    // e Coordenador só, espelha PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE em
    // app/core/permissoes.py. NÃO entra na matriz configurável de
    // propósito (2026-08-31): abrir isso pro Admin liberar via toggle
    // seria uma brecha de LGPD, não uma decisão operacional do dia a dia
    // — mesmo raciocínio dos relatórios de antimicrobianos/controlados no
    // backend (_PODE_VER_FINANCEIRO_PACIENTE, hardcoded).
    verDadosPaciente: perfil === 'farmaceutico' || perfil === 'coordenador',
  };
}

export type Permissoes = ReturnType<typeof permissoesDe>;
