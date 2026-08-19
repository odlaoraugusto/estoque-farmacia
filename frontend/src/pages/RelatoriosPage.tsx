import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, baixarArquivo, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { Letterhead } from '../components/Letterhead';
import { formatarData, formatarDataHora, formatarMoeda, labelTipoMovimentacao } from '../lib/formato';
import type {
  MovimentacaoDetalhadaOut,
  RelatorioAntimicrobianoOut,
  RelatorioCustoPorSetorOut,
  RelatorioEstoqueConsolidadoOut,
  RelatorioAuditoriaOut,
  RelatorioVencimentosProximosOut,
  TipoMovimentacao,
  UnidadeOut,
} from '../types';

type AbaRelatorio = 'consolidado' | 'custo' | 'auditoria' | 'vencimentos' | 'antimicrobianos';

const TITULOS: Record<AbaRelatorio, string> = {
  consolidado: 'Consolidado geral',
  custo: 'Custo por setor',
  auditoria: 'Trilha de auditoria',
  vencimentos: 'Vencimentos próximos',
  antimicrobianos: 'Antimicrobianos',
};

const CAMINHO_RELATORIO: Record<AbaRelatorio, string> = {
  consolidado: '/relatorios/estoque-consolidado',
  custo: '/relatorios/custo-por-setor',
  auditoria: '/relatorios/auditoria',
  vencimentos: '/relatorios/vencimentos-proximos',
  antimicrobianos: '/relatorios/antimicrobianos',
};

// Antimicrobianos não tem exportação PDF/Excel ainda (só a tela) —
// dado de paciente, formato de exportação fica pra quando fizer falta
// de verdade, não construído especulativamente.
const ABAS_SEM_EXPORTACAO: AbaRelatorio[] = ['antimicrobianos'];

/** Relatórios — 4 abas com o cabeçalho institucional acima delas
 * (docs/00_PROJETO.md seção 14). Cada aba some do menu de abas quando o
 * perfil não tem acesso (financeiro: farmacêutico/coordenador; auditoria:
 * só coordenador), em vez de aparecer desabilitada. */
