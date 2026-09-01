import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import { formatarMoeda, paraDecimalApi } from '../lib/formato';
import type { LoteDetalhadoOut } from '../types';

/** Ajuste de estoque (quantidade) — qualquer perfil operacional, inclusive
 * Atendente (2026-08-31, pedido do cliente; era Farmacêutico/Coordenador
 * só). Corrige o saldo de um lote fora dos fluxos normais (ex.:
 * divergência encontrada numa contagem física), sempre com motivo
 * obrigatório. A correção de VALOR unitário (financeiro) é uma permissão
 * separada, continua só Farmacêutico/Coordenador — ver
 * `FormularioCorrigirValor` abaixo. A tela some do menu para quem não tem
 * nenhuma das duas; mesmo assim guardamos aqui contra acesso direto pela
 * URL. */
export function AjustePage() {
  const { usuario, token, matrizPermissoes } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  if (!permissoes.ajustarEstoque) {
    return (
      <section>
        <div className="screen-head">
          <h1>Ajuste de Estoque</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Seu perfil não tem acesso ao ajuste de estoque.
        </div>
      </section>
    );
  }

  return (
    <FormularioAjuste
      token={token}
      unidadeAtivaId={unidadeAtivaId}
      podeCorrigirValor={permissoes.corrigirValorUnitario}
    />
  );
}

function FormularioAjuste({
  token,
  unidadeAtivaId,
  podeCorrigirValor,
}: {
  token: string | null;
  unidadeAtivaId: number | null;
  podeCorrigirValor: boolean;
}) {
  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidadeNova, setQuantidadeNova] = useState('');
  const [motivo, setMotivo] = useState('');

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

  function limparFormulario() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidadeNova('');
    setMotivo('');
  }

  const diferenca =
    loteSelecionado && quantidadeNova !== '' && !Number.isNaN(Number(quantidadeNova))
      ? Number(quantidadeNova) - loteSelecionado.quantidade_atual
      : null;

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!loteSelecionado) {
      setErro('Selecione um lote.');
      return;
    }
    if (!motivo.trim()) {
      setErro('Motivo do ajuste é obrigatório.');
      return;
    }
    if (diferenca === 0) {
      setErro('A quantidade informada já é o saldo atual do lote — nada para ajustar.');
      return;
    }

    setEnviando(true);
    try {
      await api.post(
        '/ajustes',
        {
          lote_id: loteSelecionado.id,
          quantidade_nova: Number(quantidadeNova),
          motivo_ajuste: motivo.trim(),
        },
        { token },
      );
      setSucesso(
        `Ajuste registrado — novo saldo do lote ${loteSelecionado.numero_lote}: ${quantidadeNova} unidades.`,
      );
      limparFormulario();
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar o ajuste.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Ajuste de Estoque</h1>
      </div>
      <p className="screen-sub">
        Corrige o saldo de um lote fora dos fluxos normais — use depois de uma contagem física que bateu diferente
        do sistema. Fica registrado na trilha de auditoria, com motivo obrigatório.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>Corrigir saldo de um lote</h2>
        <div className="grid">
          <div className="field span2">
            <label htmlFor="busca-lote-ajuste">
              Lote <span className="req">*</span>
            </label>
            <BuscaAutocomplete
              id="busca-lote-ajuste"
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
              Saldo atual no sistema <span className="tag">auto</span>
            </label>
            <input type="text" disabled value={loteSelecionado ? String(loteSelecionado.quantidade_atual) : ''} placeholder="—" />
          </div>
          <div className="field">
            <label htmlFor="quantidade-nova">
              Quantidade correta (contagem física) <span className="req">*</span>
            </label>
            <input
              id="quantidade-nova"
              type="number"
              min={0}
              placeholder="0"
              value={quantidadeNova}
              onChange={(e) => setQuantidadeNova(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Diferença</label>
            <input
              type="text"
              disabled
              value={diferenca === null ? '' : diferenca > 0 ? `+${diferenca}` : String(diferenca)}
              placeholder="—"
              className={diferenca !== null && diferenca !== 0 ? (diferenca > 0 ? 'ajuste-positivo' : 'ajuste-negativo') : ''}
            />
          </div>
          <div className="field span2">
            <label htmlFor="motivo-ajuste">
              Motivo do ajuste <span className="req">*</span>
            </label>
            <input
              id="motivo-ajuste"
              type="text"
              placeholder="ex.: divergência na contagem física de agosto/2026"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando || diferenca === 0}>
            {enviando ? 'Registrando…' : 'Confirmar ajuste'}
          </button>
          <button type="button" className="btn ghost" onClick={limparFormulario} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>

      {podeCorrigirValor && (
        <FormularioCorrigirValor token={token} unidadeAtivaId={unidadeAtivaId} lotes={lotes} recarregarLotes={carregarLotes} />
      )}
      {podeCorrigirValor && (
        <FormularioCorrigirLote token={token} unidadeAtivaId={unidadeAtivaId} lotes={lotes} recarregarLotes={carregarLotes} />
      )}
    </section>
  );
}

