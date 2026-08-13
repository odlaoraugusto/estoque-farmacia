# Planejamento Técnico — Sistema de Gerenciamento de Estoque de Farmácia Hospitalar

## 1. Premissas confirmadas

| Item | Decisão |
|---|---|
| Ambiente | Rede local do hospital (multi-estação, não é PC único) |
| Stack | Python (FastAPI) + PostgreSQL + React, sem Docker |
| Integração | Isolado por enquanto (sem SSO/cadastro único) |
| Usuários simultâneos | 6 a 15 |
| Leitura de lote | Digitação manual (sem código de barras/QR no MVP) |
| Relatórios | Tela + exportação PDF/Excel |
| Acréscimo ao escopo original | Campo de **valor do medicamento** na Entrada, para controle gerencial de custo (descartes e doações) |

Arquitetura cliente-servidor: 6 a 15 estações acessando pela rede interna exigem um servidor central (não um app local single-user), evitando conflito de concorrência (dois atendentes dando baixa no mesmo lote ao mesmo tempo).

## 2. Arquitetura proposta

**Modelo:** Web app local — servidor único na rede interna do hospital, acessado por navegador em cada estação (não precisa instalar nada nos PCs clientes).

- **Backend:** API REST em Python/FastAPI — regras de negócio (validação de saldo, FEFO, permissões por perfil).
- **Banco de dados:** PostgreSQL — múltiplos acessos simultâneos com escrita concorrente.
- **Frontend:** React, rodando no navegador de cada estação.
- **Servidor:** computador/mini-PC dedicado na farmácia (ou VM), IP fixo na rede local, hospedando backend + banco. Sem depender de internet. Sem Docker — instalação direta no servidor (systemd/serviço).
- **Backup:** rotina automática (`pg_dump` agendado, dump diário em outro disco/pasta de rede).

## 3. Ajuste no módulo de Entrada (valor do medicamento)

Novo campo obrigatório em **Entradas de Estoque**:
- **Valor unitário pago** (por unidade/apresentação) — vinculado ao lote específico, não ao medicamento genérico (lotes diferentes podem ter preços diferentes).

Impactos em cascata:
- **Relatório de Consolidado Geral de Estoque** ganha visão de **valor total em estoque** (quantidade × valor unitário por lote).
- **Saídas/Dispensação** carregam o valor do lote consumido → relatório de **custo por setor**.
- Módulo de **Descartes** formal (perdas por vencimento, quebra etc.), com valor associado.
- **Doações**: tratada como tipo de origem distinto (Compra vs Doação) na Entrada, não misturando custo real pago com valor de mercado de doação.

**Regra de negócio (2026-07-31): Entrada só ocorre na CAF.** As demais unidades (UTI, Centro Cirúrgico, Emergência) nunca recebem lote diretamente por Entrada — o único jeito de um item chegar nelas é por Transferência a partir da CAF. Isso significa que a tela de Entrada só fica disponível quando a unidade ativa da sessão é a CAF, independente do perfil do usuário (Farmacêutico/Coordenador logados em UTI, por exemplo, não veem Entrada — só Transferência/Saída/Descarte da própria unidade).

## 4. Squad — papéis e responsabilidades

| Papel | Responsabilidade nesta fase |
|---|---|
| Arquiteto(a) de Software | Stack final, modelagem do banco, estratégia de concorrência e backup |
| Dev Backend | API, regras de negócio (FEFO, saldo negativo, permissões por perfil) |
| Dev Frontend | Telas por perfil (Coordenador/Farmacêutico/Atendente), UX dos formulários |
| DBA | Modelagem de lote, movimentação, auditoria (trilha completa por usuário/data/hora) |
| QA | Casos de teste: concorrência, saldo negativo, FEFO, permissões |
| DevOps | Instalação do servidor local, rede interna, rotina de backup |

## 5. Decisões fechadas

- **Descarte**: módulo formal, fluxo de duas etapas (Farmacêutico solicita, Coordenador aprova). Só decrementa estoque após aprovação.
- **Origem da Entrada**: dois tipos — **Compra** (valor obrigatório) e **Doação** (valor = 0, automático).
- **Nome do sistema**: sem identidade própria por enquanto — "Sistema de Gerenciamento de Farmácia" (nome genérico).
- **Transferência parcial de lote**: gera dois registros de lote separados, cada um rastreável independentemente (validade, descarte, saída).
- **Unidade do usuário**: não é fixa por cadastro — o usuário seleciona a unidade ativa após login; sessão restringe ações àquela unidade.

