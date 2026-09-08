import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import { formatarData, formatarDataHora, labelTipoMovimentacao } from '../lib/formato';
import { SETORES_DISPENSACAO } from '../lib/setores';
import type { MovimentacaoDetalhadaOut, RelatorioAuditoriaOut, TipoMovimentacao } from '../types';

const PASSO = 50;

type CorrecaoAberta =
  | { tipo: 'setor'; mov: MovimentacaoDetalhadaOut }
  | { tipo: 'paciente'; mov: MovimentacaoDetalhadaOut }
  | { tipo: 'nota-fiscal'; mov: MovimentacaoDetalhadaOut };

function detalhe(mov: MovimentacaoDetalhadaOut): string {
  switch (mov.tipo) {
    case 'entrada':
      return mov.lote.numero_nota_fiscal ? `NF ${mov.lote.numero_nota_fiscal}` : 'sem nota fiscal';
    case 'saida':
      return `setor: ${mov.setor_consumidor ?? '—'}${
        mov.paciente_nome ? ` · paciente: ${mov.paciente_nome}${mov.paciente_prontuario ? ` (prontuário ${mov.paciente_prontuario})` : ''}` : ''
      }`;
    case 'transferencia':
      return mov.usuario_confirmacao
        ? `recebido por ${mov.usuario_confirmacao.nome} em ${mov.unidade_destino?.nome ?? '—'}`
        : `em trânsito para ${mov.unidade_destino?.nome ?? '—'}`;
    case 'ajuste': {
      const sinal = mov.quantidade > 0 ? `+${mov.quantidade}` : String(mov.quantidade);
      return `${sinal} un. — ${mov.motivo_ajuste ?? '—'}`;
    }
    case 'correcao_valor':
      return mov.motivo_ajuste ?? '—';
    default:
      return '—';
  }
}

/** "Minhas Ações" (2026-09-01, pedido do cliente: "conferir as coisas
 * que fez... até pra poder corrigir o que precisar") — qualquer perfil
 * autenticado vê só o que ELE MESMO registrou (nunca de outra pessoa,
 * `usuario_id` forçado no backend). Diferente da Trilha de Auditoria
 * (só Coordenador, vê tudo de todo mundo) — este é o histórico pessoal,
 * com correção self-service: só quem registrou pode corrigir a própria
 * saída (setor/paciente) ou entrada (nota fiscal/AFM), sem depender de
 * outro perfil liberar. Ajuste de saldo/valor/nº de lote continuam na
 * tela Ajuste de Estoque (esses sim exigem outra permissão). */
