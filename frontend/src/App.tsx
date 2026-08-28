import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RotaProtegida } from './components/RotaProtegida';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { EstoquePage } from './pages/EstoquePage';
import { EntradaPage } from './pages/EntradaPage';
import { TransferenciaPage } from './pages/TransferenciaPage';
import { SaidaPage } from './pages/SaidaPage';
import { EmprestimoDoacaoPage } from './pages/EmprestimoDoacaoPage';
import { RelatoriosPage } from './pages/RelatoriosPage';
import { MedicamentosPage } from './pages/MedicamentosPage';
import { ReposicaoCarrinhoPage } from './pages/ReposicaoCarrinhoPage';
import { AjustePage } from './pages/AjustePage';
import { UsuariosPage } from './pages/UsuariosPage';

/** Admin global (2026-08-27) não tem Estoque atual — sua home é Usuários,
 * única tela que esse perfil usa. */
function Inicio() {
  const { usuario } = useAuth();
  if (usuario?.perfil === 'admin') return <Navigate to="/usuarios" replace />;
  return <EstoquePage />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RotaProtegida />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Inicio />} />
              <Route path="/entrada" element={<EntradaPage />} />
              <Route path="/transferencia" element={<TransferenciaPage />} />
              <Route path="/saida" element={<SaidaPage />} />
              <Route path="/saida-externa" element={<EmprestimoDoacaoPage />} />
              <Route path="/reposicao-carrinho" element={<ReposicaoCarrinhoPage />} />
              <Route path="/ajuste" element={<AjustePage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/medicamentos" element={<MedicamentosPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
