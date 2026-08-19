import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { diasAteVencer, formatarData, formatarDataHora, labelTipoMovimentacao } from '../lib/formato';
import { permissoesDe } from '../lib/permissoes';
import type {
  RelatorioAtividadeRecenteOut,
  RelatorioEstoqueCriticoOut,
  RelatorioVencimentosProximosOut,
} from '../types';

/** Popup de alerta ao entrar no sistema (pedido do cliente, 2026-08-15) —
 * mesmas informações que já existiam nos tiles da tela Estoque atual,
 * agora com a descrição de cada item e mostradas automaticamente ao
 * logar (não só um número passivo). Estoque crítico/vencendo: Farmacêutico
 * e Coordenador. Atividade recente (2026-08-19, substitui a autorização
 * prévia de Descarte): só Coordenador — é vigilância, não some do menu
 * pro Farmacêutico "porque sim", é porque a supervisão é papel de quem
 * coordena. Aparece uma vez por sessão — o componente só monta uma vez
 * dentro do `Layout` (não remonta ao navegar entre telas, só num
 * login/F5 novo). */
export function NotificacaoEstoquePopup() {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);

  const [critico, setCritico] = useState<RelatorioEstoqueCriticoOut | null>(null);
  const [vencendo, setVencendo] = useState<RelatorioVencimentosProximosOut | null>(null);
  const [atividade, setAtividade] = useState<RelatorioAtividadeRecenteOut | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!token || !permissoes.notificacaoEstoqueCritico || usuario?.unidade_ativa_id == null) return;

    let cancelado = false;
    const buscarAtividade = permissoes.notificacaoAtividade
      ? api.get<RelatorioAtividadeRecenteOut>('/relatorios/atividade-recente', { token })
      : Promise.resolve(null);

    Promise.all([
      api.get<RelatorioEstoqueCriticoOut>('/relatorios/estoque-critico', { token }),
      api.get<RelatorioVencimentosProximosOut>('/relatorios/vencimentos-proximos', { token }),
      buscarAtividade,
    ])
      .then(([critico, vencendo, atividade]) => {
        if (cancelado) return;
        setCritico(critico);
        setVencendo(vencendo);
        setAtividade(atividade);
        if (critico.itens.length > 0 || vencendo.itens.length > 0 || (atividade?.itens.length ?? 0) > 0) {
          setAberto(true);
        }
      })
      .catch(() => {
        // Notificação é um "a mais", não bloqueia o uso do sistema —
        // falha silenciosa aqui de propósito, o alerta em si não é
        // crítico o bastante pra atrapalhar o login.
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, usuario?.unidade_ativa_id]);

  if (!aberto) return null;

  const itensCriticos = critico?.itens ?? [];
  const dias = vencendo?.dias_considerados ?? 30;

  // Já vencido é mais grave que "vencendo em breve" — vermelho e
  // destacado, separado da lista azul de quem ainda está dentro do
  // prazo (pedido do cliente, 2026-08-15).
  const itensVencidos = (vencendo?.itens ?? []).filter((lote) => diasAteVencer(lote.data_validade) < 0);
  const itensAVencer = (vencendo?.itens ?? []).filter((lote) => diasAteVencer(lote.data_validade) >= 0);

  return (
    <div className="modal-overlay" role="presentation" onClick={() => setAberto(false)}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-notificacao-estoque"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="titulo-notificacao-estoque">Alertas de estoque</h2>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setAberto(false)}>
            ×
          </button>
        </div>

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

        {itensVencidos.length > 0 && (
          <div className="alerta-bloco alerta-vencido">
            <h3>Vencidos — {itensVencidos.length} lote(s)</h3>
            <ul>
              {itensVencidos.map((lote) => (
                <li key={lote.id}>
                  <b>{lote.medicamento.nome}</b> — lote {lote.numero_lote} · venceu em {formatarData(lote.data_validade)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {itensAVencer.length > 0 && (
          <div className="alerta-bloco alerta-vencendo">
            <h3>
              Validade próxima (menos de {dias} dias) — {itensAVencer.length} lote(s)
            </h3>
            <ul>
              {itensAVencer.map((lote) => (
                <li key={lote.id}>
                  <b>{lote.medicamento.nome}</b> — lote {lote.numero_lote} · vence em {formatarData(lote.data_validade)} (
                  {diasAteVencer(lote.data_validade)}d)
                </li>
              ))}
            </ul>
          </div>
        )}

        {atividade && atividade.itens.length > 0 && (
          <div className="alerta-bloco alerta-atividade">
            <h3>
              Atividade recente (últimos {atividade.dias_considerados} dias) — {atividade.itens.length} evento(s)
            </h3>
            <ul>
              {atividade.itens.map((item) => (
                <li key={item.movimentacao_id}>
                  <b>{labelTipoMovimentacao(item.tipo)}</b> · {item.medicamento_nome} ({item.quantidade}) —{' '}
                  {item.detalhe} · <i>{item.usuario_nome}</i>, {item.unidade_nome} em {formatarDataHora(item.data_hora)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={() => setAberto(false)}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
