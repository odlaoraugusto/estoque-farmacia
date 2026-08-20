import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { permissoesDe } from '../lib/permissoes';
import { Alerta } from '../components/Alerta';
import { labelPerfil } from '../lib/formato';
import type { Perfil, UsuarioOut } from '../types';

const PERFIS: Perfil[] = ['atendente', 'farmaceutico', 'coordenador'];

const FORM_VAZIO = {
  nome: '',
  login: '',
  senha: '',
  perfil: 'atendente' as Perfil,
  crf: '',
};

function exigeCrf(perfil: Perfil): boolean {
  return perfil === 'farmaceutico' || perfil === 'coordenador';
}

/** Gestão de usuários — exclusiva do Coordenador (2026-08-20). Antes só
 * existia via script de linha de comando na instalação; esta tela cobre
 * o dia a dia depois do sistema no ar (cadastrar, promover/rebaixar
 * perfil, desativar, resetar senha). Não existe DELETE — "excluir" um
 * usuário é marcá-lo inativo (preserva a autoria de movimentações
 * históricas que referenciam esse usuário). `login` não é editável
 * depois de criado. */
export function UsuariosPage() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);

  if (!permissoes.gestaoUsuarios) {
    return (
      <section>
        <div className="screen-head">
          <h1>Usuários</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Gestão de usuários é exclusiva do Coordenador.
        </div>
      </section>
    );
  }

  return <GestaoUsuarios token={token} usuarioLogadoId={usuario?.id ?? null} />;
}

function GestaoUsuarios({ token, usuarioLogadoId }: { token: string | null; usuarioLogadoId: number | null }) {
  const [usuarios, setUsuarios] = useState<UsuarioOut[]>([]);
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
      .get<UsuarioOut[]>('/usuarios', { token, params: { apenas_ativos: !mostrarInativos } })
      .then(setUsuarios)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os usuários.')))
      .finally(() => setCarregando(false));
  }, [token, mostrarInativos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function iniciarEdicao(u: UsuarioOut) {
    setEditandoId(u.id);
    setForm({ nome: u.nome, login: u.login, senha: '', perfil: u.perfil, crf: u.crf ?? '' });
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
      if (editandoId == null) {
        await api.post(
          '/usuarios',
          { nome: form.nome, login: form.login, senha: form.senha, perfil: form.perfil, crf: form.crf || null },
          { token },
        );
        setSucesso('Usuário cadastrado.');
      } else {
        const corpo: Record<string, unknown> = {
          nome: form.nome,
          perfil: form.perfil,
          crf: form.crf || null,
        };
        if (form.senha.trim()) corpo.senha = form.senha;
        await api.put(`/usuarios/${editandoId}`, corpo, { token });
        setSucesso('Usuário atualizado.');
      }
      cancelarEdicao();
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar o usuário.'));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(u: UsuarioOut) {
    setErro(null);
    setSucesso(null);
    try {
      await api.put(`/usuarios/${u.id}`, { ativo: !u.ativo }, { token });
      setSucesso(u.ativo ? `${u.nome} desativado.` : `${u.nome} reativado.`);
      if (editandoId === u.id) cancelarEdicao();
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível alterar o status do usuário.'));
    }
  }

  const editandoEuMesmo = editandoId != null && editandoId === usuarioLogadoId;

  return (
    <section>
      <div className="screen-head">
        <h1>Usuários</h1>
        <span className="screen-tag">exclusivo Coordenador</span>
      </div>
      <p className="screen-sub">
        Cadastro de acesso ao sistema. Desativar um usuário não apaga o histórico de movimentações já registradas
        por ele. O login não pode ser alterado depois de criado.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <form className="panel" onSubmit={aoSubmeter}>
        <h2>{editandoId == null ? 'Novo usuário' : `Editando — ${form.nome}`}</h2>
        {editandoEuMesmo && (
          <div className="note" style={{ marginBottom: 14 }}>
            Você está editando a própria conta — não é possível desativar a si mesmo nem mudar o próprio perfil por
            aqui.
          </div>
        )}
        <div className="grid">
          <div className="field">
            <label htmlFor="usr-nome">
              Nome <span className="req">*</span>
            </label>
            <input
              id="usr-nome"
              type="text"
              placeholder="ex.: Maria da Silva"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="usr-login">
              Login {editandoId == null ? <span className="req">*</span> : <span className="tag">fixo</span>}
            </label>
            <input
              id="usr-login"
              type="text"
              placeholder="ex.: maria.silva"
              value={form.login}
              disabled={editandoId != null}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="usr-senha">
              {editandoId == null ? (
                <>
                  Senha <span className="req">*</span>
                </>
              ) : (
                <>
                  Nova senha <span className="tag">deixe em branco pra manter</span>
                </>
              )}
            </label>
            <input
              id="usr-senha"
              type="text"
              placeholder={editandoId == null ? 'senha temporária' : '••••••••'}
              value={form.senha}
              onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
              required={editandoId == null}
            />
          </div>
          <div className="field">
            <label htmlFor="usr-perfil">
              Perfil <span className="req">*</span>
            </label>
            <select
              id="usr-perfil"
              value={form.perfil}
              disabled={editandoEuMesmo}
              onChange={(e) => setForm((f) => ({ ...f, perfil: e.target.value as Perfil }))}
            >
              {PERFIS.map((p) => (
                <option key={p} value={p}>
                  {labelPerfil(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="usr-crf">
              CRF{' '}
              {exigeCrf(form.perfil) ? <span className="req">*</span> : <span className="tag">não aplicável</span>}
            </label>
            <input
              id="usr-crf"
              type="text"
              placeholder="ex.: 12345-SP"
              value={form.crf}
              disabled={!exigeCrf(form.perfil)}
              onChange={(e) => setForm((f) => ({ ...f, crf: e.target.value }))}
              required={exigeCrf(form.perfil)}
            />
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
          <span>Cadastrados</span>
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
                  <th>Login</th>
                  <th>Perfil</th>
                  <th>CRF</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={6} className="vazio-tabela">
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                )}
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.nome}
                      {u.id === usuarioLogadoId && <span className="pill muted" style={{ marginLeft: 8 }}>você</span>}
                    </td>
                    <td className="mono">{u.login}</td>
                    <td>{labelPerfil(u.perfil)}</td>
                    <td className="mono">{u.crf ?? '—'}</td>
                    <td>
                      <span className={`pill ${u.ativo ? 'ok' : 'muted'}`}>{u.ativo ? 'ativo' : 'inativo'}</span>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn ghost sm" onClick={() => iniciarEdicao(u)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`btn sm ${u.ativo ? 'danger' : 'ok'}`}
                        disabled={u.id === usuarioLogadoId}
                        title={u.id === usuarioLogadoId ? 'Você não pode desativar a própria conta' : undefined}
                        onClick={() => alternarAtivo(u)}
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
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
