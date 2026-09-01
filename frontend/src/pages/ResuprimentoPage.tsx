import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, baixarArquivo, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData, formatarDataHora } from '../lib/formato';
import type { LoteDetalhadoOut, MedicamentoOut, SolicitacaoOut, StatusRessuprimentoItem, UnidadeOut } from '../types';

type Aba = 'solicitar' | 'pontos';

const LABEL_STATUS_SOLICITACAO: Record<string, string> = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  recusada: 'Recusada',
};

/** Ressuprimento — fluxo PULL (a satélite pede/monitora), separado da
 * tela Transferência (fluxo PUSH — a CAF/Farmacêutico manda direto),
 * 2026-08-31, pedido do cliente.
 *
 * Aba "Solicitar" (todos os perfis): pedir um medicamento à CAF + ver
 * minhas solicitações + (só CAF/Farmacêutico/Coordenador) atender
 * solicitações pendentes de outras unidades — mesmos painéis que
 * existiam em TransferenciaPage.tsx antes, só mudaram de tela. Também
 * mostra a notificação "precisa ressuprir" da própria unidade ativa,
 * liberada a qualquer perfil.
 *
 * Aba "Pontos de Ressuprimento" (só Farmacêutico/Coordenador): cadastro
 * de quantidade padrão/mínima por medicamento em cada unidade satélite —
 * é o que alimenta a notificação acima. */
export function ResuprimentoPage() {
  const { usuario, token, matrizPermissoes } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  const [aba, setAba] = useState<Aba>('solicitar');
  const abas: Aba[] = permissoes.configurarRessuprimento ? ['solicitar', 'pontos'] : ['solicitar'];

  return (
    <section>
      <div className="screen-head">
        <h1>Ressuprimento</h1>
        <span className="screen-tag">solicitar à CAF e pontos de ressuprimento</span>
      </div>
      <p className="screen-sub">
        Peça um medicamento diretamente à CAF, acompanhe suas solicitações, e veja quando sua unidade está abaixo do
        ponto de ressuprimento configurado.
      </p>

      {abas.length > 1 && (
        <div className="tabs2" role="tablist">
          {abas.map((a) => (
            <button key={a} type="button" role="tab" className="tab2" aria-selected={aba === a} onClick={() => setAba(a)}>
              {a === 'solicitar' ? 'Solicitar' : 'Pontos de Ressuprimento'}
            </button>
          ))}
        </div>
      )}

      {aba === 'solicitar' && (
        <>
          <NotificacaoRessuprimento token={token} unidadeAtivaId={unidadeAtivaId} />
          {permissoes.solicitarTransferencia && <PainelSolicitar token={token} />}
          {permissoes.atenderSolicitacao && <PainelAtenderSolicitacoes token={token} />}
        </>
      )}
      {aba === 'pontos' && permissoes.configurarRessuprimento && <PainelPontosRessuprimento token={token} />}
    </section>
  );
}

/** Notificação "precisa ressuprir" — sempre a própria unidade ativa,
 * qualquer perfil (é o profissional da satélite que vai perceber e
 * providenciar o pedido). Não aparece pra quem não tem unidade ativa
 * (Admin) nem quando não há nenhum ponto configurado/abaixo do
 * mínimo. */
