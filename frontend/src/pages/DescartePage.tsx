import { Fragment, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { labelPerfil } from '../lib/formato';
import type { LoteDetalhadoOut, MovimentacaoDetalhadaOut } from '../types';

const MOTIVOS = ['Vencimento', 'Quebra', 'Outro'];

/** Descarte — fluxo de 2 etapas. Só decrementa estoque após a aprovação
 * do Coordenador. "Solicitar" é exclusivo do Farmacêutico (nem o
 * Coordenador solicita, só aprova/rejeita — ver descartes.py); por
 * isso os dois painéis abaixo têm visibilidade por perfil distinta,
 * cada um sumindo por completo para quem não tem a ação. */
export function DescartePage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  if (!permissoes.descarteSolicitar && !permissoes.descarteAprovar) {
    return (
      <section>
        <div className="screen-head">
          <h1>Descarte</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Seu perfil não tem acesso ao módulo de descarte.
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Descarte</h1>
        <span className="screen-tag">fluxo de 2 etapas</span>
      </div>
      <p className="screen-sub">Estoque só é decrementado depois da aprovação do Coordenador.</p>

      {permissoes.descarteSolicitar && <PainelSolicitar token={token} unidadeAtivaId={unidadeAtivaId} />}
      {permissoes.descarteAprovar && <PainelAprovar token={token} />}
    </section>
  );
}

function PainelSolicitar({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarLotes = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    api
      .get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: unidadeAtivaId } })
      .then(setLotes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os lotes.')));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregarLotes();
  }, [carregarLotes]);

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/descartes/solicitar',
        { lote_id: loteSelecionado.id, quantidade: Number(quantidade), motivo_descarte: motivo },
        { token },
      );
      setSucesso('Solicitação de descarte enviada para aprovação.');
      setBusca('');
      setLoteSelecionado(null);
      setQuantidade('');
      setMotivo(MOTIVOS[0]);
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível solicitar o descarte.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="panel" onSubmit={aoSubmeter}>
      <h2>
        Solicitar descarte <span className="pill muted">Farmacêutico</span>
      </h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-descarte">
            Lote <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-lote-descarte"
            itens={lotes}
            valor={loteSelecionado ? `${loteSelecionado.medicamento.nome} · ${loteSelecionado.numero_lote}` : busca}
            aoMudarValor={(v) => {
              setBusca(v);
              setLoteSelecionado(null);
            }}
            rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · saldo ${l.quantidade_atual}`}
            chave={(l) => l.id}
            aoSelecionar={(l) => {
              setLoteSelecionado(l);
              setBusca(`${l.medicamento.nome} · ${l.numero_lote}`);
            }}
            placeholder="buscar por medicamento ou nº do lote"
          />
        </div>
        <div className="field">
          <label htmlFor="qtd-descarte">
            Quantidade <span className="req">*</span>
          </label>
          <input
            id="qtd-descarte"
            type="number"
            min={1}
            max={loteSelecionado?.quantidade_atual}
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="motivo-descarte">
            Motivo <span className="req">*</span>
          </label>
          <select id="motivo-descarte" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar para aprovação'}
        </button>
      </div>
    </form>
  );
}

function PainelAprovar({ token }: { token: string | null }) {
  const [pendentes, setPendentes] = useState<MovimentacaoDetalhadaOut[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processandoId, setProcessandoId] = useState<number | null>(null);
  const [rejeitandoId, setRejeitandoId] = useState<number | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!token) return;
    setCarregando(true);
    api
      .get<MovimentacaoDetalhadaOut[]>('/descartes/pendentes', { token })
      .then(setPendentes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os descartes pendentes.')))
      .finally(() => setCarregando(false));
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function aprovar(id: number) {
    setErro(null);
    setSucesso(null);
    setProcessandoId(id);
    try {
      await api.post(`/descartes/${id}/aprovar`, undefined, { token });
      setSucesso('Descarte aprovado.');
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível aprovar o descarte.'));
    } finally {
      setProcessandoId(null);
    }
  }

  async function rejeitar(id: number) {
    setErro(null);
    setSucesso(null);
    setProcessandoId(id);
    try {
      await api.post(`/descartes/${id}/rejeitar`, { motivo_rejeicao: motivoRejeicao || null }, { token });
      setSucesso('Descarte rejeitado.');
      setRejeitandoId(null);
      setMotivoRejeicao('');
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível rejeitar o descarte.'));
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="panel">
      <h2>
        Aprovar descarte <span className="pill muted">Coordenador</span>
      </h2>
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
                <th>Unidade</th>
                <th className="num">Qtd.</th>
                <th>Motivo</th>
                <th>Solicitante</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={8} className="vazio-tabela">
                    Nenhum descarte pendente.
                  </td>
                </tr>
              )}
              {pendentes.map((mov) => (
                <Fragment key={mov.id}>
                  <tr>
                    <td>{mov.lote.medicamento.nome}</td>
                    <td className="mono">{mov.lote.numero_lote}</td>
                    <td>{mov.lote.unidade.nome}</td>
                    <td className="num">{mov.quantidade}</td>
                    <td>{mov.motivo_descarte}</td>
                    <td>
                      {mov.usuario_solicitante?.nome}
                      {mov.usuario_solicitante?.crf ? ` · CRF ${mov.usuario_solicitante.crf}` : ''}
                      {mov.usuario_solicitante ? ` (${labelPerfil(mov.usuario_solicitante.perfil)})` : ''}
                    </td>
                    <td>
                      <span className="pill pend">pendente</span>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn ok sm" disabled={processandoId === mov.id} onClick={() => aprovar(mov.id)}>
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="btn danger sm"
                        disabled={processandoId === mov.id}
                        onClick={() => {
                          setRejeitandoId(mov.id);
                          setMotivoRejeicao('');
                        }}
                      >
                        Rejeitar
                      </button>
                    </td>
                  </tr>
                  {rejeitandoId === mov.id && (
                    <tr>
                      <td colSpan={8}>
                        <div className="field" style={{ maxWidth: 420 }}>
                          <label htmlFor={`motivo-rejeicao-${mov.id}`}>Motivo da rejeição (opcional)</label>
                          <input
                            id={`motivo-rejeicao-${mov.id}`}
                            type="text"
                            value={motivoRejeicao}
                            onChange={(e) => setMotivoRejeicao(e.target.value)}
                          />
                        </div>
                        <div className="actions" style={{ marginTop: 10 }}>
                          <button type="button" className="btn danger sm" disabled={processandoId === mov.id} onClick={() => rejeitar(mov.id)}>
                            Confirmar rejeição
                          </button>
                          <button type="button" className="btn ghost sm" onClick={() => setRejeitandoId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