## 6. Modelagem de Banco de Dados

### `usuarios`
`id, nome, login, senha_hash, perfil (coordenador | farmaceutico | atendente), crf (preenchido quando perfil = farmaceutico OU coordenador — Coordenador também é Farmacêutico por formação), ativo`

### `unidades`
`id, nome (CAF | UTI | Centro Cirúrgico | Emergência)`

### `medicamentos` (cadastro genérico, não é o estoque em si)
`id, nome, apresentacao (forma farmacêutica — comprimido | capsula | solucao_oral | xarope | suspensao | solucao_injetavel | ampola | frasco_ampola | pomada | creme | gel | spray | supositorio | adesivo | bolsa), concentracao (texto livre, ex. "500mg/mL"), acondicionamento (ambiente | geladeira), estoque_minimo`

**Correção (2026-08-01):** apresentação e concentração eram um único campo de texto livre (ex. "Frasco 10mL", misturando forma farmacêutica e dosagem). Separado a pedido do cliente: `apresentacao` virou uma lista fechada (enum) só com a forma farmacêutica; `concentracao` é campo de texto próprio para a dosagem/concentração (ex. "500mg/mL", "100UI/mL"). Migração `0002_apresentacao_concentracao` fez o backfill dos dados de teste existentes.

### `lotes` (estoque físico — cada lote ligado a UM medicamento e UMA unidade)
`id, medicamento_id, unidade_id, numero_lote, data_validade, quantidade_atual, valor_unitario, origem (compra | doacao), numero_nota_fiscal (obrigatório se origem=compra), numero_afm (opcional), data_entrada, usuario_entrada_id, status_transferencia (nulo | em_transito | recebido), lote_origem_id (rastreio de proveniência em transferência parcial)`

### `movimentacoes` (trilha de auditoria — nunca se apaga)
`id, tipo (entrada | transferencia | saida | descarte), lote_id, quantidade, unidade_origem_id, unidade_destino_id (nulo se não for transferência), quantidade_recebida (preenchido só na confirmação, pode divergir da enviada), setor_consumidor (obrigatório em saída), motivo_descarte (obrigatório em descarte), status (pendente_aprovacao | aprovado | rejeitado — só para descarte), usuario_id, usuario_solicitante_id (descarte), usuario_aprovador_id (descarte), usuario_confirmacao_id (transferência), data_hora, data_confirmacao`

### Fluxos

- **Entrada** → cria linha em `lotes` + linha em `movimentacoes` (tipo=entrada).
- **Transferência** → marca lote como `em_transito`, reduz `quantidade_atual` na origem + linha em `movimentacoes` (tipo=transferencia). Confirmação do recebimento (pode ser feita por Atendente) cria novo registro de lote no destino com `quantidade_recebida` (pode divergir da enviada), muda status para `recebido`, preenche `usuario_confirmacao_id` + `data_confirmacao`. Transferência parcial gera lote novo no destino copiando `numero_lote`, `data_validade`, `valor_unitario`, `origem` do lote pai, com `lote_origem_id` para rastreio.
- **Saída/Dispensação** → decrementa `quantidade_atual` do lote + linha em `movimentacoes` (tipo=saida, setor_consumidor preenchido).
- **Descarte** → Farmacêutico solicita (`usuario_solicitante_id`, `motivo_descarte`, status=pendente_aprovacao); Coordenador aprova (`usuario_aprovador_id`) — só então decrementa `quantidade_atual`.

Essa estrutura resolve: valor total em estoque (Σ `quantidade_atual × valor_unitario` por lote), custo por setor (Σ `movimentacoes` tipo=saida cruzada com valor do lote), e trilha de auditoria completa (`movimentacoes` = histórico).

`usuarios.crf` é exibido em qualquer relatório que traga o nome de um Farmacêutico OU Coordenador responsável por uma ação (Coordenador também tem CRF).

