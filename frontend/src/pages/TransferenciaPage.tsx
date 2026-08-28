import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData, formatarDataHora } from '../lib/formato';
import type { LoteDetalhadoOut, MedicamentoOut, MovimentacaoDetalhadaOut, SolicitacaoOut, UnidadeOut } from '../types';

/** Transferência entre unidades. "Enviar" é restrito a farmacêutico/
 * coordenador (regra do backend); "confirmar recebimento" é liberado a
 * qualquer perfil (regra 4 do doc), inclusive Atendente — por isso a
 * tela em si não some do menu para ninguém, só o painel de envio. */
export function TransferenciaPage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  return (
    <section>
      <div className="screen-head">
        <h1>Transferência entre unidades</h1>
        <span className="screen-tag">envio e confirmação de recebimento</span>
      </div>
      <p className="screen-sub">
        Transferência parcial gera um segundo lote no destino, vinculado ao lote de origem para rastreabilidade.
      </p>

      {permissoes.transferenciaEnviar && <PainelEnviar token={token} unidadeAtivaId={unidadeAtivaId} />}
      {permissoes.devolverCarrinho && <PainelDevolverCarrinho token={token} unidadeAtivaId={unidadeAtivaId} />}
      <PainelConfirmar token={token} unidadeAtivaId={unidadeAtivaId} />
      {permissoes.solicitarTransferencia && <PainelSolicitar token={token} />}
      {permissoes.atenderSolicitacao && <PainelAtenderSolicitacoes token={token} />}
    </section>
  );
}

