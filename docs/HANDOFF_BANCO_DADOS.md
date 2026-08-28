# Handoff — Finalizar configuração do banco de dados

Contexto para retomar em uma **nova sessão do Claude Code**, nesta mesma pasta
(`C:\Users\odlaoralmeida\Desktop\ESTOQUE FARMACIA`). Escrito em 2026-08-21 ao
final de uma sessão de implantação local de teste.

**ATUALIZAÇÃO (2026-08-21, mesmo dia):** os dois bloqueios abaixo (Postgres e
`cmd.exe`) foram **resolvidos** — o usuário rodou Windows Update na máquina,
o que corrigiu o `ucrtbase.dll` desatualizado. PostgreSQL 17 portátil agora
roda normalmente. Detalhes no fim do documento, seção "Resolução".

## Objetivo original

Seguir `docs/03_DEPLOY.md` para testar a implantação localmente nesta máquina
**antes** de ir para o servidor oficial do hospital — Postgres de verdade,
`.env` de produção, migrations, backend como serviço (NSSM), frontend
buildado.

## Decisão do cliente (2026-08-21, durante a sessão)

A pasta do projeto será **copiada integralmente para o computador oficial do
servidor**, e é **lá** que o PostgreSQL será instalado de verdade. Ou seja:
esta máquina atual serve só para preparar o código (dependências, build,
configuração) — não precisa necessariamente rodar o Postgres nela para
concluir a preparação. A decisão de como validar o fluxo de banco fica em
aberto (ver "Bloqueio" abaixo).