**Trilha de auditoria restrita à Coordenação (2026-07-31):** dos relatórios, só o Coordenador tem acesso à trilha completa de movimentações; Farmacêutico e Atendente não veem esse relatório (mesmo Farmacêutico tendo acesso aos demais relatórios financeiros/operacionais).

## 7. Direção de identidade visual (referência para a fase de UI)

- Paleta clara, "clima hospitalar", fugindo do azul/cinza/branco óbvio de painel genérico de IA.
- Sem componentes "infantilizados": nada de botões enormes, fontes grandes demais, cards com sombra pesada ou gradiente chamativo — visual sóbrio, denso o suficiente para uso profissional recorrente.
- Tipografia e espaçamento discretos, mais próximos de um sistema hospitalar real (tipo AGHUse) do que de uma landing page.

**Atualização (2026-07-31):** decisão revista — a identidade FESFSUS passou a ser aplicada na barra superior institucional (topo da tela, acima do menu lateral), com o roxo `#61358c` de fundo e uma régua de 4 cores (`#61358c #7572a7 #79bfb4 #73d9a8`) na base, identificando a Fundação. O restante do sistema (menu, telas, formulários) continua com a paleta sóbria verde-azulada definida para uso profissional — não houve re-tema geral, só a identificação institucional no topo. Tipografia da barra usa a stack de sistema (Arimo é metricamente compatível com Arial/system-ui); "De Rotterdam" exigiria o arquivo de fonte licenciado da FESF para uso real — não embutido no protótipo por não termos o arquivo.

## 8. Status

Modelagem de banco de dados fechada. Todos os pontos em aberto foram resolvidos.

Wireframes de baixa fidelidade + matriz de permissões produzidos em `docs/01_WIREFRAMES.html` — aguardando aprovação. Cobre: Login + Seleção de Unidade, Estoque atual (tela extra proposta como home, a confirmar), Entrada, Transferência (envio + confirmação), Saída/Dispensação, Descarte (solicitação + aprovação) e Relatórios (4 relatórios). Simulador de perfil embutido (Coordenador/Farmacêutico/Atendente) já aplica a matriz de permissões proposta tela a tela.

A matriz de permissões só tinha regras explícitas no documento original para Descarte e confirmação de Transferência — o resto foi inferido pela squad e precisa de confirmação. Perguntas em aberto levantadas (ver `docs/01_WIREFRAMES.html`, aba "Matriz de permissões"):
1. Atendente pode registrar Entrada quando não há farmacêutico de plantão (ex.: Emergência de madrugada)?
2. Atendente deve ver relatórios financeiros (custo por setor, valor em estoque)?
3. Coordenador vê consolidado de todas as unidades, ou fica restrito à unidade ativa como os demais?
4. Cadastro de usuários: fica no sistema (tela de admin) ou é feito direto no banco pelo DBA/DevOps na fase inicial?
5. Cadastro de medicamentos: Farmacêutico cadastra sozinho ou precisa de aprovação do Coordenador, como no Descarte?

## 9. Próximos passos

1. ~~Wireframes de baixa fidelidade~~ — feito.
2. ~~Fluxograma/matriz de permissões~~ — feito. As 5 perguntas em aberto foram resolvidas com defaults (ver abaixo), revisáveis a qualquer momento.
3. ~~Aplicar a diretriz visual (seção 7) e fechar o protótipo~~ — feito em `docs/02_PROTOTIPO.html`: paleta verde-azulado escuro sóbrio + fundo papel quente (fugindo do azul/cinza/branco genérico), tipografia discreta, densidade adequada a uso profissional prolongado. Mesma navegação e simulador de perfil dos wireframes, agora com inputs reais e a matriz de permissões já com os defaults aplicados.

**Defaults aplicados nesta rodada (perguntas da seção 8):**
1. Entrada — restrita a Farmacêutico/Coordenador.
2. Relatórios financeiros — sem acesso para Atendente.
3. Consolidado multi-unidade — só Coordenador vê todas as unidades nos relatórios.
4. Cadastro de usuários — fora do MVP, gerenciado direto no banco pelo DBA/DevOps.
5. Cadastro de medicamentos — Farmacêutico cadastra sozinho, sem aprovação.

## 10. Próximo passo

