import type { RelatorioMetadados } from '../types';
import { formatarDataHora } from '../lib/formato';

/** Cabeçalho institucional obrigatório em toda tela de relatório
 * (docs/00_PROJETO.md seção 14) — Fundação + Hospital + título do
 * relatório + data/usuário/unidade. O backend já devolve esses metadados
 * prontos em cada resposta de /relatorios/*, então aqui só exibimos. */
export function Letterhead({ metadados }: { metadados: RelatorioMetadados }) {
  return (
    <div className="letterhead">
      <div className="lh-brand">
        <span className="lh-org">{metadados.organizacao}</span>
        <span className="lh-hospital">{metadados.hospital}</span>
      </div>
      <div className="lh-meta">
        <div>
          <b>{metadados.titulo_relatorio}</b>
        </div>
        <div>
          Gerado em {formatarDataHora(metadados.gerado_em)} · {metadados.gerado_por} · Unidade: {metadados.unidade}
        </div>
      </div>
    </div>
  );
}
