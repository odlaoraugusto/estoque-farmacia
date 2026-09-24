import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { VersaoInfo, VersaoNota } from '../types';

/** Popup de notas de atualização — abre sozinho logo após o login
 * quando existe alguma versão mais nova do que a última que este login
 * fechou (`usuario.versao_notas_vista`). Fechar = marcar como lida
 * (self-service, `POST /versao/marcar-lida`) — não volta a aparecer até
 * a próxima versão com notas novas. Usuário sem `versao_notas_vista`
 * (login novo, nunca viu nada) só vê a versão mais recente, não o
 * histórico inteiro. */
export function NotasAtualizacaoModal() {
  const { token, usuario, marcarNotasLidas } = useAuth();
  const [info, setInfo] = useState<VersaoInfo | null>(null);
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<VersaoInfo>('/versao', { token })
      .then(setInfo)
      .catch(() => {
        // Silencioso de propósito — não é crítico o bastante pra
        // atrapalhar o uso do sistema com um Alerta se essa chamada
        // falhar.
      });
  }, [token]);

  if (!info || !usuario) return null;
  if (usuario.versao_notas_vista === info.atual) return null;

  const indiceVista = info.notas.findIndex((n) => n.versao === usuario.versao_notas_vista);
  const notasParaMostrar: VersaoNota[] = indiceVista >= 0 ? info.notas.slice(0, indiceVista) : info.notas.slice(0, 1);
  if (notasParaMostrar.length === 0) return null;

  async function fechar() {
    setFechando(true);
    try {
      await marcarNotasLidas(info!.atual);
    } finally {
      setFechando(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true">
        <h2>Notas de atualização</h2>
        <p className="screen-sub" style={{ marginTop: -4 }}>
          O que mudou desde o seu último acesso.
        </p>

        {notasParaMostrar.map((nota) => (
          <div key={nota.versao} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <b style={{ color: 'var(--accent)' }}>Versão {nota.versao}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {new Date(nota.data).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {nota.mudancas.map((m, idx) => (
                <li key={idx} style={{ marginBottom: 6, fontSize: 13 }}>
                  <span className={`pill ${m.tipo === 'correcao' ? 'danger' : 'ok'}`} style={{ marginRight: 6 }}>
                    {m.tipo === 'correcao' ? 'Correção' : 'Novidade'}
                  </span>
                  {m.descricao}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="actions">
          <button type="button" className="btn" disabled={fechando} onClick={fechar}>
            {fechando ? 'Fechando…' : 'Fechar'}
          </button>
        </div>
      </div>
    </div>
  );
}
