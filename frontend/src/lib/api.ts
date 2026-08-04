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

function extrairMensagem(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      // Erro de validação (422) do Pydantic vem como lista de objetos.
      return detail
        .map((item) =>
          item && typeof item === 'object' && 'msg' in item
            ? String((item as { msg: unknown }).msg)
            : JSON.stringify(item),
        )
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