Aguardando sua aprovação do protótipo (`docs/02_PROTOTIPO.html`) e dos defaults acima. Depois disso, início da implementação (modelagem real do banco + API + frontend).

## 11. Correção (2026-07-31)

Entrada só ocorre na CAF (ver seção 3). Protótipo atualizado: agora simula a unidade ativa da sessão além do perfil, e a tela de Entrada trava quando a unidade ativa não é CAF — o campo "Unidade" na Entrada também deixou de dizer "= unidade ativa" e passou a ser fixo "CAF".

## 12. Identificação do hospital (2026-07-31)

**Hospital: Hospital Materno Infantil Dr. Joaquim Sampaio** (rede FESFSUS).

Como a arquitetura é um servidor local por hospital (seção 2 — não é multi-tenant, cada instalação atende um hospital só), o nome do hospital não vira uma tabela no banco: é um valor de configuração fixo da instalação (ex.: variável de ambiente `HOSPITAL_NOME` lida no start do backend), exibido na barra superior junto com a marca FESFSUS. Aplicado no protótipo (`docs/02_PROTOTIPO.html`) na barra institucional.

## 13. Correção (2026-07-31, rodada 2)

- Trilha de auditoria restrita à Coordenação (seção 6).
- `usuarios.crf` também se aplica a perfil Coordenador (seção 6).
- Padrão de UX definido: **quando um perfil/unidade não tem acesso a uma tela ou relatório, o item some do menu em vez de aparecer travado/marcado com X.** Aplicado a todos os itens de navegação e abas de relatório do protótipo — se a lista de "próximos passos" adicionar novas telas, seguir o mesmo padrão.
- Identidade visual FESFSUS aplicada na barra superior (seção 7).

## 14. Correção (2026-07-31, rodada 3)

Cabeçalho institucional (Fundação Estatal Saúde da Família + Hospital Materno Infantil Dr. Joaquim Sampaio) passa a aparecer também no topo de todo relatório gerado — tela e exportação (PDF/Excel) usam o mesmo cabeçalho, incluindo título do relatório, data/hora de geração, usuário e unidade. Aplicado em `docs/02_PROTOTIPO.html` na tela de Relatórios.

## 15.5 Teste local ponta a ponta (2026-08-01)

Ambiente de teste local montado do zero (não havia Postgres nem Docker funcional na máquina):
- **PostgreSQL 17 portátil** (zip de binários, sem instalador/serviço — não precisa de admin do Windows) em `C:\Users\arthu\pgportable`. Rodando na porta 5432, usuário `postgres`/senha `postgres`, banco `estoque_farmacia`. Iniciar: `C:\Users\arthu\pgportable\pgsql\bin\pg_ctl.exe -D C:\Users\arthu\pgportable\data -l pg.log start`. Parar: mesmo comando com `stop`.
- Migrations aplicadas (`alembic upgrade head`) e 3 usuários de teste criados via `scripts/seed_usuarios.py`:
  - `joao.souza` / `Senha123!` — coordenador (CRF 22711-SP)
  - `ana.ribeiro` / `Senha123!` — farmacêutico (CRF 12345-SP)
  - `carlos.moreira` / `Senha123!` — atendente
- Backend rodando em `http://localhost:8000` (`uvicorn app.main:app`), frontend em `http://localhost:5173` (`npm run dev`, config em `.claude/launch.json`).

**Fluxo validado de ponta a ponta:** login → seleção de unidade (CAF) → Entrada de um lote real de Dipirona → aparece corretamente em Estoque atual com valor total calculado (340 × R$2,10 = R$714,00). Trocado para perfil Atendente/UTI: confirmado que Entrada e Descarte somem do menu (não aparecem travados), e que Relatórios cai automaticamente na única aba permitida (Vencimentos próximos), com o cabeçalho institucional correto.

**Bug real encontrado e corrigido:** o campo "Valor unitário pago" da Entrada aceitava formato brasileiro (`2,10`) na tela mas mandava a string crua pra API, que exige ponto decimal — dava 422 "Input should be a valid decimal" toda vez que alguém digitava vírgula (o formato que o próprio placeholder "R$ 0,00" induz a digitar). Corrigido em `frontend/src/lib/formato.ts` (`paraDecimalApi`) + `frontend/src/pages/EntradaPage.tsx`, convertendo vírgula→ponto antes de enviar. Validado de novo depois do fix — funciona.