function PainelEnviar({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [unidadeDestinoId, setUnidadeDestinoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarLotes = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    api
      .get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: unidadeAtivaId } })
      .then(setLotes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os lotes da unidade ativa.')));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregarLotes();
    if (!token) return;
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } })
      .then((lista) => setUnidades(lista.filter((u) => u.id !== unidadeAtivaId)))
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as unidades.')));
  }, [carregarLotes, token, unidadeAtivaId]);

  function limpar() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
    setUnidadeDestinoId('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote de origem.');
      return;
    }
    if (!unidadeDestinoId) {
      setErro('Selecione a unidade de destino.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/transferencias/enviar',
        {
          lote_id: loteSelecionado.id,
          quantidade: Number(quantidade),
          unidade_destino_id: Number(unidadeDestinoId),
        },
        { token },
      );
      setSucesso('Transferência enviada com sucesso.');
      limpar();
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível enviar a transferência.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="panel" onSubmit={aoSubmeter}>
      <h2>Enviar lote</h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-transf">
            Lote de origem <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-lote-transf"
            itens={lotes}
            valor={loteSelecionado ? `${loteSelecionado.medicamento.nome} · ${loteSelecionado.numero_lote}` : busca}
            aoMudarValor={(v) => {
              setBusca(v);
              setLoteSelecionado(null);
            }}
            rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · saldo ${l.quantidade_atual} · ${l.unidade.nome}`}
            chave={(l) => l.id}
            aoSelecionar={(l) => {
              setLoteSelecionado(l);
              setBusca(`${l.medicamento.nome} · ${l.numero_lote}`);
            }}
            placeholder="buscar por medicamento ou nº do lote — unidade ativa"
          />
        </div>
        <div className="field">
          <label>
            Quantidade disponível <span className="tag">auto</span>
          </label>
          <input type="text" disabled value={loteSelecionado?.quantidade_atual ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="qtd-enviar">
            Quantidade a enviar <span className="req">*</span>
          </label>
          <input
            id="qtd-enviar"
            type="number"
            min={1}
            max={loteSelecionado?.quantidade_atual}
            placeholder={loteSelecionado ? `≤ ${loteSelecionado.quantidade_atual}` : '0'}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </div>
        <div className="field span2">
          <label htmlFor="unidade-destino">
            Unidade de destino <span className="req">*</span>
          </label>
          <select id="unidade-destino" value={unidadeDestinoId} onChange={(e) => setUnidadeDestinoId(e.target.value)} required>
            <option value="">Selecione…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </form>
  );
}

/** Devolução de carrinho -> CAF (seção 22 do doc): espelho da Reposição,
 * mas em DUAS etapas — esta tela só envia (fica pendente); a CAF confirma
 * no painel de Confirmar recebimento logo abaixo, o mesmo que já existe
 * para qualquer Transferência normal (nenhuma mudança precisou ser feita
 * ali, ele já lista qualquer pendente da unidade ativa). Exclusiva do
 * Farmacêutico, sem restrição de unidade — qualquer unidade real pode ter
 * carrinhos filhos com saldo pra devolver. */
function PainelDevolverCarrinho({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotesCarrinho, setLotesCarrinho] = useState<LoteDetalhadoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarLotes = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    api
      .get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: unidadeAtivaId } })
      // GET /lotes já devolve unidade ativa + carrinhos filhos combinados;
      // devolução só faz sentido a partir de um carrinho, filtra no cliente.
      .then((lista) => setLotesCarrinho(lista.filter((l) => l.unidade.tipo === 'carrinho')))
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os lotes dos carrinhos da unidade.')));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregarLotes();
  }, [carregarLotes]);

  function limpar() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote em um carrinho da unidade.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/transferencias/devolver-carrinho',
        { lote_id: loteSelecionado.id, quantidade: Number(quantidade) },
        { token },
      );
      setSucesso('Devolução enviada — pendente até a CAF confirmar o recebimento.');
      limpar();
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar a devolução.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="panel" onSubmit={aoSubmeter}>
      <h2>Devolver carrinho ao CAF</h2>
      <p className="screen-sub">
        Destino: <b>CAF</b> (sempre, não é uma escolha). Diferente da reposição, que já sai recebida no destino, a
        devolução fica pendente até alguém confirmar na CAF.
      </p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-devolucao">
            Lote (em um carrinho da unidade ativa) <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-lote-devolucao"
            itens={lotesCarrinho}
            valor={loteSelecionado ? `${loteSelecionado.medicamento.nome} · ${loteSelecionado.numero_lote}` : busca}
            aoMudarValor={(v) => {
              setBusca(v);
              setLoteSelecionado(null);
            }}
            rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · saldo ${l.quantidade_atual} · ${l.unidade.nome}`}
            chave={(l) => l.id}
            aoSelecionar={(l) => {
              setLoteSelecionado(l);
              setBusca(`${l.medicamento.nome} · ${l.numero_lote}`);
            }}
            placeholder="buscar por medicamento ou nº do lote — carrinhos da unidade ativa"
          />
        </div>
        <div className="field">
          <label>
            Saldo no carrinho <span className="tag">auto</span>
          </label>
          <input type="text" disabled value={loteSelecionado?.quantidade_atual ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="qtd-devolver">
            Quantidade a devolver <span className="req">*</span>
          </label>
          <input
            id="qtd-devolver"
            type="number"
            min={1}
            max={loteSelecionado?.quantidade_atual}
            placeholder={loteSelecionado ? `≤ ${loteSelecionado.quantidade_atual}` : '0'}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Devolver ao CAF'}
        </button>
        <button type="button" className="btn ghost" onClick={limpar} disabled={enviando}>
          Cancelar
        </button>
      </div>
      <div className="note">Precisa de confirmação da CAF depois de enviada — não sai já recebida como a reposição.</div>
    </form>
  );
}

