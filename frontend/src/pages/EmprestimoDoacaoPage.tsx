import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, baixarArquivo, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarData } from '../lib/formato';
import type { CategoriaSaida, LoteDetalhadoOut, MedicamentoOut, MovimentacaoOut, UnidadeOut } from '../types';

const CATEGORIAS: { valor: CategoriaSaida; rotulo: string }[] = [
  { valor: 'emprestimo', rotulo: 'Empréstimo' },
  { valor: 'doacao', rotulo: 'Doação' },
  { valor: 'permuta', rotulo: 'Permuta' },
];

interface ItemListaEmprestimo {
  medicamento: MedicamentoOut;
  lote: LoteDetalhadoOut;
  quantidade: string;
}

/** Empréstimo / Doação / Permuta (2026-08-20) — saída de medicamento pra
 * FORA do hospital, aba própria e separada da dispensação normal
 * (2026-08-20, a pedido do cliente: menos confusão sobre o que é uso
 * interno). Mesma rota `POST /saidas` de sempre, só que sempre com
 * `destino_externo` obrigatório (o backend rejeita sem isso quando a
 * categoria é uma destas três) e sem os campos de paciente/prontuário —
 * medicamento saindo do hospital não é dispensação a um paciente
 * interno. Notifica o Coordenador (RelatorioService.atividade_recente).
 *
 * Lista (2026-09-01, pedido do cliente: "acrescenta a lista para
 * dispensar mais de um medicamento por vez") — mesmo padrão de
 * SaidaPage: categoria/setor/destino/destinatário valem pra lista
 * inteira (é uma remessa só), cada item escolhe seu próprio lote via
 * FEFO. Uma chamada `POST /saidas` por item, sequencial. */
export function EmprestimoDoacaoPage() {
  const { usuario, token } = useAuth();

  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  const [busca, setBusca] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [lotesFefo, setLotesFefo] = useState<LoteDetalhadoOut[]>([]);
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<number | null>(null);
  const [buscandoFefo, setBuscandoFefo] = useState(false);
  const [quantidadeItem, setQuantidadeItem] = useState('');

  const [itensLista, setItensLista] = useState<ItemListaEmprestimo[]>([]);

  const [setorConsumidor, setSetorConsumidor] = useState('');
  const [categoria, setCategoria] = useState<CategoriaSaida>('emprestimo');
  const [destinoExterno, setDestinoExterno] = useState('');
  const [destinatario, setDestinatario] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ultimasSaidasIds, setUltimasSaidasIds] = useState<number[]>([]);
  const [imprimindo, setImprimindo] = useState(false);

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

  async function enviarLista(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (itensLista.length === 0) {
      setErro('Adicione ao menos um medicamento à lista antes de registrar.');
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
    setUltimasSaidasIds([]);
    const idsComFalha = new Set<number>();
    const mensagensFalha: string[] = [];
    const idsRegistrados: number[] = [];
    for (const item of itensLista) {
      try {
        // eslint-disable-next-line no-await-in-loop -- cada item é uma saída própria, sequencial de propósito
        const movimentacao = await api.post<MovimentacaoOut>(
          '/saidas',
          {
            lote_id: item.lote.id,
            quantidade: Number(item.quantidade),
            setor_consumidor: setorConsumidor,
            categoria,
            destino_externo: destinoExterno.trim(),
            destinatario: destinatario.trim(),
          },
          { token },
        );
        idsRegistrados.push(movimentacao.id);
      } catch (err) {
        idsComFalha.add(item.medicamento.id);
        mensagensFalha.push(`${item.medicamento.nome} (${mensagemErro(err)})`);
      }
    }
    setEnviando(false);
    if (idsComFalha.size === 0) {
      setSucesso(`${itensLista.length} saída(s) registrada(s) com sucesso.`);
      setUltimasSaidasIds(idsRegistrados);
      setItensLista([]);
      setCategoria('emprestimo');
      setDestinoExterno('');
      setDestinatario('');
    } else {
      setItensLista((atual) => atual.filter((i) => idsComFalha.has(i.medicamento.id)));
      setErro(`Não foi possível registrar: ${mensagensFalha.join('; ')}. O restante da lista foi registrado com sucesso.`);
    }
  }

  async function imprimirComprovante() {
    setErro(null);
    setImprimindo(true);
    try {
      await baixarArquivo('/saidas/comprovante', { token, params: { formato: 'pdf', ids: ultimasSaidasIds.join(',') } });
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível gerar o comprovante.'));
    } finally {
      setImprimindo(false);
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
      {sucesso && (
        <Alerta tipo="sucesso">
          {sucesso}{' '}
          {ultimasSaidasIds.length > 0 && (
            <button type="button" className="btn ghost sm" disabled={imprimindo} onClick={imprimirComprovante}>
              {imprimindo ? 'Gerando…' : 'Imprimir comprovante'}
            </button>
          )}
        </Alerta>
      )}

      <form className="panel" style={{ maxWidth: 640 }} onSubmit={enviarLista}>
        <h2>Registrar saída</h2>
        <p className="screen-sub">Adicione um ou mais medicamentos à lista e registre tudo de uma vez.</p>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="busca-medicamento-emprestimo">Medicamento</label>
          <BuscaAutocomplete
            id="busca-medicamento-emprestimo"
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
              <label htmlFor="lote-fefo-emprestimo">Lote</label>
              <select
                id="lote-fefo-emprestimo"
                value={loteSelecionadoId ?? ''}
                onChange={(e) => setLoteSelecionadoId(Number(e.target.value))}
              >
                {lotesFefo.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.numero_lote} · vence {formatarData(l.data_validade)} · saldo {l.quantidade_atual} · {l.unidade.nome}
                    {l.sugerido_fefo ? ' · sugerido (usar primeiro)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qtd-item-emprestimo">Quantidade</label>
              <input
                id="qtd-item-emprestimo"
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
                    <td>{i.medicamento.nome}</td>
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

        <div className="grid" style={{ marginTop: 16 }}>
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
          <button type="submit" className="btn" disabled={enviando || itensLista.length === 0}>
            {enviando ? 'Registrando…' : `Registrar saída ${itensLista.length > 0 ? `(${itensLista.length})` : ''}`}
          </button>
        </div>
        <div className="note">Quantidade acima do saldo do lote bloqueia o registro — sem saldo negativo.</div>
      </form>
    </section>
  );
}
