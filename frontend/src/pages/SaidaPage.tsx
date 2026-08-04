import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData } from '../lib/formato';
import type { LoteDetalhadoOut, MedicamentoOut, UnidadeOut } from '../types';

/** Saída / Dispensação — qualquer perfil pode registrar (regra 5 do
 * doc). FEFO: o lote com validade mais próxima vem sinalizado
 * (`sugerido_fefo`) pelo backend em /lotes/busca-fefo. */
export function SaidaPage() {
  const { usuario, token } = useAuth();

  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [lotesFefo, setLotesFefo] = useState<LoteDetalhadoOut[]>([]);
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<number | null>(null);
  const [buscandoFefo, setBuscandoFefo] = useState(false);

  const [quantidade, setQuantidade] = useState('');
  const [setorConsumidor, setSetorConsumidor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get<MedicamentoOut[]>('/medicamentos', { token }).then(setMedicamentos).catch(() => {});
    api.get<UnidadeOut[]>('/unidades', { token }).then(setUnidades).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (usuario?.unidade_ativa_nome) setSetorConsumidor(usuario.unidade_ativa_nome);
  }, [usuario?.unidade_ativa_nome]);

  async function selecionarMedicamento(medicamento: MedicamentoOut) {
    setMedicamentoSelecionado(medicamento);
    setBusca(medicamento.nome);
    setLotesFefo([]);
    setLoteSelecionadoId(null);
    setErro(null);
    if (!token) return;
    setBuscandoFefo(true);
    try {
      const lotes = await api.get<LoteDetalhadoOut[]>('/lotes/busca-fefo', {
        token,
        params: { medicamento_id: medicamento.id },
      });
      setLotesFefo(lotes);
      const sugerido = lotes.find((l) => l.sugerido_fefo) ?? lotes[0];
      setLoteSelecionadoId(sugerido?.id ?? null);
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível buscar lotes para este medicamento.'));
    } finally {
      setBuscandoFefo(false);
    }
  }

  const loteSelecionado = lotesFefo.find((l) => l.id === loteSelecionadoId) ?? null;

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!loteSelecionado) {
      setErro('Busque um medicamento e selecione o lote.');
      return;
    }
    if (!setorConsumidor) {
      setErro('Informe o setor consumidor.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/saidas',
        { lote_id: loteSelecionado.id, quantidade: Number(quantidade), setor_consumidor: setorConsumidor },
        { token },
      );
      setSucesso('Saída registrada com sucesso.');
      setBusca('');
      setMedicamentoSelecionado(null);
      setLotesFefo([]);
      setLoteSelecionadoId(null);
      setQuantidade('');
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar a saída.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Saída / Dispensação</h1>
        <span className="screen-tag">
          decrementa <code>quantidade_atual</code>
        </span>
      </div>
      <p className="screen-sub">FEFO: o lote com validade mais próxima aparece destacado no topo da busca.</p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" style={{ maxWidth: 540 }} onSubmit={aoSubmeter}>
        <h2>Registrar saída</h2>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="busca-medicamento-saida">
            Medicamento <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-medicamento-saida"
            itens={medicamentos}
            valor={medicamentoSelecionado ? medicamentoSelecionado.nome : busca}
            aoMudarValor={(v) => {
              setBusca(v);
              setMedicamentoSelecionado(null);
              setLotesFefo([]);
              setLoteSelecionadoId(null);
            }}
            rotulo={(m) => m.nome}
            chave={(m) => m.id}
            aoSelecionar={selecionarMedicamento}
            placeholder="buscar medicamento…"
          />
        </div>

        {buscandoFefo && <p className="carregando">Buscando lotes (FEFO)…</p>}

        {!buscandoFefo && lotesFefo.length > 0 && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="lote-fefo">Lote</label>
            <select id="lote-fefo" value={loteSelecionadoId ?? ''} onChange={(e) => setLoteSelecionadoId(Number(e.target.value))}>
              {lotesFefo.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual}
                  {l.sugerido_fefo ? ' · sugerido (FEFO)' : ''}
                </option>
              ))}
            </select>
            {loteSelecionado?.sugerido_fefo && (
              <div className="box" style={{ background: 'var(--warn-bg)', color: 'var(--ink)', borderColor: 'var(--warn)', justifyContent: 'space-between', marginTop: 8 }}>
                <span>
                  {loteSelecionado.medicamento.nome} · {loteSelecionado.numero_lote} · vence {formatarData(loteSelecionado.data_validade)}
                </span>
                <span className="pill pend">sugerido (FEFO)</span>
              </div>
            )}
          </div>
        )}

        {!buscandoFefo && medicamentoSelecionado && lotesFefo.length === 0 && (
          <p className="carregando">Nenhum lote disponível para este medicamento na unidade ativa.</p>
        )}

        <div className="grid">
          <div className="field">
            <label htmlFor="qtd-saida">
              Quantidade <span className="req">*</span>
            </label>
            <input
              id="qtd-saida"
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
            <label htmlFor="setor-consumidor">
              Setor consumidor <span className="req">*</span>
            </label>
            <select id="setor-consumidor" value={setorConsumidor} onChange={(e) => setSetorConsumidor(e.target.value)} required>
              <option value="">Selecione…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.nome}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando || !loteSelecionado}>
            {enviando ? 'Registrando…' : 'Registrar saída'}
          </button>
        </div>
        <div className="note">Quantidade acima do saldo do lote bloqueia o registro — sem saldo negativo.</div>
      </form>
    </section>
  );
}
