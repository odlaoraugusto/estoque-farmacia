import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe, unidadeEhCaf } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { labelAcondicionamento, labelApresentacao, paraDecimalApi } from '../lib/formato';
import type { MedicamentoOut, Origem } from '../types';

const HOJE = new Date().toISOString().slice(0, 10);

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
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [buscaMedicamento, setBuscaMedicamento] = useState('');
  const [medicamentoSelecionado, setMedicamentoSelecionado] = useState<MedicamentoOut | null>(null);

  const [numeroLote, setNumeroLote] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [origem, setOrigem] = useState<Origem>('compra');
  const [valorUnitario, setValorUnitario] = useState('');
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState('');
  const [numeroAfm, setNumeroAfm] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<MedicamentoOut[]>('/medicamentos', { token })
      .then(setMedicamentos)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os medicamentos.')));
  }, [token]);

  function limparFormulario() {
    setBuscaMedicamento('');
    setMedicamentoSelecionado(null);
    setNumeroLote('');
    setDataValidade('');
    setQuantidade('');
    setOrigem('compra');
    setValorUnitario('');
    setNumeroNotaFiscal('');
    setNumeroAfm('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!medicamentoSelecionado) {
      setErro('Selecione um medicamento na busca.');
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
          valor_unitario: origem === 'doacao' ? '0' : paraDecimalApi(valorUnitario),
          origem,
          numero_nota_fiscal: origem === 'doacao' ? null : numeroNotaFiscal || null,
          numero_afm: numeroAfm || null,
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

  const doacao = origem === 'doacao';

  return (
    <section>
      <div className="screen-head">
        <h1>Entrada de Estoque</h1>
        <span className="screen-tag">
          cria <code>lotes</code> + <code>movimentacoes(entrada)</code>
        </span>
      </div>
      <p className="screen-sub">
        Origem determina se <b>Valor unitário pago</b> é obrigatório (Compra) ou travado em zero (Doação).{' '}
        <b>Entrada só ocorre na CAF</b> — as demais unidades recebem item só por Transferência.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>Novo lote</h2>
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
              value={
                medicamentoSelecionado
                  ? `${labelApresentacao(medicamentoSelecionado.apresentacao)} · ${medicamentoSelecionado.concentracao}`
                  : ''
              }
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
              value={medicamentoSelecionado ? labelAcondicionamento(medicamentoSelecionado.acondicionamento) : ''}
              placeholder="Ambiente / Geladeira"
            />
          </div>
          <div className="field">
            <label htmlFor="numero-lote">
              Número do lote <span className="req">*</span>
            </label>
            <input id="numero-lote" type="text" placeholder="ex.: LT48213" value={numeroLote} onChange={(e) => setNumeroLote(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="data-validade">
              Data de validade <span className="req">*</span>
            </label>
            <input id="data-validade" type="date" min={HOJE} value={dataValidade} onChange={(e) => setDataValidade(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="quantidade">
              Quantidade <span className="req">*</span>
            </label>
            <input id="quantidade" type="number" min={1} placeholder="0" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
          </div>
          <div className="field">
            <label>
              Unidade <span className="tag">fixa</span>
            </label>
            <input type="text" disabled value="CAF" />
          </div>
          <div className="field">
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
            </div>
          </div>
          <div className="field">
            <label htmlFor="valor-unitario">
              Valor unitário pago {!doacao && <span className="req">*</span>} <span className="tag">novo campo</span>
            </label>
            <input
              id="valor-unitario"
              type="text"
              inputMode="decimal"
              placeholder="R$ 0,00"
              disabled={doacao}
              value={doacao ? '0,00' : valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              required={!doacao}
            />
          </div>
          <div className="field">
            <label htmlFor="numero-nf">
              Nº nota fiscal {!doacao && <span className="req">*</span>} <span className="tag">{doacao ? 'não obrigatório' : 'se Compra'}</span>
            </label>
            <input
              id="numero-nf"
              type="text"
              placeholder="série-número"
              disabled={doacao}
              value={doacao ? '' : numeroNotaFiscal}
              onChange={(e) => setNumeroNotaFiscal(e.target.value)}
              required={!doacao}
            />
          </div>
          <div className="field">
            <label htmlFor="numero-afm">
              Nº AFM <span className="tag">opcional</span>
            </label>
            <input id="numero-afm" type="text" placeholder="—" value={numeroAfm} onChange={(e) => setNumeroAfm(e.target.value)} />
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
        <div className="note new">
          <strong>Novo nesta rodada —</strong> ao marcar Doação, o valor trava em R$0,00 e a nota fiscal deixa de ser
          obrigatória.
        </div>
      </form>
    </section>
  );
}
