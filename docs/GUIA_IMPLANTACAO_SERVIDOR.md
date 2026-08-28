# Guia prático de build e implantação — máquina oficial do servidor

Passo a passo real, na ordem certa, para quando a pasta do projeto for
copiada para o computador definitivo do servidor do hospital. Baseado no
`docs/03_DEPLOY.md` (referência oficial/genérica) + tudo que foi validado
na prática durante a rodada de teste local (2026-08-21/24) — inclui os
problemas reais encontrados e como evitá-los de novo.

**Portas deste sistema no servidor**: já existem outros 2 apps usando
8000/8001 (backend) e 80/8080 (frontend) nesta máquina — este sistema usa
**8002** (backend) e **8081** (frontend). Todo comando/config abaixo já
está com essas portas.

**Convenção usada neste guia**: cada bloco de comando tem uma etiqueta
antes dizendo exatamente onde rodar:
- 🟢 **Janela comum** — PowerShell normal, sem "Executar como
  administrador". A maioria dos comandos é assim.
- 🔴 **Janela como Administrador** — clique direito no ícone do
  PowerShell → "Executar como administrador", aprovar o UAC. Só 2 pontos
  do guia inteiro precisam disso (instalar o PostgreSQL, instalar o
  serviço NSSM) — em todo o resto, rodar como admin não muda nada e só
  arrisca confundir qual sessão/PATH está ativo.

## 0. Antes de começar — checklist da máquina

🟢 **Janela comum.** Rodar estas 4 verificações antes de instalar
qualquer coisa. Na máquina de teste local, os itens 2 e 3 falharam e
custaram boa parte da sessão até serem descobertos.

```powershell
# 1. A conta que vai fazer a instalação é admin local de verdade?
whoami
net localgroup Administradores    # a conta precisa aparecer na lista

# 2. cmd.exe (64-bit) existe? (se não existir, npm/instaladores quebram)
Test-Path C:\Windows\system32\cmd.exe

# 3. Windows está atualizado? (ucrtbase.dll desatualizado quebra o
#    instalador do PostgreSQL com STATUS_STACK_BUFFER_OVERRUN)
(Get-Item C:\Windows\System32\ucrtbase.dll).VersionInfo.FileVersion
# Se der para comparar com outra máquina saudável e a versão for muito
# mais antiga, rodar Windows Update antes de seguir.

# 4. Máquina está no domínio, sem relação de confiança quebrada?
net localgroup Administrators 2>&1 | Select-String "confiança"
# Se aparecer "Falha na relação de confiança", chamar o TI antes de
# continuar — isso trava atualização do Windows e outras coisas.
```

Se a conta usada não aparecer no grupo de Administradores no item 1,
**parar aqui** e resolver com o TI antes de seguir para o passo 2 — sem
admin de verdade, o instalador oficial do PostgreSQL e o NSSM não
funcionam (não tem contorno viável para produção real).

## 1. Copiar a pasta do projeto

🟢 **Janela comum** (ou só copiar pelo Explorer/rede, sem terminal
nenhum). Copiar a pasta inteira **exceto**:

- `backend/.venv/` — recriar do zero na máquina nova (ambiente virtual
  Python tem caminho absoluto embutido, não é portável).
- `frontend/node_modules/` — só necessário para rebuildar; se for usar o
  `frontend/dist/` já pronto, nem precisa reinstalar.
- `backend/.env` e `frontend/.env` — **não copiar os valores da máquina de
  teste**. Gerar segredos novos no passo 3.

## 2. Instalar PostgreSQL de verdade (com instalador oficial, não portátil)

🔴 **Janela como Administrador** só para rodar o instalador (passos 1-4
abaixo). Diferente do ambiente de teste local (que usou a versão portátil
em zip por falta de admin), aqui usar o instalador oficial normal:

1. Baixar em `postgresql.org/download/windows` (versão 17, ou qualquer
   14+).
2. Rodar o instalador (vai pedir UAC — aprovar).
3. Definir senha forte do usuário `postgres` (gerar antes, numa janela
   comum: `python -c "import secrets; print(secrets.token_urlsafe(24))"`
   — guardar num cofre de senhas, não em texto plano em lugar nenhum).
