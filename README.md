# Estoque Farmácia

Sistema de gestão de estoque de farmácia hospitalar — backend em
FastAPI/PostgreSQL (`backend/`, ver `backend/README.md`) e frontend em
React/TypeScript/Vite (`frontend/`, ver `frontend/README.md`). Contexto
e planejamento completo em `docs/00_PROJETO.md`; passo a passo de
implantação em `docs/GUIA_IMPLANTACAO_SERVIDOR.md`.

## ⚠️ Esta pasta é o servidor de produção

Diferente de um projeto comum, **esta cópia local não é um ambiente de
desenvolvimento separado** — é a pasta de onde os serviços reais rodam
neste servidor:

- Backend: serviço Windows `EstoqueFarmaciaAPI` (NSSM), porta `8002`,
  executando `backend/.venv/Scripts/uvicorn.exe app.main:app` direto
  desta pasta.
- Frontend: site IIS `EstoqueFarmacia`, porta `8081`, servindo
  `frontend/dist/` direto desta pasta.

Ou seja: editar um arquivo `.py` aqui já é editar o código que o
serviço vai rodar na próxima vez que reiniciar; rodar `npm run build`
aqui já sobrescreve o que está sendo servido ao vivo em produção. Não
há um passo de "deploy" que copia arquivo de um lugar pro outro.

Depois de alterar algo:

| Mudou... | Precisa de |
|---|---|
| Código do backend (`backend/app/**`) | Reiniciar o serviço: `Restart-Service -Name "EstoqueFarmaciaAPI" -Force` (PowerShell, a mudança só entra em memória depois disso — o `uvicorn` não roda com `--reload`) |
| Migração nova (`backend/alembic/versions/`) | `alembic upgrade head` (roda direto no banco real — testar antes numa instância separada, nunca só supor) |
| Código do frontend (`frontend/src/**`) | `npm run build` dentro de `frontend/` — já é o suficiente, o IIS serve o `dist/` na hora |

Antes de reiniciar o serviço do backend ou rodar uma migração, teste
num `uvicorn` numa porta alternativa (ex. `8123`) para não derrubar a
API real enquanto valida.

## Git — como este servidor se conecta ao GitHub

Este diretório é um repositório git normal, com remoto configurado:

```
origin  https://github.com/odlaoraugusto/estoque-farmacia.git
```

`git push` **não implanta nada sozinho** — os arquivos aqui já são os
que estão em produção antes mesmo do commit. Empurrar pro GitHub serve
só para manter o histórico de mudanças salvo fora desta máquina (backup
do código-fonte, útil se este computador falhar fisicamente) — não
troque essa ordem: primeiro valide/aplique a mudança aqui (reiniciando
serviço/rodando migração conforme a tabela acima), só depois `git push`.

Fluxo normal:

```bash
git status                      # conferir o que mudou
git add <arquivos específicos>  # evitar `git add -A` — pode existir
                                 # trabalho em andamento de outra sessão
                                 # não relacionado à sua mudança
git commit -m "descrição"
git push origin main
```

`render.yaml` (raiz) e `frontend/vercel.json` são resquícios de uma
tentativa anterior de hospedagem em nuvem — **não são usados** nesta
instalação (que é 100% on-premise, ver `docs/GUIA_IMPLANTACAO_SERVIDOR.md`);
não confundir com o fluxo real acima.