## 15. Protótipo aprovado (2026-07-31)

Usuário aprovou o protótipo e os defaults. Início da implementação: `backend/` (Python/FastAPI + PostgreSQL, sem Docker) seguido de `frontend/` (React).

## 16. Implementação — v1 entregue (2026-07-31)

**Backend** (`backend/`): FastAPI + SQLAlchemy + Alembic, schema completo (migration `0001_schema_inicial`), todas as regras de negócio das seções 3/6 aplicadas server-side (Entrada só CAF, Compra/Doação, transferência com lote_origem_id em envio parcial, saída com bloqueio de saldo negativo + FEFO, descarte em 2 etapas, matriz de permissões em `app/api/deps.py`), config do hospital via variável de ambiente, seed script para usuários (cadastro de usuário continua fora do MVP). `SELECT ... FOR UPDATE` usado nos decrementos de saldo para lidar com concorrência (seção 2). JWT com unidade ativa embutida após `/auth/selecionar-unidade`.

**Frontend** (`frontend/`): React + TypeScript + Vite, replica fielmente a paleta/tipografia/layout do protótipo aprovado (`docs/02_PROTOTIPO.html`), incluindo a barra institucional FESFSUS e o letterhead dos relatórios. Toda a visibilidade por perfil vem de `GET /auth/me` (não reimplementa a matriz, reflete o que a API já aplica).

**Divergência resolvida a favor da API real:** o protótipo escondia a tela inteira de Transferência para o Atendente; o backend (regra 4, seção 6) permite Atendente confirmar recebimento — só o envio é restrito. Frontend implementado assim: item de menu "Transferência" visível a todos, painel "Enviar" condicional por perfil, "Confirmar recebimento" sempre visível.

**Pendências:**
1. ~~Teste ponta a ponta com PostgreSQL real~~ — feito (seção 15.5).
2. ~~Exportação em PDF/Excel dos relatórios~~ — feito (2026-08-01): `formato=pdf|excel` nos 4 endpoints de `/relatorios/*`, cabeçalho institucional repetido em toda página do PDF, testado com dados reais (Dipirona 340un × R$2,10 = R$714,00 aparece corretamente no PDF e no Excel exportados). Frontend com os botões "Exportar PDF/Excel" funcionando de verdade (`frontend/src/lib/api.ts` → `baixarArquivo`).
3. ~~Tela de cadastro/edição de medicamentos~~ — feito (2026-08-01): `frontend/src/pages/MedicamentosPage.tsx`, nova rota `/medicamentos` e item de menu "Medicamentos" (some do menu pra Atendente, igual ao padrão de permissão do resto do sistema). Formulário único faz criar e editar; "excluir" é soft-delete via toggle ativo/inativo (preserva a FK de lotes históricos), com filtro "Mostrar inativos" no catálogo. Testado ponta a ponta: cadastrar, editar, desativar, reativar, e confirmado que Atendente não vê o menu nem consegue acessar a URL direta (cai no mesmo `locked-panel` das outras telas).
4. Trocar o `JWT_SECRET_KEY` de exemplo do `.env.example` antes de qualquer uso real — segue pendente (é uma etapa de deploy, não de código; o `.env` local de teste já usa um segredo gerado, só o `.env.example` do repo continua com o placeholder por design).

Nenhuma pendência de funcionalidade restante. Falta só o passo de deploy (item 4) antes de considerar isso pronto para uso real no hospital.

## 17. Revisão de segurança (2026-08-01)

Primeira revisão de segurança de verdade, com tentativa ativa de burlar a matriz de permissões via `curl` direto na API (não só leitura de código). **Matriz de permissões: sólida, nenhuma brecha encontrada** — todo endpoint sensível valida perfil e unidade ativa no servidor a partir do token assinado, nunca de campo solto na requisição; a exportação de relatórios (PDF/Excel) respeita exatamente a mesma checagem do endpoint JSON equivalente.

**Mas a revisão achou 3 bugs funcionais reais, já corrigidos e testados:**

