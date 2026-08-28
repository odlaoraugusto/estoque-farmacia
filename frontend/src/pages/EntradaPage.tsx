import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe, unidadeEhCaf } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarMoeda, labelAcondicionamento, paraDecimalApi } from '../lib/formato';
import type { MedicamentoOut, Origem } from '../types';

/** Apresentação é texto livre desde 2026-08-28; concentração é opcional
 * — combina os dois só quando concentração existe, sem separador solto. */
function apresentacaoEConcentracao(m: MedicamentoOut): string {
  return m.concentracao ? `${m.apresentacao} · ${m.concentracao}` : m.apresentacao;
}

const HOJE = new Date().toISOString().slice(0, 10);

interface ItemNotaFiscal {
  chave: string;
  medicamento: MedicamentoOut;
  numeroLote: string;
  dataValidade: string;
  quantidade: number;
  valorUnitario: string; // formato "0,50", convertido só na hora de enviar
  numeroAfm: string;
}

/** Entrada de estoque — só ocorre na CAF (docs/00_PROJETO.md seção 3).
 * A tela some do menu quando a unidade ativa não é CAF ou o perfil não é
 * farmacêutico/coordenador; mesmo assim guardamos aqui contra acesso
 * direto pela URL. */
export function EntradaPage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);

  if (!permissoes.entrada) {
    return (
      <section>
        <div className="screen-head">
          <h1>Entrada de Estoque</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          {unidadeEhCaf(usuario)
            ? 'Seu perfil não tem permissão para registrar entrada de estoque.'
            : 'Entrada de estoque só pode ser registrada com a unidade CAF selecionada como unidade ativa.'}
        </div>
      </section>
    );
  }

  return <FormularioEntrada token={token} />;
}

function FormularioEntrada({ token }: { token: string | null }) {
  const [origem, setOrigem] = useState<Origem>('compra');
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);

  useEffect(() => {
    if (!token) return;
    api.get<MedicamentoOut[]>('/medicamentos', { token }).then(setMedicamentos).catch(() => {});
  }, [token]);

  return (
    <section>
      <div className="screen-head">
        <h1>Entrada de Estoque</h1>
        <span className="screen-tag">registro de novo lote</span>
      </div>
      <p className="screen-sub">
        Origem determina se <b>Valor unitário pago</b> é obrigatório (Compra) ou travado em zero (Doação/Empréstimo).{' '}
        <b>Entrada só ocorre na CAF</b> — as demais unidades recebem item só por Transferência.
      </p>

      <div className="field" style={{ maxWidth: 320, marginBottom: 20 }}>
        <label>
          Origem <span className="req">*</span>
        </label>
        <div className="seg">
          <button type="button" aria-pressed={origem === 'compra'} onClick={() => setOrigem('compra')}>
            Compra
          </button>
          <button type="button" aria-pressed={origem === 'doacao'} onClick={() => setOrigem('doacao')}>
            Doação
          </button>
          <button type="button" aria-pressed={origem === 'emprestimo'} onClick={() => setOrigem('emprestimo')}>
            Empréstimo
          </button>
        </div>
      </div>

      {origem === 'compra' ? (
        <FormularioNotaFiscal token={token} medicamentos={medicamentos} />
      ) : (
        <FormularioItemUnico token={token} medicamentos={medicamentos} origem={origem} />
      )}
    </section>
  );
}

/** Compra: nota fiscal com vários itens (2026-08-20, a pedido do
 * cliente — várias linhas de compra chegam sob a mesma NF, e digitar o
 * número dela de novo pra cada item era retrabalho e risco de erro de
 * digitação). Fluxo: preenche o número da NF e o valor total informado
 * (só pra conferência local) UMA vez, depois adiciona quantos itens
 * quiser num carrinho local; só ao final tudo vira `POST /entradas` (uma
 * chamada por item, todas com o mesmo `numero_nota_fiscal`) — não existe
 * uma tabela própria de nota fiscal no banco, cada item continua sendo
 * um `Lote` normal, só compartilhando o mesmo número de NF em texto. */
