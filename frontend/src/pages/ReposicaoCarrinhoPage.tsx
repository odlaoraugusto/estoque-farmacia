import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData, formatarDataHora } from '../lib/formato';
import type { LoteDetalhadoOut, SolicitacaoRessuprimentoCarrinhoOut, UnidadeOut } from '../types';

type AbaCarrinho = 'repor' | 'solicitacoes';

/** Carrinhos de Emergência — duas abas: "Repor Carrinho" (farmacêutico/
 * coordenador, reabastece a partir do estoque da PRÓPRIA unidade que
 * hospeda o carrinho — 2026-08-31, pedido do cliente: antes só saía do
 * estoque da CAF) e "Solicitações de Ressuprimento" (qualquer perfil
 * operacional, inclusive Atendente — confirma o que o painel público
 * `/publico/ressuprimento-carrinho` registrou). */
export function ReposicaoCarrinhoPage() {
  const { usuario, token, matrizPermissoes } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  const [aba, setAba] = useState<AbaCarrinho>(permissoes.reporCarrinho ? 'repor' : 'solicitacoes');

  if (!permissoes.telasOperacionais) {
    return (
      <section>
        <div className="screen-head">
          <h1>Carrinhos de Emergência</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Seu perfil não tem acesso a esta tela.
        </div>
      </section>
    );
  }

  const abas: AbaCarrinho[] = permissoes.reporCarrinho ? ['repor', 'solicitacoes'] : ['solicitacoes'];

  return (
    <section>
      <div className="screen-head">
        <h1>Carrinhos de Emergência</h1>
      </div>

      {abas.length > 1 && (
        <div className="tabs2" role="tablist">
          {abas.map((a) => (
            <button key={a} type="button" role="tab" className="tab2" aria-selected={aba === a} onClick={() => setAba(a)}>
              {a === 'repor' ? 'Repor Carrinho' : 'Solicitações de Ressuprimento'}
            </button>
          ))}
        </div>
      )}

      {aba === 'repor' && permissoes.reporCarrinho && (
        <FormularioReposicao token={token} unidadeAtivaId={unidadeAtivaId} />
      )}
      {aba === 'solicitacoes' && <PainelSolicitacoesRessuprimento token={token} unidadeAtivaId={unidadeAtivaId} />}
    </section>
  );
}

