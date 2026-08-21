import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAlertasEstoque } from '../hooks/useAlertasEstoque';
import { diasAteVencer, formatarData, formatarDataHora, labelTipoMovimentacao } from '../lib/formato';

function chaveVistos(usuarioId: number): string {
  return `estoque_farmacia_alertas_vistos_${usuarioId}`;
}

/** Alerta de estoque (pedido do cliente, 2026-08-15) — sino no topo
 * (sempre acessível) + popup automático ao logar (2026-08-20: só
 * reabre sozinho se o CONTEÚDO dos alertas mudou desde a última vez que
 * o usuário fechou — fechar marca como "visto" e não repete a mesma
 * informação de novo; o sino continua disponível pra rever quando
 * quiser, é só a abertura AUTOMÁTICA que para de repetir). */
export function NotificacaoEstoquePopup() {
  const { usuario } = useAuth();
  const alertas = useAlertasEstoque();

  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (alertas.carregando || alertas.total === 0 || !usuario) return;

    const ultimaVista = localStorage.getItem(chaveVistos(usuario.id));
    if (alertas.assinatura !== ultimaVista) {
      setAberto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertas.carregando, alertas.assinatura, alertas.total, usuario?.id]);

  function fechar() {
    if (usuario) localStorage.setItem(chaveVistos(usuario.id), alertas.assinatura);
    setAberto(false);
  }

  if (alertas.total === 0 && !aberto) return null;

  return (
    <>
      <button
        type="button"
        className="sino-alertas"
        aria-label={`Alertas de estoque — ${alertas.total} item(ns)`}
        onClick={() => setAberto(true)}
      >
        🔔
        {alertas.total > 0 && <span className="sino-badge">{alertas.total}</span>}
      </button>

      {aberto && (
        <div className="modal-overlay" role="presentation" onClick={fechar}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-notificacao-estoque"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="titulo-notificacao-estoque">Alertas de estoque</h2>
              <button type="button" className="modal-close" aria-label="Fechar" onClick={fechar}>
                ×
              </button>
            </div>

            <ConteudoAlertas alertas={alertas} />

            <div className="actions">
              <button type="button" className="btn" onClick={fechar}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ConteudoAlertas({ alertas }: { alertas: ReturnType<typeof useAlertasEstoque> }) {
  const itensCriticos = alertas.critico?.itens ?? [];

  if (alertas.total === 0 && !alertas.atividade?.itens.length) {
    return <p className="vazio-tabela">Nenhum alerta no momento.</p>;
  }

  return (
    <>
      {itensCriticos.length > 0 && (
        <div className="alerta-bloco alerta-critico">
          <h3>Estoque crítico — {itensCriticos.length} medicamento(s)</h3>
          <ul>
            {itensCriticos.map((item) => (
              <li key={item.medicamento_id}>
                <b>{item.nome}</b> — saldo {item.quantidade_atual} / mínimo {item.estoque_minimo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {alertas.itensVencidos.length > 0 && (
        <div className="alerta-bloco alerta-vencido">
          <h3>Vencidos — {alertas.itensVencidos.length} lote(s)</h3>
          <ul>
            {alertas.itensVencidos.map((lote) => (
              <li key={lote.id}>
                <b>{lote.medicamento.nome}</b> — lote {lote.numero_lote} · venceu em {formatarData(lote.data_validade)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {alertas.itensAmarelo.length > 0 && (
        <div className="alerta-bloco alerta-amarelo">
          <h3>Vence em menos de 30 dias — {alertas.itensAmarelo.length} lote(s)</h3>
          <ul>
            {alertas.itensAmarelo.map((lote) => (
              <li key={lote.id}>
                <b>{lote.medicamento.nome}</b> — lote {lote.numero_lote} · vence em {formatarData(lote.data_validade)} (
                {diasAteVencer(lote.data_validade)}d)
              </li>
            ))}
          </ul>
        </div>
      )}

      {alertas.itensRoxo.length > 0 && (
        <div className="alerta-bloco alerta-roxo">
          <h3>Vence entre 30 e 60 dias — {alertas.itensRoxo.length} lote(s)</h3>
          <ul>
            {alertas.itensRoxo.map((lote) => (
              <li key={lote.id}>
                <b>{lote.medicamento.nome}</b> — lote {lote.numero_lote} · vence em {formatarData(lote.data_validade)} (
                {diasAteVencer(lote.data_validade)}d)
              </li>
            ))}
          </ul>
        </div>
      )}

      {alertas.atividade && alertas.atividade.itens.length > 0 && (
        <div className="alerta-bloco alerta-atividade">
          <h3>
            Atividade recente (últimos {alertas.atividade.dias_considerados} dias) — {alertas.atividade.itens.length} evento(s)
          </h3>
          <ul>
            {alertas.atividade.itens.map((item) => (
              <li key={item.movimentacao_id}>
                <b>{labelTipoMovimentacao(item.tipo)}</b> · {item.medicamento_nome} ({item.quantidade}) —{' '}
                {item.detalhe} · <i>{item.usuario_nome}</i>, {item.unidade_nome} em {formatarDataHora(item.data_hora)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