function PainelConfirmar({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [pendentes, setPendentes] = useState<MovimentacaoDetalhadaOut[]>([]);
  const [qtdRecebida, setQtdRecebida] = useState<Record<number, string>>({});
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    setCarregando(true);
    api
      .get<MovimentacaoDetalhadaOut[]>('/transferencias/pendentes', { token, params: { unidade_destino_id: unidadeAtivaId } })
      .then((lista) => {
        setPendentes(lista);
        setQtdRecebida(Object.fromEntries(lista.map((m) => [m.id, String(m.quantidade)])));
      })
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as transferências pendentes.')))
      .finally(() => setCarregando(false));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function confirmar(movimentacaoId: number) {
    setErro(null);
    setSucesso(null);
    setConfirmandoId(movimentacaoId);
    try {
      await api.post(
        `/transferencias/${movimentacaoId}/confirmar`,
        { quantidade_recebida: Number(qtdRecebida[movimentacaoId]) },
        { token },
      );
      setSucesso('Recebimento confirmado.');
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível confirmar o recebimento.'));
    } finally {
      setConfirmandoId(null);
    }
  }

  return (
    <div className="panel">
      <h2>Confirmar recebimento — pendentes na unidade ativa</h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      {carregando && <p className="carregando">Carregando…</p>}
      {!carregando && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Lote</th>
                <th>Origem</th>
                <th className="num">Qtd. enviada</th>
                <th>Qtd. recebida</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={6} className="vazio-tabela">
                    Nenhuma transferência pendente.
                  </td>
                </tr>
              )}
              {pendentes.map((mov) => (
                <tr key={mov.id}>
                  <td>{mov.lote.medicamento.nome}</td>
                  <td className="mono">{mov.lote.numero_lote}</td>
                  <td>{mov.unidade_origem?.nome ?? '—'}</td>
                  <td className="num">{mov.quantidade}</td>
                  <td style={{ width: 110 }}>
                    <input
                      type="number"
                      min={0}
                      value={qtdRecebida[mov.id] ?? ''}
                      onChange={(e) => setQtdRecebida((atual) => ({ ...atual, [mov.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button type="button" className="btn ok sm" disabled={confirmandoId === mov.id} onClick={() => confirmar(mov.id)}>
                      {confirmandoId === mov.id ? 'Confirmando…' : 'Confirmar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="note">Divergência entre enviado e recebido é registrada, não bloqueia a confirmação — só sinaliza para auditoria.</div>
    </div>
  );
}

const LABEL_STATUS_SOLICITACAO: Record<string, string> = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  recusada: 'Recusada',
};

/** Solicitação de transferência satélite -> CAF (2026-08-20): qualquer
 * perfil de uma unidade que não seja CAF pode pedir um medicamento à
 * CAF pelo sistema — antes disso só existia o fluxo push (a CAF decidia
 * sozinha o que enviar). A CAF aceita (escolhendo o lote) ou recusa
 * (com motivo) no painel `PainelAtenderSolicitacoes` logo abaixo. */
function PainelSolicitar({ token }: { token: string | null }) {
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [quantidadeDesejada, setQuantidadeDesejada] = useState('');
  const [observacao, setObservacao] = useState('');

  const [minhasSolicitacoes, setMinhasSolicitacoes] = useState<SolicitacaoOut[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

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

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!medicamentoSelecionado) {
      setErro('Selecione um medicamento.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/solicitacoes',
        {
          medicamento_id: medicamentoSelecionado.id,
          quantidade_desejada: Number(quantidadeDesejada),
          observacao: observacao.trim() || null,
        },
        { token },
      );
      setSucesso('Solicitação enviada à CAF.');
      setBusca('');
      setMedicamentoSelecionado(null);
      setQuantidadeDesejada('');
      setObservacao('');
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível enviar a solicitação.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <form className="panel" onSubmit={aoSubmeter}>
        <h2>Solicitar transferência à CAF</h2>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
        <div className="grid">
          <div className="field span2">
            <label htmlFor="busca-medicamento-solicitacao">
              Medicamento <span className="req">*</span>
            </label>
            <BuscaAutocomplete
              id="busca-medicamento-solicitacao"
              itens={medicamentos}
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
            <label htmlFor="qtd-solicitacao">
              Quantidade desejada <span className="req">*</span>
            </label>
            <input
              id="qtd-solicitacao"
              type="number"
              min={1}
              placeholder="0"
              value={quantidadeDesejada}
              onChange={(e) => setQuantidadeDesejada(e.target.value)}
              required
            />
          </div>
          <div className="field span2">
            <label htmlFor="obs-solicitacao">
              Observação
            </label>
            <input
              id="obs-solicitacao"
              type="text"
              placeholder="ex.: urgência, motivo…"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Solicitar'}
          </button>
        </div>
      </form>

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
                </tr>
              </thead>
              <tbody>
                {minhasSolicitacoes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="vazio-tabela">
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
 * já que aceitar dispara exatamente essa ação). */
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
                        {l.sugerido_fefo ? ' · sugerido (FEFO)' : ''}
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