export function RelatoriosPage() {
  const { usuario, token, config } = useAuth();
  const permissoes = permissoesDe(usuario);
  const ehCoordenador = usuario?.perfil === 'coordenador';

  const abasDisponiveis = useMemo<AbaRelatorio[]>(() => {
    const abas: AbaRelatorio[] = [];
    if (permissoes.relatoriosFinanceiro) abas.push('consolidado', 'custo');
    if (permissoes.relatoriosAuditoria) abas.push('auditoria');
    abas.push('vencimentos');
    if (permissoes.notificacaoEstoqueCritico) abas.push('antimicrobianos');
    return abas;
  }, [permissoes.relatoriosFinanceiro, permissoes.relatoriosAuditoria, permissoes.notificacaoEstoqueCritico]);

  const [abaAtiva, setAbaAtiva] = useState<AbaRelatorio>(abasDisponiveis[0] ?? 'vencimentos');
  useEffect(() => {
    if (!abasDisponiveis.includes(abaAtiva)) setAbaAtiva(abasDisponiveis[0] ?? 'vencimentos');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abasDisponiveis]);

  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  useEffect(() => {
    if (!token) return;
    api.get<UnidadeOut[]>('/unidades', { token }).then(setUnidades).catch(() => {});
  }, [token]);

  // Filtros — só relevantes para quem pode enxergar mais de uma unidade
  // (Coordenador); os demais perfis são forçados à própria unidade ativa
  // pelo backend mesmo que um unidade_id fosse enviado.
  const [unidadeFiltro, setUnidadeFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoMovimentacao | ''>('');
  const [dias, setDias] = useState('');
  const [diasMinimoAntimicrobiano, setDiasMinimoAntimicrobiano] = useState('');

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [consolidado, setConsolidado] = useState<RelatorioEstoqueConsolidadoOut | null>(null);
  const [custo, setCusto] = useState<RelatorioCustoPorSetorOut | null>(null);
  const [auditoria, setAuditoria] = useState<RelatorioAuditoriaOut | null>(null);
  const [vencimentos, setVencimentos] = useState<RelatorioVencimentosProximosOut | null>(null);
  const [antimicrobianos, setAntimicrobianos] = useState<RelatorioAntimicrobianoOut | null>(null);

  useEffect(() => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    const unidadeId = unidadeFiltro ? Number(unidadeFiltro) : undefined;

    const promessa =
      abaAtiva === 'consolidado'
        ? api
            .get<RelatorioEstoqueConsolidadoOut>('/relatorios/estoque-consolidado', { token, params: { unidade_id: unidadeId } })
            .then(setConsolidado)
        : abaAtiva === 'custo'
          ? api
              .get<RelatorioCustoPorSetorOut>('/relatorios/custo-por-setor', {
                token,
                params: { unidade_id: unidadeId, data_inicio: dataInicio || undefined, data_fim: dataFim || undefined },
              })
              .then(setCusto)
          : abaAtiva === 'auditoria'
            ? api
                .get<RelatorioAuditoriaOut>('/relatorios/auditoria', {
                  token,
                  params: {
                    unidade_id: unidadeId,
                    tipo: tipoFiltro || undefined,
                    data_inicio: dataInicio || undefined,
                    data_fim: dataFim || undefined,
                  },
                })
                .then(setAuditoria)
            : abaAtiva === 'vencimentos'
              ? api
                  .get<RelatorioVencimentosProximosOut>('/relatorios/vencimentos-proximos', {
                    token,
                    params: { unidade_id: unidadeId, dias: dias || undefined },
                  })
                  .then(setVencimentos)
              : api
                  .get<RelatorioAntimicrobianoOut>('/relatorios/antimicrobianos', {
                    token,
                    params: { unidade_id: unidadeId, dias_minimo: diasMinimoAntimicrobiano || undefined },
                  })
                  .then(setAntimicrobianos);

    promessa
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar o relatório.')))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, token, unidadeFiltro, dataInicio, dataFim, tipoFiltro, dias, diasMinimoAntimicrobiano]);

  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null);

  async function exportar(formato: 'pdf' | 'excel') {
    setExportando(formato);
    setErro(null);
    const unidadeId = unidadeFiltro ? Number(unidadeFiltro) : undefined;
    try {
      await baixarArquivo(CAMINHO_RELATORIO[abaAtiva], {
        token,
        params: {
          formato,
          unidade_id: unidadeId,
          data_inicio: (abaAtiva === 'custo' || abaAtiva === 'auditoria') ? dataInicio || undefined : undefined,
          data_fim: (abaAtiva === 'custo' || abaAtiva === 'auditoria') ? dataFim || undefined : undefined,
          tipo: abaAtiva === 'auditoria' ? tipoFiltro || undefined : undefined,
          dias: abaAtiva === 'vencimentos' ? dias || undefined : undefined,
        },
      });
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível gerar o arquivo.'));
    } finally {
      setExportando(null);
    }
  }

  const metadados =
    (abaAtiva === 'consolidado' && consolidado?.metadados) ||
    (abaAtiva === 'custo' && custo?.metadados) ||
    (abaAtiva === 'auditoria' && auditoria?.metadados) ||
    (abaAtiva === 'vencimentos' && vencimentos?.metadados) ||
    (abaAtiva === 'antimicrobianos' && antimicrobianos?.metadados) ||
    null;

  return (
    <section>
      <div className="screen-head">
        <h1>Relatórios</h1>
        <span className="screen-tag">tela + exportação PDF / Excel</span>
      </div>
      <p className="screen-sub">
        Todos cruzam <code>movimentacoes</code> com <code>lotes.valor_unitario</code>. Relatórios financeiros ficam
        restritos a Coordenador e Farmacêutico; a trilha de auditoria fica só com Coordenação.
      </p>

      {metadados ? (
        <Letterhead metadados={{ ...metadados, titulo_relatorio: TITULOS[abaAtiva] }} />
      ) : (
        usuario && (
          <Letterhead
            metadados={{
              hospital: config?.hospital_nome ?? '',
              organizacao: config?.organizacao ?? '',
              titulo_relatorio: TITULOS[abaAtiva],
              gerado_em: new Date().toISOString(),
              gerado_por: usuario.nome,
              unidade: ehCoordenador ? 'Todas as unidades' : (usuario.unidade_ativa_nome ?? '—'),
            }}
          />
        )
      )}
      <div className="note" style={{ margin: '0 0 18px' }}>
        Este cabeçalho se repete no topo de todas as páginas ao exportar em PDF ou Excel.
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="tabs2" role="tablist">
        {abasDisponiveis.map((aba) => (
          <button key={aba} type="button" role="tab" className="tab2" aria-selected={abaAtiva === aba} onClick={() => setAbaAtiva(aba)}>
            {TITULOS[aba]}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="grid g3" style={{ marginBottom: 18 }}>
          {ehCoordenador && (
            <div className="field">
              <label htmlFor="filtro-unidade">Unidade</label>
              <select id="filtro-unidade" value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)}>
                <option value="">Todas as unidades</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(abaAtiva === 'custo' || abaAtiva === 'auditoria') && (
            <>
              <div className="field">
                <label htmlFor="filtro-inicio">Período — de</label>
                <input id="filtro-inicio" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="filtro-fim">Período — até</label>
                <input id="filtro-fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </>
          )}
          {abaAtiva === 'auditoria' && (
            <div className="field">
              <label htmlFor="filtro-tipo">Tipo de movimentação</label>
              <select id="filtro-tipo" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as TipoMovimentacao | '')}>
                <option value="">Todos</option>
                <option value="entrada">Entrada</option>
                <option value="transferencia">Transferência</option>
                <option value="saida">Saída</option>
                <option value="descarte">Descarte</option>
                <option value="ajuste">Ajuste</option>
              </select>
            </div>
          )}
          {abaAtiva === 'vencimentos' && (
            <div className="field">
              <label htmlFor="filtro-dias">Janela (dias)</label>
              <input id="filtro-dias" type="number" min={1} placeholder="30" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          )}
          {abaAtiva === 'antimicrobianos' && (
            <div className="field">
              <label htmlFor="filtro-dias-antimicrobiano">Dias mínimo de uso</label>
              <input
                id="filtro-dias-antimicrobiano"
                type="number"
                min={1}
                placeholder="7"
                value={diasMinimoAntimicrobiano}
                onChange={(e) => setDiasMinimoAntimicrobiano(e.target.value)}
              />
            </div>
          )}
        </div>

        {carregando && <p className="carregando">Carregando relatório…</p>}

        {!carregando && abaAtiva === 'consolidado' && (
          <TabelaConsolidado dados={consolidado} ehCoordenador={ehCoordenador} />
        )}
        {!carregando && abaAtiva === 'custo' && <TabelaCusto dados={custo} />}
        {!carregando && abaAtiva === 'auditoria' && <TabelaAuditoria dados={auditoria} />}
        {!carregando && abaAtiva === 'vencimentos' && <TabelaVencimentos dados={vencimentos} ehCoordenador={ehCoordenador} />}
        {!carregando && abaAtiva === 'antimicrobianos' && <TabelaAntimicrobianos dados={antimicrobianos} />}

        {!ABAS_SEM_EXPORTACAO.includes(abaAtiva) && (
          <div className="actions">
            <button type="button" className="btn ghost" disabled={exportando !== null} onClick={() => exportar('pdf')}>
              {exportando === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}
            </button>
            <button type="button" className="btn ghost" disabled={exportando !== null} onClick={() => exportar('excel')}>
              {exportando === 'excel' ? 'Gerando Excel…' : 'Exportar Excel'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function TabelaConsolidado({ dados, ehCoordenador }: { dados: RelatorioEstoqueConsolidadoOut | null; ehCoordenador: boolean }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Lote</th>
            {ehCoordenador && <th>Unidade</th>}
            <th className="num">Qtd.</th>
            <th className="num">Valor unit.</th>
            <th className="num">Valor total</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={ehCoordenador ? 6 : 5} className="vazio-tabela">
                Sem lotes no período.
              </td>
            </tr>
          )}
          {dados.itens.map((item) => (
            <tr key={item.lote.id}>
              <td>{item.lote.medicamento.nome}</td>
              <td className="mono">{item.lote.numero_lote}</td>
              {ehCoordenador && <td>{item.lote.unidade.nome}</td>}
              <td className="num">{item.lote.quantidade_atual}</td>
              <td className="num">{formatarMoeda(item.lote.valor_unitario)}</td>
              <td className="num">{formatarMoeda(item.valor_total_lote)}</td>
            </tr>
          ))}
        </tbody>
        {dados.itens.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={ehCoordenador ? 5 : 4} style={{ fontWeight: 700 }}>
                Valor total geral
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {formatarMoeda(dados.valor_total_geral)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function TabelaCusto({ dados }: { dados: RelatorioCustoPorSetorOut | null }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Setor</th>
            <th className="num">Saídas (un.)</th>
            <th className="num">Custo (R$)</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={3} className="vazio-tabela">
                Sem saídas no período.
              </td>
            </tr>
          )}
          {dados.itens.map((item) => (
            <tr key={item.setor_consumidor}>
              <td>{item.setor_consumidor}</td>
              <td className="num">{item.quantidade_total}</td>
              <td className="num">{formatarMoeda(item.valor_total)}</td>
            </tr>
          ))}
        </tbody>
        {dados.itens.length > 0 && (
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>Total geral</td>
              <td></td>
              <td className="num" style={{ fontWeight: 700 }}>
                {formatarMoeda(dados.valor_total_geral)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function detalheMovimentacao(mov: MovimentacaoDetalhadaOut): string {
  switch (mov.tipo) {
    case 'saida':
      return `setor: ${mov.setor_consumidor ?? '—'}`;
    case 'transferencia':
      return mov.usuario_confirmacao
        ? `recebido por ${mov.usuario_confirmacao.nome} em ${mov.unidade_destino?.nome ?? '—'}`
        : `em trânsito para ${mov.unidade_destino?.nome ?? '—'}`;
    case 'descarte':
      if (mov.status === 'aprovado') return `aprovado por ${mov.usuario_aprovador?.nome ?? '—'}`;
      if (mov.status === 'rejeitado') return `rejeitado por ${mov.usuario_aprovador?.nome ?? '—'}`;
      return 'aguardando aprovação';
    case 'ajuste': {
      const sinal = mov.quantidade > 0 ? `+${mov.quantidade}` : String(mov.quantidade);
      return `${sinal} un. — ${mov.motivo_ajuste ?? '—'}`;
    }
    default:
      return '—';
  }
}

function TabelaAuditoria({ dados }: { dados: RelatorioAuditoriaOut | null }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Tipo</th>
            <th>Lote</th>
            <th>Usuário</th>
            <th>Detalhe</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={5} className="vazio-tabela">
                Nenhuma movimentação no período.
              </td>
            </tr>
          )}
          {dados.itens.map((mov) => (
            <tr key={mov.id}>
              <td className="mono">{formatarDataHora(mov.data_hora)}</td>
              <td>{labelTipoMovimentacao(mov.tipo)}</td>
              <td className="mono">{mov.lote.numero_lote}</td>
              <td>{mov.usuario.nome}</td>
              <td>{detalheMovimentacao(mov)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaAntimicrobianos({ dados }: { dados: RelatorioAntimicrobianoOut | null }) {
  if (!dados) return null;
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        Aproximação a partir de dispensações da farmácia (Saída), não de confirmação de administração à beira do
        leito — o hospital não tem prontuário eletrônico de enfermagem. "Em uso" considera só quem teve dispensação
        nos últimos 2 dias.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Prontuário</th>
              <th>Medicamento</th>
              <th className="num">Dias consecutivos</th>
              <th>Início</th>
              <th>Última dose</th>
              <th>Doses</th>
            </tr>
          </thead>
          <tbody>
            {dados.itens.length === 0 && (
              <tr>
                <td colSpan={7} className="vazio-tabela">
                  Nenhum paciente com uso de antimicrobiano acima de {dados.dias_minimo} dias no momento.
                </td>
              </tr>
            )}
            {dados.itens.map((item) => (
              <tr key={`${item.paciente_prontuario}-${item.medicamento_id}`}>
                <td>{item.paciente_nome}</td>
                <td className="mono">{item.paciente_prontuario}</td>
                <td>{item.medicamento_nome}</td>
                <td className="num">
                  <span className="pill pend">{item.dias_consecutivos}d</span>
                </td>
                <td>{formatarData(item.data_inicio)}</td>
                <td>{formatarData(item.data_fim)}</td>
                <td>
                  {item.doses.map((d, i) => (
                    <span key={i} className="mono" style={{ display: 'block' }}>
                      {formatarData(d.data)} · {d.quantidade} un. · lote {d.numero_lote}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TabelaVencimentos({ dados, ehCoordenador }: { dados: RelatorioVencimentosProximosOut | null; ehCoordenador: boolean }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Lote</th>
            {ehCoordenador && <th>Unidade</th>}
            <th>Validade</th>
            <th className="num">Qtd.</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={ehCoordenador ? 5 : 4} className="vazio-tabela">
                Nenhum lote vencendo nos próximos {dados.dias_considerados} dias.
              </td>
            </tr>
          )}
          {dados.itens.map((lote) => (
            <tr key={lote.id}>
              <td>{lote.medicamento.nome}</td>
              <td className="mono">{lote.numero_lote}</td>
              {ehCoordenador && <td>{lote.unidade.nome}</td>}
              <td>{formatarData(lote.data_validade)}</td>
              <td className="num">{lote.quantidade_atual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
