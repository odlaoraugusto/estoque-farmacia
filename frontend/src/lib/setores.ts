/** Setores clínicos de dispensação (2026-08-21) — lista fechada pedida
 * pelo cliente para a tela de Saída/Dispensação normal, refletindo a
 * estrutura real do hospital (não são as mesmas 4 `unidades` do sistema
 * — CAF/UTI/Centro Cirúrgico/Emergência controlam ESTOQUE; isto aqui é
 * só o setor consumidor de uma dispensação, sempre foi texto livre no
 * banco — `Movimentacao.setor_consumidor` — só a lista de opções da
 * tela mudou). */
export const SETORES_DISPENSACAO = [
  'UTI Neonatal',
  'UCINCo',
  'Canguru',
  'UTI Pediátrica',
  'Enfermaria Pediátrica',
  'Emergência Pediátrica',
  'Emergência Obstétrica',
  'Alojamento Conjunto (Posto 1)',
  'Alojamento Conjunto (Posto 2)',
  'Centro Cirúrgico',
  'Centro Obstétrico',
  'CPN',
  'Ambulatório',
] as const;
