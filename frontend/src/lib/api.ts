// Cliente HTTP fino para a API do Estoque Farmácia. Sem libs externas
// (fetch nativo) — o backend é pequeno e não precisa de axios/query-lib.

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// Rótulo amigável por nome de campo — cobre os campos mais comuns entre
// os vários formulários do sistema; campo sem entrada aqui cai no
// fallback de humanizar o nome cru (troca "_" por espaço, primeira
// maiúscula), então nunca fica sem indicar QUAL campo é.
const CAMPO_LABEL: Record<string, string> = {
  data_validade: 'Validade',
  numero_lote: 'Nº do lote',
  quantidade: 'Quantidade',
  quantidade_nova: 'Quantidade',
  quantidade_desejada: 'Quantidade',
  quantidade_usada: 'Quantidade',
  valor_unitario: 'Valor unitário',
  motivo_ajuste: 'Motivo',
  motivo_descarte: 'Motivo',
  motivo: 'Motivo',
  setor_consumidor: 'Setor',
  setor: 'Setor',
  paciente_nome: 'Nome do paciente',
  paciente_prontuario: 'Prontuário',
  destino_externo: 'Destino',
  destinatario: 'Destinatário',
  lote_id: 'Lote',
  medicamento_id: 'Medicamento',
  unidade_destino_id: 'Unidade de destino',
  unidade_origem_id: 'Unidade de origem',
  unidade_id: 'Unidade',
  numero_nota_fiscal: 'Nº da nota fiscal',
  numero_afm: 'Nº AFM',
  login: 'Login',
  senha: 'Senha',
  senha_atual: 'Senha atual',
  senha_nova: 'Nova senha',
  nome: 'Nome',
  crf: 'CRF',
};

/** Extrai um rótulo tipo "Item 3 — Validade" a partir de `loc`
 * (ex.: `["body","itens",2,"data_validade"]`) — o campo de verdade é o
 * segmento em texto mais à direita; se houver um índice numérico antes
 * dele (formulário com lista de itens, ex. devolução com vários
 * medicamentos), prefixa com a posição (1-based) pra quem está com
 * várias linhas na tela saber ONDE está o problema, não só qual campo. */
function rotuloCampo(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;

  let campo: string | null = null;
  let indiceItem: number | null = null;
  for (let i = loc.length - 1; i >= 0; i--) {
    if (campo === null && typeof loc[i] === 'string' && loc[i] !== 'body' && loc[i] !== 'query') {
      campo = loc[i] as string;
      continue;
    }
    if (campo !== null && typeof loc[i] === 'number') {
      indiceItem = (loc[i] as number) + 1;
      break;
    }
  }
  if (campo === null) return null;

  const rotulo = CAMPO_LABEL[campo] ?? campo.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return indiceItem !== null ? `Item ${indiceItem} — ${rotulo}` : rotulo;
}

// Traduz os tipos de erro embutidos do Pydantic mais comuns — erro
// customizado (`value_error`, de um `raise ValueError(...)` nosso) já
// vem em português, só remove o prefixo "Value error, " que o Pydantic
// v2 adiciona na frente.
function traduzirMensagemValidacao(tipo: string, msgOriginal: string): string {
  if (tipo.startsWith('value_error')) {
    return msgOriginal.replace(/^Value error,\s*/i, '');
  }
  const TRADUCOES: Record<string, string> = {
    missing: 'é obrigatório.',
    date_from_datetime_parsing: 'data inválida — confira o dia, o mês e o ano.',
    date_parsing: 'data inválida — confira o dia, o mês e o ano.',
    datetime_from_date_parsing: 'data/hora inválida.',
    int_parsing: 'deve ser um número inteiro.',
    float_parsing: 'deve ser um número.',
    decimal_parsing: 'deve ser um número válido.',
    greater_than: 'deve ser maior que zero.',
    greater_than_equal: 'não pode ser negativo.',
    string_too_short: 'não pode ficar em branco.',
    string_type: 'deve ser preenchido com texto.',
    bool_parsing: 'valor inválido.',
    enum: 'valor não é uma opção válida.',
  };
  return TRADUCOES[tipo] ?? msgOriginal;
}

function extrairMensagem(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      // Erro de validação (422) do Pydantic vem como lista de objetos
      // { loc, msg, type } — um por campo inválido. Monta "Campo: motivo"
      // pra deixar claro QUAL informação está causando o problema, em
      // vez de só devolver a mensagem crua (geralmente em inglês).
      return detail
        .map((item) => {
          if (!(item && typeof item === 'object' && 'msg' in item)) return JSON.stringify(item);
          const msgOriginal = String((item as { msg: unknown }).msg);
          const tipo = 'type' in item ? String((item as { type: unknown }).type) : '';
          const campo = rotuloCampo('loc' in item ? (item as { loc: unknown }).loc : null);
          const mensagem = traduzirMensagemValidacao(tipo, msgOriginal);
          return campo ? `${campo}: ${mensagem}` : mensagem;
        })
        .join('; ');
    }
  }
  if (status === 401) return 'Sessão inválida ou expirada. Faça login novamente.';
  if (status === 403) return 'Você não tem permissão para esta ação.';
  if (status === 404) return 'Registro não encontrado.';
  return `Erro inesperado (HTTP ${status}).`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  params?: Record<string, string | number | boolean | null | undefined>;
}

function montarQueryString(params?: RequestOptions['params']): string {
  if (!params) return '';
  const entradas = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entradas.length === 0) return '';
  const usp = new URLSearchParams();
  for (const [chave, valor] of entradas) usp.set(chave, String(valor));
  return `?${usp.toString()}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, params } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}${montarQueryString(params)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let parsedBody: unknown = null;
    try {
      parsedBody = await res.json();
    } catch {
      // corpo vazio ou não-JSON — segue sem detalhe extra
    }
    throw new ApiError(res.status, extrairMensagem(res.status, parsedBody), parsedBody);
  }

  if (res.status === 204) return undefined as T;

  const texto = await res.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

export const api = {
  get: <T,>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T,>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T,>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T,>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

/** Baixa um arquivo (PDF/Excel de relatório) e dispara o download no
 * navegador — usa o nome de arquivo que o backend manda em
 * Content-Disposition em vez de inventar um. */
export async function baixarArquivo(
  path: string,
  opts: { token?: string | null; params?: RequestOptions['params'] } = {},
): Promise<void> {
  const { token, params } = opts;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}${montarQueryString(params)}`, { headers });

  if (!res.ok) {
    let parsedBody: unknown = null;
    try {
      parsedBody = await res.json();
    } catch {
      // corpo vazio ou não-JSON
    }
    throw new ApiError(res.status, extrairMensagem(res.status, parsedBody), parsedBody);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const nomeArquivo = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? 'relatorio';

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Mensagem amigável para exibir em telas — uso: catch(err) { setErro(mensagemErro(err)) }. */
export function mensagemErro(err: unknown, padrao = 'Não foi possível completar a operação.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return padrao;
}
