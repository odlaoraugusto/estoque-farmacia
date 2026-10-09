import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { StatusRessuprimentoItem } from '../types';

function chaveVistos(usuarioId: number): string {
  return `estoque_farmacia_excesso_vistos_${usuarioId}`;
}

/** Alerta de excesso em satélite (2026-10-08, pedido do cliente): unidade
 * com saldo ACIMA da quantidade padrão configurada em Ponto de
 * Ressuprimento — o oposto do alerta "precisa ressuprir" já existente em
 * ResuprimentoPage. Farmacêutico/Coordenador vê o excesso de TODAS as
 * satélites consolidado (GET /ressuprimento/status sem unidade_id cai em
 * resolver_unidade_escopo -> None -> todas); os demais perfis veem só a
 * própria unidade ativa. Mesmo padrão de sino + popup automático das
 * outras notificações (NotificacaoEstoquePopup /
 * NotificacaoRessuprimentoCarrinhoPopup). */
export function NotificacaoEstoqueExcessoPopup() {
  const { usuario, token } = useAuth();
  const [itens, setItens] = useState<StatusRessuprimentoItem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [assinaturaVista, setAssinaturaVista] = useState<string | null>(null);

  const podeVerTudo = usuario?.perfil === 'coordenador' || usuario?.perfil === 'farmaceutico';

  useEffect(() => {
    if (!token || !usuario || (!podeVerTudo && usuario.unidade_ativa_id == null)) return;
    let cancelado = false;
    api
      .get<StatusRessuprimentoItem[]>('/ressuprimento/status', { token })
      .then((lista) => {
        if (cancelado) return;
        const emExcesso = lista.filter((i) => i.em_excesso);
        setItens(emExcesso);
        const assinatura = JSON.stringify(emExcesso.map((i) => `${i.medicamento_id}-${i.unidade_id}`).sort());
        const chave = chaveVistos(usuario.id);
        const ultimaVista = localStorage.getItem(chave);
        if (emExcesso.length > 0 && assinatura !== ultimaVista) {
          setAberto(true);
        }
        setAssinaturaVista(assinatura);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [token, usuario?.unidade_ativa_id, usuario?.id, podeVerTudo]);

  function fechar() {
    if (usuario && assinaturaVista) {
      localStorage.setItem(chaveVistos(usuario.id), assinaturaVista);
    }
    setAberto(false);
  }

  if (itens.length === 0 && !aberto) return null;

  return (
    <>
      <button
        type="button"
        className="sino-alertas"
        aria-label={`Satélite com excesso de estoque — ${itens.length} item(ns)`}
        onClick={() => setAberto(true)}
      >
        📦
        {itens.length > 0 && <span className="sino-badge">{itens.length}</span>}
      </button>

      {aberto && (
        <div className="modal-overlay" role="presentation" onClick={fechar}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-notificacao-excesso"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="titulo-notificacao-excesso">Satélite(s) com excesso de estoque</h2>
              <button type="button" className="modal-close" aria-label="Fechar" onClick={fechar}>
                ×
              </button>
            </div>

            {itens.length === 0 ? (
              <p className="vazio-tabela">Nenhum excesso no momento.</p>
            ) : (
              <ul>
                {itens.map((i) => (
                  <li key={`${i.medicamento_id}-${i.unidade_id}`} style={{ marginBottom: 10 }}>
                    <b>{i.unidade_nome}</b> está com <b>{i.medicamento_nome}</b> acima da quantidade padrão — tem{' '}
                    {i.quantidade_atual}, padrão {i.quantidade_padrao} · devolver <b>{i.excedente}</b> à CAF
                  </li>
                ))}
              </ul>
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
