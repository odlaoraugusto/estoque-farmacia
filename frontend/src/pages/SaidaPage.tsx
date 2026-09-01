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

interface ItemListaSaida {
  medicamento: MedicamentoOut;
  lote: LoteDetalhadoOut;
  quantidade: string;
}

/** Saída / Dispensação — qualquer perfil pode registrar (regra 5 do
 * doc). FEFO ("usar primeiro"): o lote com validade mais próxima vem
 * sinalizado (`sugerido_fefo`) pelo backend em /lotes/busca-fefo.
 * Empréstimo/doação/permuta pra fora do hospital tem tela própria
 * (2026-08-20, ver EmprestimoDoacaoPage) — aqui só fica a dispensação
 * interna e a baixa de vencidos.
 *
 * Lista (2026-09-01, pedido do cliente: "acrescenta a lista para
 * dispensar mais de um medicamento por vez") — mesmo padrão já usado em
 * Solicitar/Enviar lote: monta uma listinha local (cada item com seu
 * próprio medicamento/lote escolhido via FEFO) antes de enviar tudo numa
 * passada, uma chamada `POST /saidas` por item (não existe endpoint de
 * lote no backend pra isso). Categoria e setor consumidor valem pra
 * lista inteira (é uma sessão de dispensação/baixa só); paciente/
 * prontuário também — obrigatório se QUALQUER item da lista for
 * antimicrobiano ou controlado, mesmo espírito do formulário público de
 * carrinho (`PublicoRessuprimentoCarrinhoPage`). */
