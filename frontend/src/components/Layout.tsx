import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { permissoesDe } from '../lib/permissoes';
import { classeRailUnidade, labelPerfil } from '../lib/formato';
import { NotificacaoEstoquePopup } from './NotificacaoEstoquePopup';
import { NotificacaoRessuprimentoCarrinhoPopup } from './NotificacaoRessuprimentoCarrinhoPopup';
import { NotificacaoDevolucaoMedicamentoPopup } from './NotificacaoDevolucaoMedicamentoPopup';
import { NotificacaoSolicitacaoTransferenciaPopup } from './NotificacaoSolicitacaoTransferenciaPopup';

/** Casca da aplicação pós-login: barra institucional no topo +
 * sidebar de navegação + conteúdo da tela. Itens de menu sem permissão
 * somem da lista (não aparecem desabilitados) — pedido explícito do
 * cliente, replicado do protótipo aprovado. */
export function Layout() {
  const { config, usuario, matrizPermissoes, trocarUnidade, sair } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);

  const hospitalNome = config?.hospital_nome ?? 'Hospital Exemplo';
  const organizacao = config?.organizacao ?? 'Rede de Saúde Exemplo';

  return (
    <div className="shell">
      <div className="topbar">
        <div className="fesf-id">
          <span className="fesf-org">{organizacao}</span>
          <span className="fesf-hospital">{hospitalNome}</span>
        </div>
        <span className="fesf-div" />
        <span className="fesf-app">Estoque Farmácia — Farmácia Hospitalar</span>
        <NotificacaoEstoquePopup />
        <NotificacaoRessuprimentoCarrinhoPopup />
        <NotificacaoDevolucaoMedicamentoPopup />
        <NotificacaoSolicitacaoTransferenciaPopup />
      </div>

      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="mark">
              <svg className="ic">
                <use href="#i-capsule" />
              </svg>
            </div>
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
            {permissoes.telasOperacionais && (
              <div className="unit">
                <span>Unidade ativa</span>
                <b>{usuario?.unidade_ativa_nome ?? '—'}</b>
              </div>
            )}
            <div className="sair" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {permissoes.telasOperacionais && (
                <button type="button" className="btn ghost sm" onClick={trocarUnidade}>
                  <svg className="ic">
                    <use href="#i-swap" />
                  </svg>
                  Trocar unidade
                </button>
              )}
              <button type="button" className="btn ghost sm" onClick={sair}>
                <svg className="ic">
                  <use href="#i-logout" />
                </svg>
                Sair
              </button>
            </div>
          </div>

          <nav className="screens" aria-label="Telas do sistema">
            <div className="eyebrow">Telas</div>
            {permissoes.telasOperacionais && (
              <NavLink to="/" end className="nav-btn">
                <svg className="ic">
                  <use href="#i-layers" />
                </svg>
                <span className="lbl">Estoque atual</span>
              </NavLink>
            )}
            {(permissoes.entrada || permissoes.devolucaoMedicamento) && (
              <NavLink to="/entrada" className="nav-btn">
                <svg className="ic">
                  <use href="#i-in" />
                </svg>
                <span className="lbl">Entrada</span>
              </NavLink>
            )}
            {permissoes.medicamentos && (
              <NavLink to="/medicamentos" className="nav-btn">
                <svg className="ic">
                  <use href="#i-capsule" />
                </svg>
                <span className="lbl">Medicamentos</span>
              </NavLink>
            )}
            {permissoes.telasOperacionais && (
              <NavLink to="/transferencia" className="nav-btn">
                <svg className="ic">
                  <use href="#i-swap" />
                </svg>
                <span className="lbl">Transferência</span>
              </NavLink>
            )}
            {permissoes.telasOperacionais && (
              <NavLink to="/ressuprimento" className="nav-btn">
                <svg className="ic">
                  <use href="#i-refresh" />
                </svg>
                <span className="lbl">Ressuprimento</span>
              </NavLink>
            )}
            {permissoes.saida && (
              <NavLink to="/saida" className="nav-btn">
                <svg className="ic">
                  <use href="#i-out" />
                </svg>
                <span className="lbl">Saída / Dispensação</span>
              </NavLink>
            )}
            {permissoes.saidaExterna && (
              <NavLink to="/saida-externa" className="nav-btn">
                <svg className="ic">
                  <use href="#i-building" />
                </svg>
                <span className="lbl">Empréstimo / Doação</span>
              </NavLink>
            )}
            {permissoes.telasOperacionais && (
              <NavLink to="/reposicao-carrinho" className="nav-btn">
                <svg className="ic">
                  <use href="#i-package" />
                </svg>
                <span className="lbl">Carrinhos de Emergência</span>
              </NavLink>
            )}
            {permissoes.ajustarEstoque && (
              <NavLink to="/ajuste" className="nav-btn">
                <svg className="ic">
                  <use href="#i-check" />
                </svg>
                <span className="lbl">Ajuste de Estoque</span>
              </NavLink>
            )}
            {permissoes.telasOperacionais && (
              <NavLink to="/minhas-acoes" className="nav-btn">
                <svg className="ic">
                  <use href="#i-clipboard" />
                </svg>
                <span className="lbl">Minhas Ações</span>
              </NavLink>
            )}
            {permissoes.telasOperacionais && (
              <NavLink to="/relatorios" className="nav-btn">
                <svg className="ic">
                  <use href="#i-chart" />
                </svg>
                <span className="lbl">Relatórios</span>
              </NavLink>
            )}
            {permissoes.gestaoUsuarios && (
              <NavLink to="/usuarios" className="nav-btn">
                <svg className="ic">
                  <use href="#i-users" />
                </svg>
                <span className="lbl">Usuários</span>
              </NavLink>
            )}
            {permissoes.gerenciarPermissoes && (
              <NavLink to="/permissoes" className="nav-btn">
                <svg className="ic">
                  <use href="#i-shield" />
                </svg>
                <span className="lbl">Permissões</span>
              </NavLink>
            )}
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
