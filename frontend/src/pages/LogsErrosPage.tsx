import { Fragment, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { formatarDataHora } from '../lib/formato';
import type { LogErroResultado } from '../types';

const NIVEL_PILL: Record<string, string> = {
  CRITICAL: 'danger',
  ERROR: 'danger',
  WARNING: 'pend',
  INFO: 'muted',
  DEBUG: 'muted',
};

/** Relatório de log de erros do backend — exclusivo do Admin
 * (2026-09-18, pedido do cliente). Lê `logs/api-erro*.log` (stderr do
 * processo uvicorn) já separado em eventos individuais pelo backend
 * (`log_service.py`); tracebacks de antes de 2026-09-18 não têm horário
 * exato registrado na própria linha (o log não tinha timestamp ainda) —
 * esses aparecem marcados com "~" e usam a data de rotação do arquivo
 * como aproximação. */
export function LogsErrosPage() {
  const { usuario, token } = useAuth();

  if (usuario?.perfil !== 'admin') {
    return (
      <section>
        <div className="screen-head">
          <h1>Logs de Erro</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Tela exclusiva do Admin.
        </div>
      </section>
    );
  }

  return <ConteudoLogsErros token={token} />;
}

function ConteudoLogsErros({ token }: { token: string | null }) {
  const [dias, setDias] = useState('30');
  const [mostrarRuido, setMostrarRuido] = useState(false);
  const [resultado, setResultado] = useState<LogErroResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  const carregar = useCallback(() => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    api
      .get<LogErroResultado>('/admin/logs/erros', {
        token,
        params: { dias: Number(dias) || 30, apenas_erros: !mostrarRuido },
      })
      .then(setResultado)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar o log de erros.')))
      .finally(() => setCarregando(false));
  }, [token, dias, mostrarRuido]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <section>
      <div className="screen-head">
        <h1>Logs de Erro</h1>
        <span className="screen-tag">exclusivo do Admin</span>
      </div>
      <p className="screen-sub">
        Eventos de erro do backend, mais recente primeiro. Sem "mostrar ruído de start/stop", só o que de fato pode
        indicar um bug.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="panel">
        <div className="grid g3" style={{ marginBottom: 0 }}>
          <div className="field">
            <label htmlFor="log-dias">Período — últimos N dias</label>
            <input id="log-dias" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 12.5 }}>
              <input type="checkbox" checked={mostrarRuido} onChange={(e) => setMostrarRuido(e.target.checked)} />
              Mostrar ruído (start/stop do serviço)
            </label>
          </div>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={carregar} disabled={carregando}>
            {carregando ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="panel">
          <h2>
            {resultado.itens.length} evento(s)
            <span className="screen-tag" style={{ marginLeft: 10 }}>
              {resultado.arquivos_lidos.length} arquivo(s) de log no período
            </span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Nível</th>
                  <th>Exceção</th>
                  <th>Resumo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resultado.itens.length === 0 && (
                  <tr>
                    <td colSpan={5} className="vazio-tabela">
                      Nenhum evento de erro no período selecionado.
                    </td>
                  </tr>
                )}
                {resultado.itens.map((item, idx) => (
                  <Fragment key={idx}>
                    <tr className="clicavel" onClick={() => setExpandido(expandido === idx ? null : idx)}>
                      <td className="mono">
                        {formatarDataHora(item.timestamp)}
                        {item.timestamp_aproximado && (
                          <span title="Log de antes de registrar horário exato — data aproximada pelo arquivo.">
                            {' '}
                            ~
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${NIVEL_PILL[item.nivel] ?? 'muted'}`}>{item.nivel}</span>
                      </td>
                      <td className="mono">{item.tipo_excecao ?? '—'}</td>
                      <td>{item.resumo}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {expandido === idx ? '▲' : '▼'}
                      </td>
                    </tr>
                    {expandido === idx && (
                      <tr>
                        <td colSpan={5}>
                          <pre
                            style={{
                              margin: 0,
                              padding: 10,
                              background: 'var(--surface-2)',
                              borderRadius: 6,
                              fontSize: 11.5,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {item.detalhe}
                          </pre>
                          <div className="screen-sub" style={{ margin: '6px 0 0' }}>
                            arquivo: {item.arquivo}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
