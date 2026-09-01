import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import type { SolicitacaoRessuprimentoCarrinhoOut } from '../types';

/** Notificação de uso de carrinho de emergência registrado pelo painel
 * público (2026-08-31, pedido do cliente: "chegaria para a farmácia com
 * uma cor em gradiente, em pop-up"). Liberada a qualquer perfil da
 * unidade responsável — inclusive Atendente, é quem vai fisicamente
 * confirmar (por isso não usa `useAlertasEstoque`, que é filtrado por
 * `notificacaoEstoqueCritico`/financeiro). Só informa; a confirmação em
 * si acontece na aba "Solicitações de Ressuprimento" de Carrinhos de
 * Emergência. */
export function NotificacaoRessuprimentoCarrinhoPopup() {
  const { usuario, token } = useAuth();
  const [pendentes, setPendentes] = useState<SolicitacaoRessuprimentoCarrinhoOut[]>([]);
  const [aberto, setAberto] = useState(false);
  const [assinaturaVista, setAssinaturaVista] = useState<string | null>(null);

  useEffect(() => {
    if (!token || usuario?.unidade_ativa_id == null) return;
    let cancelado = false;
    api
      .get<SolicitacaoRessuprimentoCarrinhoOut[]>('/ressuprimento-carrinho/pendentes', { token })
      .then((lista) => {
        if (cancelado) return;
        setPendentes(lista);
        const assinatura = JSON.stringify(lista.map((s) => s.id).sort());
        const chave = `estoque_farmacia_ressuprimento_carrinho_vistos_${usuario.id}`;
        const ultimaVista = localStorage.getItem(chave);
        if (lista.length > 0 && assinatura !== ultimaVista) {
          setAberto(true);
        }
        setAssinaturaVista(assinatura);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [token, usuario?.unidade_ativa_id, usuario?.id]);

  function fechar() {
    if (usuario && assinaturaVista) {
      localStorage.setItem(`estoque_farmacia_ressuprimento_carrinho_vistos_${usuario.id}`, assinaturaVista);
    }
    setAberto(false);
  }

  if (pendentes.length === 0 && !aberto) return null;

  return (
    <>
      <button
        type="button"
        className="sino-alertas sino-gradiente"
        aria-label={`Uso de carrinho registrado — ${pendentes.length} pendente(s)`}
        onClick={() => setAberto(true)}
      >
        🧰
        {pendentes.length > 0 && <span className="sino-badge">{pendentes.length}</span>}
      </button>

      {aberto && (
        <div className="modal-overlay" role="presentation" onClick={fechar}>
          <div
            className="modal-card modal-gradiente"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-notificacao-carrinho"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="titulo-notificacao-carrinho">Uso de carrinho de emergência registrado</h2>
              <button type="button" className="modal-close" aria-label="Fechar" onClick={fechar}>
                ×
              </button>
            </div>

            {pendentes.length === 0 ? (
              <p className="vazio-tabela">Nenhuma solicitação pendente no momento.</p>
            ) : (
              <ul>
                {pendentes.map((s) => (
                  <li key={s.id} style={{ marginBottom: 10 }}>
                    <b>{s.setor}</b> usou <b>{s.carrinho_nome}</b> — {formatarDataHora(s.data_hora)}
                    <br />
                    {s.itens.map((i) => `${i.medicamento_nome} (${i.quantidade_usada})`).join(', ')}
                    <br />
                    <span className="pill pend">saída {s.status_saida === 'confirmada' ? 'confirmada' : 'pendente'}</span>{' '}
                    <span className="pill pend">
                      reposição {s.status_transferencia === 'confirmada' ? 'confirmada' : 'pendente'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="actions">
              <Link to="/reposicao-carrinho" className="btn" onClick={fechar}>
                Ir para Carrinhos de Emergência
              </Link>
              <button type="button" className="btn ghost" onClick={fechar}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