export function SaidaPage() {
  const { token } = useAuth();

  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [lotesFefo, setLotesFefo] = useState<LoteDetalhadoOut[]>([]);
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<number | null>(null);
  const [buscandoFefo, setBuscandoFefo] = useState(false);
  const [quantidadeItem, setQuantidadeItem] = useState('');

  const [itensLista, setItensLista] = useState<ItemListaSaida[]>([]);

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

  function limparSelecao() {
    setBusca('');
    setMedicamentoSelecionado(null);
    setLotesFefo([]);
    setLoteSelecionadoId(null);
    setQuantidadeItem('');
  }

  function adicionarNaLista() {
    setErro(null);
    if (!medicamentoSelecionado || !loteSelecionado) {
      setErro('Busque um medicamento e selecione o lote.');
      return;
    }
    const qtd = Number(quantidadeItem);
    if (!qtd || qtd <= 0) {
      setErro('Informe uma quantidade válida.');
      return;
    }
    if (qtd > loteSelecionado.quantidade_atual) {
      setErro(`Quantidade maior que o saldo disponível (${loteSelecionado.quantidade_atual}).`);
      return;
    }
    if (itensLista.some((i) => i.medicamento.id === medicamentoSelecionado.id)) {
      setErro(`${medicamentoSelecionado.nome} já está na lista.`);
      return;
    }
    setItensLista((atual) => [...atual, { medicamento: medicamentoSelecionado, lote: loteSelecionado, quantidade: quantidadeItem }]);
    limparSelecao();
  }

  function removerDaLista(medicamentoId: number) {
    setItensLista((atual) => atual.filter((i) => i.medicamento.id !== medicamentoId));
  }

  // Vigilância por paciente (2026-08-20): antimicrobiano (DOT) e
  // controlado exigem paciente/prontuário pela mesma regra — ver
  // SaidaService, que é quem de fato bloqueia no backend. Aqui vale pra
  // lista inteira: basta UM item ser antimicrobiano/controlado.
  const exigePaciente = itensLista.some((i) => i.medicamento.e_antimicrobiano || i.medicamento.e_controlado);

  async function enviarLista(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (itensLista.length === 0) {
      setErro('Adicione ao menos um medicamento à lista antes de registrar.');
      return;
    }
    if (categoria !== 'vencimento' && !setorConsumidor) {
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
      const item = itensLista.find((i) => i.medicamento.e_antimicrobiano || i.medicamento.e_controlado);
      const classe = item?.medicamento.e_antimicrobiano ? 'antimicrobiano' : 'controlado';
      setErro(`${item?.medicamento.nome} é ${classe} — paciente e prontuário são obrigatórios nesta saída.`);
      return;
    }

    setEnviando(true);
    const idsComFalha = new Set<number>();
    const mensagensFalha: string[] = [];
    for (const item of itensLista) {
      try {
        // eslint-disable-next-line no-await-in-loop -- cada item é uma saída própria, sequencial de propósito
        await api.post(
          '/saidas',
          {
            lote_id: item.lote.id,
            quantidade: Number(item.quantidade),
            categoria,
            // setor_consumidor não se aplica à baixa por vencimento — omitido
            // nesse caso em vez de mandar string vazia (backend exige null).
            ...(categoria !== 'vencimento' ? { setor_consumidor: setorConsumidor } : {}),
            // Opcionais — só vão no corpo quando pelo menos um foi preenchido
            // (o backend exige os dois juntos ou nenhum; nunca string vazia).
            ...(prontuarioPreenchido || nomePreenchido
              ? { paciente_prontuario: prontuario.trim(), paciente_nome: pacienteNome.trim() }
              : {}),
          },
          { token },
        );
      } catch (err) {
        idsComFalha.add(item.medicamento.id);
        mensagensFalha.push(`${item.medicamento.nome} (${mensagemErro(err)})`);
      }
    }
    setEnviando(false);
    if (idsComFalha.size === 0) {
      setSucesso(`${itensLista.length} saída(s) registrada(s) com sucesso.`);
      setItensLista([]);
      setSetorConsumidor('');
      setCategoria('normal');
      setProntuario('');
      setPacienteNome('');
      setPacienteEncontrado(false);
    } else {
      setItensLista((atual) => atual.filter((i) => idsComFalha.has(i.medicamento.id)));
      setErro(`Não foi possível registrar: ${mensagensFalha.join('; ')}. O restante da lista foi registrado com sucesso.`);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Saída / Dispensação</h1>
        <span className="screen-tag">dispensação de medicamento</span>
      </div>
      <p className="screen-sub">Usar primeiro: o lote com validade mais próxima aparece destacado no topo da busca.</p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" style={{ maxWidth: 640 }} onSubmit={enviarLista}>
        <h2>Registrar saída</h2>
        <p className="screen-sub">Adicione um ou mais medicamentos à lista e registre tudo de uma vez.</p>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="busca-medicamento-saida">Medicamento</label>
          <BuscaAutocomplete
            id="busca-medicamento-saida"
            itens={medicamentos.filter((m) => !itensLista.some((i) => i.medicamento.id === m.id))}
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

        {buscandoFefo && <p className="carregando">Buscando lotes (usar primeiro)…</p>}

        {!buscandoFefo && lotesFefo.length > 0 && (
          <div className="grid" style={{ marginBottom: 0 }}>
            <div className="field span2">
              <label htmlFor="lote-fefo">Lote</label>
              <select id="lote-fefo" value={loteSelecionadoId ?? ''} onChange={(e) => setLoteSelecionadoId(Number(e.target.value))}>
                {lotesFefo.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual} · {l.unidade.nome}
                    {l.sugerido_fefo ? ' · sugerido (usar primeiro)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qtd-item-saida">Quantidade</label>
              <input
                id="qtd-item-saida"
                type="number"
                min={1}
                max={loteSelecionado?.quantidade_atual}
                placeholder={loteSelecionado ? `≤ ${loteSelecionado.quantidade_atual}` : '0'}
                value={quantidadeItem}
                onChange={(e) => setQuantidadeItem(e.target.value)}
              />
            </div>
          </div>
        )}
        {loteSelecionado?.sugerido_fefo && (
          <div className="box" style={{ background: 'var(--warn-bg)', color: 'var(--ink)', borderColor: 'var(--warn)', justifyContent: 'space-between', marginTop: 8 }}>
            <span>
              {loteSelecionado.medicamento.nome} · {loteSelecionado.numero_lote} · vence {formatarData(loteSelecionado.data_validade)}
            </span>
            <span className="pill pend">sugerido (usar primeiro)</span>
          </div>
        )}
        {!buscandoFefo && medicamentoSelecionado && lotesFefo.length === 0 && (
          <p className="carregando">Nenhum lote disponível para este medicamento na unidade ativa.</p>
        )}

        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" disabled={!loteSelecionado} onClick={adicionarNaLista}>
            + Adicionar à lista
          </button>
        </div>

        {itensLista.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Lote</th>
                  <th className="num">Qtd.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itensLista.map((i) => (
                  <tr key={i.medicamento.id}>
                    <td>
                      {i.medicamento.nome}
                      {(i.medicamento.e_antimicrobiano || i.medicamento.e_controlado) && (
                        <span className="tag" style={{ marginLeft: 6 }}>
                          {i.medicamento.e_controlado ? 'controlado' : 'antimicrobiano'}
                        </span>
                      )}
                    </td>
                    <td className="mono">{i.lote.numero_lote}</td>
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

        {exigePaciente && (
          <div
            className="box"
            style={{ background: 'var(--danger-bg)', color: 'var(--ink)', borderColor: 'var(--danger)', marginTop: 16 }}
          >
            <span>Há medicamento antimicrobiano ou controlado na lista — paciente e prontuário são obrigatórios.</span>
          </div>
        )}

        <div className="grid" style={{ marginTop: 16 }}>
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
            <label htmlFor="setor-consumidor">
              Setor consumidor {categoria !== 'vencimento' && <span className="req">*</span>}
            </label>
            <select
              id="setor-consumidor"
              value={setorConsumidor}
              onChange={(e) => setSetorConsumidor(e.target.value)}
              disabled={categoria === 'vencimento'}
              required={categoria !== 'vencimento'}
            >
              <option value="">{categoria === 'vencimento' ? 'Não se aplica' : 'Selecione…'}</option>
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
          <button type="submit" className="btn" disabled={enviando || itensLista.length === 0}>
            {enviando ? 'Registrando…' : `Registrar saída ${itensLista.length > 0 ? `(${itensLista.length})` : ''}`}
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