4. Porta padrão `5432`, locale padrão, encoding **UTF8** (conferir na
   tela de resumo antes de finalizar — o padrão às vezes vem como
   `WIN1252` dependendo do locale do Windows, e o sistema tem acentuação
   em português o tempo todo).

🟢 **Janela comum** a partir daqui — criar o banco e o usuário dedicado
da aplicação (nunca usar o superusuário `postgres` direto no
`DATABASE_URL` de produção). Rodar via `psql` (não precisa de admin,
só da senha do `postgres` definida acima):

```sql
CREATE USER estoque_farmacia WITH PASSWORD 'senha-forte-gerada-aqui';
CREATE DATABASE estoque_farmacia OWNER estoque_farmacia;
```

Ajustar `pg_hba.conf` (arquivo de texto comum, editar com qualquer
editor, não precisa de admin a menos que o arquivo esteja em
`Program Files` com permissão restrita — nesse caso abrir o editor como
Administrador só para salvar) para aceitar conexões da rede interna do
hospital (trocar pela faixa real):

```
host    estoque_farmacia    estoque_farmacia    10.10.28.0/24    scram-sha-256
```

## 3. Backend

🟢 **Janela comum.**

```powershell
cd "C:\caminho\ESTOQUE FARMACIA\backend"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Editar `.env` com valores **novos** (nunca os da máquina de teste):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://estoque_farmacia:<senha-do-passo-2>@localhost:5432/estoque_farmacia` |
| `JWT_SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` — gerar um novo aqui, nunca reaproveitar |
| `HOSPITAL_NOME` | `Hospital Materno Infantil Dr. Joaquim Sampaio` |
| `HOSPITAL_ORGANIZACAO` | `FESFSUS` |
| `CORS_ORIGINS` | `*` (aceitável — rede interna sem internet, ver revisão de segurança `docs/00_PROJETO.md` seção 17) |

🟢 **Janela comum.** Migrations e primeiro usuário Coordenador:

```powershell
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe scripts\seed_usuarios.py --nome "Nome Completo" --login usuario.login --senha "SenhaTemporariaForte!" --perfil coordenador --crf 12345-SP
```

A migration `0003_carrinhos_emergencia` já foi corrigida (2026-08-21) para
criar as 4 unidades padrão sozinha — `alembic upgrade head` funciona limpo
numa instalação nova, sem precisar rodar o seed antes.

### Usuário Admin global (2026-08-27)

Perfil separado do Coordenador — só acessa a tela **Usuários** (não opera
estoque, não seleciona unidade). Não é obrigatório pro bootstrap (o
Coordenador já consegue cadastrar gente pela tela Usuários), mas se quiser
criar já de saída, o mesmo script serve — `--crf` não se aplica a esse
perfil, pode omitir:

```powershell
.venv\Scripts\python.exe scripts\seed_usuarios.py --nome "Administrador" --login admin.farmacia --senha "SenhaTemporariaForte!" --perfil admin
```

Troca de senha obrigatória no primeiro login, igual qualquer usuário novo.
Se preferir, crie depois pela própria tela Usuários, logado como
Coordenador — não precisa ser feito no bootstrap.

Se houver uma planilha de estoque já existente para importar (catálogo +
saldo inicial), ver `docs/IMPORTACAO_ESTOQUE_INICIAL.md` — script pronto,
com as colunas exatas que a planilha precisa ter. Os 25 carrinhos de
emergência do hospital (carros + kits hemorrágicos + maletas) já vêm
cadastrados sozinhos pelo `alembic upgrade head` acima — não precisa
recriar nenhum manualmente; a planilha de importação só precisa acertar
o nome exato de cada um na coluna `unidade` (lista completa no doc de
importação).

### Serviço do backend (NSSM) — porta 8002

🔴 **Janela como Administrador** — os 3 comandos abaixo recusam com
"Administrator access is needed" numa janela comum, sem sequer tentar
abrir um prompt de UAC (diferente de instaladores comuns, não adianta só
confirmar depois — a janela inteira precisa já estar elevada antes de
rodar).

