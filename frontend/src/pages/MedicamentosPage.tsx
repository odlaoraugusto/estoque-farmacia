import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { labelAcondicionamento } from '../lib/formato';
import type { Acondicionamento, MedicamentoOut } from '../types';

const FORM_VAZIO = {
  nome: '',
  apresentacao: '',
  concentracao: '',
  fabricante: '',
  acondicionamento: '' as Acondicionamento | '',
  estoqueMinimo: '',
  eAntimicrobiano: false,
  eControlado: false,
};

/** Cadastro de medicamentos — Farmacêutico cadastra sozinho, sem fluxo de
 * aprovação (diferente do Descarte); Coordenador também tem acesso
 * completo. Não existe DELETE — "excluir" um item do catálogo é
 * marcá-lo como inativo via PUT (preserva a FK de lotes históricos que
 * já referenciam esse medicamento). */
export function MedicamentosPage() {
  const { usuario, token, matrizPermissoes } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);

  if (!permissoes.medicamentos) {
    return (
      <section>
        <div className="screen-head">
          <h1>Medicamentos</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Seu perfil não tem acesso ao cadastro de medicamentos.
        </div>
      </section>
    );
  }

  return <GestaoMedicamentos token={token} />;
}

function GestaoMedicamentos({ token }: { token: string | null }) {
  const [medicamentos, setMedicamentos] = useState<MedicamentoOut[]>([]);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    if (!token) return;
    setCarregando(true);
    api
      .get<MedicamentoOut[]>('/medicamentos', { token, params: { apenas_ativos: !mostrarInativos } })
      .then(setMedicamentos)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os medicamentos.')))
      .finally(() => setCarregando(false));
  }, [token, mostrarInativos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function iniciarEdicao(m: MedicamentoOut) {
    setEditandoId(m.id);
    setForm({
      nome: m.nome,
      apresentacao: m.apresentacao,
      concentracao: m.concentracao ?? '',
      fabricante: m.fabricante ?? '',
      acondicionamento: m.acondicionamento ?? '',
      estoqueMinimo: String(m.estoque_minimo),
      eAntimicrobiano: m.e_antimicrobiano,
      eControlado: m.e_controlado,
    });
    setErro(null);
    setSucesso(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const corpo = {
        nome: form.nome,
        apresentacao: form.apresentacao.trim(),
        concentracao: form.concentracao.trim() || null,
        fabricante: form.fabricante.trim() || null,
        acondicionamento: form.acondicionamento || null,
        estoque_minimo: Number(form.estoqueMinimo || 0),
        e_antimicrobiano: form.eAntimicrobiano,
        e_controlado: form.eControlado,
      };
      if (editandoId == null) {
        await api.post('/medicamentos', corpo, { token });
        setSucesso('Medicamento cadastrado.');
      } else {
        await api.put(`/medicamentos/${editandoId}`, corpo, { token });
        setSucesso('Medicamento atualizado.');
      }
      cancelarEdicao();
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar o medicamento.'));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(m: MedicamentoOut) {
    setErro(null);
    setSucesso(null);
    try {
      await api.put(`/medicamentos/${m.id}`, { ativo: !m.ativo }, { token });
      setSucesso(m.ativo ? `${m.nome} desativado.` : `${m.nome} reativado.`);
      if (editandoId === m.id) cancelarEdicao();
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível alterar o status do medicamento.'));
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Medicamentos</h1>
        <span className="screen-tag">cadastro de medicamentos</span>
      </div>
      <p className="screen-sub">
        Cadastro base usado na busca da tela de Entrada. Desativar um item não apaga o histórico de lotes já
        registrados com ele.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>{editandoId == null ? 'Novo medicamento' : `Editando — ${form.nome}`}</h2>
        <div className="grid">
          <div className="field span2">
            <label htmlFor="med-nome">
              Nome <span className="req">*</span>
            </label>
            <input
              id="med-nome"
              type="text"
              placeholder="ex.: Dipirona 500mg/mL"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="med-apresentacao">
              Apresentação <span className="req">*</span>
            </label>
            <input
              id="med-apresentacao"
              type="text"
              placeholder="ex.: FA, comprimido, CP"
              value={form.apresentacao}
              onChange={(e) => setForm((f) => ({ ...f, apresentacao: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="med-concentracao">Concentração</label>
            <input
              id="med-concentracao"
              type="text"
              placeholder="ex.: 500mg/mL"
              value={form.concentracao}
              onChange={(e) => setForm((f) => ({ ...f, concentracao: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="med-fabricante">Fabricante</label>
            <input
              id="med-fabricante"
              type="text"
              placeholder="ex.: EMS"
              value={form.fabricante}
              onChange={(e) => setForm((f) => ({ ...f, fabricante: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="med-acondicionamento">Acondicionamento</label>
            <select
              id="med-acondicionamento"
              value={form.acondicionamento}
              onChange={(e) => setForm((f) => ({ ...f, acondicionamento: e.target.value as Acondicionamento | '' }))}
            >
              <option value="">— não informado —</option>
              <option value="ambiente">Ambiente</option>
              <option value="geladeira">Geladeira</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="med-estoque-minimo">Estoque crítico</label>
            <input
              id="med-estoque-minimo"
              type="number"
              min={0}
              placeholder="0"
              value={form.estoqueMinimo}
              onChange={(e) => setForm((f) => ({ ...f, estoqueMinimo: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="med-antimicrobiano" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="med-antimicrobiano"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.eAntimicrobiano}
                onChange={(e) => setForm((f) => ({ ...f, eAntimicrobiano: e.target.checked }))}
              />
              É antimicrobiano
            </label>
            <span className="screen-sub" style={{ margin: 0, fontSize: 12 }}>
              Exige paciente/prontuário na Saída — vigilância de uso prolongado (mais de 7 dias).
            </span>
          </div>
          <div className="field">
            <label htmlFor="med-controlado" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="med-controlado"
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.eControlado}
                onChange={(e) => setForm((f) => ({ ...f, eControlado: e.target.checked }))}
              />
              É controlado
            </label>
            <span className="screen-sub" style={{ margin: 0, fontSize: 12 }}>
              Exige paciente/prontuário na Saída — controle diário de dispensação.
            </span>
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? 'Salvando…' : editandoId == null ? 'Cadastrar' : 'Salvar alterações'}
          </button>
          {editandoId != null && (
            <button type="button" className="btn ghost" onClick={cancelarEdicao}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      <div className="panel">
        <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Catálogo</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, textTransform: 'none', fontSize: 12.5 }}>
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar inativos
          </label>
        </h2>
        {carregando && <p className="carregando">Carregando…</p>}
        {!carregando && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Apresentação</th>
                  <th>Concentração</th>
                  <th>Fabricante</th>
                  <th>Acondicionamento</th>
                  <th className="num">Estoque crítico</th>
                  <th>Antimicrobiano</th>
                  <th>Controlado</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {medicamentos.length === 0 && (
                  <tr>
                    <td colSpan={10} className="vazio-tabela">
                      Nenhum medicamento cadastrado.
                    </td>
                  </tr>
                )}
                {medicamentos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nome}</td>
                    <td>{m.apresentacao}</td>
                    <td className="mono">{m.concentracao ?? '—'}</td>
                    <td>{m.fabricante ?? '—'}</td>
                    <td>{m.acondicionamento ? labelAcondicionamento(m.acondicionamento) : '—'}</td>
                    <td className="num">{m.estoque_minimo}</td>
                    <td>
                      {m.e_antimicrobiano ? <span className="pill pend">sim</span> : <span className="pill muted">não</span>}
                    </td>
                    <td>
                      {m.e_controlado ? <span className="pill pend">sim</span> : <span className="pill muted">não</span>}
                    </td>
                    <td>
                      <span className={`pill ${m.ativo ? 'ok' : 'muted'}`}>{m.ativo ? 'ativo' : 'inativo'}</span>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn ghost sm" onClick={() => iniciarEdicao(m)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`btn sm ${m.ativo ? 'danger' : 'ok'}`}
                        onClick={() => alternarAtivo(m)}
                      >
                        {m.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
