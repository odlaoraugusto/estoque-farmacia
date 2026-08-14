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

    // Descarte — solicitar é exclusivo do Farmacêutico (nem o Coordenador
    // solicita, só aprova/rejeita — ver descartes.py); aprovar é exclusivo
    // do Coordenador. A tela some inteira só para o Atendente.
    descarteSolicitar: perfil === 'farmaceutico',
    descarteAprovar: perfil === 'coordenador',

    // Relatórios — vencimentos-próximos é liberado a todos; os demais têm
    // regras próprias por aba.
    relatoriosFinanceiro: farmaceuticoOuCoordenador,
    relatoriosAuditoria: perfil === 'coordenador',

    // Consolidado multi-unidade nos relatórios/estoque — só Coordenador.
    consolidadoTodasUnidades: perfil === 'coordenador',

    // Cadastro de medicamentos — Farmacêutico cadastra sozinho, sem
    // aprovação; Coordenador também tem acesso completo; Atendente sem
    // acesso (docs/00_PROJETO.md seção 9, ver app/api/routes/medicamentos.py).
    medicamentos: farmaceuticoOuCoordenador,

    // Reposição de carrinho de emergência — exclusiva do Farmacêutico
    // (Coordenador NÃO repõe carrinho, diferente do envio de Transferência
    // normal) e só a partir da unidade CAF (regras 1/2 dos carrinhos,
    // ver app/api/routes/transferencias.py, _PODE_REPOR_CARRINHO).
    reporCarrinho: perfil === 'farmaceutico' && unidadeEhCaf(usuario),

    // Devolução de carrinho -> CAF (seção 22 do doc) — mesma exclusividade
    // da reposição (só Farmacêutico, Coordenador não devolve), mas SEM
    // restrição de unidade: qualquer unidade real pode ter carrinhos
    // filhos com saldo pra devolver, diferente da reposição que exige CAF
    // como origem (ver _PODE_DEVOLVER_CARRINHO em
    // app/api/routes/transferencias.py).
    devolverCarrinho: perfil === 'farmaceutico',

    // Dados de paciente/prontuário (seção 22 do doc, LGPD) — Farmacêutico
    // e Coordenador só, espelha PERFIS_COM_ACESSO_A_DADOS_DE_PACIENTE em
    // app/core/permissoes.py. Usado para decidir se a tela de Saída tenta
    // o autopreenchimento por GET /pacientes/{prontuario} (Atendente
    // nunca deve chamar essa rota — daria 403 sempre).
    verDadosPaciente: farmaceuticoOuCoordenador,
  };
}

export type Permissoes = ReturnType<typeof permissoesDe>;
