import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import type { SolicitacaoOut } from '../types';

/** Notificação de solicitação de transferência pendente pra CAF
 * (2026-09-02, pedido do cliente) — achado do dia: farmacêutico só
 * enxergava a aba "Atender Solicitações" (ResuprimentoPage) quando por
 * acaso já estava logado com a CAF como unidade ativa; operando outra
 * unidade, a fila ficava invisível e sem aviso nenhum. Este sino usa
 * `GET /solicitacoes/pendentes-atender`, que devolve a fila real da CAF
 * INDEPENDENTE da unidade ativa da sessão — só avisa; a confirmação em
 * si continua exigindo trocar pra CAF (regra estrutural, inalterada). */
export function NotificacaoSolicitacaoTransferenciaPopup() {
  const { usuario, token } = useAuth();
  const [pendentes, setPendentes] = useState<SolicitacaoOut[]>([]);
  const [aberto, setAberto] = useState(false);
  const [assinaturaVista, setAssinaturaVista] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api
      .get<SolicitacaoOut[]>('/solicitacoes/pendentes-atender', { token })
      .then((lista) => {
        if (cancelado) return;
        setPendentes(lista);
        const assinatura = JSON.stringify(lista.map((s) => s.id).sort());
        const chave = `estoque_farmacia_solicitacao_transferencia_vistos_${usuario?.id}`;
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
  }, [token, usuario?.id]);

  function fechar() {
    if (usuario && assinaturaVista) {
      localStorage.setItem(`estoque_farmacia_solicitacao_transferencia_vistos_${usuario.id}`, assinaturaVista);
    }
    setAberto(false);
  }

  if (pendentes.length === 0 && !aberto) return null;

  return (
    <>
      <button
        type="button"
        className="sino-alertas sino-gradiente"
        aria-label={`Solicitação de transferência pendente — ${pendentes.length} pendente(s)`}
        onClick={() => setAberto(true)}
      >
        📨
        {pendentes.length > 0 && <span className="sino-badge">{pendentes.length}</span>}
      </button>

      {aberto && (
        <div className="modal-overlay" role="presentation" onClick={fechar}>
          <div
            className="modal-card modal-gradiente"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-notificacao-solicitacao"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="titulo-notificacao-solicitacao">Solicitações de transferência pendentes</h2>
              <button type="button" className="modal-close" aria-label="Fechar" onClick={fechar}>
                ×
              </button>
            </div>

            {pendentes.length === 0 ? (
              <p className="vazio-tabela">Nenhuma solicitação pendente no momento.</p>
            ) : (
              <>
                <p className="note" style={{ marginTop: 0 }}>
                  Pra confirmar ou recusar, troque a unidade ativa pra CAF.
                </p>
                <ul>
                  {pendentes.map((s) => (
                    <li key={s.id} style={{ marginBottom: 10 }}>
                      <b>{s.unidade_solicitante.nome}</b> pediu <b>{s.medicamento.nome}</b> ({s.quantidade_desejada}{' '}
                      un.) — {formatarDataHora(s.data_solicitacao)}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="actions">
              <Link to="/ressuprimento" className="btn" onClick={fechar}>
                Ir para Ressuprimento
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
