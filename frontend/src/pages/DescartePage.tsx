import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import type { LoteDetalhadoOut } from '../types';

const MOTIVOS = ['Vencimento', 'Quebra', 'Outro'];

/** Descarte — ação direta desde 2026-08-19 (era fluxo de 2 etapas
 * solicitar/aprovar; virou 1 etapa a pedido do cliente, igual Entrada/
 * Saída/Ajuste). Farmacêutico e Coordenador têm o mesmo acesso; em troca
 * da autorização prévia que deixou de existir, o Coordenador passa a ser
 * notificado de todo descarte ao logar (ver NotificacaoEstoquePopup). */
export function DescartePage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  if (!permissoes.descarte) {
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

  return <FormularioDescarte token={token} unidadeAtivaId={unidadeAtivaId} />;
}

function FormularioDescarte({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
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

  function limparFormulario() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
    setMotivo(MOTIVOS[0]);
  }

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
        '/descartes',
        { lote_id: loteSelecionado.id, quantidade: Number(quantidade), motivo_descarte: motivo },
        { token },
      );
      setSucesso(`Descarte registrado — saldo do lote ${loteSelecionado.numero_lote} atualizado.`);
      limparFormulario();
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar o descarte.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Descarte</h1>
        <span className="screen-tag">ação direta</span>
      </div>
      <p className="screen-sub">
        Decrementa o estoque na hora — sem etapa de aprovação. O Coordenador é notificado de todo descarte ao logar.
      </p>

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>Registrar descarte</h2>
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
              rotulo={(l) => `${l.medicamento.nome} · ${l.numero_lote} · saldo ${l.quantidade_atual} · ${l.unidade.nome}`}
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
            {enviando ? 'Registrando…' : 'Registrar descarte'}
          </button>
          <button type="button" className="btn ghost" onClick={limparFormulario} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