**Importante:** o IP `10.10.28.254` foi cogitado como IP provisório do
servidor e depois **descartado explicitamente pelo cliente** ("não usa esse
IP") — não usar esse valor em lugar nenhum. O `frontend/.env` está com
`VITE_API_BASE_URL=http://localhost:8000` como placeholder até haver um IP
definitivo.

## O que já está pronto nesta máquina

- **Python 3.12.10** instalado em
  `C:\Users\odlaoralmeida\AppData\Local\Programs\Python\Python312\python.exe`
  (pode não estar no PATH de sessões antigas do PowerShell — numa sessão nova
  deve funcionar `python` direto; se não, usar o caminho completo).
- **Node.js 24.19.0 / npm 11.17** instalados em
  `C:\Program Files\nodejs\` (usar `npm.ps1` em vez de `npm.cmd`/`npm` — ver
  "Bloqueio 2" abaixo).
- **NSSM 2.24** instalado (via winget), binário em:
  `C:\Users\odlaoralmeida\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe`
  (fora do PATH; usar caminho completo ou adicionar ao PATH).
- **Backend** (`backend/`):
  - `.venv/` criado, todas as dependências de `requirements.txt` instaladas.
  - `.env` criado com `JWT_SECRET_KEY` gerado nesta sessão, `HOSPITAL_NOME`/
    `HOSPITAL_ORGANIZACAO` já corretos (Hospital Materno Infantil Dr. Joaquim
    Sampaio / FESFSUS). `DATABASE_URL` está com um placeholder apontando
    para `estoque_farmacia`/`localhost:5432` com uma senha gerada nesta
    sessão — **não usar esses segredos no servidor real**, gerar novos lá
    (checklist do `docs/03_DEPLOY.md`, item 0, é explícito sobre isso).
- **Frontend** (`frontend/`):
  - `npm install` feito (0 vulnerabilidades, `npm audit fix` já rodado).
  - `.env` com `VITE_API_BASE_URL=http://localhost:8000` (placeholder).
  - `npm run build` executado com sucesso — `frontend/dist/` existe e está
    atualizado com esse placeholder. **Lembrar**: o Vite grava a URL da API
    dentro dos arquivos estáticos em tempo de build — se o IP do servidor
    mudar, precisa rebuildar (`npm run build`) de novo, não é configurável
    em runtime.
- Repositório atualizado (`git pull`) — inclui as migrations `0007` a `0010`
  (solicitação de transferência, medicamento controlado, saída destinatário,
  usuário trocar senha).

## Bloqueio 1 — PostgreSQL não roda nesta máquina (bug de sistema)

Testado exaustivamente e **reproduzido de forma determinística**:

- `initdb` do **PostgreSQL 17 portátil** (zip de binários, sem instalador)
  trava com `STATUS_STACK_BUFFER_OVERRUN` (0xc0000409).
- O **instalador oficial do PostgreSQL 17** (via winget) também falha —
  primeiro tentando UAC (cancelado automaticamente, sem desktop interativo
  disponível pro Claude Code aprovar), depois com `dangerouslyDisableSandbox`
  (exit code genérico 1, sem log — o instalador nem chega a rodar de fato).
- Testado também com **PostgreSQL 14 portátil** (versão mínima exigida pelo
  projeto) — **mesmo crash idêntico**.
- Isolado ao extremo: até `initdb --show` (só detecta o locale do sistema,
  sem escrever nada em disco) já trava, mesmo com I/O totalmente redirecionado
  para arquivo via `Start-Process` (sem console envolvido).
- Confirmado no **Visualizador de Eventos do Windows** (Log de Aplicativos):
  módulo com falha é `C:\Windows\System32\ucrtbase.dll`, versão
  **10.0.19041.789** (de ~2020) — indica que esta instalação do Windows não
  recebe atualizações há muito tempo.
- Tentativas de contorno que **não resolveram**: `--locale=C`,
  `--no-locale`/`--auth=trust`, forçar `$env:LANG`/`$env:LC_ALL=en-US`.

**Diagnóstico:** não é um bug do PostgreSQL — é uma incompatibilidade real
entre os binários modernos do Postgres (14 e 17, toolchains diferentes, mesmo
resultado) e o C Runtime do Windows desatualizado/corrompido nesta máquina
específica.

**Opções não exploradas ainda** (ficaram em aberto quando o cliente decidiu
pausar):
1. Reparar o Windows desta máquina (`sfc /scannow`, `DISM
   /Online /Cleanup-Image /RestoreHealth`, Windows Update) — precisa de
   admin, e como o UAC é cancelado automaticamente nesta sessão do Claude
   Code, **precisa ser rodado pelo próprio usuário** numa janela elevada
   dele.
2. Usar um Postgres na nuvem (ex. Neon, já usado no protótipo — ver
   `docs/00_PROJETO.md` seção 20) só para validar migrations/fluxo
   localmente, já que o Postgres real vai rodar no servidor oficial mesmo.
3. Não se preocupar em rodar Postgres nesta máquina — já que a pasta será
   copiada para o servidor oficial, deixar a instalação do Postgres (e o
   teste de ponta a ponta) para acontecer diretamente lá, presumindo que
   aquela máquina não tem o mesmo problema de sistema.

**Quando retomar, a primeira pergunta a fazer ao usuário é: qual dessas 3
opções ele quer seguir agora.**

## Bloqueio 2 (relacionado, já contornado) — `cmd.exe` 64-bit ausente

`C:\Windows\system32\cmd.exe` **não existe** nesta máquina (confirmado via
`Test-Path`), mas a cópia de 32-bit em `C:\Windows\SysWOW64\cmd.exe` está
intacta. Isso quebra qualquer `npm run <script>` que use `&&` (precisa de um
shell), porque o Windows tenta usar o `ComSpec` padrão (64-bit, ausente).

**Contorno usado com sucesso** — setar isso na mesma sessão/comando antes de
rodar npm:

```powershell
$env:ComSpec = "C:\Windows\SysWOW64\cmd.exe"
$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
& "$env:ProgramFiles\nodejs\npm.ps1" run build
```

Provavelmente é sintoma da mesma corrupção de sistema do Bloqueio 1 — reparar
o Windows resolveria os dois de uma vez.

## Próximos passos (depois que a decisão do Bloqueio 1 for tomada)

Assumindo que já existe um Postgres acessível (local reparado, Neon, ou já no
servidor oficial) e `backend/.env` com `DATABASE_URL` apontando pra ele:

```powershell
Set-Location "C:\Users\odlaoralmeida\Desktop\ESTOQUE FARMACIA\backend"
.venv\Scripts\python.exe -m alembic upgrade head

# criar o primeiro usuário coordenador (bootstrap único — depois disso,
# cadastro de usuário é pela própria tela Usuários do sistema)
.venv\Scripts\python.exe scripts\seed_usuarios.py --nome "Nome Completo" `
    --login usuario.login --senha "SenhaTemporariaForte!" `
    --perfil coordenador --crf 12345-SP
```

Depois: subir o backend (`uvicorn app.main:app --host 0.0.0.0 --port 8000`)
pra testar manualmente, e só então formalizar como serviço NSSM
(`docs/03_DEPLOY.md` seção 3 tem os comandos exatos). Frontend: servir
`frontend/dist/` (IIS ou nginx pra Windows — seção 4 do mesmo doc).

## Resolução (2026-08-21, mesmo dia)

O usuário rodou as atualizações do Windows na máquina (Windows Update) —
`cmd.exe` 64-bit voltou a existir, e `ucrtbase.dll` atualizou de
`10.0.19041.789` para `10.0.19041.3636` (build do Windows: 19042 → 19045).
PostgreSQL 17 portátil, testado de novo, funcionou sem crash.

**O que foi feito depois disso, nesta mesma sessão:**

1. **Postgres 17 portátil inicializado e rodando** em
   `C:\Users\odlaoralmeida\Desktop\pgportable\` (`initdb -E UTF8`,
   `pg_ctl start`, porta 5432). Banco `estoque_farmacia` e usuário dedicado
   criados (senhas geradas nesta sessão, já refletidas em `backend/.env`).
2. **Bug real encontrado e corrigido na migration `0003_carrinhos_emergencia`**:
   ela assumia que as 4 unidades padrão (CAF/UTI/Centro Cirúrgico/Emergência)
   já existiam no banco, mas `docs/03_DEPLOY.md` manda rodar
   `alembic upgrade head` **antes** de `scripts/seed_usuarios.py` (que é
   quem cria essas unidades) — instalação nova, do zero, sempre quebraria
   nesse ponto. Corrigido: a migration agora garante essas 4 unidades ela
   mesma (INSERT se não existirem) antes de criar os carrinhos. Testado:
   `alembic upgrade head` roda limpo do zero até a `0010`.
3. **Primeiro usuário Coordenador criado**: login `ananda.carvalho` (Ananda
   Luiza Silva Carvalho, CRF 13746-BA). Senha temporária inicial trocada no
   primeiro login (fluxo obrigatório, testado ao vivo no navegador).
4. **Bug de CSS real encontrado e corrigido**: o popup de alertas de estoque
   (`NotificacaoEstoquePopup`) é filho JSX de `.topbar` (barra institucional
   roxa), que define `color: #f7f3fa` (quase branco) para contraste com o
   roxo. Mesmo o popup sendo `position: fixed` (tela cheia), ele herdava
   essa cor branca por estar aninhado no DOM dentro da topbar — texto
   ilegível sobre o fundo claro do modal. Corrigido adicionando
   `color: var(--ink)` em `.modal-card` (`frontend/src/index.css`), que
   reseta a herança e usa o token correto (claro/escuro). Confirmado via
   `getComputedStyle` no navegador, antes e depois do fix.
5. Testado ponta a ponta no navegador: login → troca de senha obrigatória →
   seleção de unidade (CAF) → tela principal carregando dados reais do
   Postgres local → popup de alertas com cor corrigida.

## Achado importante — conta sem admin local + domínio com confiança quebrada (2026-08-24)

Ao tentar instalar o serviço NSSM do backend, descobrimos por que a
elevação (UAC) nunca funciona nesta máquina: a conta usada
(`maternidade\odlaoralmeida`) é uma **conta de domínio**, e o grupo local
`Administradores` desta máquina só tem `Administrador` (conta local
embutida) e `SESAB` como membros — **`odlaoralmeida` não é admin local**,
mesmo sabendo a própria senha.

Além disso, `net localgroup Administrators` devolveu **"Falha na relação de
confiança entre esta estação de trabalho e o domínio primário"** — a máquina
perdeu a sincronia de confiança com o domínio `maternidade`. Isso
provavelmente é a causa raiz (ou contribui) para os outros problemas de
sistema encontrados nesta sessão (Windows sem receber atualizações havia
anos, `cmd.exe` 64-bit ausente) — políticas de domínio (incluindo Windows
Update via GPO) param de aplicar direito quando essa confiança quebra.

**Decisão do usuário**: pular o NSSM por agora (backend segue como processo
comum, `Start-Process` manual, não sobrevive a reboot) — resolver isso é
trabalho de TI/infraestrutura do hospital (rejoin no domínio, ou obter a
senha do `Administrador` local), não algo pra resolver por dentro do Claude
Code. Retomar o NSSM quando o acesso admin for resolvido, ou já fazer isso
direto na máquina do servidor oficial (que pode não ter o mesmo problema).

**Pendente ainda:**
- ~~IP definitivo do servidor~~ — confirmado pelo usuário: `10.10.28.254`.
  `frontend/.env` (`VITE_API_BASE_URL=http://10.10.28.254:8000`) e
  `frontend/dist/` já foram rebuildados com esse valor.
- `pg_hba.conf` do Postgres local **não foi ajustado** para liberar essa
  faixa de rede (`docs/03_DEPLOY.md` seção 2) — não fizemos isso porque o
  Postgres real vai rodar direto na máquina do servidor oficial, não nesta;
  ajustar lá, não aqui.
- NSSM (serviço do backend) ainda não configurado nesta máquina — o
  usuário esclareceu que o Postgres real e a instalação como serviço vão
  acontecer na máquina oficial do servidor; esta máquina serve pra preparar
  o código. Ver seção "Como copiar a pasta" mais acima na conversa (não
  registrada neste arquivo ainda).
- Dados de teste usados para validar o popup (medicamento "Dipirona (TESTE
  UI)", lotes "TESTE-VENCIDO"/"TESTE-AMARELO") foram desativados
  (`ativo=false`), mas os lotes/movimentações continuam no banco por design
  (trilha de auditoria não se apaga). Se for usar este mesmo banco Postgres
  local como base pro servidor real, considerar recriar do zero em vez de
  copiar este banco de teste.
