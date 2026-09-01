import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { BuscaAutocomplete } from '../components/BuscaAutocomplete';
import type { LoteDetalhadoOut, UnidadeOut } from '../types';

/** Transferência entre unidades — envio direto (Farmacêutico/Coordenador)
 * pra outra unidade real ou devolução de carrinho pra unidade que o
 * hospeda (2026-08-31: era sempre pra CAF, agora acompanha a mesma
 * generalização da reposição).
 *
 * 2026-08-31 (pedido do cliente): "Solicitar transferência à CAF" e
 * "Atender solicitações" saíram daqui — viraram a tela Ressuprimento
 * (`ResuprimentoPage.tsx`), que é o fluxo PULL (a satélite pede) em vez
 * do PUSH que fica aqui (a CAF/Farmacêutico manda direto). Também desde
 * 2026-08-31, envio direto (`PainelEnviar`) já nasce confirmado — não
 * fica mais pendente esperando a unidade de destino confirmar.
 *
 * 2026-09-01 (pedido do cliente): removido o painel "Confirmar
 * recebimento" (não estava sendo usado). Devolução de carrinho continua
 * sendo criada em duas etapas no backend (`TransferenciaService.
 * devolver_carrinho`, ver `POST /transferencias/{id}/confirmar`) — sem
 * este painel, essa confirmação deixou de ter uma tela própria. */
export function TransferenciaPage() {
  const { usuario, token, matrizPermissoes } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);
  const unidadeAtivaId = usuario?.unidade_ativa_id ?? null;

  return (
    <section>
      <div className="screen-head">
        <h1>Transferência entre unidades</h1>
        <span className="screen-tag">envio direto (Farmacêutico/Coordenador)</span>
      </div>
      <p className="screen-sub">
        Envio direto já sai confirmado no destino. Transferência parcial gera um segundo lote, vinculado ao lote de
        origem para rastreabilidade. Para pedir um medicamento à CAF em vez de enviar, use a tela{' '}
        <strong>Ressuprimento</strong>.
      </p>

      {permissoes.transferenciaEnviar && <PainelEnviar token={token} unidadeAtivaId={unidadeAtivaId} />}
      {permissoes.devolverCarrinho && <PainelDevolverCarrinho token={token} unidadeAtivaId={unidadeAtivaId} />}
    </section>
  );
}

interface ItemListaEnvio {
  lote: LoteDetalhadoOut;
  quantidade: string;
}

/** Enviar lote — em lista (2026-08-31, pedido do cliente: "acrescentar
 * lista", mesmo padrão já usado em Solicitar) — monta vários lotes antes
 * de enviar, todos pra mesma unidade de destino (escolhida uma vez só).
 * Cada item vira uma chamada própria de `POST /transferencias/enviar`
 * (não existe endpoint de lote no backend pra isso — mesma abordagem
 * sequencial já usada em `PainelPage.confirmarItensMarcados` do projeto
 * irmão Almoxarifado). */