function FormularioReposicao({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [carrinhos, setCarrinhos] = useState<UnidadeOut[]>([]);

  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [carrinhoDestinoId, setCarrinhoDestinoId] = useState('');

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
    if (!token || unidadeAtivaId == null) return;
    // Só os carrinhos filhos da unidade ativa — é o estoque dela que vai
    // ser usado pra repor (2026-08-31: cada satélite repõe os carrinhos
    // dela mesma, não mais só a CAF).
    api
      .get<UnidadeOut[]>('/unidades', { token })
      .then((lista) => setCarrinhos(lista.filter((u) => u.tipo === 'carrinho' && u.unidade_pai_id === unidadeAtivaId)))
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os carrinhos de emergência.')));
  }, [carregarLotes, token, unidadeAtivaId]);

  function limpar() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
    setCarrinhoDestinoId('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote.');
      return;
    }
    if (!carrinhoDestinoId) {
      setErro('Selecione o carrinho de destino.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/transferencias/repor-carrinho',
        {
          lote_id: loteSelecionado.id,
          quantidade: Number(quantidade),
          carrinho_destino_id: Number(carrinhoDestinoId),
        },
        { token },
      );
      setSucesso('Carrinho reposto — o lote já saiu como recebido no destino.');
      limpar();
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível repor o carrinho.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <p className="screen-sub">
        Reabastece um carrinho de emergência a partir do estoque da unidade ativa — sem etapa de confirmação, o lote já sai
        como recebido.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>Repor carrinho</h2>
        <div className="grid">
          <div className="field span2">
            <label htmlFor="busca-lote-carrinho">
              Lote (estoque da unidade ativa) <span className="req">*</span>
            </label>
            <BuscaAutocomplete
              id="busca-lote-carrinho"
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
              placeholder="buscar por medicamento ou nº do lote — estoque da unidade ativa"
            />
          </div>
          <div className="field">
            <label>
              Saldo disponível <span className="tag">auto</span>
            </label>
            <input type="text" disabled value={loteSelecionado?.quantidade_atual ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="qtd-repor">
              Quantidade a repor <span className="req">*</span>
            </label>
            <input
              id="qtd-repor"
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
            <label htmlFor="carrinho-destino">
              Carrinho de destino <span className="req">*</span>
            </label>
            <select
              id="carrinho-destino"
              value={carrinhoDestinoId}
              onChange={(e) => setCarrinhoDestinoId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {carrinhos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? 'Repondo…' : 'Repor carrinho'}
          </button>
          <button type="button" className="btn ghost" onClick={limpar} disabled={enviando}>
            Cancelar
          </button>
        </div>
        <div className="note">
          Reposição de estoque, não uma transferência com confirmação — ao enviar, o lote já nasce recebido no
          carrinho.
        </div>
      </form>
    </>
  );
}

/** Solicitações de ressuprimento de carrinho (2026-08-31, pedido do
 * cliente) — o que o painel público `/publico/ressuprimento-carrinho`
 * registrou, com as duas ações de confirmação independentes: saída
 * direta do carrinho (baixa do que foi usado) e transferência de
 * reposição (reabastece). Qualquer perfil operacional confirma. */
function PainelSolicitacoesRessuprimento({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [pendentes, setPendentes] = useState<SolicitacaoRessuprimentoCarrinhoOut[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    setCarregando(true);
    api
      .get<SolicitacaoRessuprimentoCarrinhoOut[]>('/ressuprimento-carrinho/pendentes', { token })
      .then(setPendentes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as solicitações pendentes.')))
      .finally(() => setCarregando(false));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (unidadeAtivaId == null) return null;

  return (
    <div className="panel">
      <h2>Solicitações de ressuprimento de carrinho</h2>
      <p className="screen-sub" style={{ marginTop: -4 }}>
        Registradas pelo formulário público quando o setor usa um carrinho de emergência, maleta ou kit.
      </p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {carregando && <p className="carregando">Carregando…</p>}
      {!carregando && pendentes.length === 0 && <p className="vazio-tabela">Nenhuma solicitação pendente.</p>}
      {!carregando &&
        pendentes.map((s) => (
          <CardSolicitacaoRessuprimento key={s.id} token={token} unidadeAtivaId={unidadeAtivaId} solicitacao={s} recarregar={carregar} />
        ))}
    </div>
  );
}

interface LinhaConfirmacao {
  medicamento_id: number;
  medicamento_nome: string;
  loteId: string;
  quantidade: string;
}

function CardSolicitacaoRessuprimento({
  token,
  unidadeAtivaId,
  solicitacao,
  recarregar,
}: {
  token: string | null;
  unidadeAtivaId: number;
  solicitacao: SolicitacaoRessuprimentoCarrinhoOut;
  recarregar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // ---- confirmar saída (lotes do CARRINHO) ----
  const [lotesCarrinhoPorMedicamento, setLotesCarrinhoPorMedicamento] = useState<Record<number, LoteDetalhadoOut[]>>({});
  const [linhasSaida, setLinhasSaida] = useState<LinhaConfirmacao[] | null>(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  // ---- confirmar reposição (lotes da UNIDADE ATIVA) ----
  const [lotesUnidadePorMedicamento, setLotesUnidadePorMedicamento] = useState<Record<number, LoteDetalhadoOut[]>>({});
  const [linhasTransferencia, setLinhasTransferencia] = useState<LinhaConfirmacao[] | null>(null);
  const [confirmandoTransferencia, setConfirmandoTransferencia] = useState(false);

  async function abrirConfirmarSaida() {
    setErro(null);
    if (!token) return;
    const porMedicamento: Record<number, LoteDetalhadoOut[]> = {};
    for (const item of solicitacao.itens) {
      // eslint-disable-next-line no-await-in-loop -- poucos itens por solicitação, sequencial é suficiente
      const lotes = await api
        .get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: solicitacao.carrinho_id, medicamento_id: item.medicamento_id } })
        .catch(() => []);
      porMedicamento[item.medicamento_id] = lotes;
    }
    setLotesCarrinhoPorMedicamento(porMedicamento);
    setLinhasSaida(
      solicitacao.itens.map((item) => ({
        medicamento_id: item.medicamento_id,
        medicamento_nome: item.medicamento_nome,
        loteId: String(porMedicamento[item.medicamento_id]?.[0]?.id ?? ''),
        quantidade: String(item.quantidade_usada),
      })),
    );
  }

  async function abrirConfirmarTransferencia() {
    setErro(null);
    if (!token) return;
    const porMedicamento: Record<number, LoteDetalhadoOut[]> = {};
    for (const item of solicitacao.itens) {
      // eslint-disable-next-line no-await-in-loop -- poucos itens por solicitação, sequencial é suficiente
      const lotes = await api
        .get<LoteDetalhadoOut[]>('/lotes/busca-fefo', { token, params: { medicamento_id: item.medicamento_id } })
        .catch(() => []);
      porMedicamento[item.medicamento_id] = lotes;
    }
    setLotesUnidadePorMedicamento(porMedicamento);
    setLinhasTransferencia(
      solicitacao.itens.map((item) => ({
        medicamento_id: item.medicamento_id,
        medicamento_nome: item.medicamento_nome,
        loteId: String(porMedicamento[item.medicamento_id]?.[0]?.id ?? ''),
        quantidade: String(item.quantidade_usada),
      })),
    );
  }

  async function confirmarSaida() {
    if (!linhasSaida || !token) return;
    setErro(null);
    setSucesso(null);
    if (linhasSaida.some((l) => !l.loteId || !Number(l.quantidade))) {
      setErro('Escolha um lote e uma quantidade válida para cada medicamento.');
      return;
    }
    setConfirmandoSaida(true);
    try {
      await api.post(
        `/ressuprimento-carrinho/${solicitacao.id}/confirmar-saida`,
        { itens: linhasSaida.map((l) => ({ medicamento_id: l.medicamento_id, lote_id: Number(l.loteId), quantidade: Number(l.quantidade) })) },
        { token },
      );
      setSucesso('Saída do carrinho confirmada.');
      setLinhasSaida(null);
      recarregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível confirmar a saída.'));
    } finally {
      setConfirmandoSaida(false);
    }
  }

  async function confirmarTransferencia() {
    if (!linhasTransferencia || !token) return;
    setErro(null);
    setSucesso(null);
    if (linhasTransferencia.some((l) => !l.loteId || !Number(l.quantidade))) {
      setErro('Escolha um lote e uma quantidade válida para cada medicamento.');
      return;
    }
    setConfirmandoTransferencia(true);
    try {
      await api.post(
        `/ressuprimento-carrinho/${solicitacao.id}/confirmar-transferencia`,
        {
          itens: linhasTransferencia.map((l) => ({
            medicamento_id: l.medicamento_id,
            lote_id: Number(l.loteId),
            quantidade: Number(l.quantidade),
          })),
        },
        { token },
      );
      setSucesso('Reposição do carrinho confirmada.');
      setLinhasTransferencia(null);
      recarregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível confirmar a reposição.'));
    } finally {
      setConfirmandoTransferencia(false);
    }
  }

  const podeConfirmarSaida = solicitacao.status_saida === 'pendente';
  const podeConfirmarTransferencia = solicitacao.status_transferencia === 'pendente' && solicitacao.unidade_destino_id === unidadeAtivaId;
  // Só dá pra cancelar enquanto NENHUMA das duas ações foi confirmada —
  // depois disso já existe baixa/transferência real de estoque presa a
  // esta solicitação (2026-09-01, pedido do cliente).
  const podeCancelar = solicitacao.status_saida === 'pendente' && solicitacao.status_transferencia === 'pendente';
  const [cancelando, setCancelando] = useState(false);

  async function cancelarSolicitacao() {
    if (!token) return;
    if (!window.confirm('Cancelar esta solicitação de ressuprimento? Ela foi registrada pelo formulário público e será excluída.')) {
      return;
    }
    setErro(null);
    setSucesso(null);
    setCancelando(true);
    try {
      await api.delete(`/ressuprimento-carrinho/${solicitacao.id}`, { token });
      recarregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível cancelar a solicitação.'));
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="box modal-gradiente" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 14, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>
          <b>{solicitacao.setor}</b> usou <b>{solicitacao.carrinho_nome}</b> — destino: {solicitacao.unidade_destino_nome}
        </span>
        <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{formatarDataHora(solicitacao.data_hora)}</span>
      </div>
      <ul style={{ margin: '4px 0' }}>
        {solicitacao.itens.map((i) => (
          <li key={i.id}>
            {i.medicamento_nome} — {i.quantidade_usada} un.
          </li>
        ))}
      </ul>
      {solicitacao.paciente_nome && (
        <div className="note">
          Paciente: {solicitacao.paciente_nome} · prontuário {solicitacao.paciente_prontuario}
        </div>
      )}

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`pill ${solicitacao.status_saida === 'confirmada' ? 'ok' : 'pend'}`}>
            saída {solicitacao.status_saida === 'confirmada' ? 'confirmada' : 'pendente'}
          </span>
          <span className={`pill ${solicitacao.status_transferencia === 'confirmada' ? 'ok' : 'pend'}`}>
            reposição {solicitacao.status_transferencia === 'confirmada' ? 'confirmada' : 'pendente'}
          </span>
        </div>
        {podeCancelar && (
          <button type="button" className="btn ghost sm" disabled={cancelando} onClick={cancelarSolicitacao}>
            {cancelando ? 'Cancelando…' : 'Cancelar solicitação'}
          </button>
        )}
      </div>

      {podeConfirmarSaida && (
        <div className="panel" style={{ marginTop: 4 }}>
          <h3 style={{ marginTop: 0 }}>1. Confirmar saída direta do carrinho</h3>
          {linhasSaida === null ? (
            <button type="button" className="btn ghost sm" onClick={abrirConfirmarSaida}>
              Conferir e confirmar saída
            </button>
          ) : (
            <>
              {linhasSaida.map((linha, idx) => (
                <div className="grid" key={linha.medicamento_id} style={{ marginBottom: 6 }}>
                  <div className="field span2">
                    <label>{linha.medicamento_nome}</label>
                    <select
                      value={linha.loteId}
                      onChange={(e) =>
                        setLinhasSaida((atual) => atual!.map((l, i) => (i === idx ? { ...l, loteId: e.target.value } : l)))
                      }
                    >
                      <option value="">Selecione o lote…</option>
                      {(lotesCarrinhoPorMedicamento[linha.medicamento_id] ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Quantidade</label>
                    <input
                      type="number"
                      min={1}
                      value={linha.quantidade}
                      onChange={(e) =>
                        setLinhasSaida((atual) => atual!.map((l, i) => (i === idx ? { ...l, quantidade: e.target.value } : l)))
                      }
                    />
                  </div>
                </div>
              ))}
              <div className="actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn ok sm" disabled={confirmandoSaida} onClick={confirmarSaida}>
                  {confirmandoSaida ? 'Confirmando…' : 'Confirmar saída'}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setLinhasSaida(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {podeConfirmarTransferencia && (
        <div className="panel" style={{ marginTop: 4 }}>
          <h3 style={{ marginTop: 0 }}>2. Confirmar reposição do carrinho</h3>
          {linhasTransferencia === null ? (
            <button type="button" className="btn ghost sm" onClick={abrirConfirmarTransferencia}>
              Conferir e confirmar reposição
            </button>
          ) : (
            <>
              {linhasTransferencia.map((linha, idx) => (
                <div className="grid" key={linha.medicamento_id} style={{ marginBottom: 6 }}>
                  <div className="field span2">
                    <label>{linha.medicamento_nome}</label>
                    <select
                      value={linha.loteId}
                      onChange={(e) =>
                        setLinhasTransferencia((atual) => atual!.map((l, i) => (i === idx ? { ...l, loteId: e.target.value } : l)))
                      }
                    >
                      <option value="">Selecione o lote…</option>
                      {(lotesUnidadePorMedicamento[linha.medicamento_id] ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Quantidade</label>
                    <input
                      type="number"
                      min={1}
                      value={linha.quantidade}
                      onChange={(e) =>
                        setLinhasTransferencia((atual) => atual!.map((l, i) => (i === idx ? { ...l, quantidade: e.target.value } : l)))
                      }
                    />
                  </div>
                </div>
              ))}
              <div className="actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn ok sm" disabled={confirmandoTransferencia} onClick={confirmarTransferencia}>
                  {confirmandoTransferencia ? 'Confirmando…' : 'Confirmar reposição'}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setLinhasTransferencia(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
