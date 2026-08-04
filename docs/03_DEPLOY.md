# Deploy — Instalação no Servidor do Hospital

Guia de instalação para quando houver acesso à máquina definitiva da farmácia (Hospital Materno Infantil Dr. Joaquim Sampaio). **Tudo aqui é local** — sem nuvem, sem Supabase, sem senha de serviço externo. O servidor roda PostgreSQL de verdade instalado na própria máquina, na rede interna do hospital, sem depender de internet (seção 2 do `00_PROJETO.md`).

Diferença importante em relação ao ambiente de desenvolvimento usado até aqui: aqui (nesta máquina de dev) o Postgres é uma versão portátil sem instalador porque não havia privilégio de administrador disponível (ver memória do projeto). **No servidor real do hospital, instalar o Postgres da forma normal**, com instalador oficial e privilégio de administrador de verdade — é mais simples e é o suportado oficialmente.

## 0. Checklist rápido (antes de ir ao ar)

- [ ] PostgreSQL instalado como serviço, com senha forte (não `postgres`/`postgres` do dev)
- [ ] `JWT_SECRET_KEY` gerado novo — nunca reaproveitar o de desenvolvimento
- [ ] Usuários reais cadastrados (coordenador/farmacêuticos/atendentes da farmácia) — **não** os de teste (`ana.ribeiro`, etc.)
- [ ] Servidor com IP fixo na rede interna
- [ ] Backend rodando como serviço (reinicia sozinho se o servidor reiniciar)
- [ ] Frontend buildado e servido, apontando para o IP do servidor (não `localhost`)
- [ ] Backup (`pg_dump`) agendado e **testado pelo menos uma vez com restauração de verdade**
- [ ] Firewall liberando as portas só para a rede interna do hospital, não para fora

---

## 1. Escolher e preparar o servidor

- Um computador ou mini-PC dedicado, ligado na rede interna do hospital (seção 2 do doc — 6 a 15 estações vão acessar por navegador).
- **IP fixo**: reserva de DHCP pelo IP do MAC address, ou IP estático configurado na máquina. Todas as estações vão apontar para esse IP — se ele mudar, quebra tudo.
- Windows ou Linux, o que a equipe de TI do hospital preferir manter — os passos abaixo cobrem os dois.

## 2. Instalar o PostgreSQL de verdade

**Windows**: baixar o instalador oficial em `postgresql.org/download/windows` (versão 14+, mesma exigida no README do backend) e instalar normalmente — ele já registra como serviço do Windows automaticamente. Definir uma senha forte para o usuário `postgres` na instalação (gerar com `python -c "import secrets; print(secrets.token_urlsafe(24))"` e guardar em local seguro, não no repositório).

**Linux**: `apt install postgresql` (Debian/Ubuntu) ou equivalente da distribuição — já instala como serviço `systemd` habilitado.

Depois de instalado (qualquer SO), criar o banco e um usuário dedicado à aplicação (evitar usar o superusuário `postgres` direto na `DATABASE_URL` de produção):

```sql
CREATE USER estoque_farmacia WITH PASSWORD 'senha-forte-gerada-aqui';
CREATE DATABASE estoque_farmacia OWNER estoque_farmacia;
```

Ajustar `pg_hba.conf` para aceitar conexões vindas da rede interna do hospital (não da internet) — ex., se a rede interna é `192.168.10.0/24`:

```
host    estoque_farmacia    estoque_farmacia    192.168.10.0/24    scram-sha-256
```

## 3. Preparar o backend

```bash
# copiar o código (git clone, ou copiar a pasta backend/ direto) para o servidor
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux

pip install -r requirements.txt

copy .env.example .env          # Windows
# cp .env.example .env          # Linux
```

Editar o `.env` com os valores **reais** de produção:

| Variável | Valor de produção |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://estoque_farmacia:senha-forte-gerada-aqui@localhost:5432/estoque_farmacia` |
| `JWT_SECRET_KEY` | gerar novo — `python -c "import secrets; print(secrets.token_hex(32))"` — **nunca** o valor usado em desenvolvimento |
| `CORS_ORIGINS` | manter `*` é aceitável dado o contexto de rede interna sem internet (avaliado na revisão de segurança, seção 17), ou restringir ao IP/host do frontend se quiser mais rigor |
| `HOSPITAL_NOME` / `HOSPITAL_ORGANIZACAO` | já vêm com o default correto |

Rodar as migrations e criar os usuários reais da farmácia (substituindo os de teste):