function NotificacaoRessuprimento({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [itens, setItens] = useState<StatusRessuprimentoItem[]>([]);

  useEffect(() => {
    if (!token || unidadeAtivaId == null) return;
    api
      .get<StatusRessuprimentoItem[]>('/ressuprimento/status', { token, params: { unidade_id: unidadeAtivaId } })
      .then((lista) => setItens(lista.filter((i) => i.precisa_ressuprir)))
      .catch(() => {});
  }, [token, unidadeAtivaId]);

  if (itens.length === 0) return null;

  return (
    <Alerta tipo="info">
      <strong>{itens.length}</strong> medicamento{itens.length > 1 ? 's' : ''} abaixo do ponto de ressuprimento nesta
      unidade:{' '}
      {itens
        .map((i) => `${i.medicamento_nome} (tem ${i.quantidade_atual}, mínimo ${i.quantidade_minima} — pedir ${i.quantidade_sugerida})`)
        .join('; ')}
    </Alerta>
  );
}

/** Solicitação de transferência satélite -> CAF (2026-08-20) — qualquer
 * perfil de uma unidade que não seja CAF pode pedir um medicamento à
 * CAF pelo sistema. A CAF aceita (escolhendo o lote) ou recusa (com
 * motivo) no painel `PainelAtenderSolicitacoes` logo abaixo. */
interface ItemCarrinhoSolicitacao {
  medicamento: MedicamentoOut;
  quantidade: string;
}

/** Solicitação em lote (2026-08-31, pedido do cliente: "tipo uma lista,
 * para pedir de vários medicamentos de uma vez") — monta uma listinha
 * local antes de enviar tudo numa chamada só (POST /solicitacoes/lote),
 * uma `SolicitacaoTransferencia` por item no backend. */
function PainelSolicitar({ token }: { token: string | null }) {
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [quantidadeDesejada, setQuantidadeDesejada] = useState('');
  const [observacao, setObservacao] = useState('');
  const [itensLista, setItensLista] = useState<ItemCarrinhoSolicitacao[]>([]);

  const [minhasSolicitacoes, setMinhasSolicitacoes] = useState<SolicitacaoOut[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [imprimindoId, setImprimindoId] = useState<number | null>(null);

  async function imprimirComprovante(solicitacaoId: number) {
    setErro(null);
    setImprimindoId(solicitacaoId);
    try {
      await baixarArquivo(`/solicitacoes/${solicitacaoId}/comprovante`, { token, params: { formato: 'pdf' } });
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível gerar o comprovante.'));
    } finally {
      setImprimindoId(null);
    }
  }

  const carregar = useCallback(() => {
    if (!token) return;
    setCarregando(true);
    api
      .get<SolicitacaoOut[]>('/solicitacoes', { token })
      .then(setMinhasSolicitacoes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar suas solicitações.')))
      .finally(() => setCarregando(false));
  }, [token]);

  useEffect(() => {
    carregar();
    if (!token) return;
    api.get<MedicamentoOut[]>('/medicamentos', { token }).then(setMedicamentos).catch(() => {});
  }, [carregar, token]);

  function adicionarNaLista() {
    setErro(null);
    if (!medicamentoSelecionado) {
      setErro('Selecione um medicamento.');
      return;
    }
    const quantidade = Number(quantidadeDesejada);
    if (!quantidade || quantidade <= 0) {
      setErro('Informe uma quantidade desejada válida.');
      return;
    }
    if (itensLista.some((i) => i.medicamento.id === medicamentoSelecionado.id)) {
      setErro(`${medicamentoSelecionado.nome} já está na lista.`);
      return;
    }
    setItensLista((atual) => [...atual, { medicamento: medicamentoSelecionado, quantidade: quantidadeDesejada }]);
    setBusca('');
    setMedicamentoSelecionado(null);
    setQuantidadeDesejada('');
  }

  function removerDaLista(medicamentoId: number) {
    setItensLista((atual) => atual.filter((i) => i.medicamento.id !== medicamentoId));
  }

  async function enviarLista() {
    setErro(null);
    setSucesso(null);
    if (itensLista.length === 0) {
      setErro('Adicione ao menos um medicamento à lista antes de solicitar.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/solicitacoes/lote',
        {
          itens: itensLista.map((i) => ({ medicamento_id: i.medicamento.id, quantidade_desejada: Number(i.quantidade) })),
          observacao: observacao.trim() || null,
        },
        { token },
      );
      setSucesso(`${itensLista.length} solicitação(ões) enviada(s) à CAF.`);
      setItensLista([]);
      setObservacao('');
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível enviar a lista de solicitações.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="panel">
        <h2>Solicitar transferência à CAF</h2>
        <p className="screen-sub">Adicione um ou mais medicamentos à lista e envie tudo de uma vez.</p>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
        <div className="grid">
          <div className="field span2">
            <label htmlFor="busca-medicamento-solicitacao">Medicamento</label>
            <BuscaAutocomplete
              id="busca-medicamento-solicitacao"
              itens={medicamentos.filter((m) => !itensLista.some((i) => i.medicamento.id === m.id))}
              valor={medicamentoSelecionado ? medicamentoSelecionado.nome : busca}
              aoMudarValor={(v) => {
                setBusca(v);
                setMedicamentoSelecionado(null);
              }}
              rotulo={(m) => m.nome}
              chave={(m) => m.id}
              aoSelecionar={(m) => {
                setMedicamentoSelecionado(m);
                setBusca(m.nome);
              }}
              placeholder="buscar medicamento…"
            />
          </div>
          <div className="field">
            <label htmlFor="qtd-solicitacao">Quantidade desejada</label>
            <input
              id="qtd-solicitacao"
              type="number"
              min={1}
              placeholder="0"
              value={quantidadeDesejada}
              onChange={(e) => setQuantidadeDesejada(e.target.value)}
            />
          </div>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn ghost" onClick={adicionarNaLista}>
            + Adicionar à lista
          </button>
        </div>

        {itensLista.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th className="num">Qtd. desejada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itensLista.map((i) => (
                  <tr key={i.medicamento.id}>
                    <td>{i.medicamento.nome}</td>
                    <td className="num">{i.quantidade}</td>
                    <td>
                      <button type="button" className="btn ghost sm" onClick={() => removerDaLista(i.medicamento.id)}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="obs-solicitacao">Observação (vale para toda a lista)</label>
          <input
            id="obs-solicitacao"
            type="text"
            placeholder="ex.: urgência, motivo…"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
        <div className="actions">
          <button type="button" className="btn" disabled={enviando || itensLista.length === 0} onClick={enviarLista}>
            {enviando ? 'Enviando…' : `Solicitar ${itensLista.length > 0 ? `(${itensLista.length})` : ''}`}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Minhas solicitações</h2>
        {carregando && <p className="carregando">Carregando…</p>}
        {!carregando && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th className="num">Qtd. desejada</th>
                  <th>Status</th>
                  <th>Detalhe</th>
                  <th>Solicitada em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {minhasSolicitacoes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="vazio-tabela">
                      Nenhuma solicitação registrada.
                    </td>
                  </tr>
                )}
                {minhasSolicitacoes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.medicamento.nome}</td>
                    <td className="num">{s.quantidade_desejada}</td>
                    <td>
                      <span
                        className={`pill ${s.status === 'aceita' ? 'ok' : s.status === 'recusada' ? 'danger' : 'pend'}`}
                      >
                        {LABEL_STATUS_SOLICITACAO[s.status]}
                      </span>
                    </td>
                    <td>{s.status === 'recusada' ? s.motivo_recusa ?? '—' : s.status === 'aceita' ? 'transferência enviada' : '—'}</td>
                    <td className="mono">{formatarDataHora(s.data_solicitacao)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={imprimindoId === s.id}
                        onClick={() => imprimirComprovante(s.id)}
                      >
                        {imprimindoId === s.id ? 'Gerando…' : 'Imprimir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** Atender (aceitar/recusar) solicitações — só na CAF, Farmacêutico/
 * Coordenador (mesma regra de quem já pode enviar transferência normal,
 * já que aceitar dispara exatamente essa ação — já nasce confirmada,
 * ver TransferenciaService.enviar). */
function PainelAtenderSolicitacoes({ token }: { token: string | null }) {
  const [pendentes, setPendentes] = useState<SolicitacaoOut[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [atendendoId, setAtendendoId] = useState<number | null>(null);
  const [lotesPorSolicitacao, setLotesPorSolicitacao] = useState<Record<number, LoteDetalhadoOut[]>>({});
  const [loteEscolhido, setLoteEscolhido] = useState<Record<number, number>>({});
  const [quantidadeEnvio, setQuantidadeEnvio] = useState<Record<number, string>>({});
  const [motivoRecusa, setMotivoRecusa] = useState<Record<number, string>>({});
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  const carregar = useCallback(() => {
    if (!token) return;
    setCarregando(true);
    api
      .get<SolicitacaoOut[]>('/solicitacoes', { token, params: { status: 'pendente' } })
      .then(setPendentes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as solicitações pendentes.')))
      .finally(() => setCarregando(false));
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirAtendimento(s: SolicitacaoOut) {
    setAtendendoId(s.id);
    setErro(null);
    if (lotesPorSolicitacao[s.id] || !token) return;
    try {
      const lotes = await api.get<LoteDetalhadoOut[]>('/lotes/busca-fefo', {
        token,
        params: { medicamento_id: s.medicamento_id },
      });
      setLotesPorSolicitacao((atual) => ({ ...atual, [s.id]: lotes }));
      const sugerido = lotes.find((l) => l.sugerido_fefo) ?? lotes[0];
      if (sugerido) setLoteEscolhido((atual) => ({ ...atual, [s.id]: sugerido.id }));
      setQuantidadeEnvio((atual) => ({ ...atual, [s.id]: String(s.quantidade_desejada) }));
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível buscar lotes disponíveis na CAF para este medicamento.'));
    }
  }

  async function aceitar(s: SolicitacaoOut) {
    const loteId = loteEscolhido[s.id];
    const quantidade = Number(quantidadeEnvio[s.id]);
    if (!loteId) {
      setErro('Selecione um lote para enviar.');
      return;
    }
    setProcessandoId(s.id);
    setErro(null);
    setSucesso(null);
    try {
      await api.post(`/solicitacoes/${s.id}/aceitar`, { lote_id: loteId, quantidade }, { token });
      setSucesso(`Solicitação de ${s.unidade_solicitante.nome} atendida.`);
      setAtendendoId(null);
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível aceitar a solicitação.'));
    } finally {
      setProcessandoId(null);
    }
  }

  async function recusar(s: SolicitacaoOut) {
    const motivo = (motivoRecusa[s.id] ?? '').trim();
    if (!motivo) {
      setErro('Informe o motivo da recusa.');
      return;
    }
    setProcessandoId(s.id);
    setErro(null);
    setSucesso(null);
    try {
      await api.post(`/solicitacoes/${s.id}/recusar`, { motivo_recusa: motivo }, { token });
      setSucesso(`Solicitação de ${s.unidade_solicitante.nome} recusada.`);
      setAtendendoId(null);
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível recusar a solicitação.'));
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="panel">
      <h2>Solicitações pendentes de outras unidades</h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      {carregando && <p className="carregando">Carregando…</p>}
      {!carregando && pendentes.length === 0 && <p className="vazio-tabela">Nenhuma solicitação pendente.</p>}
      {!carregando &&
        pendentes.map((s) => (
          <div key={s.id} className="box" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>
                <b>{s.unidade_solicitante.nome}</b> pediu <b>{s.medicamento.nome}</b> · qtd. {s.quantidade_desejada}
                {s.observacao ? ` · "${s.observacao}"` : ''}
              </span>
              <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                {s.usuario_solicitante.nome} · {formatarData(s.data_solicitacao)}
              </span>
            </div>

            {atendendoId !== s.id ? (
              <div className="actions">
                <button type="button" className="btn ghost sm" onClick={() => abrirAtendimento(s)}>
                  Atender
                </button>
              </div>
            ) : (
              <div className="grid">
                <div className="field span2">
                  <label>Lote a enviar (estoque da CAF)</label>
                  <select
                    value={loteEscolhido[s.id] ?? ''}
                    onChange={(e) => setLoteEscolhido((atual) => ({ ...atual, [s.id]: Number(e.target.value) }))}
                  >
                    <option value="">Selecione…</option>
                    {(lotesPorSolicitacao[s.id] ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual}
                        {l.sugerido_fefo ? ' · sugerido (usar primeiro)' : ''}
                      </option>
                    ))}
                  </select>
                  {(lotesPorSolicitacao[s.id] ?? []).length === 0 && (
                    <span className="tag">nenhum lote disponível na CAF para este medicamento</span>
                  )}
                </div>
                <div className="field">
                  <label>Quantidade a enviar</label>
                  <input
                    type="number"
                    min={1}
                    value={quantidadeEnvio[s.id] ?? ''}
                    onChange={(e) => setQuantidadeEnvio((atual) => ({ ...atual, [s.id]: e.target.value }))}
                  />
                </div>
                <div className="field span2">
                  <label>Motivo da recusa (só se for recusar)</label>
                  <input
                    type="text"
                    placeholder="ex.: sem saldo disponível"
                    value={motivoRecusa[s.id] ?? ''}
                    onChange={(e) => setMotivoRecusa((atual) => ({ ...atual, [s.id]: e.target.value }))}
                  />
                </div>
                <div className="field span2 actions" style={{ marginTop: 0 }}>
                  <button type="button" className="btn ok sm" disabled={processandoId === s.id} onClick={() => aceitar(s)}>
                    {processandoId === s.id ? 'Enviando…' : 'Aceitar e enviar'}
                  </button>
                  <button type="button" className="btn danger sm" disabled={processandoId === s.id} onClick={() => recusar(s)}>
                    Recusar
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => setAtendendoId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

/** Pontos de ressuprimento — exclusivo Farmacêutico/Coordenador
 * (2026-08-31, pedido do cliente): quantidade padrão/mínima por
 * medicamento, numa unidade satélite escolhida. */
function PainelPontosRessuprimento({ token }: { token: string | null }) {
  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  const [unidadeId, setUnidadeId] = useState('');
  const [pontos, setPontos] = useState<StatusRessuprimentoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [edicoes, setEdicoes] = useState<Record<number, { padrao: string; minima: string }>>({});
  const [salvandoId, setSalvandoId] = useState<number | null>(null);

  // Novo ponto
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoNovo, setMedicamentoNovo] = useState<MedicamentoOut | null>(null);
  const [padraoNovo, setPadraoNovo] = useState('');
  const [minimaNovo, setMinimaNovo] = useState('');
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    if (!token) return;
    // Só as satélites (não CAF — CAF é a origem, não faz sentido ter
    // ponto de ressuprimento dela mesma).
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } })
      .then((lista) => setUnidades(lista.filter((u) => u.nome.trim().toUpperCase() !== 'CAF')))
      .catch(() => {});
    api.get<MedicamentoOut[]>('/medicamentos', { token }).then(setMedicamentos).catch(() => {});
  }, [token]);

  const carregarPontos = useCallback(() => {
    if (!token || !unidadeId) {
      setPontos([]);
      return;
    }
    setCarregando(true);
    setErro(null);
    api
      .get<StatusRessuprimentoItem[]>('/ressuprimento/status', { token, params: { unidade_id: Number(unidadeId) } })
      .then((lista) => {
        setPontos(lista);
        setEdicoes(
          Object.fromEntries(
            lista.map((p) => [p.medicamento_id, { padrao: String(p.quantidade_padrao), minima: String(p.quantidade_minima) }]),
          ),
        );
      })
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os pontos de ressuprimento.')))
      .finally(() => setCarregando(false));
  }, [token, unidadeId]);

  useEffect(() => {
    carregarPontos();
  }, [carregarPontos]);

  async function salvarPonto(medicamentoId: number) {
    const edicao = edicoes[medicamentoId];
    if (!edicao) return;
    const padrao = Number(edicao.padrao);
    const minima = Number(edicao.minima);
    if (Number.isNaN(padrao) || Number.isNaN(minima) || padrao < 0 || minima < 0) {
      setErro('Informe quantidades válidas (padrão e mínima).');
      return;
    }
    setErro(null);
    setSucesso(null);
    setSalvandoId(medicamentoId);
    try {
      await api.put(
        '/ressuprimento/pontos',
        { medicamento_id: medicamentoId, unidade_id: Number(unidadeId), quantidade_padrao: padrao, quantidade_minima: minima },
        { token },
      );
      setSucesso('Ponto de ressuprimento atualizado.');
      carregarPontos();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar o ponto de ressuprimento.'));
    } finally {
      setSalvandoId(null);
    }
  }

  async function adicionarPonto(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!unidadeId) {
      setErro('Selecione uma unidade.');
      return;
    }
    if (!medicamentoNovo) {
      setErro('Selecione um medicamento.');
      return;
    }
    const padrao = Number(padraoNovo);
    const minima = Number(minimaNovo);
    if (Number.isNaN(padrao) || Number.isNaN(minima) || padrao < 0 || minima < 0) {
      setErro('Informe quantidades válidas (padrão e mínima).');
      return;
    }
    setAdicionando(true);
    try {
      await api.put(
        '/ressuprimento/pontos',
        { medicamento_id: medicamentoNovo.id, unidade_id: Number(unidadeId), quantidade_padrao: padrao, quantidade_minima: minima },
        { token },
      );
      setSucesso(`Ponto de ressuprimento de ${medicamentoNovo.nome} cadastrado.`);
      setBusca('');
      setMedicamentoNovo(null);
      setPadraoNovo('');
      setMinimaNovo('');
      carregarPontos();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível cadastrar o ponto de ressuprimento.'));
    } finally {
      setAdicionando(false);
    }
  }

  const medicamentosDisponiveis = medicamentos.filter((m) => !pontos.some((p) => p.medicamento_id === m.id));

  return (
    <>
      <div className="panel">
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="unidade-ressuprimento">Unidade satélite</label>
          <select id="unidade-ressuprimento" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
            <option value="">Selecione…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      {unidadeId && (
        <>
          <div className="panel">
            <h2>Pontos configurados</h2>
            {carregando && <p className="carregando">Carregando…</p>}
            {!carregando && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Medicamento</th>
                      <th className="num">Qtd. atual</th>
                      <th className="num">Qtd. mínima</th>
                      <th className="num">Qtd. padrão</th>
                      <th>Situação</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pontos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="vazio-tabela">
                          Nenhum ponto de ressuprimento cadastrado para esta unidade ainda.
                        </td>
                      </tr>
                    )}
                    {pontos.map((p) => (
                      <tr key={p.medicamento_id}>
                        <td>{p.medicamento_nome}</td>
                        <td className="num">{p.quantidade_atual}</td>
                        <td className="num" style={{ width: 100 }}>
                          <input
                            type="number"
                            min={0}
                            value={edicoes[p.medicamento_id]?.minima ?? ''}
                            onChange={(e) =>
                              setEdicoes((atual) => ({
                                ...atual,
                                [p.medicamento_id]: { ...atual[p.medicamento_id], minima: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="num" style={{ width: 100 }}>
                          <input
                            type="number"
                            min={0}
                            value={edicoes[p.medicamento_id]?.padrao ?? ''}
                            onChange={(e) =>
                              setEdicoes((atual) => ({
                                ...atual,
                                [p.medicamento_id]: { ...atual[p.medicamento_id], padrao: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td>
                          {p.precisa_ressuprir ? (
                            <span className="pill danger">precisa ressuprir ({p.quantidade_sugerida})</span>
                          ) : (
                            <span className="pill ok">ok</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={salvandoId === p.medicamento_id}
                            onClick={() => salvarPonto(p.medicamento_id)}
                          >
                            {salvandoId === p.medicamento_id ? 'Salvando…' : 'Salvar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form className="panel" onSubmit={adicionarPonto}>
            <h2>Cadastrar novo ponto</h2>
            <div className="grid">
              <div className="field span2">
                <label>Medicamento</label>
                <BuscaAutocomplete
                  itens={medicamentosDisponiveis}
                  valor={medicamentoNovo ? medicamentoNovo.nome : busca}
                  aoMudarValor={(v) => {
                    setBusca(v);
                    setMedicamentoNovo(null);
                  }}
                  rotulo={(m) => m.nome}
                  chave={(m) => m.id}
                  aoSelecionar={(m) => {
                    setMedicamentoNovo(m);
                    setBusca(m.nome);
                  }}
                  placeholder="buscar medicamento…"
                />
              </div>
              <div className="field">
                <label>Qtd. mínima (gatilho)</label>
                <input type="number" min={0} value={minimaNovo} onChange={(e) => setMinimaNovo(e.target.value)} />
              </div>
              <div className="field">
                <label>Qtd. padrão (alvo)</label>
                <input type="number" min={0} value={padraoNovo} onChange={(e) => setPadraoNovo(e.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button type="submit" className="btn" disabled={adicionando}>
                {adicionando ? 'Salvando…' : 'Cadastrar'}
              </button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