function FormularioCorrigirValor({
  token,
  unidadeAtivaId,
  lotes,
  recarregarLotes,
}: {
  token: string | null;
  unidadeAtivaId: number | null;
  lotes: LoteDetalhadoOut[];
  recarregarLotes: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [valorNovo, setValorNovo] = useState('');
  const [motivo, setMotivo] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function limparFormulario() {
    setBusca('');
    setLoteSelecionado(null);
    setValorNovo('');
    setMotivo('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!loteSelecionado) {
      setErro('Selecione um lote.');
      return;
    }
    if (!motivo.trim()) {
      setErro('Motivo da correção é obrigatório.');
      return;
    }

    setEnviando(true);
    try {
      await api.post(
        '/ajustes/valor',
        {
          lote_id: loteSelecionado.id,
          valor_unitario_novo: paraDecimalApi(valorNovo),
          motivo: motivo.trim(),
        },
        { token },
      );
      setSucesso(
        `Valor unitário do lote ${loteSelecionado.numero_lote} corrigido para ${formatarMoeda(paraDecimalApi(valorNovo))}.`,
      );
      limparFormulario();
      recarregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível corrigir o valor unitário.'));
    } finally {
      setEnviando(false);
    }
  }

  if (unidadeAtivaId == null) return null;

  return (
    <form className="panel" onSubmit={aoSubmeter} style={{ marginTop: 20 }}>
      <h2>Corrigir valor unitário de um lote</h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <p className="screen-sub" style={{ marginTop: -4 }}>
        Para erro de digitação no valor pago (Entrada) — não mexe no saldo físico do lote, só no valor usado nos
        relatórios financeiros.
      </p>
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-valor">
            Lote <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-lote-valor"
            itens={lotes}
            valor={loteSelecionado ? `${loteSelecionado.medicamento.nome} · ${loteSelecionado.numero_lote}` : busca}
            aoMudarValor={(v) => {
              setBusca(v);
              setLoteSelecionado(null);
            }}
            rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · ${formatarMoeda(l.valor_unitario)} · ${l.unidade.nome}`}
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
            Valor unitário atual <span className="tag">auto</span>
          </label>
          <input type="text" disabled value={loteSelecionado ? formatarMoeda(loteSelecionado.valor_unitario) : ''} placeholder="—" />
        </div>
        <div className="field">
          <label htmlFor="valor-unitario-novo">
            Novo valor unitário <span className="req">*</span>
          </label>
          <input
            id="valor-unitario-novo"
            type="text"
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={valorNovo}
            onChange={(e) => setValorNovo(e.target.value)}
            required
          />
        </div>
        <div className="field span2">
          <label htmlFor="motivo-valor">
            Motivo da correção <span className="req">*</span>
          </label>
          <input
            id="motivo-valor"
            type="text"
            placeholder="ex.: valor da nota fiscal digitado errado na Entrada"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Confirmar correção'}
        </button>
        <button type="button" className="btn ghost" onClick={limparFormulario} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Corrigir nº do lote e/ou validade (2026-08-31, pedido do cliente) —
 * mesma permissão de corrigir valor unitário (é a mesma categoria: dado
 * do lote, não saldo físico). Não mexe em quantidade nem em valor. */
function FormularioCorrigirLote({
  token,
  unidadeAtivaId,
  lotes,
  recarregarLotes,
}: {
  token: string | null;
  unidadeAtivaId: number | null;
  lotes: LoteDetalhadoOut[];
  recarregarLotes: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [numeroLoteNovo, setNumeroLoteNovo] = useState('');
  const [validadeNova, setValidadeNova] = useState('');
  const [motivo, setMotivo] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function limparFormulario() {
    setBusca('');
    setLoteSelecionado(null);
    setNumeroLoteNovo('');
    setValidadeNova('');
    setMotivo('');
  }

  function selecionarLote(l: LoteDetalhadoOut) {
    setLoteSelecionado(l);
    setBusca(`${l.medicamento.nome} · ${l.numero_lote}`);
    setNumeroLoteNovo(l.numero_lote ?? '');
    setValidadeNova(l.data_validade ?? '');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!loteSelecionado) {
      setErro('Selecione um lote.');
      return;
    }
    if (!motivo.trim()) {
      setErro('Motivo da correção é obrigatório.');
      return;
    }

    setEnviando(true);
    try {
      await api.post(
        '/ajustes/lote',
        {
          lote_id: loteSelecionado.id,
          numero_lote: numeroLoteNovo.trim() || null,
          data_validade: validadeNova || null,
          motivo: motivo.trim(),
        },
        { token },
      );
      setSucesso(`Lote de ${loteSelecionado.medicamento.nome} corrigido.`);
      limparFormulario();
      recarregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível corrigir o lote.'));
    } finally {
      setEnviando(false);
    }
  }

  if (unidadeAtivaId == null) return null;

  return (
    <form className="panel" onSubmit={aoSubmeter} style={{ marginTop: 20 }}>
      <h2>Corrigir nº do lote / validade</h2>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <p className="screen-sub" style={{ marginTop: -4 }}>
        Para erro de digitação na Entrada — não mexe no saldo físico nem no valor do lote.
      </p>
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-numero">
            Lote <span className="req">*</span>
          </label>
          <BuscaAutocomplete
            id="busca-lote-numero"
            itens={lotes}
            valor={loteSelecionado ? `${loteSelecionado.medicamento.nome} · ${loteSelecionado.numero_lote}` : busca}
            aoMudarValor={(v) => {
              setBusca(v);
              setLoteSelecionado(null);
            }}
            rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · vence ${l.data_validade ?? 's/ validade'} · ${l.unidade.nome}`}
            chave={(l) => l.id}
            aoSelecionar={selecionarLote}
            placeholder="buscar por medicamento ou nº do lote — estoque da unidade ativa"
          />
        </div>
        <div className="field">
          <label htmlFor="numero-lote-novo">Nº do lote</label>
          <input
            id="numero-lote-novo"
            type="text"
            placeholder="deixe em branco se não tiver"
            value={numeroLoteNovo}
            onChange={(e) => setNumeroLoteNovo(e.target.value)}
            disabled={!loteSelecionado}
          />
        </div>
        <div className="field">
          <label htmlFor="validade-novo">Validade</label>
          <input
            id="validade-novo"
            type="date"
            value={validadeNova}
            onChange={(e) => setValidadeNova(e.target.value)}
            disabled={!loteSelecionado}
          />
        </div>
        <div className="field span2">
          <label htmlFor="motivo-lote">
            Motivo da correção <span className="req">*</span>
          </label>
          <input
            id="motivo-lote"
            type="text"
            placeholder="ex.: nº do lote digitado errado na Entrada"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn" disabled={enviando || !loteSelecionado}>
          {enviando ? 'Salvando…' : 'Confirmar correção'}
        </button>
        <button type="button" className="btn ghost" onClick={limparFormulario} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
