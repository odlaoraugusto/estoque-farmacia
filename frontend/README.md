# Estoque Farmácia — Frontend

React + TypeScript + Vite. Consome a API real do backend (`../backend`)
— sem dados mockados. Réplica fiel do protótipo aprovado
(`../docs/02_PROTOTIPO.html`): barra institucional FESFSUS no topo,
paleta sóbria verde-azulada, sidebar de navegação e cabeçalho
institucional em todo relatório.

## Rodando localmente

```bash
npm install
cp .env.example .env   # ajuste VITE_API_BASE_URL se o backend não estiver em localhost:8000
npm run dev
```

O backend precisa estar rodando (ver `../backend/README.md`) com pelo
menos um usuário semeado via `scripts/seed_usuarios.py`.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — `tsc -b` + build de produção
- `npm run lint` — oxlint
- `npm run preview` — serve o build de produção localmente

## Estrutura

```
src/
  types.ts            tipos espelhando app/schemas/*.py do backend
  lib/
    api.ts            cliente HTTP fino (fetch) + ApiError + mensagens amigáveis
    permissoes.ts      regras de visibilidade por perfil/unidade ativa
    formato.ts         formatação de moeda/data/labels em pt-BR
  context/
    AuthContext.tsx     sessão (token, usuário, config institucional)
  components/
    Layout.tsx           topbar + sidebar + outlet
    RotaProtegida.tsx     guarda de rota (token + unidade ativa)
    Letterhead.tsx        cabeçalho institucional dos relatórios
    Alerta.tsx            banner de erro/sucesso/info
    BuscaAutocomplete.tsx  busca com sugestões (medicamento/lote)
  pages/
    LoginPage.tsx        login + seleção de unidade (2 passos)
    EstoquePage.tsx      home pós-login — tiles + tabela de lotes
    EntradaPage.tsx      entrada de estoque (só CAF)
    TransferenciaPage.tsx enviar + confirmar recebimento
    SaidaPage.tsx        saída/dispensação com sugestão FEFO
    DescartePage.tsx     solicitar (farmacêutico) + aprovar (coordenador)
    RelatoriosPage.tsx   4 abas + cabeçalho institucional
```

## Permissões

Toda visibilidade de tela/aba/ação é derivada de `usuario.perfil` e
`usuario.unidade_ativa_nome` (vindos de `/auth/me`), refletindo as
regras já aplicadas pela API — ver `src/lib/permissoes.ts`. Itens sem
acesso somem do menu, não aparecem desabilitados (regra explícita do
cliente, docs/00_PROJETO.md seção 13).
