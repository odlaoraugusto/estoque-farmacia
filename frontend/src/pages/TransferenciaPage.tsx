import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import type { LoteDetalhadoOut, MovimentacaoDetalhadaOut, UnidadeOut } from '../types';

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
        <span className="screen-tag">envio → em_transito · confirmação → novo lote</span>
      </div>
      <p className="screen-sub">
        Transferência parcial gera um segundo registro de lote no destino, ligado ao lote pai por{' '}
        <code>lote_origem_id</code>.
      </p>

      {permissoes.transferenciaEnviar && <PainelEnviar token={token} unidadeAtivaId={unidadeAtivaId} />}
      <PainelConfirmar token={token} unidadeAtivaId={unidadeAtivaId} />
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
      .get<UnidadeOut[]>('/unidades', { token })
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
            rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · saldo ${l.quantidade_atual}`}
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
