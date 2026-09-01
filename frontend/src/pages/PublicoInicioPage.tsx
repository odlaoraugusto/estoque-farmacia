import { Link } from 'react-router-dom';

/** Landing pública (sem login) em `/publico` — ponto único pra divulgar
 * (QR code genérico "Farmácia"), de onde o setor escolhe qual das duas
 * funções quer usar. As URLs específicas de cada formulário continuam
 * funcionando direto (2026-09-01, pedido do cliente: não quebrar QR
 * code/link já impresso apontando pra `/publico/ressuprimento-carrinho`). */
export function PublicoInicioPage() {
  return (
    <div className="shell">
      <div className="topbar">
        <div className="fesf-id">
          <span className="fesf-app">Farmácia</span>
        </div>
      </div>
      <main className="content" style={{ maxWidth: 720, margin: '0 auto' }}>
        <section>
          <div className="screen-head">
            <h1>O que você quer registrar?</h1>
          </div>
          <p className="screen-sub">Escolha uma opção abaixo. Nenhuma delas precisa de login.</p>

          <div className="grid" style={{ marginTop: 16 }}>
            <div className="field span2">
              <Link to="/publico/ressuprimento-carrinho" className="panel" style={{ display: 'block', textDecoration: 'none' }}>
                <h2 style={{ marginTop: 0 }}>Uso de carrinho de emergência</h2>
                <p className="screen-sub" style={{ marginBottom: 0 }}>
                  Registrar o que foi usado de um carrinho de emergência, maleta ou kit — a farmácia responsável repõe e
                  dá baixa formal.
                </p>
              </Link>
            </div>
            <div className="field span2">
              <Link to="/publico/devolucao-medicamento" className="panel" style={{ display: 'block', textDecoration: 'none' }}>
                <h2 style={{ marginTop: 0 }}>Devolução de medicamento</h2>
                <p className="screen-sub" style={{ marginBottom: 0 }}>
                  Devolver medicamento não usado à farmácia/unidade satélite — a unidade escolhida confere e dá entrada
                  no estoque.
                </p>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
