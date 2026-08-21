import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { labelPerfil } from '../lib/formato';
import type { UnidadeOut } from '../types';

/** Login + Seleção de Unidade — fluxo de 2 passos (docs/02_PROTOTIPO.html).
 * A unidade escolhida vira o filtro de tudo que a sessão pode ver e
 * movimentar; o backend embute isso num novo token assinado. */
export function LoginPage() {
  const { config, token, usuario, precisaSelecionarUnidade, precisaTrocarSenha, entrar, trocarSenha, selecionarUnidade } =
    useAuth();
  const navigate = useNavigate();

  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erroLogin, setErroLogin] = useState<string | null>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmarSenhaNova, setConfirmarSenhaNova] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [erroTrocarSenha, setErroTrocarSenha] = useState<string | null>(null);

  const [unidades, setUnidades] = useState<UnidadeOut[]>([]);
  const [carregandoUnidades, setCarregandoUnidades] = useState(false);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erroUnidade, setErroUnidade] = useState<string | null>(null);

  useEffect(() => {
    if (!precisaSelecionarUnidade || precisaTrocarSenha || !token) return;
    setCarregandoUnidades(true);
    api
      .get<UnidadeOut[]>('/unidades', { token, params: { tipo: 'unidade' } })
      .then(setUnidades)
      .catch((err) => setErroUnidade(mensagemErro(err, 'Não foi possível carregar as unidades.')))
      .finally(() => setCarregandoUnidades(false));
  }, [precisaSelecionarUnidade, precisaTrocarSenha, token]);

  if (token && usuario && !precisaSelecionarUnidade && !precisaTrocarSenha) {
    return <Navigate to="/" replace />;
  }

  async function aoSubmeterTrocarSenha(e: FormEvent) {
    e.preventDefault();
    setErroTrocarSenha(null);
    if (senhaNova !== confirmarSenhaNova) {
      setErroTrocarSenha('A confirmação não confere com a nova senha.');
      return;
    }
    if (senhaNova.length < 8) {
      setErroTrocarSenha('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setTrocandoSenha(true);
    try {
      await trocarSenha(senhaAtual, senhaNova);
      setSenhaAtual('');
      setSenhaNova('');
      setConfirmarSenhaNova('');
    } catch (err) {
      setErroTrocarSenha(mensagemErro(err, 'Não foi possível trocar a senha.'));
    } finally {
      setTrocandoSenha(false);
    }
  }

  async function aoSubmeterLogin(e: FormEvent) {
    e.preventDefault();
    setErroLogin(null);
    setEntrando(true);
    try {
      await entrar(login.trim(), senha);
    } catch (err) {
      setErroLogin(mensagemErro(err, 'Login ou senha inválidos.'));
    } finally {
      setEntrando(false);
    }
  }

  async function confirmarUnidade() {
    if (unidadeSelecionada == null) return;
    setErroUnidade(null);
    setConfirmando(true);
    try {
      await selecionarUnidade(unidadeSelecionada);
      navigate('/', { replace: true });
    } catch (err) {
      setErroUnidade(mensagemErro(err, 'Não foi possível selecionar a unidade.'));
    } finally {
      setConfirmando(false);
    }
  }

  const hospitalNome = config?.hospital_nome ?? 'Hospital Exemplo';
  const organizacao = config?.organizacao ?? 'Rede de Saúde Exemplo';

  return (
    <div className="login-wrap">
      <div className="topbar">
        <div className="fesf-id">
          <span className="fesf-org">{organizacao}</span>
          <span className="fesf-hospital">{hospitalNome}</span>
        </div>
        <span className="fesf-div" />
        <span className="fesf-app">Estoque Farmácia — Farmácia Hospitalar</span>
      </div>

      <div className="login-main">
        <div className="login-panels">
          <div className="screen-head">
            <h1>{precisaTrocarSenha ? 'Trocar senha' : precisaSelecionarUnidade ? 'Selecionar unidade' : 'Login'}</h1>
            <span className="screen-tag">
              {precisaTrocarSenha ? 'obrigatório no primeiro acesso' : precisaSelecionarUnidade ? 'passo 2 de 2' : 'passo 1 de 2'}
            </span>
          </div>
          <p className="screen-sub">
            {precisaTrocarSenha
              ? 'Sua senha ainda é a padrão temporária — cadastre uma nova antes de continuar.'
              : 'A unidade escolhida vira o filtro de tudo que a sessão pode ver e movimentar.'}
          </p>

          {precisaTrocarSenha && (
            <form className="panel" onSubmit={aoSubmeterTrocarSenha}>
              <h2>Nova senha</h2>
              {erroTrocarSenha && <Alerta tipo="erro">{erroTrocarSenha}</Alerta>}
              <div className="field">
                <label htmlFor="senha-atual">
                  Senha atual <span className="req">*</span>
                </label>
                <input
                  id="senha-atual"
                  type="password"
                  placeholder="senha padrão ou a que foi resetada"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="senha-nova">
                  Nova senha <span className="req">*</span>
                </label>
                <input
                  id="senha-nova"
                  type="password"
                  placeholder="mínimo 8 caracteres"
                  value={senhaNova}
                  onChange={(e) => setSenhaNova(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="confirmar-senha-nova">
                  Confirmar nova senha <span className="req">*</span>
                </label>
                <input
                  id="confirmar-senha-nova"
                  type="password"
                  placeholder="repita a nova senha"
                  value={confirmarSenhaNova}
                  onChange={(e) => setConfirmarSenhaNova(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="actions">
                <button type="submit" className="btn" disabled={trocandoSenha}>
                  {trocandoSenha ? 'Salvando…' : 'Trocar senha e continuar'}
                </button>
              </div>
            </form>
          )}

          {!precisaSelecionarUnidade && !precisaTrocarSenha && (
            <form className="panel" onSubmit={aoSubmeterLogin}>
              <h2>Acesso</h2>
              {erroLogin && <Alerta tipo="erro">{erroLogin}</Alerta>}
              <div className="field">
                <label htmlFor="login">
                  Login <span className="req">*</span>
                </label>
                <input
                  id="login"
                  type="text"
                  placeholder="usuario.nome"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="senha">
                  Senha <span className="req">*</span>
                </label>
                <input
                  id="senha"
                  type="password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="actions">
                <button type="submit" className="btn" disabled={entrando}>
                  {entrando ? 'Entrando…' : 'Entrar'}
                </button>
              </div>
            </form>
          )}

          {precisaSelecionarUnidade && !precisaTrocarSenha && (
            <div className="panel">
              <h2>Selecionar unidade</h2>
              {usuario && (
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Usuário reconhecido</label>
                  <div className="box">
                    {usuario.nome} — {labelPerfil(usuario.perfil)}
                    {usuario.crf ? ` · CRF ${usuario.crf}` : ''}
                  </div>
                </div>
              )}
              {erroUnidade && <Alerta tipo="erro">{erroUnidade}</Alerta>}
              {carregandoUnidades && <p className="carregando">Carregando unidades…</p>}
              {!carregandoUnidades && (
                <div className="unidade-grid">
                  {unidades.map((unidade) => (
                    <button
                      key={unidade.id}
                      type="button"
                      className="unidade-btn"
                      aria-pressed={unidadeSelecionada === unidade.id}
                      onClick={() => setUnidadeSelecionada(unidade.id)}
                    >
                      {unidade.nome}
                    </button>
                  ))}
                </div>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  disabled={unidadeSelecionada == null || confirmando}
                  onClick={confirmarUnidade}
                >
                  {confirmando ? 'Confirmando…' : 'Confirmar e entrar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
