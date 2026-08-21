import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, baixarArquivo, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { Letterhead } from '../components/Letterhead';
import { formatarData, formatarDataHora, formatarMoeda, labelTipoMovimentacao } from '../lib/formato';
import { SETORES_DISPENSACAO } from '../lib/setores';
import type {
  MovimentacaoDetalhadaOut,
  RelatorioAntimicrobianoOut,
  RelatorioConsumoMedicamentosOut,
  RelatorioCustoPorSetorOut,
  RelatorioEstoqueConsolidadoOut,
  RelatorioEstoqueCriticoOut,
  RelatorioAuditoriaOut,
  RelatorioTransferenciasOut,
  RelatorioVencimentosProximosOut,
  TipoMovimentacao,
  UnidadeOut,
} from '../types';

type AbaRelatorio =
  | 'consolidado'
  | 'custo'
  | 'consumo'
  | 'transferencias'
  | 'auditoria'
  | 'vencimentos'
  | 'critico'
  | 'antimicrobianos'
  | 'controlados';

const TITULOS: Record<AbaRelatorio, string> = {
  consolidado: 'Consolidado geral',
  custo: 'Custo por setor',
  consumo: 'Consumo de medicamentos',
  transferencias: 'Rastreabilidade de transferências',
  auditoria: 'Trilha de auditoria',
  vencimentos: 'Vencimentos próximos',
  critico: 'Estoque Crítico',
  antimicrobianos: 'Antimicrobianos',
  controlados: 'Controlados',
};

const CAMINHO_RELATORIO: Record<AbaRelatorio, string> = {
  consolidado: '/relatorios/estoque-consolidado',
  custo: '/relatorios/custo-por-setor',
  consumo: '/relatorios/consumo-medicamentos',
  transferencias: '/relatorios/transferencias',
  auditoria: '/relatorios/auditoria',
  vencimentos: '/relatorios/vencimentos-proximos',
  critico: '/relatorios/estoque-critico',
  antimicrobianos: '/relatorios/antimicrobianos',
  controlados: '/relatorios/controlados',
};

// Abas que usam o filtro de período (de/até) — mesmo padrão de Custo/
// Auditoria já existente.
const ABAS_COM_PERIODO: AbaRelatorio[] = ['custo', 'consumo', 'transferencias', 'auditoria'];

// Espelha RELATORIO_AUDITORIA_DIAS_PADRAO/LIMITE_PADRAO (backend/app/core/
// config.py) — só pra pré-preencher o filtro de período na tela (o backend
// já aplica esse padrão sozinho se a data vier vazia; isto aqui é só pra
// o Coordenador VER o período aplicado em vez de ele acontecer invisível).
const AUDITORIA_DIAS_PADRAO = 90;
const AUDITORIA_LIMITE_PASSO = 200;

function dataIsoHaDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

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
    if (permissoes.relatoriosFinanceiro) abas.push('consolidado', 'custo', 'consumo', 'transferencias');
    if (permissoes.relatoriosAuditoria) abas.push('auditoria');
    abas.push('vencimentos');
    if (permissoes.notificacaoEstoqueCritico) abas.push('critico', 'antimicrobianos', 'controlados');
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
    api.get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } }).then(setUnidades).catch(() => {});
  }, [token]);

  // Filtros — só relevantes para quem pode enxergar mais de uma unidade
  // (Coordenador); os demais perfis são forçados à própria unidade ativa
  // pelo backend mesmo que um unidade_id fosse enviado.
  const [unidadeFiltro, setUnidadeFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoMovimentacao | ''>('');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [dias, setDias] = useState('');
  const [diasMinimoAntimicrobiano, setDiasMinimoAntimicrobiano] = useState('');
  const [diasMinimoControlado, setDiasMinimoControlado] = useState('');
  const [limiteAuditoria, setLimiteAuditoria] = useState(AUDITORIA_LIMITE_PASSO);

  // Ao entrar na aba de Auditoria, pré-preenche o período com os últimos
  // 90 dias — o mesmo padrão que o backend aplicaria de qualquer forma se
  // a data viesse vazia, só que aqui fica visível e ajustável em vez de
  // acontecer escondido (2026-08-19, achado do diagnóstico de carga: sem
  // isso a trilha inteira — 1192 linhas / 1,7MB no teste — vinha de uma
  // vez só). Só preenche se o campo ainda estiver vazio, pra não pisar
  // numa data que o usuário já tenha escolhido.
  useEffect(() => {
    if (abaAtiva === 'auditoria' && !dataInicio) {
      setDataInicio(dataIsoHaDias(AUDITORIA_DIAS_PADRAO));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva]);

  // Trocar de aba/filtro/unidade reseta quanto já foi "carregado a mais"
  // na Auditoria — senão um "carregar mais" antigo vazaria pro filtro novo.
  useEffect(() => {
    setLimiteAuditoria(AUDITORIA_LIMITE_PASSO);
  }, [abaAtiva, unidadeFiltro, dataInicio, dataFim, tipoFiltro]);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [consolidado, setConsolidado] = useState<RelatorioEstoqueConsolidadoOut | null>(null);
  const [custo, setCusto] = useState<RelatorioCustoPorSetorOut | null>(null);
  const [consumo, setConsumo] = useState<RelatorioConsumoMedicamentosOut | null>(null);
  const [transferencias, setTransferencias] = useState<RelatorioTransferenciasOut | null>(null);
  const [auditoria, setAuditoria] = useState<RelatorioAuditoriaOut | null>(null);
  const [vencimentos, setVencimentos] = useState<RelatorioVencimentosProximosOut | null>(null);
  const [critico, setCritico] = useState<RelatorioEstoqueCriticoOut | null>(null);
  const [antimicrobianos, setAntimicrobianos] = useState<RelatorioAntimicrobianoOut | null>(null);
  const [controlados, setControlados] = useState<RelatorioAntimicrobianoOut | null>(null);

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
          : abaAtiva === 'consumo'
            ? api
                .get<RelatorioConsumoMedicamentosOut>('/relatorios/consumo-medicamentos', {
                  token,
                  params: {
                    unidade_id: unidadeId,
                    data_inicio: dataInicio || undefined,
                    data_fim: dataFim || undefined,
                    setor_consumidor: setorFiltro || undefined,
                  },
                })
                .then(setConsumo)
            : abaAtiva === 'transferencias'
              ? api
                  .get<RelatorioTransferenciasOut>('/relatorios/transferencias', {
                    token,
                    params: { unidade_id: unidadeId, data_inicio: dataInicio || undefined, data_fim: dataFim || undefined },
                  })
                  .then(setTransferencias)
              : abaAtiva === 'auditoria'
            ? api
                .get<RelatorioAuditoriaOut>('/relatorios/auditoria', {
                  token,
                  params: {
                    unidade_id: unidadeId,
                    tipo: tipoFiltro || undefined,
                    data_inicio: dataInicio || undefined,
                    data_fim: dataFim || undefined,
                    limit: limiteAuditoria,
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
              : abaAtiva === 'critico'
                ? api
                    .get<RelatorioEstoqueCriticoOut>('/relatorios/estoque-critico', { token, params: { unidade_id: unidadeId } })
                    .then(setCritico)
                : abaAtiva === 'antimicrobianos'
                ? api
                    .get<RelatorioAntimicrobianoOut>('/relatorios/antimicrobianos', {
                      token,
                      params: { unidade_id: unidadeId, dias_minimo: diasMinimoAntimicrobiano || undefined },
                    })
                    .then(setAntimicrobianos)
                : api
                    .get<RelatorioAntimicrobianoOut>('/relatorios/controlados', {
                      token,
                      params: { unidade_id: unidadeId, dias_minimo: diasMinimoControlado || undefined },
                    })
                    .then(setControlados);

    promessa
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar o relatório.')))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    abaAtiva,
    token,
    unidadeFiltro,
    dataInicio,
    dataFim,
    tipoFiltro,
    setorFiltro,
    dias,
    diasMinimoAntimicrobiano,
    diasMinimoControlado,
    limiteAuditoria,
  ]);

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
          data_inicio: ABAS_COM_PERIODO.includes(abaAtiva) ? dataInicio || undefined : undefined,
          data_fim: ABAS_COM_PERIODO.includes(abaAtiva) ? dataFim || undefined : undefined,
          tipo: abaAtiva === 'auditoria' ? tipoFiltro || undefined : undefined,
          setor_consumidor: abaAtiva === 'consumo' ? setorFiltro || undefined : undefined,
          dias: abaAtiva === 'vencimentos' ? dias || undefined : undefined,
          dias_minimo:
            abaAtiva === 'antimicrobianos'
              ? diasMinimoAntimicrobiano || undefined
              : abaAtiva === 'controlados'
                ? diasMinimoControlado || undefined
                : undefined,
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
    (abaAtiva === 'consumo' && consumo?.metadados) ||
    (abaAtiva === 'transferencias' && transferencias?.metadados) ||
    (abaAtiva === 'auditoria' && auditoria?.metadados) ||
    (abaAtiva === 'vencimentos' && vencimentos?.metadados) ||
    (abaAtiva === 'antimicrobianos' && antimicrobianos?.metadados) ||
    (abaAtiva === 'controlados' && controlados?.metadados) ||
    null;

  return (
    <section>
      <div className="screen-head">
        <h1>Relatórios</h1>
        <span className="screen-tag">exportação em PDF / Excel</span>
      </div>

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
          {permissoes.relatoriosFinanceiro && (
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
          {ABAS_COM_PERIODO.includes(abaAtiva) && (
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
          {abaAtiva === 'consumo' && (
            <div className="field">
              <label htmlFor="filtro-setor">Setor</label>
              <select id="filtro-setor" value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
                <option value="">Todos os setores</option>
                {SETORES_DISPENSACAO.map((setor) => (
                  <option key={setor} value={setor}>
                    {setor}
                  </option>
                ))}
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
          {abaAtiva === 'controlados' && (
            <div className="field">
              <label htmlFor="filtro-dias-controlado">Dias mínimo (0 = qualquer dispensação)</label>
              <input
                id="filtro-dias-controlado"
                type="number"
                min={0}
                placeholder="0"
                value={diasMinimoControlado}
                onChange={(e) => setDiasMinimoControlado(e.target.value)}
              />
            </div>
          )}
        </div>

        {carregando && <p className="carregando">Carregando relatório…</p>}

        {!carregando && abaAtiva === 'consolidado' && (
          <TabelaConsolidado dados={consolidado} ehCoordenador={ehCoordenador} />
        )}
        {!carregando && abaAtiva === 'custo' && <TabelaCusto dados={custo} />}
        {!carregando && abaAtiva === 'consumo' && <TabelaConsumo dados={consumo} />}
        {!carregando && abaAtiva === 'transferencias' && <TabelaTransferencias dados={transferencias} />}
        {!carregando && abaAtiva === 'auditoria' && (
          <TabelaAuditoria dados={auditoria} onCarregarMais={() => setLimiteAuditoria((l) => l + AUDITORIA_LIMITE_PASSO)} />
        )}
        {!carregando && abaAtiva === 'vencimentos' && <TabelaVencimentos dados={vencimentos} ehCoordenador={ehCoordenador} />}
        {!carregando && abaAtiva === 'critico' && <TabelaEstoqueCritico dados={critico} />}
        {!carregando && abaAtiva === 'antimicrobianos' && (
          <TabelaAntimicrobianos
            dados={antimicrobianos}
            vazio={(dias) => `Nenhum paciente com uso de antimicrobiano acima de ${dias} dias no momento.`}
          />
        )}
        {!carregando && abaAtiva === 'controlados' && (
          <TabelaAntimicrobianos dados={controlados} vazio={() => 'Nenhuma dispensação de medicamento controlado no momento.'} />
        )}

        <div className="actions">
          <button type="button" className="btn ghost" disabled={exportando !== null} onClick={() => exportar('pdf')}>
            {exportando === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}
          </button>
          <button type="button" className="btn ghost" disabled={exportando !== null} onClick={() => exportar('excel')}>
            {exportando === 'excel' ? 'Gerando Excel…' : 'Exportar Excel'}
          </button>
        </div>
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

function TabelaConsumo({ dados }: { dados: RelatorioConsumoMedicamentosOut | null }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Setor</th>
            <th>Mês</th>
            <th className="num">Quantidade consumida</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={4} className="vazio-tabela">
                Sem consumo registrado no período.
              </td>
            </tr>
          )}
          {dados.itens.map((item) => (
            <tr key={`${item.medicamento_id}-${item.mes}-${item.setor}`}>
              <td>{item.nome}</td>
              <td>{item.setor}</td>
              <td className="mono">{item.mes}</td>
              <td className="num">{item.quantidade_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaEstoqueCritico({ dados }: { dados: RelatorioEstoqueCriticoOut | null }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th className="num">Qtd. Atual</th>
            <th className="num">Estoque Mínimo</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={3} className="vazio-tabela">
                Nenhum medicamento em estoque crítico.
              </td>
            </tr>
          )}
          {dados.itens.map((item) => (
            <tr key={item.medicamento_id}>
              <td>{item.nome}</td>
              <td className="num">{item.quantidade_atual}</td>
              <td className="num">{item.estoque_minimo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaTransferencias({ dados }: { dados: RelatorioTransferenciasOut | null }) {
  if (!dados) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Medicamento</th>
            <th>Lote</th>
            <th>Origem</th>
            <th>Destino</th>
            <th className="num">Qtd. enviada</th>
            <th className="num">Qtd. recebida</th>
            <th>Enviado por</th>
            <th>Confirmado por</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.length === 0 && (
            <tr>
              <td colSpan={9} className="vazio-tabela">
                Nenhuma transferência no período.
              </td>
            </tr>
          )}
          {dados.itens.map((mov) => {
            const divergiu = mov.quantidade_recebida !== null && mov.quantidade_recebida !== mov.quantidade;
            return (
              <tr key={mov.id}>
                <td className="mono">{formatarDataHora(mov.data_hora)}</td>
                <td>{mov.lote.medicamento.nome}</td>
                <td className="mono">{mov.lote.numero_lote}</td>
                <td>{mov.unidade_origem?.nome ?? '—'}</td>
                <td>{mov.unidade_destino?.nome ?? '—'}</td>
                <td className="num">{mov.quantidade}</td>
                <td className="num">
                  {mov.quantidade_recebida ?? '—'}
                  {divergiu && <span className="pill danger" style={{ marginLeft: 6 }}>divergiu</span>}
                </td>
                <td>{mov.usuario.nome}</td>
                <td>{mov.usuario_confirmacao?.nome ?? <span className="pill pend">pendente</span>}</td>
              </tr>
            );
          })}
        </tbody>
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

function TabelaAuditoria({ dados, onCarregarMais }: { dados: RelatorioAuditoriaOut | null; onCarregarMais: () => void }) {
  if (!dados) return null;
  const temMais = dados.itens.length < dados.total;
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        Mostrando {dados.itens.length} de {dados.total} movimentação(ões).
      </p>
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
      {temMais && (
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={onCarregarMais}>
            Carregar mais {Math.min(200, dados.total - dados.itens.length)}
          </button>
        </div>
      )}
    </>
  );
}

function TabelaAntimicrobianos({
  dados,
  vazio,
}: {
  dados: RelatorioAntimicrobianoOut | null;
  vazio: (diasMinimo: number) => string;
}) {
  if (!dados) return null;
  return (
    <>
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
                  {vazio(dados.dias_minimo)}
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
