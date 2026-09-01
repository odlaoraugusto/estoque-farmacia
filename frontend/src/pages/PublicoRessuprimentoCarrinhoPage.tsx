import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { SETORES_DISPENSACAO } from '../lib/setores';
import type { CarrinhoPublicoOut, EstoqueCarrinhoPublicoItem, UnidadePublicaOut } from '../types';

interface ItemCarrinhoUso {
  medicamento_id: number;
  medicamento_nome: string;
  e_controlado: boolean;
  quantidade: string;
}

/** Formulário público (sem login) — registrado pelo próprio setor quando
 * usa um carrinho de emergência/maleta/kit (2026-08-31, pedido do
 * cliente). Dispara notificação em pop-up pra farmácia escolhida, que
 * confirma a saída direta do carrinho e a transferência de reposição —
 * ver a aba "Solicitações de Ressuprimento" na tela Carrinhos de
 * Emergência (autenticado). */
export function PublicoRessuprimentoCarrinhoPage() {
  const [carrinhos, setCarrinhos] = useState<CarrinhoPublicoOut[]>([]);
  const [unidades, setUnidades] = useState<UnidadePublicaOut[]>([]);

  const [setor, setSetor] = useState('');
  const [carrinhoId, setCarrinhoId] = useState('');
  const [unidadeDestinoId, setUnidadeDestinoId] = useState('');

  const [estoqueCarrinho, setEstoqueCarrinho] = useState<EstoqueCarrinhoPublicoItem[]>([]);
  const [medicamentoId, setMedicamentoId] = useState('');
  const [quantidadeUsada, setQuantidadeUsada] = useState('');
  const [itens, setItens] = useState<ItemCarrinhoUso[]>([]);

  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteProntuario, setPacienteProntuario] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    api.get<CarrinhoPublicoOut[]>('/ressuprimento-carrinho/publico/carrinhos').then(setCarrinhos).catch(() => {});
    api.get<UnidadePublicaOut[]>('/ressuprimento-carrinho/publico/unidades').then(setUnidades).catch(() => {});
  }, []);

  useEffect(() => {
    setEstoqueCarrinho([]);
    setItens([]);
    setMedicamentoId('');
    setQuantidadeUsada('');
    if (!carrinhoId) return;
    api
      .get<EstoqueCarrinhoPublicoItem[]>(`/ressuprimento-carrinho/publico/carrinhos/${carrinhoId}/estoque`)
      .then(setEstoqueCarrinho)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar o estoque deste carrinho.')));
  }, [carrinhoId]);

  const precisaPaciente = itens.some((i) => i.e_controlado);
  const opcoesMedicamento = estoqueCarrinho.filter((m) => !itens.some((i) => i.medicamento_id === m.medicamento_id));

  function adicionarItem() {
    setErro(null);
    const medicamento = estoqueCarrinho.find((m) => String(m.medicamento_id) === medicamentoId);
    if (!medicamento) {
      setErro('Selecione um medicamento.');
      return;
    }
    const quantidade = Number(quantidadeUsada);
    if (!quantidade || quantidade <= 0) {
      setErro('Informe a quantidade usada.');
      return;
    }
    if (quantidade > medicamento.quantidade_atual) {
      setErro(`Quantidade maior que o saldo do carrinho para ${medicamento.medicamento_nome} (saldo: ${medicamento.quantidade_atual}).`);
      return;
    }
    setItens((atual) => [
      ...atual,
      {
        medicamento_id: medicamento.medicamento_id,
        medicamento_nome: medicamento.medicamento_nome,
        e_controlado: medicamento.e_controlado,
        quantidade: quantidadeUsada,
      },
    ]);
    setMedicamentoId('');
    setQuantidadeUsada('');
  }

  function removerItem(medicamentoId: number) {
    setItens((atual) => atual.filter((i) => i.medicamento_id !== medicamentoId));
  }

  function limparTudo() {
    setSetor('');
    setCarrinhoId('');
    setUnidadeDestinoId('');
    setItens([]);
    setPacienteNome('');
    setPacienteProntuario('');
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (!setor) {
      setErro('Selecione o setor.');
      return;
    }
    if (!carrinhoId) {
      setErro('Selecione o carrinho utilizado.');
      return;
    }
    if (itens.length === 0) {
      setErro('Adicione ao menos um medicamento usado.');
      return;
    }
    if (!unidadeDestinoId) {
      setErro('Selecione para qual farmácia pedir o ressuprimento.');
      return;
    }
    if (precisaPaciente && (!pacienteNome.trim() || !pacienteProntuario.trim())) {
      setErro('Há medicamento controlado na lista — nome completo e prontuário do paciente são obrigatórios.');
      return;
    }

    setEnviando(true);
    try {
      await api.post('/ressuprimento-carrinho/publico', {
        setor,
        carrinho_id: Number(carrinhoId),
        unidade_destino_id: Number(unidadeDestinoId),
        itens: itens.map((i) => ({ medicamento_id: i.medicamento_id, quantidade_usada: Number(i.quantidade) })),
        ...(precisaPaciente ? { paciente_nome: pacienteNome.trim(), paciente_prontuario: pacienteProntuario.trim() } : {}),
      });
      setSucesso('Registrado — a farmácia foi notificada.');
      limparTudo();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar o uso do carrinho.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="shell shell-publico">
      <div className="topbar">
        <div className="fesf-id">
          <span className="fesf-app">Uso de carrinho de emergência</span>
        </div>
      </div>
      <main className="content" style={{ maxWidth: 720, margin: '0 auto' }}>
        <section>
          <div className="screen-head">
            <h1>Registrar uso de carrinho / maleta / kit</h1>
          </div>
          <p className="screen-sub">
            Preencha sempre que usar um carrinho de emergência, maleta ou kit — a farmácia responsável será
            notificada para repor e, se for o caso, dar baixa formal do que foi usado. Não precisa de login.
          </p>
          <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
            <Link to="/publico/devolucao-medicamento" className="btn ghost sm">
              Ir para Devolução de Medicamento
            </Link>
          </div>

          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

          <form className="panel" onSubmit={aoSubmeter}>
            <div className="grid">
              <div className="field">
                <label htmlFor="setor-uso">
                  Setor <span className="req">*</span>
                </label>
                <select id="setor-uso" value={setor} onChange={(e) => setSetor(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {SETORES_DISPENSACAO.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="carrinho-uso">
                  Carrinho / maleta / kit utilizado <span className="req">*</span>
                </label>
                <select id="carrinho-uso" value={carrinhoId} onChange={(e) => setCarrinhoId(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {carrinhos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {carrinhoId && (
              <>
                <div className="grid" style={{ marginTop: 8 }}>
                  <div className="field span2">
                    <label htmlFor="medicamento-uso">Medicamento usado</label>
                    <select id="medicamento-uso" value={medicamentoId} onChange={(e) => setMedicamentoId(e.target.value)}>
                      <option value="">Selecione…</option>
                      {opcoesMedicamento.map((m) => (
                        <option key={m.medicamento_id} value={m.medicamento_id}>
                          {m.medicamento_nome} (saldo no carrinho: {m.quantidade_atual})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="qtd-uso">Quantidade usada</label>
                    <input
                      id="qtd-uso"
                      type="number"
                      min={1}
                      value={quantidadeUsada}
                      onChange={(e) => setQuantidadeUsada(e.target.value)}
                    />
                  </div>
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button type="button" className="btn ghost" onClick={adicionarItem}>
                    + Adicionar medicamento
                  </button>
                </div>

                {itens.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Medicamento</th>
                          <th className="num">Qtd. usada</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((i) => (
                          <tr key={i.medicamento_id}>
                            <td>
                              {i.medicamento_nome}
                              {i.e_controlado && <span className="tag" style={{ marginLeft: 6 }}>controlado</span>}
                            </td>
                            <td className="num">{i.quantidade}</td>
                            <td>
                              <button type="button" className="btn ghost sm" onClick={() => removerItem(i.medicamento_id)}>
                                Remover
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <div className="grid" style={{ marginTop: 16 }}>
              <div className="field span2">
                <label htmlFor="unidade-destino-uso">
                  Pedir ressuprimento a <span className="req">*</span>
                </label>
                <select
                  id="unidade-destino-uso"
                  value={unidadeDestinoId}
                  onChange={(e) => setUnidadeDestinoId(e.target.value)}
                  required
                >
                  <option value="">Selecione a farmácia…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {precisaPaciente && (
              <div className="box" style={{ background: 'var(--danger-bg)', color: 'var(--ink)', borderColor: 'var(--danger)', marginTop: 16 }}>
                <span>Há medicamento controlado nesta lista — paciente e prontuário são obrigatórios.</span>
              </div>
            )}
            {precisaPaciente && (
              <div className="grid" style={{ marginTop: 8 }}>
                <div className="field">
                  <label htmlFor="prontuario-uso">
                    Prontuário<span className="req"> *</span>
                  </label>
                  <input
                    id="prontuario-uso"
                    type="text"
                    value={pacienteProntuario}
                    onChange={(e) => setPacienteProntuario(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="paciente-uso">
                    Nome completo do paciente<span className="req"> *</span>
                  </label>
                  <input
                    id="paciente-uso"
                    type="text"
                    value={pacienteNome}
                    onChange={(e) => setPacienteNome(e.target.value)}
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </div>
            )}

            <div className="actions">
              <button type="submit" className="btn" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Registrar uso'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
