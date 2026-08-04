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
  };
}

export type Permissoes = ReturnType<typeof permissoesDe>;
