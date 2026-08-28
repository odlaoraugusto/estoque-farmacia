/** Formatação compartilhada — evita duplicar Intl.* em cada página. */

import type { Apresentacao } from '../types';

/** Converte um valor digitado no formato pt-BR ("1.234,56" ou "2,10") para
 * uma string decimal com ponto ("1234.56"), que é o que a API espera. */
export function paraDecimalApi(valor: string): string {
  return valor.trim().replaceAll('.', '').replace(',', '.');
}

export function formatarMoeda(valor: string | number): string {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (Number.isNaN(numero)) return 'R$ —';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR');
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Dias corridos entre hoje e a data de validade (negativo = já venceu). */
export function diasAteVencer(dataValidade: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(`${dataValidade}T00:00:00`);
  return Math.round((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

/** Nível de alerta de vencimento (2026-08-20, pedido do cliente) — mesma
 * régua usada no popup de login e na tela Estoque atual, pra não
 * duplicar os limites em dois lugares: vencido (vermelho), menos de 30
 * dias (amarelo), entre 30 e 60 dias (roxo), fora disso não é alerta. */
export type NivelValidade = 'vencido' | 'amarelo' | 'roxo' | 'ok';

export function nivelValidade(dias: number): NivelValidade {
  if (dias < 0) return 'vencido';
  if (dias < 30) return 'amarelo';
  if (dias <= 60) return 'roxo';
  return 'ok';
}

const ORIGEM_LABEL: Record<string, string> = { compra: 'Compra', doacao: 'Doação' };
export function labelOrigem(origem: string): string {
  return ORIGEM_LABEL[origem] ?? origem;
}

const ACONDICIONAMENTO_LABEL: Record<string, string> = { ambiente: 'Ambiente', geladeira: 'Geladeira' };
export function labelAcondicionamento(valor: string): string {
  return ACONDICIONAMENTO_LABEL[valor] ?? valor;
}

const APRESENTACAO_LABEL: Record<string, string> = {
  comprimido: 'Comprimido',
  capsula: 'Cápsula',
  solucao_oral: 'Solução oral',
  xarope: 'Xarope',
  suspensao: 'Suspensão',
  solucao_injetavel: 'Solução injetável',
  ampola: 'Ampola',
  frasco_ampola: 'Frasco-ampola',
  pomada: 'Pomada',
  creme: 'Creme',
  gel: 'Gel',
  spray: 'Spray',
  supositorio: 'Supositório',
  adesivo: 'Adesivo',
  bolsa: 'Bolsa',
};
export function labelApresentacao(valor: string): string {
  return APRESENTACAO_LABEL[valor] ?? valor;
}

/** Opções para o <select> de apresentação, na mesma ordem do enum do backend. */
export const OPCOES_APRESENTACAO = Object.entries(APRESENTACAO_LABEL) as [Apresentacao, string][];

/** Classe `.rail-*` (docs/04_IDENTIDADE_VISUAL.md, seção 4) — cada uma
 * das 4 unidades do hospital herda uma cor da régua institucional,
 * suavizada, aplicada como borda esquerda de 3px em cards/badges que
 * mostram contexto de unidade. Nunca é a única pista (nome da unidade
 * sempre visível ao lado) — ver nota de acessibilidade no doc. */
const RAIL_POR_UNIDADE: Record<string, string> = {
  CAF: 'rail-caf',
  UTI: 'rail-uti',
  'Centro Cirúrgico': 'rail-cc',
  Emergência: 'rail-emerg',
};
export function classeRailUnidade(nomeUnidade: string | null | undefined): string {
  if (!nomeUnidade) return '';
  return RAIL_POR_UNIDADE[nomeUnidade] ?? '';
}

const PERFIL_LABEL: Record<string, string> = {
  coordenador: 'Coordenador',
  farmaceutico: 'Farmacêutico',
  atendente: 'Atendente',
  admin: 'Administrador',
};
export function labelPerfil(perfil: string): string {
  return PERFIL_LABEL[perfil] ?? perfil;
}

const TIPO_MOV_LABEL: Record<string, string> = {
  entrada: 'Entrada',
  transferencia: 'Transferência',
  saida: 'Saída',
  descarte: 'Descarte',
  ajuste: 'Ajuste',
};
export function labelTipoMovimentacao(tipo: string): string {
  return TIPO_MOV_LABEL[tipo] ?? tipo;
}
