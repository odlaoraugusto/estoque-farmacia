import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatarDataHora } from '../lib/formato';
import type { SolicitacaoDevolucaoMedicamentoOut } from '../types';

/** Notificação de devolução de medicamento registrada pelo painel
 * público (2026-09-01, pedido do cliente) — liberada a qualquer perfil
 * autenticado não-Admin, em QUALQUER unidade (não exclusiva da CAF,
 * diferente de `NotificacaoEstoquePopup`). Só informa; a confirmação em
 * si acontece na aba "Devoluções pendentes" de Entrada de Estoque. */
export function NotificacaoDevolucaoMedicamentoPopup() {
  const { usuario, token } = useAuth();
  const [pendentes, setPendentes] = useState<SolicitacaoDevolucaoMedicamentoOut[]>([]);
  const [aberto, setAberto] = useState(false);
  const [assinaturaVista, setAssinaturaVista] = useState<string | null>(null);

  useEffect(() => {
    if (!token || usuario?.unidade_ativa_id == null) return;
    let cancelado = false;
    api
      .get<SolicitacaoDevolucaoMedicamentoOut[]>('/devolucao-medicamento/pendentes', { token })
      .then((lista) => {
        if (cancelado) return;
        setPendentes(lista);
        const assinatura = JSON.stringify(lista.map((s) => s.id).sort());
        const chave = `estoque_farmacia_devolucao_medicamento_vistos_${usuario.id}`;
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
      localStorage.setItem(`estoque_farmacia_devolucao_medicamento_vistos_${usuario.id}`, assinaturaVista);
    }
    setAberto(false);
  }

  if (pendentes.length === 0 && !aberto) return null;

  return (
    <>
      <button
        type="button"
        className="sino-alertas sino-gradiente"
        aria-label={`Devolução de medicamento registrada — ${pendentes.length} pendente(s)`}
        onClick={() => setAberto(true)}
      >
        ↩️
        {pendentes.length > 0 && <span className="sino-badge">{pendentes.length}</span>}
      </button>

      {aberto && (
        <div className="modal-overlay" role="presentation" onClick={fechar}>
          <div
            className="modal-card modal-gradiente"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-notificacao-devolucao"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="titulo-notificacao-devolucao">Devolução de medicamento registrada</h2>
              <button type="button" className="modal-close" aria-label="Fechar" onClick={fechar}>
                ×
              </button>
            </div>

            {pendentes.length === 0 ? (
              <p className="vazio-tabela">Nenhuma devolução pendente no momento.</p>
            ) : (
              <ul>
                {pendentes.map((s) => (
                  <li key={s.id} style={{ marginBottom: 10 }}>
                    <b>{s.setor}</b> devolveu para <b>{s.unidade_destino_nome}</b> — {formatarDataHora(s.data_hora)}
                    <br />
                    {s.itens.map((i) => `${i.medicamento_nome} (${i.quantidade})`).join(', ')}
                  </li>
                ))}
              </ul>
            )}

            <div className="actions">
              <Link to="/entrada" className="btn" onClick={fechar}>
                Ir para Entrada de Estoque
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