```bash
alembic upgrade head

python scripts/seed_usuarios.py --nome "Nome Completo" --login usuario.login \
    --senha "SenhaTemporariaForte!" --perfil coordenador --crf 12345-SP
# repetir para cada farmacêutico/atendente real da equipe
```

### Rodar o backend como serviço (não como processo manual num terminal aberto)

**Windows — NSSM** (mais simples que Agendador de Tarefas para manter um processo de longa duração vivo e reiniciando sozinho):

```bash
nssm install EstoqueFarmaciaAPI "C:\caminho\backend\.venv\Scripts\uvicorn.exe" "app.main:app --host 0.0.0.0 --port 8000"
nssm set EstoqueFarmaciaAPI AppDirectory "C:\caminho\backend"
nssm start EstoqueFarmaciaAPI
```

**Linux — systemd** (`/etc/systemd/system/estoque-farmacia.service`):

```ini
[Unit]
Description=Estoque Farmácia API
After=network.target postgresql.service

[Service]
User=estoquefarmacia
WorkingDirectory=/opt/estoque-farmacia/backend
ExecStart=/opt/estoque-farmacia/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now estoque-farmacia
```

Note o `--host 0.0.0.0` (não `127.0.0.1`) — necessário para que as outras estações da rede consigam alcançar o backend, diferente do ambiente de dev onde só a própria máquina acessava.

## 4. Preparar o frontend

```bash
cd frontend
copy .env.example .env    # Windows / cp no Linux
```

Editar `frontend/.env` com o **IP real do servidor**, não `localhost` (isso é o ajuste mais fácil de esquecer — funciona perfeito em dev porque frontend e backend estão na mesma máquina, mas em produção cada estação acessa o frontend pela rede, então o navegador dela precisa saber o IP do servidor para falar com a API):

```
VITE_API_BASE_URL=http://192.168.10.50:8000
```

```bash
npm install
npm run build
```

Isso gera `frontend/dist/` — arquivos estáticos prontos, sem precisar do Node.js rodando em produção. Servir esses arquivos com qualquer servidor web simples:

- **Windows**: IIS apontando para a pasta `dist/`, ou `nginx` para Windows.
- **Linux**: `nginx` servindo `dist/` como raiz, configuração mínima:

```nginx
server {
    listen 80;
    root /opt/estoque-farmacia/frontend/dist;
    location / {
        try_files $uri /index.html;   # necessário p/ rotas do React Router
    }
}
```

## 5. Rede e firewall

Liberar no firewall do servidor, **só para a sub-rede interna do hospital** (nunca para a internet):
- Porta 8000 (backend)
- Porta 80 ou a porta escolhida para servir o frontend

Testar de uma estação cliente qualquer: abrir o navegador em `http://192.168.10.50` (ou a porta configurada) e confirmar que o login aparece.

## 6. Backup

```bash
pg_dump -Fc -U estoque_farmacia estoque_farmacia > /backup/estoque_farmacia_$(date +%F).dump
```

**Windows** — Agendador de Tarefas, ação diária às 2h chamando um `.bat` com o comando acima (usando `pg_dump.exe` do diretório de instalação do Postgres).
**Linux** — `cron`, mesma linha do README do backend:

```
0 2 * * * pg_dump -Fc -U estoque_farmacia estoque_farmacia > /backup/estoque_farmacia_$(date +\%F).dump
```

O destino do backup deve ser um disco ou pasta de rede **separada** do servidor principal — se o servidor falhar fisicamente, o backup não pode estar no mesmo disco.

**Importante**: testar a restauração pelo menos uma vez antes de considerar o backup confiável —

```bash
pg_restore -d estoque_farmacia_teste -U postgres /backup/estoque_farmacia_2026-08-01.dump
```

Um backup nunca testado é uma suposição, não uma garantia.

## 7. Depois de tudo no ar

- Trocar as senhas temporárias dos usuários reais no primeiro login (não há tela de "trocar senha" no MVP — se isso for necessário no dia 1, pode ser um próximo pedido de funcionalidade).
- Guardar a senha do banco e o `JWT_SECRET_KEY` em um cofre de senhas da equipe de TI do hospital, não em texto plano em lugar nenhum.
- Repetir a validação manual básica: login de cada perfil, uma Entrada, uma Saída, uma Transferência, um Descarte solicitado/aprovado — os mesmos fluxos já testados em dev (seções 15.5, 17 e 18 do `00_PROJETO.md`), agora contra o banco de produção.
