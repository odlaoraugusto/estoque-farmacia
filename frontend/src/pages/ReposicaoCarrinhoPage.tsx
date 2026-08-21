import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import type { LoteDetalhadoOut, UnidadeOut } from '../types';

/** Reposição de carrinhos de emergência — reabastece um carrinho a
 * partir do estoque da CAF. Fluxo de UMA etapa só (diferente de
 * Transferência normal): não existe confirmação separada, o lote já
 * sai como recebido no carrinho destino (POST /transferencias/repor-carrinho).
 * Exclusiva do Farmacêutico com a CAF como unidade ativa — Coordenador
 * não repõe carrinho (só o Farmacêutico, ver lib/permissoes.ts). */
export function ReposicaoCarrinhoPage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);

  if (!permissoes.reporCarrinho) {
    return (
      <section>
        <div className="screen-head">
          <h1>Reposição de Carrinhos</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          {usuario?.perfil !== 'farmaceutico'
            ? 'Só o perfil Farmacêutico repõe carrinhos de emergência.'
            : 'Reposição de carrinhos só pode ser feita com a unidade CAF selecionada como unidade ativa.'}
        </div>
      </section>
    );
  }

  return <FormularioReposicao token={token} unidadeAtivaId={usuario?.unidade_ativa_id ?? null} />;
}

function FormularioReposicao({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [unidadesReais, setUnidadesReais] = useState<UnidadeOut[]>([]);
  const [carrinhos, setCarrinhos] = useState<UnidadeOut[]>([]);

  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [carrinhoDestinoId, setCarrinhoDestinoId] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarLotes = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    api
      .get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: unidadeAtivaId } })
      .then(setLotes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os lotes da CAF.')));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregarLotes();
    if (!token) return;
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } })
      .then(setUnidadesReais)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as unidades.')));
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'carrinho' } })
      .then(setCarrinhos)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os carrinhos de emergência.')));
  }, [carregarLotes, token]);

  const nomeUnidadePorId = useMemo(() => new Map(unidadesReais.map((u) => [u.id, u.nome])), [unidadesReais]);

  const gruposCarrinho = useMemo(() => {
    const grupos = new Map<string, UnidadeOut[]>();
    for (const carrinho of carrinhos) {
      const rotuloSetor = nomeUnidadePorId.get(carrinho.unidade_pai_id ?? -1) ?? 'Sem setor';
      const lista = grupos.get(rotuloSetor) ?? [];
      lista.push(carrinho);
      grupos.set(rotuloSetor, lista);
    }
    return [...grupos.entries()];
  }, [carrinhos, nomeUnidadePorId]);

  function limpar() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
    setCarrinhoDestinoId('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote da CAF.');
      return;
    }
    if (!carrinhoDestinoId) {
      setErro('Selecione o carrinho de destino.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        '/transferencias/repor-carrinho',
        {
          lote_id: loteSelecionado.id,
          quantidade: Number(quantidade),
          carrinho_destino_id: Number(carrinhoDestinoId),
        },
        { token },
      );
      setSucesso('Carrinho reposto — o lote já saiu como recebido no destino.');
      limpar();
      carregarLotes();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível repor o carrinho.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Reposição de Carrinhos</h1>
        <span className="screen-tag">recebimento imediato</span>
      </div>
      <p className="screen-sub">
        Reabastece um carrinho de emergência a partir do estoque da CAF — sem etapa de confirmação, o lote já sai
        como recebido.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>Repor carrinho</h2>
        <div className="grid">
          <div className="field span2">
            <label htmlFor="busca-lote-carrinho">
              Lote (estoque da CAF) <span className="req">*</span>
            </label>
            <BuscaAutocomplete
              id="busca-lote-carrinho"
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
              placeholder="buscar por medicamento ou nº do lote — estoque da CAF"
            />
          </div>
          <div className="field">
            <label>
              Saldo disponível <span className="tag">auto</span>
            </label>
            <input type="text" disabled value={loteSelecionado?.quantidade_atual ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="qtd-repor">
              Quantidade a repor <span className="req">*</span>
            </label>
            <input
              id="qtd-repor"
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
            <label htmlFor="carrinho-destino">
              Carrinho de destino <span className="req">*</span>
            </label>
            <select
              id="carrinho-destino"
              value={carrinhoDestinoId}
              onChange={(e) => setCarrinhoDestinoId(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {gruposCarrinho.map(([setor, itensCarrinho]) => (
                <optgroup key={setor} label={setor}>
                  {itensCarrinho.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? 'Repondo…' : 'Repor carrinho'}
          </button>
          <button type="button" className="btn ghost" onClick={limpar} disabled={enviando}>
            Cancelar
          </button>
        </div>
        <div className="note">
          Reposição de estoque, não uma transferência com confirmação — ao enviar, o lote já nasce recebido no
          carrinho.
        </div>
      </form>
    </section>
  );
}