function PainelEnviar({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotes, setLotes] = useState<LoteDetalhadoOut[]>([]);
  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [unidadeDestinoId, setUnidadeDestinoId] = useState('');
  const [itensLista, setItensLista] = useState<ItemListaEnvio[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarLotes = useCallback(() => {
    if (!token || unidadeAtivaId == null) return;
    api
      .get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: unidadeAtivaId } })
      .then(setLotes)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os lotes da unidade ativa.')));
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregarLotes();
    if (!token) return;
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } })
      .then((lista) => setUnidades(lista.filter((u) => u.id !== unidadeAtivaId)))
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as unidades.')));
  }, [carregarLotes, token, unidadeAtivaId]);

  function limparSelecao() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
  }

  function adicionarNaLista() {
    setErro(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote de origem.');
      return;
    }
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) {
      setErro('Informe uma quantidade válida.');
      return;
    }
    if (qtd > loteSelecionado.quantidade_atual) {
      setErro(`Quantidade maior que o saldo disponível (${loteSelecionado.quantidade_atual}).`);
      return;
    }
    if (itensLista.some((i) => i.lote.id === loteSelecionado.id)) {
      setErro('Este lote já está na lista.');
      return;
    }
    setItensLista((atual) => [...atual, { lote: loteSelecionado, quantidade }]);
    limparSelecao();
  }

  function removerDaLista(loteId: number) {
    setItensLista((atual) => atual.filter((i) => i.lote.id !== loteId));
  }

  async function enviarLista() {
    setErro(null);
    setSucesso(null);
    if (itensLista.length === 0) {
      setErro('Adicione ao menos um lote à lista antes de enviar.');
      return;
    }
    if (!unidadeDestinoId) {
      setErro('Selecione a unidade de destino.');
      return;
    }
    setEnviando(true);
    const idsComFalha = new Set<number>();
    const mensagensFalha: string[] = [];
    for (const item of itensLista) {
      try {
        // eslint-disable-next-line no-await-in-loop -- cada item é uma transferência própria, sequencial de propósito
        await api.post(
          '/transferencias/enviar',
          { lote_id: item.lote.id, quantidade: Number(item.quantidade), unidade_destino_id: Number(unidadeDestinoId) },
          { token },
        );
      } catch (err) {
        idsComFalha.add(item.lote.id);
        mensagensFalha.push(`${item.lote.medicamento.nome} (${mensagemErro(err)})`);
      }
    }
    setEnviando(false);
    carregarLotes();
    if (idsComFalha.size === 0) {
      setSucesso(`${itensLista.length} transferência(s) enviada(s) com sucesso.`);
      setItensLista([]);
      setUnidadeDestinoId('');
    } else {
      setItensLista((atual) => atual.filter((i) => idsComFalha.has(i.lote.id)));
      setErro(`Não foi possível enviar: ${mensagensFalha.join('; ')}. O restante da lista foi enviado com sucesso.`);
    }
  }

  return (
    <div className="panel">
      <h2>Enviar lote</h2>
      <p className="screen-sub">Adicione um ou mais lotes à lista e envie tudo de uma vez para a mesma unidade de destino.</p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-transf">Lote de origem</label>
          <BuscaAutocomplete
            id="busca-lote-transf"
            itens={lotes.filter((l) => !itensLista.some((i) => i.lote.id === l.id))}
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
            placeholder="buscar por medicamento ou nº do lote — unidade ativa"
          />
        </div>
        <div className="field">
          <label htmlFor="qtd-enviar">Quantidade a enviar</label>
          <input
            id="qtd-enviar"
            type="number"
            min={1}
            max={loteSelecionado?.quantidade_atual}
            placeholder={loteSelecionado ? `≤ ${loteSelecionado.quantidade_atual}` : '0'}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn ghost" onClick={adicionarNaLista}>
          + Adicionar à lista
        </button>
      </div>

      {itensLista.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th className="num">Qtd.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itensLista.map((i) => (
                <tr key={i.lote.id}>
                  <td>
                    {i.lote.medicamento.nome} · {i.lote.numero_lote}
                  </td>
                  <td className="num">{i.quantidade}</td>
                  <td>
                    <button type="button" className="btn ghost sm" onClick={() => removerDaLista(i.lote.id)}>
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
        <div className="field span2">
          <label htmlFor="unidade-destino">
            Unidade de destino <span className="req">*</span>
          </label>
          <select id="unidade-destino" value={unidadeDestinoId} onChange={(e) => setUnidadeDestinoId(e.target.value)}>
            <option value="">Selecione…</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn" disabled={enviando || itensLista.length === 0} onClick={enviarLista}>
          {enviando ? 'Enviando…' : `Enviar ${itensLista.length > 0 ? `(${itensLista.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}

/** Devolução de carrinho -> unidade que o hospeda (2026-08-31, pedido do
 * cliente: antes sempre voltava pra CAF, mesmo carrinho sendo de outra
 * satélite; agora, espelhando a reposição já generalizada, volta pra
 * própria unidade ativa). Espelho da Reposição, mas em DUAS etapas —
 * esta tela só envia (fica pendente); a confirmação em si não tem mais
 * tela própria (painel "Confirmar recebimento" removido em 2026-09-01,
 * não estava sendo usado). Exclusiva do Farmacêutico/Coordenador — só
 * pode devolver carrinhos que são FILHOS da unidade ativa. */
interface ItemListaDevolucao {
  lote: LoteDetalhadoOut;
  quantidade: string;
}

/** Devolver carrinho — em lista (2026-08-31/09-01, pedido do cliente:
 * mesmo padrão de "Enviar lote"), destino sempre a própria unidade ativa
 * (inclusive a CAF, que também hospeda carrinhos próprios — "devolver
 * carrinho da CAF" continua funcionando igual, só que agora explícito em
 * vez de fixo no código). Cada item vira sua própria chamada de `POST
 * /transferencias/devolver-carrinho`, sequencial. */
function PainelDevolverCarrinho({ token, unidadeAtivaId }: { token: string | null; unidadeAtivaId: number | null }) {
  const [lotesCarrinho, setLotesCarrinho] = useState<LoteDetalhadoOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<LoteDetalhadoOut | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [itensLista, setItensLista] = useState<ItemListaDevolucao[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarLotes = useCallback(async () => {
    if (!token || unidadeAtivaId == null) return;
    try {
      // Carrinho é estoque à parte da unidade que o hospeda (2026-08-31)
      // — GET /lotes?unidade_id=unidadeAtivaId não traz mais os carrinhos
      // filhos junto. Busca os carrinhos filhos da unidade ativa primeiro,
      // depois o estoque de cada um, um a um.
      const todasUnidades = await api.get<UnidadeOut[]>('/unidades', { token });
      const carrinhosFilhos = todasUnidades.filter((u) => u.tipo === 'carrinho' && u.unidade_pai_id === unidadeAtivaId);
      const lotesPorCarrinho = await Promise.all(
        carrinhosFilhos.map((c) => api.get<LoteDetalhadoOut[]>('/lotes', { token, params: { unidade_id: c.id } })),
      );
      setLotesCarrinho(lotesPorCarrinho.flat());
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível carregar os lotes dos carrinhos da unidade.'));
    }
  }, [token, unidadeAtivaId]);

  useEffect(() => {
    carregarLotes();
  }, [carregarLotes]);

  function limparSelecao() {
    setBusca('');
    setLoteSelecionado(null);
    setQuantidade('');
  }

  function adicionarNaLista() {
    setErro(null);
    if (!loteSelecionado) {
      setErro('Selecione um lote em um carrinho da unidade.');
      return;
    }
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) {
      setErro('Informe uma quantidade válida.');
      return;
    }
    if (qtd > loteSelecionado.quantidade_atual) {
      setErro(`Quantidade maior que o saldo disponível no carrinho (${loteSelecionado.quantidade_atual}).`);
      return;
    }
    if (itensLista.some((i) => i.lote.id === loteSelecionado.id)) {
      setErro('Este lote já está na lista.');
      return;
    }
    setItensLista((atual) => [...atual, { lote: loteSelecionado, quantidade }]);
    limparSelecao();
  }

  function removerDaLista(loteId: number) {
    setItensLista((atual) => atual.filter((i) => i.lote.id !== loteId));
  }

  async function enviarLista() {
    setErro(null);
    setSucesso(null);
    if (itensLista.length === 0) {
      setErro('Adicione ao menos um lote à lista antes de devolver.');
      return;
    }
    setEnviando(true);
    const idsComFalha = new Set<number>();
    const mensagensFalha: string[] = [];
    for (const item of itensLista) {
      try {
        // eslint-disable-next-line no-await-in-loop -- cada item é uma devolução própria, sequencial de propósito
        await api.post('/transferencias/devolver-carrinho', { lote_id: item.lote.id, quantidade: Number(item.quantidade) }, { token });
      } catch (err) {
        idsComFalha.add(item.lote.id);
        mensagensFalha.push(`${item.lote.medicamento.nome} (${mensagemErro(err)})`);
      }
    }
    setEnviando(false);
    carregarLotes();
    if (idsComFalha.size === 0) {
      setSucesso(`${itensLista.length} devolução(ões) enviada(s) — pendente(s) até a unidade confirmar o recebimento.`);
      setItensLista([]);
    } else {
      setItensLista((atual) => atual.filter((i) => idsComFalha.has(i.lote.id)));
      setErro(`Não foi possível devolver: ${mensagensFalha.join('; ')}. O restante da lista foi enviado com sucesso.`);
    }
  }

  return (
    <div className="panel">
      <h2>Devolver carrinho à unidade</h2>
      <p className="screen-sub">
        Destino: a própria unidade ativa (sempre a que hospeda o carrinho, não é uma escolha — inclusive a CAF, que
        também tem carrinhos próprios). Diferente da reposição, que já sai recebida no destino, a devolução fica
        pendente até alguém confirmar. Adicione um ou mais lotes à lista antes de enviar.
      </p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      <div className="grid">
        <div className="field span2">
          <label htmlFor="busca-lote-devolucao">Lote (em um carrinho da unidade ativa)</label>
          <BuscaAutocomplete
            id="busca-lote-devolucao"
            itens={lotesCarrinho.filter((l) => !itensLista.some((i) => i.lote.id === l.id))}
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
            placeholder="buscar por medicamento ou nº do lote — carrinhos da unidade ativa"
          />
        </div>
        <div className="field">
          <label htmlFor="qtd-devolver">Quantidade a devolver</label>
          <input
            id="qtd-devolver"
            type="number"
            min={1}
            max={loteSelecionado?.quantidade_atual}
            placeholder={loteSelecionado ? `≤ ${loteSelecionado.quantidade_atual}` : '0'}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn ghost" onClick={adicionarNaLista}>
          + Adicionar à lista
        </button>
      </div>

      {itensLista.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th className="num">Qtd.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itensLista.map((i) => (
                <tr key={i.lote.id}>
                  <td>
                    {i.lote.medicamento.nome} · {i.lote.numero_lote}
                  </td>
                  <td className="num">{i.quantidade}</td>
                  <td>
                    <button type="button" className="btn ghost sm" onClick={() => removerDaLista(i.lote.id)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn" disabled={enviando || itensLista.length === 0} onClick={enviarLista}>
          {enviando ? 'Enviando…' : `Devolver ${itensLista.length > 0 ? `(${itensLista.length})` : ''}`}
        </button>
      </div>
      <div className="note">Precisa de confirmação da unidade depois de enviada — não sai já recebida como a reposição.</div>
    </div>
  );
}
