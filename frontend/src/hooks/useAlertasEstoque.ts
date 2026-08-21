import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { diasAteVencer, nivelValidade } from '../lib/formato';
import { permissoesDe } from '../lib/permissoes';
import type {
  LoteDetalhadoOut,
  RelatorioAtividadeRecenteOut,
  RelatorioEstoqueCriticoOut,
  RelatorioVencimentosProximosOut,
} from '../types';

export interface AlertasEstoque {
  carregando: boolean;
  critico: RelatorioEstoqueCriticoOut | null;
  itensVencidos: LoteDetalhadoOut[];
  itensAmarelo: LoteDetalhadoOut[];
  itensRoxo: LoteDetalhadoOut[];
  atividade: RelatorioAtividadeRecenteOut | null;
  total: number;
  /** Identifica o CONTEÚDO atual dos alertas (não muda por reabrir o
   * popup) — usado para saber se já foi "lido" antes (ver
   * NotificacaoEstoquePopup) sem repetir a mesma informação de novo. */
  assinatura: string;
}

const VAZIO: AlertasEstoque = {
  carregando: true,
  critico: null,
  itensVencidos: [],
  itensAmarelo: [],
  itensRoxo: [],
  atividade: null,
  total: 0,
  assinatura: '',
};

/** Busca os mesmos dados usados no popup de alerta ao login (2026-08-15)
 * e na tela Estoque atual — extraído num hook (2026-08-20) pra poder
 * alimentar mais de um lugar (popup + painel de alertas no dashboard)
 * sem duplicar a busca/regra de níveis de vencimento. */
export function useAlertasEstoque(): AlertasEstoque {
  const { usuario, token } = useAuth();
  const permissoes = permissoesDe(usuario);

  const [dados, setDados] = useState<AlertasEstoque>(VAZIO);

  useEffect(() => {
    if (!token || !permissoes.notificacaoEstoqueCritico || usuario?.unidade_ativa_id == null) {
      setDados({ ...VAZIO, carregando: false });
      return;
    }

    let cancelado = false;
    const buscarAtividade = permissoes.notificacaoAtividade
      ? api.get<RelatorioAtividadeRecenteOut>('/relatorios/atividade-recente', { token })
      : Promise.resolve(null);

    Promise.all([
      api.get<RelatorioEstoqueCriticoOut>('/relatorios/estoque-critico', { token }),
      // dias=60: a régua tem 3 níveis (vencido / <30 / 30-60) — a busca
      // cobre a janela inteira, o corte por nível é feito aqui a partir
      // de `nivelValidade` (mesma régua da tela Estoque atual).
      api.get<RelatorioVencimentosProximosOut>('/relatorios/vencimentos-proximos', { token, params: { dias: 60 } }),
      buscarAtividade,
    ])
      .then(([critico, vencendo, atividade]) => {
        if (cancelado) return;

        const itensVencidos = vencendo.itens.filter((l) => nivelValidade(diasAteVencer(l.data_validade)) === 'vencido');
        const itensAmarelo = vencendo.itens.filter((l) => nivelValidade(diasAteVencer(l.data_validade)) === 'amarelo');
        const itensRoxo = vencendo.itens.filter((l) => nivelValidade(diasAteVencer(l.data_validade)) === 'roxo');

        const assinatura = JSON.stringify({
          c: critico.itens.map((i) => i.medicamento_id).sort(),
          v: itensVencidos.map((l) => l.id).sort(),
          a: itensAmarelo.map((l) => l.id).sort(),
          r: itensRoxo.map((l) => l.id).sort(),
          at: (atividade?.itens ?? []).map((i) => i.movimentacao_id).sort(),
        });

        setDados({
          carregando: false,
          critico,
          itensVencidos,
          itensAmarelo,
          itensRoxo,
          atividade,
          total: critico.itens.length + itensVencidos.length + itensAmarelo.length + itensRoxo.length,
          assinatura,
        });
      })
      .catch(() => {
        if (!cancelado) setDados({ ...VAZIO, carregando: false });
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, usuario?.unidade_ativa_id]);

  return dados;
}
