import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData } from '../lib/formato';
import { SETORES_DISPENSACAO } from '../lib/setores';
import type { CategoriaSaida, LoteDetalhadoOut, MedicamentoOut, PacienteOut } from '../types';

const CATEGORIAS: { valor: CategoriaSaida; rotulo: string }[] = [
  { valor: 'normal', rotulo: 'Dispensação normal' },
  { valor: 'vencimento', rotulo: 'Baixa por vencimento' },
];

/** Saída / Dispensação — qualquer perfil pode registrar (regra 5 do
 * doc). FEFO: o lote com validade mais próxima vem sinalizado
 * (`sugerido_fefo`) pelo backend em /lotes/busca-fefo. Empréstimo/
 * doação/permuta pra fora do hospital tem tela própria (2026-08-20,
 * ver EmprestimoDoacaoPage) — aqui só fica a dispensação interna e a
 * baixa de vencidos. */
export function SaidaPage() {
  const { token } = useAuth();

  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [lotesFefo, setLotesFefo] = useState<LoteDetalhadoOut[]>([]);
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<number | null>(null);
  const [buscandoFefo, setBuscandoFefo] = useState(false);

  const [quantidade, setQuantidade] = useState('');
  const [setorConsumidor, setSetorConsumidor] = useState('');
  const [categoria, setCategoria] = useState<CategoriaSaida>('normal');

  // Paciente/prontuário (seção 22 do doc): opcional, adicional ao setor
  // consumidor. Autopreenchimento por prontuário só é tentado para quem
  // tem acesso a GET /pacientes/{prontuario} (Farmacêutico/Coordenador) —
  // Atendente sempre digita o nome livremente, sem chamar a rota (daria
  // 403 sempre para esse perfil).
  const [prontuario, setProntuario] = useState('');
  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteEncontrado, setPacienteEncontrado] = useState(false);
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get<MedicamentoOut[]>('/medicamentos', { token }).then(setMedicamentos).catch(() => {});
  }, [token]);

  // Autopreenchimento por prontuário (2026-08-20: liberado a qualquer
  // perfil, inclusive Atendente — é consulta pra própria dispensação que
  // ele está registrando agora, não a restrição mais ampla de "ver dado
  // de paciente de outra Saída"). Pequeno debounce ao digitar, não busca
  // a cada tecla.
  useEffect(() => {
    if (!token) return;
    const valor = prontuario.trim();
    if (!valor) return;

    const timer = setTimeout(() => {
      setBuscandoPaciente(true);
      api
        .get<PacienteOut>(`/pacientes/${encodeURIComponent(valor)}`, { token })
        .then((paciente) => {
          setPacienteNome(paciente.nome);
          setPacienteEncontrado(true);
        })
        .catch((err) => {
          // 404 = paciente novo, campo nome fica livre; outros erros também
          // não bloqueiam o formulário, só não autopreenchem.
          if (!(err instanceof ApiError && err.status === 404)) {
            setErro(mensagemErro(err, 'Não foi possível buscar o paciente pelo prontuário.'));
          }
        })
        .finally(() => setBuscandoPaciente(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [prontuario, token]);

  function aoMudarProntuario(valor: string) {
    setProntuario(valor);
    // Prontuário mudou: o nome buscado para o valor anterior não vale mais
    // — libera o campo para digitar até a próxima busca resolver.
    setPacienteEncontrado(false);
    setPacienteNome('');
  }

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

  // Vigilância por paciente (2026-08-20): antimicrobiano (DOT) e
  // controlado exigem paciente/prontuário pela mesma regra — ver
  // SaidaService, que é quem de fato bloqueia no backend.
  const exigePaciente = Boolean(medicamentoSelecionado?.e_antimicrobiano || medicamentoSelecionado?.e_controlado);

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
    const prontuarioPreenchido = prontuario.trim().length > 0;
    const nomePreenchido = pacienteNome.trim().length > 0;
    if (prontuarioPreenchido !== nomePreenchido) {
      setErro('Prontuário e nome do paciente devem ser preenchidos juntos, ou nenhum dos dois.');
      return;
    }
    if (exigePaciente && !prontuarioPreenchido) {
      const classe = medicamentoSelecionado?.e_antimicrobiano ? 'antimicrobiano' : 'controlado';
      setErro(`${medicamentoSelecionado?.nome} é ${classe} — paciente e prontuário são obrigatórios nesta saída.`);
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
          // Opcionais — só vão no corpo quando pelo menos um foi preenchido
          // (o backend exige os dois juntos ou nenhum; nunca string vazia).
          ...(prontuarioPreenchido || nomePreenchido
            ? { paciente_prontuario: prontuario.trim(), paciente_nome: pacienteNome.trim() }
            : {}),
        },
        { token },
      );
      setSucesso('Saída registrada com sucesso.');
      setBusca('');
      setMedicamentoSelecionado(null);
      setLotesFefo([]);
      setLoteSelecionadoId(null);
      setQuantidade('');
      setCategoria('normal');
      setProntuario('');
      setPacienteNome('');
      setPacienteEncontrado(false);
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
        <span className="screen-tag">dispensação de medicamento</span>
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
                  {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual} · {l.unidade.nome}
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

        {exigePaciente && (
          <div
            className="box"
            style={{ background: 'var(--danger-bg)', color: 'var(--ink)', borderColor: 'var(--danger)', marginBottom: 16 }}
          >
            <span>
              <b>{medicamentoSelecionado?.nome}</b> é {medicamentoSelecionado?.e_antimicrobiano ? 'antimicrobiano' : 'controlado'} —
              paciente e prontuário são obrigatórios nesta saída.
            </span>
          </div>
        )}

        <div className="grid">
          <div className="field">
            <label htmlFor="categoria-saida">Categoria</label>
            <select id="categoria-saida" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaSaida)}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
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
              {SETORES_DISPENSACAO.map((setor) => (
                <option key={setor} value={setor}>
                  {setor}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="prontuario-saida">
              Prontuário{' '}
              {exigePaciente && <span className="req">*</span>}
            </label>
            <input
              id="prontuario-saida"
              type="text"
              placeholder="nº do prontuário"
              value={prontuario}
              onChange={(e) => aoMudarProntuario(e.target.value)}
              required={exigePaciente}
            />
            {buscandoPaciente && (
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Buscando paciente…</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="nome-paciente-saida">
              Nome do paciente{' '}
              {pacienteEncontrado ? (
                <span className="tag">já cadastrado</span>
              ) : (
                exigePaciente && <span className="req">*</span>
              )}
            </label>
            <input
              id="nome-paciente-saida"
              type="text"
              placeholder="nome do paciente"
              value={pacienteNome}
              readOnly={pacienteEncontrado}
              onChange={(e) => setPacienteNome(e.target.value)}
              required={exigePaciente}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando || !loteSelecionado}>
            {enviando ? 'Registrando…' : 'Registrar saída'}
          </button>
        </div>
        <div className="note">Quantidade acima do saldo do lote bloqueia o registro — sem saldo negativo.</div>
        <div className="note">
          Prontuário/paciente são opcionais; quando preenchidos, precisam vir os dois juntos. Prontuário já
          cadastrado autopreenche o nome (fica travado); prontuário novo deixa o nome livre para digitar.
        </div>
      </form>
    </section>
  );
}