1. **CRÍTICO — Saída, Transferência (enviar e confirmar) e Aprovação de Descarte davam 500 sempre.** Causa: `lazy="joined"` nas relações de `Lote`/`Movimentacao` (`app/models/lote.py`, `app/models/movimentacao.py`) virava `LEFT OUTER JOIN`, e o Postgres recusa `SELECT ... FOR UPDATE` (usado em `get_by_id_for_update()` para a trava de concorrência da seção 2 do doc) sobre uma query com outer join em FK opcional. **O teste ponta a ponta da seção 15.5 só cobriu o fluxo de Entrada — nunca exercitou de fato Saída/Transferência/Descarte-aprovar, que é onde o bug morava.** Corrigido trocando para `lazy="selectin"` (mesmo eager loading, sem JOIN na query principal). Retestado via curl: Saída, Transferência enviar/confirmar e Descarte aprovar agora retornam 200 e decrementam/criam lote corretamente.
2. **Bug funcional relacionado, achado durante o reteste**: ao confirmar uma transferência de lote com origem=compra, o novo lote criado no destino não copiava `numero_nota_fiscal` do lote pai, violando a CHECK constraint (`ck_lotes_nota_fiscal_obrigatoria_compra`) e derrubando a confirmação com 500. Corrigido em `transferencia_service.py` — `numero_nota_fiscal` e `numero_afm` agora são copiados do lote de origem.
3. **ALTA — Texto livre do usuário podia derrubar/deformar a exportação em PDF.** `reportlab.Paragraph` interpreta uma mini-linguagem XML (`<b>`, `<font>` etc.) no texto que recebe; nome de medicamento, setor consumidor ou motivo de descarte com esses caracteres quebrava a exportação (confirmado ao vivo: renomear um medicamento pra incluir `<b>` derrubava `GET /relatorios/estoque-consolidado?formato=pdf` com 500). Corrigido escapando todo texto livre antes de `Paragraph()` em `pdf_exportador.py`. Aproveitado para também blindar o Excel contra "formula injection" (célula começando com `=+-@` sendo interpretada como fórmula ao abrir) em `excel_exportador.py`, achado adicional na mesma rodada.

**Achados menores, sem correção obrigatória agora:**
- Sem rate limit no `/auth/login` — baixo risco dado o contexto (rede interna sem internet), mas um colega tentando adivinhar a senha de outro colega é um cenário real (perfis têm permissões bem diferentes). Considerar `slowapi` ou bloqueio após N tentativas numa próxima rodada.
- `CORS_ORIGINS=*` e token JWT em `localStorage` no frontend: aceitáveis no contexto de rede interna sem internet; registrados como trade-offs a revisitar se o cenário de ameaça mudar (ex. se a rede do hospital deixar de ser isolada).

Auditoria completa e verificada: senha (bcrypt, sem log em texto plano), SQL injection (só ORM, nenhuma interpolação de input de usuário), vazamento de erro (stack trace só no log do servidor, nunca no cliente), JWT (sem fallback inseguro de segredo).

## 18. QA — concorrência, saldo negativo, FEFO e descarte (2026-08-01)

Cenários da seção 4 (responsabilidade do QA) nunca antes testados de verdade. Todos aprovados, com chamadas HTTP reais (inclusive paralelas de verdade via threads sincronizadas, não sequenciais):

1. **Concorrência real**: 5 requisições de Saída simultâneas no mesmo lote (100 unidades, 60 cada — só uma pode passar). Resultado: 1 aceita, 4 rejeitadas com erro claro, saldo final exatamente `100-60=40`, nenhum saldo negativo, nenhuma dupla-aceitação. Confirma sob carga real que o fix da seção 17 (`lazy="selectin"` + `SELECT FOR UPDATE`) sustenta a proteção de concorrência que o design sempre previu (seção 2).
2. **Saldo negativo direto**: pedido de saída maior que o saldo disponível → 400 com mensagem clara, saldo inalterado.
3. **FEFO**: 3 lotes do mesmo medicamento (validade distante, próxima, e um já vencido) — ordenação por validade ascendente correta, `sugerido_fefo` marcado no lote mais próximo de vencer mesmo já vencido (FEFO não filtra vencido, só ordena, como especificado).
4. **Descarte com saldo alterado entre solicitação e aprovação**: saldo reduzido por uma Saída depois da solicitação de descarte → aprovação bloqueada com 400 claro, saldo não fica negativo.