function FormularioNotaFiscal({ token, medicamentos }: { token: string | null; medicamentos: MedicamentoOut[] }) {
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState('');
  const [valorTotalNota, setValorTotalNota] = useState('');
  // Calculado automaticamente a partir da soma dos itens (2026-08-20, a
  // pedido do cliente) — mas continua editável: assim que o usuário
  // digita um valor diferente do calculado, o campo para de se
  // autoatualizar (ele "assumiu o controle" do valor, provavelmente
  // porque está copiando o total impresso na nota física).
  const [valorEditadoManualmente, setValorEditadoManualmente] = useState(false);

  const [buscaMedicamento, setBuscaMedicamento] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [numeroLote, setNumeroLote] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [valorUnitario, setValorUnitario] = useState('');
  const [numeroAfm, setNumeroAfm] = useState('');
  const [erroItem, setErroItem] = useState<string | null>(null);

  const [itens, setItens] = useState<ItemNotaFiscal[]>([]);
  const [registrando, setRegistrando] = useState(false);
  const [progresso, setProgresso] = useState<{ ok: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function limparCampoItem() {
    setBuscaMedicamento('');
    setMedicamentoSelecionado(null);
    setNumeroLote('');
    setDataValidade('');
    setQuantidade('');
    setValorUnitario('');
    setNumeroAfm('');
  }

  function adicionarItem() {
    setErroItem(null);
    if (!numeroNotaFiscal.trim()) {
      setErroItem('Informe o número da nota fiscal antes de adicionar itens.');
      return;
    }
    if (!medicamentoSelecionado) {
      setErroItem('Selecione um medicamento.');
      return;
    }
    if (!numeroLote.trim() || !dataValidade || !quantidade || !valorUnitario) {
      setErroItem('Preencha lote, validade, quantidade e valor unitário deste item.');
      return;
    }
    setItens((atual) => [
      ...atual,
      {
        chave: `${Date.now()}-${atual.length}`,
        medicamento: medicamentoSelecionado,
        numeroLote: numeroLote.trim(),
        dataValidade,
        quantidade: Number(quantidade),
        valorUnitario,
        numeroAfm: numeroAfm.trim(),
      },
    ]);
    limparCampoItem();
  }

  function removerItem(chave: string) {
    setItens((atual) => atual.filter((i) => i.chave !== chave));
  }

  const subtotal = itens.reduce((soma, i) => soma + i.quantidade * Number(paraDecimalApi(i.valorUnitario) || '0'), 0);

  useEffect(() => {
    if (valorEditadoManualmente) return;
    setValorTotalNota(itens.length > 0 ? subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, valorEditadoManualmente]);

  const valorInformado = valorTotalNota ? Number(paraDecimalApi(valorTotalNota) || '0') : null;
  const divergencia = valorInformado !== null ? subtotal - valorInformado : null;

  async function registrarTodos() {
    setErro(null);
    setSucesso(null);
    setRegistrando(true);
    setProgresso({ ok: 0, total: itens.length });

    const restantes = [...itens];
    let ok = 0;
    for (const item of restantes) {
      try {
        await api.post(
          '/entradas',
          {
            medicamento_id: item.medicamento.id,
            numero_lote: item.numeroLote,
            data_validade: item.dataValidade,
            quantidade: item.quantidade,
            valor_unitario: paraDecimalApi(item.valorUnitario),
            origem: 'compra',
            numero_nota_fiscal: numeroNotaFiscal.trim(),
            numero_afm: item.numeroAfm || null,
          },
          { token },
        );
        ok += 1;
        setProgresso({ ok, total: restantes.length });
        setItens((atual) => atual.filter((i) => i.chave !== item.chave));
      } catch (err) {
        setErro(
          mensagemErro(
            err,
            `Não foi possível registrar "${item.medicamento.nome}" (lote ${item.numeroLote}) — os demais itens ainda não enviados continuam na lista.`,
          ),
        );
        setRegistrando(false);
        return;
      }
    }

    setSucesso(`${ok} item(ns) da nota ${numeroNotaFiscal} registrado(s) com sucesso.`);
    setNumeroNotaFiscal('');
    setValorTotalNota('');
    setValorEditadoManualmente(false);
    setRegistrando(false);
    setProgresso(null);
  }

  return (
    <>
      <form
        className="panel"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          adicionarItem();
        }}
      >
        <h2>Dados da nota fiscal</h2>
        {erroItem && <Alerta tipo="erro">{erroItem}</Alerta>}
        <div className="grid">
          <div className="field">
            <label htmlFor="nf-numero">
              Nº da nota fiscal <span className="req">*</span>
            </label>
            <input
              id="nf-numero"
              type="text"
              placeholder="ex.: 20260558"
              value={numeroNotaFiscal}
              onChange={(e) => setNumeroNotaFiscal(e.target.value)}
              disabled={itens.length > 0}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="nf-valor-total">
              Valor total da nota{' '}
              <span className="tag">{valorEditadoManualmente ? 'editado manualmente' : 'calculado automático'}</span>
            </label>
            <input
              id="nf-valor-total"
              type="text"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={valorTotalNota}
              onChange={(e) => {
                setValorEditadoManualmente(true);
                setValorTotalNota(e.target.value);
              }}
            />
            {valorEditadoManualmente && (
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: 12, marginTop: 4 }}
                onClick={() => setValorEditadoManualmente(false)}
              >
                Voltar a calcular automaticamente
              </button>
            )}
          </div>
        </div>

        <h2 style={{ marginTop: 18 }}>Adicionar item</h2>
        <div className="grid">
          <div className="field span2">
            <label htmlFor="busca-medicamento">
              Medicamento <span className="req">*</span>
            </label>
            <BuscaAutocomplete
              id="busca-medicamento"
              itens={medicamentos}
              valor={medicamentoSelecionado ? medicamentoSelecionado.nome : buscaMedicamento}
              aoMudarValor={(v) => {
                setBuscaMedicamento(v);
                setMedicamentoSelecionado(null);
              }}
              rotulo={(m) => m.nome}
              chave={(m) => m.id}
              aoSelecionar={(m) => {
                setMedicamentoSelecionado(m);
                setBuscaMedicamento(m.nome);
              }}
              placeholder="buscar por nome…"
            />
          </div>
          <div className="field">
            <label>
              Apresentação <span className="tag">auto</span>
            </label>
            <input
              type="text"
              disabled
              value={medicamentoSelecionado ? apresentacaoEConcentracao(medicamentoSelecionado) : ''}
              placeholder="preenchido pelo medicamento"
            />
          </div>
          <div className="field">
            <label>
              Acondicionamento <span className="tag">auto</span>
            </label>
            <input
              type="text"
              disabled
              value={medicamentoSelecionado?.acondicionamento ? labelAcondicionamento(medicamentoSelecionado.acondicionamento) : ''}
              placeholder="Ambiente / Geladeira"
            />
          </div>
          <div className="field">
            <label htmlFor="numero-lote">
              Número do lote <span className="req">*</span>
            </label>
            <input
              id="numero-lote"
              type="text"
              placeholder="ex.: LT48213"
              value={numeroLote}
              onChange={(e) => setNumeroLote(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="data-validade">
              Data de validade <span className="req">*</span>
            </label>
            <input
              id="data-validade"
              type="date"
              min={HOJE}
              value={dataValidade}
              onChange={(e) => setDataValidade(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="quantidade">
              Quantidade <span className="req">*</span>
            </label>
            <input
              id="quantidade"
              type="number"
              min={1}
              placeholder="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="valor-unitario">
              Valor unitário pago <span className="req">*</span>
            </label>
            <input
              id="valor-unitario"
              type="text"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="numero-afm">Nº AFM</label>
            <input id="numero-afm" type="text" placeholder="—" value={numeroAfm} onChange={(e) => setNumeroAfm(e.target.value)} />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn ghost">
            Adicionar item à nota
          </button>
        </div>
      </form>

      <div className="panel">
        <h2>Itens desta nota ({itens.length})</h2>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Lote</th>
                <th>Validade</th>
                <th className="num">Qtd.</th>
                <th className="num">Valor unit.</th>
                <th className="num">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 && (
                <tr>
                  <td colSpan={7} className="vazio-tabela">
                    Nenhum item adicionado ainda.
                  </td>
                </tr>
              )}
              {itens.map((item) => (
                <tr key={item.chave}>
                  <td>{item.medicamento.nome}</td>
                  <td className="mono">{item.numeroLote}</td>
                  <td>{item.dataValidade}</td>
                  <td className="num">{item.quantidade}</td>
                  <td className="num">{formatarMoeda(paraDecimalApi(item.valorUnitario))}</td>
                  <td className="num">
                    {formatarMoeda(item.quantidade * Number(paraDecimalApi(item.valorUnitario) || '0'))}
                  </td>
                  <td>
                    <button type="button" className="btn ghost sm" onClick={() => removerItem(item.chave)} disabled={registrando}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {itens.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ fontWeight: 700 }}>
                    Subtotal dos itens
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {formatarMoeda(subtotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {valorInformado !== null && divergencia !== null && Math.abs(divergencia) > 0.005 && (
          <div
            className="box"
            style={{ background: 'var(--warn-bg)', color: 'var(--ink)', borderColor: 'var(--warn)', marginTop: 12 }}
          >
            <span>
              Divergência: valor informado da nota ({formatarMoeda(valorInformado)}) difere do subtotal dos itens (
              {formatarMoeda(subtotal)}) em {formatarMoeda(Math.abs(divergencia))}. Não bloqueia o registro — confira
              antes de prosseguir.
            </span>
          </div>
        )}

        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" disabled={itens.length === 0 || registrando} onClick={registrarTodos}>
            {registrando
              ? `Registrando… (${progresso?.ok ?? 0}/${progresso?.total ?? itens.length})`
              : `Registrar ${itens.length} item(ns) desta nota`}
          </button>
        </div>
        <div className="note">
          Todos os itens acima entram como lotes separados, compartilhando o mesmo número de nota fiscal — evita
          digitar a mesma NF várias vezes e facilita conferir depois se o total bate com o que chegou.
        </div>
      </div>
    </>
  );
}

/** Doação/Empréstimo: continua sendo um item por vez — não há nota
 * fiscal nem valor a conferir nesses casos (valor sempre zerado). */
function FormularioItemUnico({
  token,
  medicamentos,
  origem,
}: {
  token: string | null;
  medicamentos: MedicamentoOut[];
  origem: Origem;
}) {
  const [buscaMedicamento, setBuscaMedicamento] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);
  const [numeroLote, setNumeroLote] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [procedenciaExterna, setProcedenciaExterna] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function limparFormulario() {
    setBuscaMedicamento('');
    setMedicamentoSelecionado(null);
    setNumeroLote('');
    setDataValidade('');
    setQuantidade('');
    setProcedenciaExterna('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!medicamentoSelecionado) {
      setErro('Selecione um medicamento na busca.');
      return;
    }
    if (origem === 'emprestimo' && !procedenciaExterna.trim()) {
      setErro('Informe de qual instituição veio o empréstimo.');
      return;
    }

    setEnviando(true);
    try {
      const lote = await api.post<{ numero_lote: string }>(
        '/entradas',
        {
          medicamento_id: medicamentoSelecionado.id,
          numero_lote: numeroLote,
          data_validade: dataValidade,
          quantidade: Number(quantidade),
          valor_unitario: '0',
          origem,
          numero_nota_fiscal: null,
          numero_afm: null,
          procedencia_externa: procedenciaExterna.trim() || null,
        },
        { token },
      );
      setSucesso(`Entrada registrada — lote ${lote.numero_lote}.`);
      limparFormulario();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar a entrada.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="panel" onSubmit={aoSubmeter}>
      <h2>Novo lote — {origem === 'doacao' ? 'Doação' : 'Empréstimo'}</h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-medicamento-unico">
            Medicamento <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-medicamento-unico"
            itens={medicamentos}
            valor={medicamentoSelecionado ? medicamentoSelecionado.nome : buscaMedicamento}
            aoMudarValor={(v) => {
              setBuscaMedicamento(v);
              setMedicamentoSelecionado(null);
            }}
            rotulo={(m) => m.nome}
            chave={(m) => m.id}
            aoSelecionar={(m) => {
              setMedicamentoSelecionado(m);
              setBuscaMedicamento(m.nome);
            }}
            placeholder="buscar por nome…"
          />
        </div>
        <div className="field">
          <label>
            Apresentação <span className="tag">auto</span>
          </label>
          <input
            type="text"
            disabled
            value={medicamentoSelecionado ? apresentacaoEConcentracao(medicamentoSelecionado) : ''}
            placeholder="preenchido pelo medicamento"
          />
        </div>
        <div className="field">
          <label>
            Acondicionamento <span className="tag">auto</span>
          </label>
          <input
            type="text"
            disabled
            value={medicamentoSelecionado?.acondicionamento ? labelAcondicionamento(medicamentoSelecionado.acondicionamento) : ''}
            placeholder="Ambiente / Geladeira"
          />
        </div>
        <div className="field">
          <label htmlFor="numero-lote-unico">
            Número do lote <span className="req">*</span>
          </label>
          <input
            id="numero-lote-unico"
            type="text"
            placeholder="ex.: LT48213"
            value={numeroLote}
            onChange={(e) => setNumeroLote(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="data-validade-unico">
            Data de validade <span className="req">*</span>
          </label>
          <input
            id="data-validade-unico"
            type="date"
            min={HOJE}
            value={dataValidade}
            onChange={(e) => setDataValidade(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="quantidade-unico">
            Quantidade <span className="req">*</span>
          </label>
          <input
            id="quantidade-unico"
            type="number"
            min={1}
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>
            Unidade <span className="tag">fixa</span>
          </label>
          <input type="text" disabled value="CAF" />
        </div>
        <div className="field span2">
          <label htmlFor="procedencia-externa-unico">
            Unidade de origem — de qual instituição veio{' '}
            {origem === 'emprestimo' && <span className="req">*</span>}
          </label>
          <input
            id="procedencia-externa-unico"
            type="text"
            placeholder="ex.: Hospital Municipal Tal"
            value={procedenciaExterna}
            onChange={(e) => setProcedenciaExterna(e.target.value)}
            required={origem === 'emprestimo'}
          />
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar entrada'}
        </button>
        <button type="button" className="btn ghost" onClick={limparFormulario} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
