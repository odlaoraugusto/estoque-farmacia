// Tipos espelhando app/schemas/*.py do backend (FastAPI). Strings literais
// no lugar de `enum` porque o tsconfig do projeto usa `erasableSyntaxOnly`.

export type Perfil = 'coordenador' | 'farmaceutico' | 'atendente';

export type Acondicionamento = 'ambiente' | 'geladeira';

export type Apresentacao =
  | 'comprimido'
  | 'capsula'
  | 'solucao_oral'
  | 'xarope'
  | 'suspensao'
  | 'solucao_injetavel'
  | 'ampola'
  | 'frasco_ampola'
  | 'pomada'
  | 'creme'
  | 'gel'
  | 'spray'
  | 'supositorio'
  | 'adesivo'
  | 'bolsa';

export type Origem = 'compra' | 'doacao';

/** Categoria de uma Saída (2026-08-19) — normal (default) ou empréstimo/
 * doação pra fora do hospital, usado pra notificar o Coordenador. */
export type CategoriaSaida = 'normal' | 'emprestimo' | 'doacao';

export type StatusTransferencia = 'em_transito' | 'recebido';

export type TipoMovimentacao = 'entrada' | 'transferencia' | 'saida' | 'descarte' | 'ajuste';

export type StatusDescarte = 'pendente_aprovacao' | 'aprovado' | 'rejeitado';

/** Carrinho de emergência (2026-08-13): vira um local de estoque
 * rastreável (`tipo=carrinho`), mas nunca gera acesso de sessão — só
 * `tipo=unidade` aparece na seleção de unidade ativa do login. */
export type TipoUnidade = 'unidade' | 'carrinho';

export interface ConfigInstalacao {
  hospital_nome: string;
  organizacao: string;
}

export interface UsuarioMe {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
  crf: string | null;
  unidade_ativa_id: number | null;
  unidade_ativa_nome: string | null;
}

export interface UsuarioResumo {
  id: number;
  nome: string;
  perfil: Perfil;
  crf: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  usuario: UsuarioMe;
}

export interface UnidadeOut {
  id: number;
  nome: string;
  tipo: TipoUnidade;
  unidade_pai_id: number | null;
  descricao: string | null;
}

export interface MedicamentoOut {
  id: number;
  nome: string;
  apresentacao: Apresentacao;
  concentracao: string;
  acondicionamento: Acondicionamento;
  estoque_minimo: number;
  ativo: boolean;
  // Programa de uso racional de antimicrobianos (2026-08-19) — quando
  // true, Saída desse item exige paciente/prontuário (SaidaPage e
  // SaidaService validam isso, cada um do seu lado).
  e_antimicrobiano: boolean;
}

export interface LoteOut {
  id: number;
  medicamento_id: number;
  unidade_id: number;
  numero_lote: string;
  data_validade: string;
  quantidade_atual: number;
  valor_unitario: string;
  origem: Origem;
  numero_nota_fiscal: string | null;
  numero_afm: string | null;
  data_entrada: string;
  usuario_entrada_id: number;
  status_transferencia: StatusTransferencia | null;
  lote_origem_id: number | null;
}

export interface LoteDetalhadoOut extends LoteOut {
  medicamento: MedicamentoOut;
  unidade: UnidadeOut;
  sugerido_fefo: boolean;
}

export interface MovimentacaoOut {
  id: number;
  tipo: TipoMovimentacao;
  lote_id: number;
  quantidade: number;
  unidade_origem_id: number | null;
  unidade_destino_id: number | null;
  quantidade_recebida: number | null;
  setor_consumidor: string | null;
  categoria_saida: CategoriaSaida | null;
  motivo_descarte: string | null;
  motivo_ajuste: string | null;
  status: StatusDescarte | null;
  // Paciente/prontuário (seção 22 do doc) — só preenchido em Saída, e só
  // visível para quem tem acesso (backend zera os dois para Atendente,
  // ver MovimentacaoOut.visivel_para no schema Python).
  paciente_nome: string | null;
  paciente_prontuario: string | null;
  usuario_id: number;
  usuario_solicitante_id: number | null;
  usuario_aprovador_id: number | null;
  usuario_confirmacao_id: number | null;
  data_hora: string;
  data_confirmacao: string | null;
}

export interface MovimentacaoDetalhadaOut extends MovimentacaoOut {
  lote: LoteDetalhadoOut;
  unidade_origem: UnidadeOut | null;
  unidade_destino: UnidadeOut | null;
  usuario: UsuarioResumo;
  usuario_solicitante: UsuarioResumo | null;
  usuario_aprovador: UsuarioResumo | null;
  usuario_confirmacao: UsuarioResumo | null;
}

/** Resposta do autopreenchimento por prontuário (`GET /pacientes/{prontuario}`)
 * — restrito a Farmacêutico/Coordenador no backend (403 para Atendente). */
export interface PacienteOut {
  prontuario: string;
  nome: string;
}

export interface RelatorioMetadados {
  hospital: string;
  organizacao: string;
  titulo_relatorio: string;
  gerado_em: string;
  gerado_por: string;
  unidade: string;
}

export interface RelatorioEstoqueConsolidadoItem {
  lote: LoteDetalhadoOut;
  valor_total_lote: string;
}

export interface RelatorioEstoqueConsolidadoOut {
  metadados: RelatorioMetadados;
  itens: RelatorioEstoqueConsolidadoItem[];
  valor_total_geral: string;
}

export interface RelatorioCustoPorSetorItem {
  setor_consumidor: string;
  quantidade_total: number;
  valor_total: string;
}

export interface RelatorioCustoPorSetorOut {
  metadados: RelatorioMetadados;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  itens: RelatorioCustoPorSetorItem[];
  valor_total_geral: string;
}

export interface RelatorioAuditoriaOut {
  metadados: RelatorioMetadados;
  itens: MovimentacaoDetalhadaOut[];
}

export interface RelatorioVencimentosProximosOut {
  metadados: RelatorioMetadados;
  dias_considerados: number;
  itens: LoteDetalhadoOut[];
}

export interface RelatorioEstoqueCriticoItem {
  medicamento_id: number;
  nome: string;
  quantidade_atual: number;
  estoque_minimo: number;
}

export interface RelatorioEstoqueCriticoOut {
  metadados: RelatorioMetadados;
  itens: RelatorioEstoqueCriticoItem[];
}

export interface DoseAntimicrobianoItem {
  data: string;
  quantidade: number;
  numero_lote: string;
}

export interface RelatorioAntimicrobianoItem {
  paciente_prontuario: string;
  paciente_nome: string;
  medicamento_id: number;
  medicamento_nome: string;
  dias_consecutivos: number;
  data_inicio: string;
  data_fim: string;
  doses: DoseAntimicrobianoItem[];
}

export interface RelatorioAntimicrobianoOut {
  metadados: RelatorioMetadados;
  dias_minimo: number;
  itens: RelatorioAntimicrobianoItem[];
}

export interface AtividadeRecenteItem {
  movimentacao_id: number;
  tipo: string;
  detalhe: string;
  medicamento_nome: string;
  quantidade: number;
  usuario_nome: string;
  unidade_nome: string;
  data_hora: string;
}

export interface RelatorioAtividadeRecenteOut {
  metadados: RelatorioMetadados;
  dias_considerados: number;
  itens: AtividadeRecenteItem[];
}