Nenhum bug novo encontrado. Dados de teste (2 medicamentos) desativados após o teste; lotes/movimentações de teste ficaram no banco por design (trilha de auditoria não se apaga), sem impacto em fluxos normais.

**Status: sem pendências de funcionalidade, segurança ou QA conhecidas.** Falta só o passo de deploy real no hospital (trocar `JWT_SECRET_KEY`, instalar no servidor definitivo, configurar backup agendado).

## 20. Deploy de protótipo — Render + Neon (2026-08-13)

Fase temporária, sem custo (plano free dos dois), pra uso pessoal enquanto o sistema ainda é protótipo — não é a arquitetura de produção (essa continua sendo servidor local, `docs/03_DEPLOY.md`).

- **Backend**: Render, via Blueprint (`render.yaml` na raiz do repo) — builda e roda `alembic upgrade head` automaticamente a cada deploy. URL: `https://estoquefarmacia-6b49d5.onrender.com`.
- **Banco**: Neon (Postgres serverless free). Migrations e os 3 usuários de teste (mesmos do ambiente local: `joao.souza`/coordenador, `ana.ribeiro`/farmaceutico, `carlos.moreira`/atendente, senha `Senha123!`) já aplicados.
- **Frontend**: Vercel, projeto `estoque-a9697852` (nome aleatório de propósito — "URL secreta", só o usuário sabe). URL: `https://estoque-a9697852.vercel.app`.
- **Limitação aceita**: instância free do Render "dorme" após inatividade — primeiro acesso depois de um tempo parado pode demorar até ~50s (cold start). Sem região no Brasil disponível no Render (só Oregon, Ohio, Virginia, Frankfurt, Singapura) — Oregon foi usada, latência mais alta mas aceitável pra uso pessoal de protótipo.

**Bugs encontrados e corrigidos durante este deploy** (só apareceram testando o ambiente publicado de verdade, não existiam ou não tinham sido notados no ambiente local):
1. **404 em qualquer rota direta no Vercel** (`/login`, refresh de página, etc.) — faltava `frontend/vercel.json` com rewrite pra SPA (`{"source": "/(.*)", "destination": "/index.html"}`). Mesmo problema que o `try_files` do nginx já resolvia no deploy local — Vercel precisa da própria config.
2. **Rótulo de perfil errado na tela de seleção de unidade** (`LoginPage.tsx`) — Coordenador aparecia como "Farmacêutico". Ternário binário (`atendente` vs tudo mais) nunca tratava coordenador como caso próprio; trocado pelo `labelPerfil()` já usado em todo o resto do app.

## 19. Identidade visual — paleta oficial FESFSUS aplicada (2026-08-03/04)

Nova direção de identidade documentada em `docs/04_IDENTIDADE_VISUAL.md` (+ `.html` de referência viva dos tokens + `.docx`): a paleta do produto deixou de ser o verde-salva do protótipo original e passou a derivar das 5 cores oficiais do Manual de Marca FESFSUS (roxo, lis, verde-água, menta, cinza), suavizadas em tom pastel para uso denso de tela — as cores cheias da marca continuam intactas só na barra institucional, na régua de 4 cores e no letterhead dos relatórios, como manda o manual. `frontend/src/index.css` já veio com os tokens da nova paleta aplicados (confirmado 1:1 contra o doc, claro e escuro).

Também: cada unidade (CAF/UTI/Centro Cirúrgico/Emergência) ganhou uma cor de identificação (rail de 3px na borda esquerda), derivada da régua de 4 cores da marca — implementado em 2026-08-04 no `session-card` da sidebar (`Layout.tsx`) e no painel de lotes da tela Estoque atual (`EstoquePage.tsx`), via helper `classeRailUnidade()` em `lib/formato.ts`. Cor nunca é a única pista — nome da unidade sempre visível ao lado, por design (seção 4 do doc de identidade).

