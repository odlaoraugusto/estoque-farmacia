import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { ConfigInstalacao, TokenResponse, UsuarioMe } from '../types';

const CHAVE_TOKEN = 'estoque_farmacia_token';

interface AuthContextValue {
  carregandoSessao: boolean;
  config: ConfigInstalacao | null;
  token: string | null;
  usuario: UsuarioMe | null;
  precisaSelecionarUnidade: boolean;
  precisaTrocarSenha: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  trocarSenha: (senhaAtual: string, senhaNova: string) => Promise<void>;
  selecionarUnidade: (unidadeId: number) => Promise<void>;
  trocarUnidade: () => void;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [config, setConfig] = useState<ConfigInstalacao | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(CHAVE_TOKEN));
  const [usuario, setUsuario] = useState<UsuarioMe | null>(null);
  // Força a tela de seleção de unidade mesmo com token já tendo uma
  // unidade ativa embutida (fluxo de "trocar unidade" pelo menu lateral).
  const [forcarSelecaoUnidade, setForcarSelecaoUnidade] = useState(false);

  useEffect(() => {
    // Endpoint público — usado para montar a barra institucional mesmo
    // antes do login.
    api
      .get<ConfigInstalacao>('/config')
      .then(setConfig)
      .catch(() => {
        setConfig({
          hospital_nome: 'Hospital Exemplo',
          organizacao: 'Rede de Saúde Exemplo',
        });
      });
  }, []);

  useEffect(() => {
    if (!token) {
      setCarregandoSessao(false);
      return;
    }
    api
      .get<UsuarioMe>('/auth/me', { token })
      .then((dados) => setUsuario(dados))
      .catch(() => {
        localStorage.removeItem(CHAVE_TOKEN);
        setToken(null);
        setUsuario(null);
      })
      .finally(() => setCarregandoSessao(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrar = useCallback(async (login: string, senha: string) => {
    const resposta = await api.post<TokenResponse>('/auth/login', { login, senha });
    localStorage.setItem(CHAVE_TOKEN, resposta.access_token);
    setToken(resposta.access_token);
    setUsuario(resposta.usuario);
    setForcarSelecaoUnidade(false);
  }, []);

  const trocarSenha = useCallback(
    async (senhaAtual: string, senhaNova: string) => {
      await api.post('/auth/trocar-senha', { senha_atual: senhaAtual, senha_nova: senhaNova }, { token });
      // Backend não reemite token (o flag não vive no JWT) — atualiza só
      // o estado local, que é o que a tela de login consulta pra decidir
      // se ainda precisa mostrar o passo de troca de senha.
      setUsuario((atual) => (atual ? { ...atual, deve_trocar_senha: false } : atual));
    },
    [token],
  );

  const selecionarUnidade = useCallback(
    async (unidadeId: number) => {
      const resposta = await api.post<TokenResponse>(
        '/auth/selecionar-unidade',
        { unidade_id: unidadeId },
        { token },
      );
      localStorage.setItem(CHAVE_TOKEN, resposta.access_token);
      setToken(resposta.access_token);
      setUsuario(resposta.usuario);
      setForcarSelecaoUnidade(false);
    },
    [token],
  );

  const trocarUnidade = useCallback(() => setForcarSelecaoUnidade(true), []);

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_TOKEN);
    setToken(null);
    setUsuario(null);
    setForcarSelecaoUnidade(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      carregandoSessao,
      config,
      token,
      usuario,
      precisaSelecionarUnidade: !!token && (usuario?.unidade_ativa_id == null || forcarSelecaoUnidade),
      precisaTrocarSenha: !!token && usuario?.deve_trocar_senha === true,
      entrar,
      trocarSenha,
      selecionarUnidade,
      trocarUnidade,
      sair,
    }),
    [
      carregandoSessao,
      config,
      token,
      usuario,
      forcarSelecaoUnidade,
      entrar,
      trocarSenha,
      selecionarUnidade,
      trocarUnidade,
      sair,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
