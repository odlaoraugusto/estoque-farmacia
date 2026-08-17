import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import {
  classeRailUnidade,
  diasAteVencer,
  formatarData,
  formatarMoeda,
  labelOrigem,
  labelAcondicionamento,
} from '../lib/formato';
import type { LoteDetalhadoOut, MedicamentoOut, RelatorioEstoqueConsolidadoOut, RelatorioVencimentosProximosOut, MovimentacaoDetalhadaOut } from '../types';

/** Home pós-login. Coordenador enxerga o consolidado de todas as
 * unidades aqui (GET /lotes sem unidade_id); os demais perfis ficam
 * restritos à unidade ativa — o próprio backend já resolve esse escopo
 * (resolver_unidade_escopo), o front só reflete o resultado. */
export function EstoquePage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);
  const ehCoordenador = usuario?.perfil === 'coordenador';

  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [vencimentos, setVencimentos] = useState<RelatorioVencimentosProximosOut | null>(null);
  const [pendentes, setPendentes] = useState<MovimentacaoDetalhadaOut[]>([]);
  const [consolidado, setConsolidado] = useState<RelatorioEstoqueConsolidadoOut | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    const chamadas: Promise<void>[] = [
      api.get<LoteDetalhadoOut[]>('/lotes', { token }).then((r) => {
        if (!cancelado) setLotes(r);
      }),
      api.get<MedicamentoOut[]>('/medicamentos', { token }).then((r) => {
        if (!cancelado) setMedicamentos(r);
      }),
      api.get<RelatorioVencimentosProximosOut>('/relatorios/vencimentos-proximos', { token }).then((r) => {
        if (!cancelado) setVencimentos(r);
      }),
      api.get<MovimentacaoDetalhadaOut[]>('/transferencias/pendentes', { token }).then((r) => {
        if (!cancelado) setPendentes(r);
      }),
    ];

    if (permissoes.relatoriosFinanceiro) {
      chamadas.push(
        api.get<RelatorioEstoqueConsolidadoOut>('/relatorios/estoque-consolidado', { token }).then((r) => {
          if (!cancelado) setConsolidado(r);
        }),
      );
    }

    Promise.all(chamadas)
      .catch((err) => {
        if (!cancelado) setErro(mensagemErro(err, 'Não foi possível carregar o estoque.'));
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, usuario?.unidade_ativa_id]);

  const itensEmRisco = useMemo(() => {
    // Semeia com TODOS os medicamentos ativos (saldo 0) antes de somar os
    // lotes — sem isso, um medicamento com estoque mínimo cadastrado mas
    // ZERO lotes (prateleira vazia, o caso mais crítico) nunca aparecia
    // aqui, porque não existia nenhuma linha de lote pra iterar. Mesma
    // regra do backend (`RelatorioService.estoque_critico`).
    const somaPorMedicamento = new Map<number, { nome: string; total: number; minimo: number }>();
    for (const medicamento of medicamentos) {
      somaPorMedicamento.set(medicamento.id, { nome: medicamento.nome, total: 0, minimo: medicamento.estoque_minimo });
    }
    for (const lote of lotes) {
      const atual = somaPorMedicamento.get(lote.medicamento_id);
      if (atual) {
        atual.total += lote.quantidade_atual;
      } else {
        somaPorMedicamento.set(lote.medicamento_id, {
          nome: lote.medicamento.nome,
          total: lote.quantidade_atual,
          minimo: lote.medicamento.estoque_minimo,
        });
      }
    }
    return [...somaPorMedicamento.values()].filter((m) => m.minimo > 0 && m.total < m.minimo);
  }, [lotes, medicamentos]);

  const vencidosEmBreve = useMemo(() => {
    const idsVencendo = new Set((vencimentos?.itens ?? []).map((l) => l.id));
    return idsVencendo;
  }, [vencimentos]);

  const tituloUnidade = ehCoordenador ? 'todas as unidades' : usuario?.unidade_ativa_nome ?? '—';

  return (
    <section>
      <div className="screen-head">
        <h1>Estoque atual — {tituloUnidade}</h1>
        <span className="screen-tag">landing pós-login</span>
      </div>
      <p className="screen-sub">
        {ehCoordenador
          ? 'Coordenador enxerga o consolidado de todas as unidades.'
          : 'Lotes disponíveis na sua unidade ativa.'}
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="tiles">
        <div className="tile">
          <div className="k">Itens em risco de ruptura</div>
          <div className={`v ${itensEmRisco.length > 0 ? 'warn' : ''}`}>{carregando ? '—' : itensEmRisco.length}</div>
        </div>
        <div className="tile">
          <div className="k">Lotes vencendo em {vencimentos?.dias_considerados ?? 30} dias</div>
          <div className={`v ${(vencimentos?.itens.length ?? 0) > 0 ? 'warn' : ''}`}>
            {carregando ? '—' : vencimentos?.itens.length ?? 0}
          </div>
        </div>
        <div className="tile">
          <div className="k">Transferências pendentes</div>
          <div className="v">{carregando ? '—' : pendentes.length}</div>
        </div>
        {permissoes.relatoriosFinanceiro && (
          <div className="tile">
            <div className="k">Valor total em estoque</div>
            <div className="v">{carregando ? '—' : formatarMoeda(consolidado?.valor_total_geral ?? '0')}</div>
          </div>
        )}
      </div>

      <div className={`panel ${ehCoordenador ? '' : classeRailUnidade(usuario?.unidade_ativa_nome)}`}>
        <h2>Lotes {ehCoordenador ? '— todas as unidades' : '— unidade ativa'}</h2>
        {carregando && <p className="carregando">Carregando lotes…</p>}
        {!carregando && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Lote</th>
                  <th>Unidade</th>
                  <th>Validade</th>
                  <th className="num">Qtd.</th>
                  <th>Acondic.</th>
                  <th>Origem</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lotes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="vazio-tabela">
                      Nenhum lote disponível.
                    </td>
                  </tr>
                )}
                {lotes.map((lote) => {
                  const dias = diasAteVencer(lote.data_validade);
                  const vencendo = vencidosEmBreve.has(lote.id);
                  return (
                    <tr key={lote.id}>
                      <td>{lote.medicamento.nome}</td>
                      <td className="mono">{lote.numero_lote}</td>
                      <td>{lote.unidade.nome}</td>
                      <td>{formatarData(lote.data_validade)}</td>
                      <td className="num">{lote.quantidade_atual}</td>
                      <td>{labelAcondicionamento(lote.medicamento.acondicionamento)}</td>
                      <td>{labelOrigem(lote.origem)}</td>
                      <td>
                        {lote.status_transferencia === 'em_transito' ? (
                          <span className="pill pend">em trânsito</span>
                        ) : vencendo ? (
                          <span className="pill pend">vence em {dias}d</span>
                        ) : (
                          <span className="pill muted">ok</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
