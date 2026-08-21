# Estoque Farmácia — Backend

API REST (FastAPI + PostgreSQL + SQLAlchemy/Alembic) do sistema de gestão
de estoque de farmácia hospitalar, desenvolvido para um hospital de uma
rede pública de saúde (nome da instituição omitido deste repositório —
ver `.env.example`). Ver `docs/00_PROJETO.md` (raiz do repositório) para
o planejamento completo — este README cobre só o "como rodar".

Sem Docker: instalação direta no servidor da farmácia (Windows/Linux),
como um serviço (systemd no Linux, Agendador de Tarefas/NSSM no
Windows). Não há orientação de deploy aqui porque cada instalação de
hospital decide isso na hora do DevOps.

## Requisitos

- Python 3.12+
- PostgreSQL 14+ na rede local do hospital (uma instância por hospital —
  não é multi-tenant)

## Rodando localmente

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt

copy .env.example .env      # Windows
# cp .env.example .env      # Linux/Mac
# edite o .env com a URL real do banco e um JWT_SECRET_KEY novo
```

### Variáveis de ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | ex.: `postgresql+psycopg2://usuario:senha@localhost:5432/estoque_farmacia` |
| `JWT_SECRET_KEY` | sim | segredo de assinatura da sessão — gere com `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_ALGORITHM` | não (default `HS256`) | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | não (default `480`, 8h) | duração do token/sessão |
| `HOSPITAL_NOME` | não (tem default genérico, sobrescrever por instalação) | nome exibido no cabeçalho institucional |
| `HOSPITAL_ORGANIZACAO` | não (tem default genérico, sobrescrever por instalação) | idem, para a organização/rede |
| `RELATORIO_VENCIMENTO_DIAS` | não (default `30`) | janela do relatório de vencimentos próximos |
| `CORS_ORIGINS` | não (default `*`) | lista separada por vírgula das origens do frontend, ou `*` |

### Banco de dados — migrações

```bash
# cria o schema completo (usuarios, unidades, medicamentos, lotes, movimentacoes)
alembic upgrade head

# gera o SQL sem se conectar a um banco (útil pra revisar antes de aplicar)
alembic upgrade head --sql
```

Novas alterações de schema entram como novas revisions em
`alembic/versions/` (`alembic revision --autogenerate -m "descrição"`,
com o banco acessível para o autogenerate comparar).

### Usuários iniciais

Cadastro de usuários é fora do escopo do MVP (feito direto no banco).
Use o script:

```bash
python scripts/seed_usuarios.py --nome "Maria Silva" --login maria.silva \
    --senha "TrocarNoPrimeiroAcesso!" --perfil coordenador --crf 12345-SP

python scripts/seed_usuarios.py --nome "João Souza" --login joao.souza \
    --senha "TrocarNoPrimeiroAcesso!" --perfil atendente
```

O script também garante a existência das 4 unidades padrão (CAF, UTI,
Centro Cirúrgico, Emergência) na primeira execução.

### Subindo a API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Docs interativos (Swagger) em `http://<servidor>:8000/docs`.

## Backup

Não implementado em código — é rotina de infraestrutura, não da
aplicação. Recomendação: `pg_dump` agendado (cron no Linux, Agendador de
Tarefas no Windows) gerando dump diário em disco/pasta de rede separada
do servidor principal. Ex. (Linux, cron diário às 2h):

```
0 2 * * * pg_dump -Fc estoque_farmacia > /backup/estoque_farmacia_$(date +\%F).dump
```

## Decisões técnicas não 100% especificadas no `docs/00_PROJETO.md`

- **IDs**: inteiros autoincremento (`SERIAL`), não UUID — mais simples
  para esta escala (6-15 estações) e sem necessidade de geração
  distribuída de ID.
- **Enums**: implementados como `VARCHAR + CHECK CONSTRAINT`
  (`sa.Enum(..., native_enum=False)`), não `ENUM` nativo do Postgres —
  evita `ALTER TYPE ... ADD VALUE` (que não roda dentro de transação) se
  a instalação precisar adicionar um valor novo (ex. uma 5ª unidade) no
  futuro.
- **Sessão/unidade ativa**: JWT assinado pelo servidor. O token do login
  não carrega unidade; `POST /auth/selecionar-unidade` valida a unidade
  no banco e emite um novo token com `unidade_ativa_id`/`unidade_ativa_nome`
  embutidos. Como o cliente não pode forjar a assinatura, a unidade ativa
  vira um dado de sessão verificável no servidor a cada requisição
  (não um campo solto no corpo da requisição). Duração do token: 8h,
  cobrindo um turno de plantão — configurável via `ACCESS_TOKEN_EXPIRE_MINUTES`.
- **`lotes.status_transferencia`**: interpretado como o status da
  transferência mais recente que envolveu aquele registro de lote —
  `em_transito` quando enviado (mesmo em envio parcial, em que o lote de
  origem continua com o saldo restante disponível), `recebido` quando o
  destino confirma. O doc original não deixava explícito o que acontece
  com esse campo em envios parciais; ficou assim para casar com a
  redação literal das regras de negócio (regras 3 e 4 do pedido).
- **Confirmação de transferência "recebida"**: como a coluna `status` de
  `movimentacoes` é exclusiva de descarte (conforme o próprio doc), o
  "confirmado" de uma transferência é representado pelo preenchimento de
  `quantidade_recebida`/`data_confirmacao`/`usuario_confirmacao_id` —
  não por uma nova coluna de status genérica.
- **Concorrência**: `SELECT ... FOR UPDATE` (`with_for_update()`) ao
  buscar o lote/movimentação antes de decrementar saldo ou aprovar
  descarte — trava a linha até o fim da transação, evitando duas
  estações decrementarem o mesmo lote ao mesmo tempo (risco citado
  explicitamente no doc, seção 2).
- **Descarte aprovado com saldo insuficiente**: se o saldo do lote caiu
  entre a solicitação e a aprovação (por outra saída/transferência no
  meio tempo), a aprovação retorna 400 pedindo para rejeitar e solicitar
  de novo — o doc não cobria esse caso, mas deixar aprovar geraria saldo
  negativo.
- **Escopo de unidade nos relatórios/listagens**: Coordenador pode
  filtrar por qualquer unidade ou omitir o filtro (retorna todas); os
  demais perfis são sempre forçados à própria unidade ativa da sessão,
  mesmo que informem outro `unidade_id` na query string (o valor é
  ignorado nesse caso) — função `resolver_unidade_escopo` em
  `app/api/deps.py`.
- **Cadastro de medicamento com `ativo`**: campo extra não mencionado no
  doc, adicionado para permitir descontinuar um item do catálogo sem
  `DELETE` físico (que quebraria a FK de lotes históricos).
- **Hash de senha**: `bcrypt` direto (sem `passlib`), para evitar o bug
  conhecido de incompatibilidade entre `passlib` 1.7.x e `bcrypt` >= 4.1.

## O que ficou fora desta rodada

- **Geração de PDF/Excel dos relatórios** — os 4 endpoints de relatório
  retornam os dados corretos (com os metadados do cabeçalho
  institucional), mas a exportação em arquivo fica para uma próxima
  rodada, conforme priorizado no pedido.
- **Tela/endpoint de cadastro de usuários** — fora do MVP por decisão já
  registrada no doc; coberto pelo `scripts/seed_usuarios.py`.
- **Rotina de backup em código** — é configuração de infraestrutura
  (`pg_dump` agendado), não código Python; só documentada acima.
- **Frontend** — não faz parte deste pacote.