```powershell
# instalar NSSM (se ainda não tiver): winget install NSSM.NSSM
nssm install EstoqueFarmaciaAPI "C:\caminho\ESTOQUE FARMACIA\backend\.venv\Scripts\uvicorn.exe" "app.main:app --host 0.0.0.0 --port 8002"
nssm set EstoqueFarmaciaAPI AppDirectory "C:\caminho\ESTOQUE FARMACIA\backend"
nssm start EstoqueFarmaciaAPI
```

🟢 **Janela comum** para verificar depois: `Get-Service EstoqueFarmaciaAPI`
deve mostrar `Running`, e `http://localhost:8002/docs` deve responder
mesmo sem nenhum terminal aberto.

## 4. Frontend — porta 8081

🟢 **Janela comum**, do início ao fim desta seção.

```powershell
cd "C:\caminho\ESTOQUE FARMACIA\frontend"
copy .env.example .env
```

Editar `frontend/.env` com o **IP real do servidor** e a porta 8002 do
backend (não `localhost` — é o navegador de cada estação, não o
servidor, que faz essa chamada):

```
VITE_API_BASE_URL=http://10.10.28.254:8002
```

```powershell
npm install
npm run build
```

Isso gera `frontend/dist/` — arquivos estáticos prontos. **Se o IP ou a
porta mudar depois**, é preciso editar o `.env` e rodar `npm run build`
de novo — o Vite grava o valor dentro dos arquivos em tempo de build, não
é lido em runtime.

Servir `dist/` na porta 8081 com IIS ou nginx para Windows — configuração
mínima nginx:

```nginx
server {
    listen 8081;
    root C:/caminho/ESTOQUE FARMACIA/frontend/dist;
    location / {
        try_files $uri /index.html;
    }
}
```

⚠️ **Atenção — nginx sozinho NÃO sobrevive a reboot.** Diferente do IIS
(que roda como o serviço do Windows `W3SVC`, já configurado para iniciar
sozinho), o `nginx.exe` para Windows é só um executável — se você rodar
`start nginx` manualmente, ele para de responder na próxima vez que o
servidor reiniciar, do mesmo jeito que o backend fazia antes do NSSM. Se
for usar nginx, tem que registrar ele **também** como serviço, com o
mesmo NSSM já usado para o backend (🔴 **janela como Administrador**):

```powershell
nssm install EstoqueFarmaciaFrontend "C:\caminho\nginx\nginx.exe"
nssm set EstoqueFarmaciaFrontend AppDirectory "C:\caminho\nginx"
nssm start EstoqueFarmaciaFrontend
```

Se for IIS: criar um novo site (não usar o site padrão da porta 80, que já
está ocupado por outro app) com binding na porta `8081`, apontando para
`frontend/dist`, e adicionar `web.config` com o rewrite de SPA
equivalente ao `try_files` acima. Não precisa de NSSM — o IIS já cuida
disso pelo `W3SVC`.

**Se `npm run build` falhar** com `spawn C:\Windows\system32\cmd.exe
ENOENT`: 🟢 ainda janela comum, não precisa de admin para o contorno —
o `cmd.exe` de 64-bit está faltando no sistema (sintoma de Windows
corrompido/desatualizado, ver checklist item 0.2):

```powershell
$env:ComSpec = "C:\Windows\SysWOW64\cmd.exe"  # só se a versão 32-bit existir
npm run build
```

Mas o certo é resolver a causa raiz (Windows Update, item 0.3 — isso
precisa do TI/admin) e não depender desse contorno numa máquina de
produção.

## 5. Rede e firewall

🔴 **Janela como Administrador** — regra de firewall exige elevação.

Liberar no firewall do servidor, **só para a sub-rede interna do
hospital**:
- Porta **8002** (backend deste sistema)
- Porta **8081** (frontend deste sistema)

🟢 **Janela comum** para testar de uma estação cliente qualquer:
`http://10.10.28.254:8081` deve mostrar a tela de login.

## 6. Backup diário

🟢 **Janela comum** para tudo desta seção — agendamento básico do
próprio usuário não precisa de admin.

