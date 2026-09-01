import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { permissoesDe } from '../lib/permissoes';
import { api, mensagemErro } from '../lib/api';
import { Alerta } from '../components/Alerta';
import type { PermissaoPerfil } from '../types';

type LinhaEditavel = Omit<PermissaoPerfil, 'perfil'>;

const LINHA_VAZIA: LinhaEditavel = {
  entrada: false,
  medicamentos: false,
  ajustar_estoque: false,
  corrigir_valor_unitario: false,
  transferencia_enviar: false,
  reposicao_carrinho: false,
  relatorios_financeiro: false,
};

const ACOES: { chave: keyof LinhaEditavel; rotulo: string; ajuda: string }[] = [
  {
    chave: 'entrada',
    rotulo: 'Registrar Entrada',
    ajuda: 'Dar entrada de medicamento (compra/doação/empréstimo) — só na unidade CAF.',
  },
  {
    chave: 'medicamentos',
    rotulo: 'Gerenciar medicamentos',
    ajuda: 'Cadastrar e editar o catálogo de medicamentos (estoque mínimo, antimicrobiano, controlado).',
  },
  {
    chave: 'ajustar_estoque',
    rotulo: 'Ajustar estoque',
    ajuda: 'Corrigir saldo de um lote por contagem física, fora do fluxo normal de entrada/saída.',
  },
  {
    chave: 'corrigir_valor_unitario',
    rotulo: 'Corrigir valor unitário',
    ajuda: 'Corrigir o valor pago de um lote (erro de digitação na Entrada) — não mexe no saldo físico.',
  },
  {
    chave: 'transferencia_enviar',
    rotulo: 'Enviar / dispensar transferência',
    ajuda: 'Enviar uma transferência direta ou atender (aceitar/recusar) uma solicitação de outra unidade — só na CAF.',
  },
  {
    chave: 'reposicao_carrinho',
    rotulo: 'Repor / devolver carrinho',
    ajuda: 'Repor um carrinho de emergência a partir da própria unidade que o hospeda, ou devolver saldo de um carrinho pra essa mesma unidade.',
  },
  {
    chave: 'relatorios_financeiro',
    rotulo: 'Relatórios financeiros',
    ajuda: 'Ver consolidado de estoque, custo por setor, consumo, estoque crítico e rastreabilidade de transferências.',
  },
];

const PERFIS_CONFIGURAVEIS: { chave: 'farmaceutico' | 'atendente'; rotulo: string }[] = [
  { chave: 'farmaceutico', rotulo: 'Farmacêutico' },
  { chave: 'atendente', rotulo: 'Atendente' },
];

/** Tela exclusiva do Admin — decide o que Farmacêutico e Atendente podem
 * fazer além do básico (ver estoque/vencimentos, registrar Saída/
 * dispensação, confirmar transferência, solicitar transferência —
 * liberado a qualquer login). Coordenador não aparece na matriz: é
 * superusuário implícito, sempre com tudo liberado, igual o Admin. */
export function PermissoesPage() {
  const { usuario, matrizPermissoes, token, recarregarPermissoes } = useAuth();
  const permissoes = permissoesDe(usuario, matrizPermissoes);

  if (!permissoes.gerenciarPermissoes) {
    return (
      <section>
        <div className="screen-head">
          <h1>Permissões</h1>
        </div>
        <div className="locked-panel">
          <span className="lock-icon">🔒</span>
          Gerenciar permissões é exclusivo do Admin.
        </div>
      </section>
    );
  }

  return <GestaoPermissoes token={token} matrizAtual={matrizPermissoes} recarregar={recarregarPermissoes} />;
}

function GestaoPermissoes({
  token,
  matrizAtual,
  recarregar,
}: {
  token: string | null;
  matrizAtual: PermissaoPerfil[] | null;
  recarregar: () => Promise<void>;
}) {
  const [form, setForm] = useState<Record<'farmaceutico' | 'atendente', LinhaEditavel>>({
    farmaceutico: LINHA_VAZIA,
    atendente: LINHA_VAZIA,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!matrizAtual) return;
    setForm((atual) => {
      const proximo = { ...atual };
      for (const linha of matrizAtual) {
        if (linha.perfil === 'farmaceutico' || linha.perfil === 'atendente') {
          const { perfil: _perfil, ...resto } = linha;
          proximo[linha.perfil] = resto;
        }
      }
      return proximo;
    });
  }, [matrizAtual]);

  function alternar(perfil: 'farmaceutico' | 'atendente', chave: keyof LinhaEditavel) {
    setSucesso(null);
    setForm((atual) => ({
      ...atual,
      [perfil]: { ...atual[perfil], [chave]: !atual[perfil][chave] },
    }));
  }

  async function salvar() {
    setErro(null);
    setSucesso(null);
    setSalvando(true);
    try {
      await api.put('/permissoes', { farmaceutico: form.farmaceutico, atendente: form.atendente }, { token });
      await recarregar();
      setSucesso('Permissões atualizadas.');
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar as permissões.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section>
      <div className="screen-head">
        <h1>Permissões</h1>
        <span className="screen-tag">exclusivo Admin</span>
      </div>
      <p className="screen-sub">
        Define o que Farmacêutico e Atendente podem fazer além do básico (ver estoque/vencimentos, registrar
        Saída/dispensação, confirmar transferência, solicitar transferência — liberado a qualquer login). O
        Coordenador sempre tem tudo liberado e não aparece nesta matriz.
      </p>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ação</th>
                {PERFIS_CONFIGURAVEIS.map((p) => (
                  <th key={p.chave} style={{ textAlign: 'center' }}>
                    {p.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACOES.map((acao) => (
                <tr key={acao.chave}>
                  <td>
                    <div>{acao.rotulo}</div>
                    <div className="screen-sub" style={{ margin: 0, fontSize: 12 }}>
                      {acao.ajuda}
                    </div>
                  </td>
                  {PERFIS_CONFIGURAVEIS.map((p) => (
                    <td key={p.chave} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={form[p.chave][acao.chave]}
                        onChange={() => alternar(p.chave, acao.chave)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar permissões'}
          </button>
        </div>
      </div>
    </section>
  );
}
