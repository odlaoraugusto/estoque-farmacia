import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Guarda de rota: exige token válido + unidade ativa selecionada antes
 * de renderizar a casca (Layout) e as telas internas. */
export function RotaProtegida() {
  const { carregandoSessao, token, precisaSelecionarUnidade } = useAuth();

  if (carregandoSessao) {
    return <p className="carregando" style={{ padding: 24 }}>Carregando sessão…</p>;
  }

  if (!token || precisaSelecionarUnidade) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