export function MinhasAcoesPage() {
  const { token } = useAuth();

  const [tipoFiltro, setTipoFiltro] = useState<TipoMovimentacao | ''>('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [limite, setLimite] = useState(PASSO);

  const [dados, setDados] = useState<RelatorioAuditoriaOut | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [corrigindo, setCorrigindo] = useState<CorrecaoAberta | null>(null);

  function carregar() {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    api
      .get<RelatorioAuditoriaOut>('/relatorios/minhas-movimentacoes', {
        token,
        params: {
          tipo: tipoFiltro || undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
          limit: limite,
        },
      })
      .then(setDados)
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar suas ações.')))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tipoFiltro, dataInicio, dataFim, limite]);

  function aoCorrigir() {
    setCorrigindo(null);
    setSucesso('Correção registrada.');
    carregar();
  }

  const temMais = dados != null && dados.itens.length < dados.total;

  return (
    <section>
      <div className="screen-head">
        <h1>Minhas Ações</h1>
        <span className="screen-tag">histórico pessoal</span>
      </div>
      <p className="screen-sub">
        Tudo que você registrou — entradas, saídas, transferências, ajustes. Errou o setor, o nome do paciente ou a
        nota fiscal? Corrija direto aqui, sem precisar de outro perfil.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <div className="panel">
        <div className="grid g3" style={{ marginBottom: 18 }}>
          <div className="field">
            <label htmlFor="filtro-tipo-minhas">Tipo</label>
            <select
              id="filtro-tipo-minhas"
              value={tipoFiltro}
              onChange={(e) => {
                setLimite(PASSO);
                setTipoFiltro(e.target.value as TipoMovimentacao | '');
              }}
            >
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="transferencia">Transferência</option>
              <option value="ajuste">Ajuste</option>
              <option value="correcao_valor">Correção</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="filtro-inicio-minhas">Período — de</label>
            <input
              id="filtro-inicio-minhas"
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setLimite(PASSO);
                setDataInicio(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="filtro-fim-minhas">Período — até</label>
            <input
              id="filtro-fim-minhas"
              type="date"
              value={dataFim}
              onChange={(e) => {
                setLimite(PASSO);
                setDataFim(e.target.value);
              }}
            />
          </div>
        </div>

        {carregando && <p className="carregando">Carregando…</p>}
        {!carregando && dados && (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Mostrando {dados.itens.length} de {dados.total} ação(ões).
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data/hora</th>
                    <th>Tipo</th>
                    <th>Medicamento</th>
                    <th>Lote</th>
                    <th className="num">Qtd.</th>
                    <th>Detalhe</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="vazio-tabela">
                        Nenhuma ação registrada nesse filtro.
                      </td>
                    </tr>
                  )}
                  {dados.itens.map((mov) => (
                    <tr key={mov.id}>
                      <td className="mono">{formatarDataHora(mov.data_hora)}</td>
                      <td>{labelTipoMovimentacao(mov.tipo)}</td>
                      <td>{mov.lote.medicamento.nome}</td>
                      <td className="mono">{mov.lote.numero_lote}</td>
                      <td className="num">{mov.quantidade}</td>
                      <td>{detalhe(mov)}</td>
                      <td>
                        <div className="acoes-linha" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {mov.tipo === 'saida' && mov.categoria_saida !== 'vencimento' && (
                            <button type="button" className="btn ghost sm" onClick={() => setCorrigindo({ tipo: 'setor', mov })}>
                              Corrigir setor
                            </button>
                          )}
                          {mov.tipo === 'saida' && (
                            <button type="button" className="btn ghost sm" onClick={() => setCorrigindo({ tipo: 'paciente', mov })}>
                              Corrigir paciente
                            </button>
                          )}
                          {mov.tipo === 'entrada' && (
                            <button type="button" className="btn ghost sm" onClick={() => setCorrigindo({ tipo: 'nota-fiscal', mov })}>
                              Corrigir nota fiscal
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {temMais && (
              <div className="actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setLimite((l) => l + PASSO)}>
                  Carregar mais {Math.min(PASSO, dados.total - dados.itens.length)}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {corrigindo && (
        <ModalCorrecao
          token={token}
          corrigindo={corrigindo}
          onFechar={() => setCorrigindo(null)}
          onCorrigido={aoCorrigir}
        />
      )}
    </section>
  );
}

function ModalCorrecao({
  token,
  corrigindo,
  onFechar,
  onCorrigido,
}: {
  token: string | null;
  corrigindo: CorrecaoAberta;
  onFechar: () => void;
  onCorrigido: () => void;
}) {
  const { mov, tipo } = corrigindo;

  const [setorConsumidor, setSetorConsumidor] = useState(mov.setor_consumidor ?? '');
  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteProntuario, setPacienteProntuario] = useState('');
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState(mov.lote.numero_nota_fiscal ?? '');
  const [numeroAfm, setNumeroAfm] = useState(mov.lote.numero_afm ?? '');
  const [motivo, setMotivo] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!motivo.trim()) {
      setErro('Motivo da correção é obrigatório.');
      return;
    }
    setEnviando(true);
    try {
      if (tipo === 'setor') {
        await api.post(`/saidas/${mov.id}/corrigir-setor`, { setor_consumidor: setorConsumidor.trim(), motivo: motivo.trim() }, { token });
      } else if (tipo === 'paciente') {
        if (!pacienteNome.trim() || !pacienteProntuario.trim()) {
          setErro('Nome e prontuário do paciente são obrigatórios.');
          setEnviando(false);
          return;
        }
        await api.post(
          `/saidas/${mov.id}/corrigir-paciente`,
          { paciente_nome: pacienteNome.trim(), paciente_prontuario: pacienteProntuario.trim(), motivo: motivo.trim() },
          { token },
        );
      } else {
        await api.post(
          '/ajustes/nota-fiscal',
          {
            lote_id: mov.lote_id,
            numero_nota_fiscal: numeroNotaFiscal.trim() || null,
            numero_afm: numeroAfm.trim() || null,
            motivo: motivo.trim(),
          },
          { token },
        );
      }
      onCorrigido();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível registrar a correção.'));
    } finally {
      setEnviando(false);
    }
  }

  const titulo =
    tipo === 'setor' ? 'Corrigir setor consumidor' : tipo === 'paciente' ? 'Corrigir paciente / prontuário' : 'Corrigir nota fiscal';

  return (
    <div className="modal-overlay" role="presentation" onClick={onFechar}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{titulo}</h2>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onFechar}>
            ×
          </button>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          {mov.lote.medicamento.nome} · lote {mov.lote.numero_lote} · {formatarData(mov.data_hora)}
        </p>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <form onSubmit={aoSubmeter}>
          {tipo === 'setor' && (
            <div className="field">
              <label htmlFor="corrigir-setor">
                Setor consumidor correto <span className="req">*</span>
              </label>
              <select id="corrigir-setor" value={setorConsumidor} onChange={(e) => setSetorConsumidor(e.target.value)} required>
                <option value="">Selecione…</option>
                {SETORES_DISPENSACAO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tipo === 'paciente' && (
            <>
              <p className="note" style={{ marginTop: 0 }}>
                Digite o prontuário e nome corretos — não é possível ver o valor atual aqui (dado sensível), só
                substituir pelo certo.
              </p>
              <div className="grid">
                <div className="field">
                  <label htmlFor="corrigir-prontuario">
                    Prontuário correto <span className="req">*</span>
                  </label>
                  <input
                    id="corrigir-prontuario"
                    type="text"
                    value={pacienteProntuario}
                    onChange={(e) => setPacienteProntuario(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="corrigir-paciente-nome">
                    Nome correto <span className="req">*</span>
                  </label>
                  <input
                    id="corrigir-paciente-nome"
                    type="text"
                    value={pacienteNome}
                    onChange={(e) => setPacienteNome(e.target.value)}
                    style={{ textTransform: 'uppercase' }}
                    required
                  />
                </div>
              </div>
            </>
          )}
          {tipo === 'nota-fiscal' && (
            <div className="grid">
              <div className="field">
                <label htmlFor="corrigir-nf">Nº nota fiscal</label>
                <input id="corrigir-nf" type="text" value={numeroNotaFiscal} onChange={(e) => setNumeroNotaFiscal(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="corrigir-afm">Nº AFM</label>
                <input id="corrigir-afm" type="text" value={numeroAfm} onChange={(e) => setNumeroAfm(e.target.value)} />
              </div>
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="corrigir-motivo">
              Motivo da correção <span className="req">*</span>
            </label>
            <input
              id="corrigir-motivo"
              type="text"
              placeholder="ex.: digitei o setor errado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
            />
          </div>
          <div className="actions">
            <button type="submit" className="btn" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Confirmar correção'}
            </button>
            <button type="button" className="btn ghost" onClick={onFechar} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
