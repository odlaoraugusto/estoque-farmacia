import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData } from '../lib/formato';
import type { CategoriaSaida, LoteDetalhadoOut, MedicamentoOut, UnidadeOut } from '../types';

const CATEGORIAS: { valor: CategoriaSaida; rotulo: string }[] = [
  { valor: 'emprestimo', rotulo: 'Empréstimo' },
  { valor: 'doacao', rotulo: 'Doação' },
  { valor: 'permuta', rotulo: 'Permuta' },
];

/** Empréstimo / Doação / Permuta (2026-08-20) — saída de medicamento pra
 * FORA do hospital, aba própria e separada da dispensação normal
 * (2026-08-20, a pedido do cliente: menos confusão sobre o que é uso
 * interno). Mesma rota `POST /saidas` de sempre, só que sempre com
 * `destino_externo` obrigatório (o backend rejeita sem isso quando a
 * categoria é uma destas três) e sem os campos de paciente/prontuário —
 * medicamento saindo do hospital não é dispensação a um paciente
 * interno. Notifica o Coordenador (RelatorioService.atividade_recente). */
export function EmprestimoDoacaoPage() {
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
  const [categoria, setCategoria] = useState<CategoriaSaida>('emprestimo');
  const [destinoExterno, setDestinoExterno] = useState('');
  const [destinatario, setDestinatario] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get<MedicamentoOut[]>('/medicamentos', { token }).then(setMedicamentos).catch(() => {});
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } })
      .then(setUnidades)
      .catch(() => {});
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
      setErro('Informe o setor responsável pela saída.');
      return;
    }
    if (!destinoExterno.trim()) {
      setErro('Informe para qual instituição o medicamento foi.');
      return;
    }
    if (!destinatario.trim()) {
      setErro('Informe o destinatário (pessoa responsável no destino).');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/saidas',
        {
          lote_id: loteSelecionado.id,
          quantidade: Number(quantidade),
          setor_consumidor: setorConsumidor,
          categoria,
          destino_externo: destinoExterno.trim(),
          destinatario: destinatario.trim(),
        },
        { token },
      );
      setSucesso('Saída registrada com sucesso.');
      setBusca('');
      setMedicamentoSelecionado(null);
      setLotesFefo([]);
      setLoteSelecionadoId(null);
      setQuantidade('');
      setCategoria('emprestimo');
      setDestinoExterno('');
      setDestinatario('');
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar a saída.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Empréstimo / Doação / Permuta</h1>
        <span className="screen-tag">saída para fora do hospital</span>
      </div>
      <p className="screen-sub">
        Notifica o Coordenador. Diferente da Saída/Dispensação, aqui o destino é sempre outra instituição — por isso é
        obrigatório informar para onde foi.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" style={{ maxWidth: 540 }} onSubmit={aoSubmeter}>
        <h2>Registrar saída</h2>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="busca-medicamento-emprestimo">
            Medicamento <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-medicamento-emprestimo"
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
            <label htmlFor="lote-fefo-emprestimo">Lote</label>
            <select
              id="lote-fefo-emprestimo"
              value={loteSelecionadoId ?? ''}
              onChange={(e) => setLoteSelecionadoId(Number(e.target.value))}
            >
              {lotesFefo.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual} · {l.unidade.nome}
                  {l.sugerido_fefo ? ' · sugerido (FEFO)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {!buscandoFefo && medicamentoSelecionado && lotesFefo.length === 0 && (
          <p className="carregando">Nenhum lote disponível para este medicamento na unidade ativa.</p>
        )}

        <div className="grid">
          <div className="field">
            <label htmlFor="categoria-emprestimo">
              Categoria <span className="req">*</span>
            </label>
            <select
              id="categoria-emprestimo"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaSaida)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="qtd-emprestimo">
              Quantidade <span className="req">*</span>
            </label>
            <input
              id="qtd-emprestimo"
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
            <label htmlFor="setor-emprestimo">
              Setor responsável <span className="req">*</span>
            </label>
            <select
              id="setor-emprestimo"
              value={setorConsumidor}
              onChange={(e) => setSetorConsumidor(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.nome}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="destino-externo">
              Para onde foi (hospital/instituição) <span className="req">*</span>
            </label>
            <input
              id="destino-externo"
              type="text"
              placeholder="ex.: Hospital Municipal Tal"
              value={destinoExterno}
              onChange={(e) => setDestinoExterno(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="destinatario-saida">
              Destinatário (pessoa responsável) <span className="req">*</span>
            </label>
            <input
              id="destinatario-saida"
              type="text"
              placeholder="ex.: Farm. Fulano de Tal"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              required
            />
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