**Bug real encontrado e corrigido ao aplicar**: as classes `.rail-*` existiam no CSS mas nunca apareciam visualmente — `.panel`/`.session-card` definem `border` (shorthand, mesma especificidade) mais abaixo no arquivo, então venciam o empate de cascata e resetavam a borda esquerda de volta pra cor de linha padrão, em silêncio (sem erro, sem warning). Corrigido movendo o bloco `.rail-*` para o fim do arquivo CSS — comentário deixado no código pra não repetir o erro. Confirmado visualmente (screenshot + inspeção de `getComputedStyle`) em CAF (roxo) e UTI (lis), claro e escuro.

**Pendências da identidade visual (registradas no próprio `04_IDENTIDADE_VISUAL.md`, não bloqueiam uso)**: fonte De Rotterdam (licenciada FESF, precisa do arquivo da ASCOM) e logotipos vetoriais do SUS/Governo da Bahia para completar a régua de assinatura de 4 marcas no letterhead — ambos fora do escopo até os arquivos chegarem.

**Nota**: `docs/02_PROTOTIPO.html` (protótipo estático aprovado em 2026-07-31) ficou desatualizado em relação a esta nova paleta — é histórico, não voltar a usar como referência visual; a referência atual é `04_IDENTIDADE_VISUAL.md`/`.html` + o app React de verdade.

## 19. Identidade visual unificada sob a paleta FESFSUS (2026-08-03)

Cliente enviou o arquivo oficial `Manual de Aplicação de Marca - FESFSUS - 2024.pdf` (23 páginas) e pediu um projeto de identidade visual completo e documentado para o sistema, usando a paleta da FESF suavizada em tom pastel — substituindo o verde-salva usado até aqui como cor própria do produto (seção 7, 16).

**Decisão:** a paleta inteira do produto (não só a barra institucional) passou a ser derivada das 5 cores oficiais do manual (`#61358c` roxo, `#7572a7` lis, `#79bfb4` verde-água, `#73d9a8` menta, `#575756` cinza), com saturação reduzida e luminosidade calibrada para uso denso de tela — todos os pares texto/fundo verificados contra WCAG AA (≥4,5:1). Âmbar e terracota foram mantidos como cores de status (atenção/erro) por não existir equivalente na paleta FESF e por semáforo de status precisar de cores reconhecíveis como tal — decisão registrada e justificada em `docs/04_IDENTIDADE_VISUAL.md`. As 5 cores oficiais continuam intactas (sem suavização) na barra institucional, na régua de 4 cores e no letterhead de relatórios, como exige o manual de marca.

Novidade proposta nesta rodada: as 4 cores da régua institucional (que coincidem em número com as 4 unidades do hospital) foram atribuídas cada uma a uma unidade — CAF/roxo, UTI/lis, Centro Cirúrgico/verde-água, Emergência/menta — como rail de contexto (borda esquerda de 3px em cards). Classes CSS já existem (`.rail-caf`, `.rail-uti`, `.rail-cc`, `.rail-emerg`); aplicação nos componentes de tela fica pendente (ver seção 12 do documento de identidade).

Também confirmado: a régua de assinatura institucional do manual de marca (Serviço → FESF → SUS → Governo do Estado) já tem o exemplo pronto para este hospital na página 13 do manual oficial — `Hospital Materno-Infantil Dr. Joaquim Sampaio · FESFSUS · SUS · Governo do Estado (Bahia)`. Registrado como o padrão a seguir no letterhead de relatórios; falta só os arquivos vetoriais dos logotipos do SUS e do Governo da Bahia para completar a régua de 4 marcas (hoje o letterhead mostra só texto de organização + hospital).

`frontend/src/index.css` atualizado com os novos tokens (mesma estrutura de variáveis, só os valores mudaram — nenhum componente ou layout foi tocado). Build de produção não pôde ser confirmado neste ambiente por incompatibilidade da biblioteca nativa `lightningcss` com o sandbox Linux usado nesta sessão (o projeto foi instalado em Windows); a compilação chegou a transformar os 41 módulos do frontend sem erro antes de falhar num binário nativo — recomenda-se rodar `npm run build` no ambiente normal do projeto antes do próximo deploy.

Entregáveis: `docs/04_IDENTIDADE_VISUAL.md` (fonte), `docs/04_IDENTIDADE_VISUAL.docx` (manual formatado) e `docs/04_IDENTIDADE_VISUAL.html` (guia de estilo vivo, com os tokens reais aplicados).