Script pronto e testado: `backend/scripts/backup_diario.ps1` (ajustar o
caminho do `pg_dump.exe` da instalação oficial — no ambiente de teste
apontava para a versão portátil, no servidor real vai ser
`C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`, e a senha do usuário
`estoque_farmacia` também precisa ser trocada pela do passo 2).

**Importante — diferente do que foi feito na máquina de teste**: o
`docs/03_DEPLOY.md` (seção 6) recomenda o destino do backup ser um disco
ou pasta de rede **separada** do servidor principal, não a própria pasta
do projeto — se o servidor falhar fisicamente, o backup não pode estar
junto. Ajustar `$backupDir` no script antes de agendar de verdade.

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\caminho\ESTOQUE FARMACIA\backend\scripts\backup_diario.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At "19:00"
Register-ScheduledTask -TaskName "EstoqueFarmacia_BackupDiario" -Action $action -Trigger $trigger -Description "Backup diario do banco Postgres" -Force
```

Testar a restauração pelo menos uma vez antes de confiar no backup
(`docs/03_DEPLOY.md` seção 6 — "um backup nunca testado é uma suposição,
não uma garantia").

## 7. Garantir que tudo sobe sozinho depois de um reboot

🟢 **Janela comum** para as checagens abaixo. Os 3 componentes precisam
sobreviver a um reboot **sem ninguém logar** — é a diferença entre um
servidor de verdade e um ambiente de teste manual como o desta sessão.

```powershell
# PostgreSQL (instalador oficial já registra como serviço Automático —
# só confirmar; o nome exato do serviço varia com a versão)
Get-Service -Name "postgresql*" | Select-Object Name, Status, StartType

# Backend (NSSM)
Get-Service -Name "EstoqueFarmaciaAPI" | Select-Object Name, Status, StartType

# Frontend — só se estiver usando nginx via NSSM (seção 4). Se for IIS,
# checar o serviço W3SVC no lugar.
Get-Service -Name "EstoqueFarmaciaFrontend" -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType
Get-Service -Name "W3SVC" -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType
```

Todos precisam mostrar `StartType: Automatic`. Se algum vier
`Manual`, corrigir (backend/frontend via NSSM, 🔴 **janela como
Administrador**):

```powershell
nssm set EstoqueFarmaciaAPI Start SERVICE_AUTO_START
nssm set EstoqueFarmaciaFrontend Start SERVICE_AUTO_START   # se usar nginx
```

Para o PostgreSQL, se vier `Manual`: `Set-Service -Name "<nome-do-serviço>" -StartupType Automatic` (🔴 admin).

**O teste que realmente importa**: reiniciar o servidor de verdade (não só
parar/iniciar os serviços manualmente) e, sem logar em nenhuma conta,
esperar 1-2 minutos e confirmar de uma estação cliente que
`http://10.10.28.254:8081` carrega a tela de login normalmente. Só isso
prova que o boot automático funciona — checar `StartType` sozinho não
garante que o serviço realmente sobe limpo (ex.: se o backend tentar subir
antes do PostgreSQL estar pronto e falhar o primeiro connect). Se isso
acontecer, o NSSM tem uma opção de "retry"/atraso de início
(`nssm set EstoqueFarmaciaAPI AppExit Default Restart` já é o padrão —
o serviço tenta de novo sozinho se cair na primeira tentativa).

## 8. Validação final

🟢 **Janela comum** para tudo (login pelo navegador, checagem de
serviço).

- Login de cada perfil (Coordenador/Farmacêutico/Atendente).
- Uma Entrada, uma Saída, uma Transferência, um Descarte/Ajuste.
- Popup de alertas de estoque abrindo com texto legível (bug de cor
  corrigido em 2026-08-21 — `frontend/src/index.css`, `.modal-card`).
- Confirmar que os outros 2 apps (portas 8000/8001/80/8080) continuam
  respondendo normalmente depois do reboot — nenhuma mudança feita aqui
  deveria afetá-los, mas vale conferir numa implantação com múltiplos
  apps na mesma máquina.
- Trocar as senhas temporárias dos usuários reais no primeiro login.
- Guardar senha do banco e `JWT_SECRET_KEY` em cofre de senhas da equipe
  de TI, nunca em texto plano.
