import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { SETORES_DISPENSACAO } from '../lib/setores';
import type { MedicamentoDevolucaoPublicoOut, UnidadePublicaOut } from '../types';

interface ItemDevolucao {
  medicamento_id: number;
  medicamento_nome: string;
  e_controlado: boolean;
  e_antimicrobiano: boolean;
  quantidade: string;
}

/** Formulário público (sem login) — registrado pelo próprio setor ao
 * devolver medicamento físico não usado à farmácia/unidade satélite
 * (2026-09-01, pedido do cliente). Diferente do uso de carrinho de
 * emergência (`PublicoRessuprimentoCarrinhoPage`), aqui QUALQUER
 * unidade real pode ser escolhida como destino — a devolução não é
 * exclusiva da CAF. A unidade escolhida confirma dando entrada de um
 * lote novo (lote/validade digitados na hora) na aba "Devoluções
 * pendentes" de Entrada de Estoque (autenticado). */
export function PublicoDevolucaoMedicamentoPage() {
  const [unidades, setUnidades] = useState<UnidadePublicaOut[]>([]);
  const [medicamentos, setMedicamentos] = useState<MedicamentoDevolucaoPublicoOut[]>([]);

  const [setor, setSetor] = useState('');
  const [unidadeDestinoId, setUnidadeDestinoId] = useState('');

  const [medicamentoId, setMedicamentoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [itens, setItens] = useState<ItemDevolucao[]>([]);

  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteProntuario, setPacienteProntuario] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    api.get<UnidadePublicaOut[]>('/devolucao-medicamento/publico/unidades').then(setUnidades).catch(() => {});
    api
      .get<MedicamentoDevolucaoPublicoOut[]>('/devolucao-medicamento/publico/medicamentos')
      .then(setMedicamentos)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar a lista de medicamentos.')));
  }, []);

  const precisaPaciente = itens.some((i) => i.e_controlado || i.e_antimicrobiano);
  const opcoesMedicamento = medicamentos.filter((m) => !itens.some((i) => i.medicamento_id === m.id));

  function adicionarItem() {
    setErro(null);
    const medicamento = medicamentos.find((m) => String(m.id) === medicamentoId);
    if (!medicamento) {
      setErro('Selecione um medicamento.');
      return;
    }
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) {
      setErro('Informe a quantidade devolvida.');
      return;
    }
    setItens((atual) => [
      ...atual,
      {
        medicamento_id: medicamento.id,
        medicamento_nome: medicamento.nome,
        e_controlado: medicamento.e_controlado,
        e_antimicrobiano: medicamento.e_antimicrobiano,
        quantidade,
      },
    ]);
    setMedicamentoId('');
    setQuantidade('');
  }

  function removerItem(medicamentoId: number) {
    setItens((atual) => atual.filter((i) => i.medicamento_id !== medicamentoId));
  }

  function limparTudo() {
    setSetor('');
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
    if (!unidadeDestinoId) {
      setErro('Selecione para qual unidade/farmácia devolver.');
      return;
    }
    if (itens.length === 0) {
      setErro('Adicione ao menos um medicamento devolvido.');
      return;
    }
    if (precisaPaciente && (!pacienteNome.trim() || !pacienteProntuario.trim())) {
      setErro('Há medicamento controlado ou antimicrobiano na lista — nome completo e prontuário do paciente são obrigatórios.');
      return;
    }

    setEnviando(true);
    try {
      await api.post('/devolucao-medicamento/publico', {
        setor,
        unidade_destino_id: Number(unidadeDestinoId),
        itens: itens.map((i) => ({ medicamento_id: i.medicamento_id, quantidade: Number(i.quantidade) })),
        ...(pacienteNome.trim() ? { paciente_nome: pacienteNome.trim() } : {}),
        ...(pacienteProntuario.trim() ? { paciente_prontuario: pacienteProntuario.trim() } : {}),
      });
      setSucesso('Registrado — a unidade escolhida foi notificada.');
      limparTudo();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar a devolução.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="shell shell-publico">
      <div className="topbar">
        <div className="fesf-id">
          <span className="fesf-app">Devolução de medicamento</span>
        </div>
      </div>
      <main className="content" style={{ maxWidth: 720, margin: '0 auto' }}>
        <section>
          <div className="screen-head">
            <h1>Registrar devolução de medicamento</h1>
          </div>
          <p className="screen-sub">
            Preencha sempre que devolver medicamento não usado à farmácia/unidade satélite — a unidade escolhida será
            notificada para conferir e dar entrada no estoque. Não precisa de login.
          </p>
          <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
            <Link to="/publico/ressuprimento-carrinho" className="btn ghost sm">
              Ir para Reposição de Carrinho
            </Link>
          </div>

          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

          <form className="panel" onSubmit={aoSubmeter}>
            <div className="grid">
              <div className="field">
                <label htmlFor="setor-devolucao">
                  Setor <span className="req">*</span>
                </label>
                <select id="setor-devolucao" value={setor} onChange={(e) => setSetor(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {SETORES_DISPENSACAO.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="unidade-destino-devolucao">
                  Devolver para <span className="req">*</span>
                </label>
                <select
                  id="unidade-destino-devolucao"
                  value={unidadeDestinoId}
                  onChange={(e) => setUnidadeDestinoId(e.target.value)}
                  required
                >
                  <option value="">Selecione a unidade/farmácia…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid" style={{ marginTop: 8 }}>
              <div className="field span2">
                <label htmlFor="medicamento-devolucao">Medicamento devolvido</label>
                <select id="medicamento-devolucao" value={medicamentoId} onChange={(e) => setMedicamentoId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {opcoesMedicamento.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="qtd-devolucao">Quantidade</label>
                <input
                  id="qtd-devolucao"
                  type="number"
                  min={1}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
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
                      <th className="num">Qtd. devolvida</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.medicamento_id}>
                        <td>
                          {i.medicamento_nome}
                          {(i.e_controlado || i.e_antimicrobiano) && (
                            <span className="tag" style={{ marginLeft: 6 }}>controlado</span>
                          )}
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

            {precisaPaciente && (
              <div className="box" style={{ background: 'var(--danger-bg)', color: 'var(--ink)', borderColor: 'var(--danger)', marginTop: 16 }}>
                <span>Há medicamento controlado ou antimicrobiano nesta lista — paciente e prontuário são obrigatórios.</span>
              </div>
            )}
            <div className="grid" style={{ marginTop: 8 }}>
              <div className="field">
                <label htmlFor="prontuario-devolucao">
                  Prontuário{precisaPaciente && <span className="req"> *</span>}
                </label>
                <input
                  id="prontuario-devolucao"
                  type="text"
                  value={pacienteProntuario}
                  onChange={(e) => setPacienteProntuario(e.target.value)}
                  required={precisaPaciente}
                />
              </div>
              <div className="field">
                <label htmlFor="paciente-devolucao">
                  Nome completo do paciente{precisaPaciente && <span className="req"> *</span>}
                </label>
                <input
                  id="paciente-devolucao"
                  type="text"
                  value={pacienteNome}
                  onChange={(e) => setPacienteNome(e.target.value)}
                  required={precisaPaciente}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>

            <div className="actions">
              <button type="submit" className="btn" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Registrar devolução'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
