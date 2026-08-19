import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { permissoesDe } from '../lib/permissoes';
import { classeRailUnidade, labelPerfil } from '../lib/formato';
import { NotificacaoEstoquePopup } from './NotificacaoEstoquePopup';

/** Casca da aplicação pós-login: barra institucional FESFSUS no topo +
 * sidebar de navegação + conteúdo da tela. Itens de menu sem permissão
 * somem da lista (não aparecem desabilitados) — pedido explícito do
 * cliente, replicado do protótipo aprovado. */
export function Layout() {
  const { config, usuario, trocarUnidade, sair } = useAuth();
  const permissoes = permissoesDe(usuario);

  const hospitalNome = config?.hospital_nome ?? 'Hospital Materno Infantil Dr. Joaquim Sampaio';
  const organizacao = config?.organizacao ?? 'Fundação Estatal Saúde da Família';

  return (
    <div className="shell">
      <NotificacaoEstoquePopup />
      <div className="topbar">
        <div className="fesf-id">
          <span className="fesf-org">{organizacao}</span>
          <span className="fesf-hospital">{hospitalNome}</span>
        </div>
        <span className="fesf-div" />
        <span className="fesf-app">Estoque Farmácia — Farmácia Hospitalar</span>
      </div>

      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="mark">Rx</div>
            <div className="name">
              Estoque Farmácia
              <small>rede local</small>
            </div>
          </div>

          <div className={`session-card ${classeRailUnidade(usuario?.unidade_ativa_nome)}`}>
            <div className="who">{usuario?.nome}</div>
            <div className="role">
              {usuario ? labelPerfil(usuario.perfil) : ''}
              {usuario?.crf ? ` · CRF ${usuario.crf}` : ''}
            </div>
            <div className="unit">
              <span>Unidade ativa</span>
              <b>{usuario?.unidade_ativa_nome ?? '—'}</b>
            </div>
            <div className="sair" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <button type="button" className="link-btn" onClick={trocarUnidade}>
                Trocar unidade
              </button>
              <button type="button" className="link-btn" onClick={sair}>
                Sair
              </button>
            </div>
          </div>

          <nav className="screens" aria-label="Telas do sistema">
            <div className="eyebrow">Telas</div>
            <NavLink to="/" end className="nav-btn">
              <span className="ic">▤</span>
              <span className="lbl">Estoque atual</span>
            </NavLink>
            {permissoes.entrada && (
              <NavLink to="/entrada" className="nav-btn">
                <span className="ic">↓</span>
                <span className="lbl">Entrada</span>
              </NavLink>
            )}
            {permissoes.medicamentos && (
              <NavLink to="/medicamentos" className="nav-btn">
                <span className="ic">℞</span>
                <span className="lbl">Medicamentos</span>
              </NavLink>
            )}
            <NavLink to="/transferencia" className="nav-btn">
              <span className="ic">⇄</span>
              <span className="lbl">Transferência</span>
            </NavLink>
            {permissoes.saida && (
              <NavLink to="/saida" className="nav-btn">
                <span className="ic">↑</span>
                <span className="lbl">Saída / Dispensação</span>
              </NavLink>
            )}
            {permissoes.reporCarrinho && (
              <NavLink to="/reposicao-carrinho" className="nav-btn">
                <span className="ic">↻</span>
                <span className="lbl">Reposição de Carrinhos</span>
              </NavLink>
            )}
            {permissoes.descarte && (
              <NavLink to="/descarte" className="nav-btn">
                <span className="ic">✕</span>
                <span className="lbl">Descarte</span>
              </NavLink>
            )}
            {permissoes.ajustarEstoque && (
              <NavLink to="/ajuste" className="nav-btn">
                <span className="ic">⚖</span>
                <span className="lbl">Ajuste de Estoque</span>
              </NavLink>
            )}
            <NavLink to="/relatorios" className="nav-btn">
              <span className="ic">▦</span>
              <span className="lbl">Relatórios</span>
            </NavLink>
          </nav>

          <div className="sidebar-foot">
            Servidor local · sem internet
            <br />
            {usuario?.login}
          </div>
        </aside>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
