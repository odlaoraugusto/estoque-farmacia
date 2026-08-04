# Identidade Visual — Estoque Farmácia

Rede FESFSUS · Hospital Materno Infantil Dr. Joaquim Sampaio

Versão 1.0 — agosto de 2026

## 1. De onde isso vem

Este documento parte do **Manual de Aplicação de Marca — FESFSUS 2024** (arquivo fornecido pelo cliente, `Manual de Aplicação de Marca - FESFSUS - 2024.pdf`), que é a fonte oficial da marca da Fundação. Dali vêm três coisas que este sistema não pode reinventar: a paleta de cinco cores, a régua de assinatura institucional e a proibição de alterar a marca fora de campanhas aprovadas pela ASCOM da FESF.

O que este documento faz é pegar essa paleta — pensada para papelaria, uniformes e material impresso — e adaptá-la para uma tela de sistema hospitalar usada por 6 a 15 pessoas ao mesmo tempo, várias horas por dia, em turnos que incluem madrugada. Uma paleta de marca institucional costuma ser mais saturada do que o ideal para uso denso e prolongado em tela; por isso as cores do produto aqui são versões suavizadas (pastel) das cinco cores oficiais, e não as cores cheias aplicadas diretamente em botão, tabela e formulário. A decisão de unificar tudo sob a paleta FESF — em vez do verde-salva que vinha sendo usado até a rodada anterior do protótipo — e de suavizar essas cores em tom pastel foi confirmada pelo cliente em 2026-08-03.

A régua de quatro cores e o roxo institucional continuam exatamente como no manual de marca — sem suavização — porque ali eles cumprem uma função diferente: identificar a Fundação, não decorar a interface.

## 2. Paleta oficial (herdada, não mexer)

| Cor | Hex | Significado no manual FESFSUS |
|---|---|---|
| Roxo | `#61358c` | Honra, feminino, criatividade, capacidade |
| Lis (lavanda) | `#7572a7` | Honra, feminino, criatividade, capacidade |
| Verde-água | `#79bfb4` | Saúde, sustentabilidade, fertilidade, confiança, equilíbrio |
| Menta | `#73d9a8` | Saúde, sustentabilidade, fertilidade, confiança, equilíbrio |
| Cinza | `#575756` | Sofisticação, formalidade, maturidade, solidez |

Essas cinco cores seguem intactas em três lugares do sistema: a barra institucional no topo de cada tela, a régua de quatro cores logo abaixo dela, e o cabeçalho (letterhead) de todo relatório exportado. Fora desses três lugares, o sistema usa as versões suavizadas descritas na seção 3.

## 3. Paleta do produto (suavizada, tela)

Cada token abaixo foi derivado do matiz (hue) da cor FESF correspondente, com saturação reduzida e luminosidade ajustada para funcionar como texto, botão ou fundo sem cansar a vista em uso prolongado. Todos os pares texto/fundo abaixo foram checados e passam WCAG AA (contraste ≥ 4,5:1 para texto normal).

| Token | Hex (claro) | Hex (escuro) | Uso | Derivado de |
|---|---|---|---|---|
| `--bg` | `#f7f4f8` | `#17121c` | Fundo geral da aplicação | cinza + roxo (undertone) |
| `--surface` | `#ffffff` | `#221c26` | Cards, painéis, inputs | neutro |
| `--surface-2` | `#eeeaf0` | `#2c2532` | Fundos secundários (linha zebrada, box readonly) | cinza + roxo |
| `--ink` | `#2c2433` | `#ece7ef` | Texto principal | roxo, muito escurecido |
| `--muted` | `#73687d` | `#a9a0b1` | Texto secundário, legendas | roxo, dessaturado |
| `--line` / `--line-soft` | `#dad3de` / `#e9e5eb` | `#453b4e` / `#362e3d` | Bordas | roxo, bem claro |
| `--accent` | `#754f9c` | `#b897d8` | Botão primário, foco, links, aba ativa | Roxo `#61358c` |
| `--accent-strong` | `#543276` | `#d1bae8` | Hover do botão primário | Roxo `#61358c` |
| `--accent-soft` | `#f0ebf4` | `#332442` | Fundo de tag/badge suave | Roxo `#61358c` |
| `--ok` | `#397463` | `#80c6b2` | Status positivo, saldo ok, aprovado | Verde-água `#79bfb4` |
| `--ok-bg` | `#e8f3ef` | `#1d302a` | Fundo de pill/alerta de sucesso | Verde-água `#79bfb4` |
| `--warn` | `#886220` | `#dab981` | Alerta, pendência, vencimento próximo | âmbar (fora da paleta FESF — ver nota) |
| `--warn-bg` | `#f7f0e3` | `#372d1b` | Fundo de pill/alerta de atenção | âmbar |
| `--danger` | `#96404f` | `#dd9da7` | Erro, saldo negativo, rejeição | terracota (fora da paleta FESF — ver nota) |
| `--danger-bg` | `#f4e6e8` | `#381e23` | Fundo de pill/alerta de erro | terracota |

**Nota sobre âmbar e terracota:** a paleta oficial da FESF não tem uma cor de alerta (amarelo/laranja) nem uma cor de erro (vermelho) — as cinco cores do manual são todas do campo roxo/verde. Semáforo de status (atenção/erro) precisa de cores que o olho reconheça como tal independentemente de contexto cultural, então mantivemos âmbar e terracota como no protótipo anterior, só ajustando a luminosidade para bater com o resto da paleta pastel. Isso é uma decisão deliberada, não um esquecimento: cor de alerta e cor de marca cumprem papéis diferentes, e forçar um roxo institucional a significar "erro" seria confuso e, ironicamente, um dos padrões genéricos que este documento tenta evitar.

## 4. Cor por unidade (rail de contexto)

O hospital opera quatro unidades (CAF, UTI, Centro Cirúrgico, Emergência) e o usuário troca de unidade ativa sem trocar de conta. Como a régua de marca da FESF já tem exatamente quatro cores, cada unidade herda uma delas — suavizada — como cor de identificação, aplicada numa borda esquerda de 3px em cards e no badge de unidade ativa da barra lateral.

| Unidade | Token | Hex | Origem |
|---|---|---|---|
| CAF | `--unit-caf` | `#754f9c` | Roxo (mesmo tom do accent — faz sentido, é a unidade de origem de tudo) |
| UTI | `--unit-uti` | `#6d6aaf` | Lis / lavanda |
| Centro Cirúrgico | `--unit-cc` | `#3b9184` | Verde-água |
| Emergência | `--unit-emerg` | `#389468` | Menta |

Importante: a cor nunca é a única pista. Cada rail vem sempre acompanhado do nome da unidade por extenso (no badge da sessão, no cabeçalho do card) — ninguém deve precisar decorar "verde-água = Centro Cirúrgico" para operar o sistema. Isso é tanto uma regra de acessibilidade (não depender só de cor) quanto uma regra de bom senso operacional: às 3h da manhã, texto lido é mais confiável que matiz reconhecido.

As classes CSS já existem em `frontend/src/index.css` (`.rail-caf`, `.rail-uti`, `.rail-cc`, `.rail-emerg`); a aplicação em cada tela (ex.: `session-card` no `Layout.tsx`) fica como próximo passo de implementação, fora do escopo deste documento de identidade.

## 5. Tipografia

O manual FESFSUS define duas fontes: **Arimo**, sans serif metricamente compatível com Arial, para uso corrente; e **De Rotterdam**, uma fonte display arredondada, para a marca e títulos de destaque. São papéis diferentes, e o sistema respeita essa divisão:

- **Arimo** é a fonte de todo o produto — formulários, tabelas, botões, texto de relatório. É a fonte "de trabalho": neutra, legível em tamanho pequeno, sem chamar atenção para si mesma. Já é metricamente compatível com Arial, então funciona como fallback confiável enquanto o arquivo da fonte não está embutido no build (ver nota abaixo).
- **De Rotterdam** aparece só em momentos de marca: o logotipo FESFSUS em si (que é vetor, não precisa da fonte) e, opcionalmente, o nome do sistema na tela de login. Nunca em corpo de texto, tabela ou formulário — é uma fonte de título, não de uso denso.

**Nota de implementação:** nem Arimo nem De Rotterdam estão embutidas no build hoje (`frontend/src/index.css` ainda usa a pilha de fontes do sistema operacional como fallback seguro). Arimo é gratuita (Google Fonts, licença Apache) e pode ser adicionada sem custo. De Rotterdam é a fonte licenciada da FESF — precisa do arquivo `.woff2` cedido pela Fundação (ou pela ASCOM) para uso real; até lá, o nome do sistema na tela de login usa a mesma pilha de sistema, em negrito, como já era feito.

## 6. Voz e tom

O sistema fala com quem trabalha em turno, muitas vezes cansado, muitas vezes sob pressão. Isso significa: mensagens de erro dizem o que aconteceu e o que fazer a respeito, sem eufemismo nem alarme (`"Saldo insuficiente: restam 40 unidades deste lote"`, não `"Ops! Algo deu errado 😅"`); confirmações são diretas (`"Lote registrado"`, não `"Sucesso! Sua ação foi processada com êxito"`); nada de ponto de exclamação decorativo, nada de emoji na interface. Rótulos de campo são substantivos claros (`"Número da nota fiscal"`), não perguntas nem frases longas.

## 7. Componentes principais

- **Botão primário** (`.btn`): fundo `--accent`, hover `--accent-strong`. Usado uma vez por tela — a ação principal daquele formulário. Ações secundárias usam `.btn.ghost` (contorno) e ações destrutivas usam `.btn.danger` (contorno vermelho, nunca preenchido — descarte e rejeição não devem parecer "botão de destaque").
- **Pill de status** (`.pill`): ponto colorido + texto, nunca só a cor. Variantes `pend` (âmbar), `ok` (verde-água), `danger` (terracota), `muted` (cinza).
- **Painel/card** (`.panel`): fundo branco, borda 1px, sombra discreta de 1-3px — nunca sombra pesada ou flutuante, o sistema é denso e usado por perto, não uma vitrine.
- **Tabela**: cabeçalho em versalete pequeno cinza, linhas com hover sutil, números sempre alinhados à direita com `font-variant-numeric: tabular-nums`.
- **Alerta** (`.alerta`): erro, sucesso ou informação — cor de fundo suave da própria paleta (`--danger-bg`, `--ok-bg`, `--surface-2`), nunca vermelho ou verde saturado ocupando a tela inteira.
- **Letterhead de relatório** (`.letterhead`): ver seção 8.

## 8. A régua de assinatura institucional

O manual de marca define uma ordem hierárquica fixa para quando a marca da FESF aparece ao lado de outras marcas: **Serviço → FESF → SUS → Governo do Estado**. No caso deste hospital, o exemplo já vem pronto no próprio manual (página 13): **Hospital Materno-Infantil Dr. Joaquim Sampaio · FESFSUS · SUS · Governo do Estado (Bahia)**.

Essa é exatamente a ordem que deve aparecer no cabeçalho de todo relatório exportado (PDF/Excel) e, futuramente, se o sistema ganhar uma versão impressa de etiqueta ou comprovante. Hoje o `Letterhead.tsx` mostra organização + hospital; a régua completa de 4 marcas (que inclui os logotipos do SUS e do Governo da Bahia, não só texto) é um item de acabamento que depende de receber os arquivos desses logotipos — registrado aqui como pendência, não implementado neste momento por não termos os arquivos.

## 9. Modo escuro

O sistema já responde a `prefers-color-scheme: dark` desde o protótipo original. Os tokens da seção 3 têm par claro/escuro para todas as cores; o roxo institucional da barra superior **não muda no escuro** — ele é marca, não tema, e continua com o texto claro original (`#f7f3fa`) sobre `--fesf-purple`.

## 10. Acessibilidade

Todos os pares texto/fundo da seção 3 foram calculados e checados (WCAG 2.1, contraste mínimo 4,5:1 para texto normal). As cores de unidade (seção 4) são elementos gráficos informativos, não texto — usamos o mínimo de 3:1 do WCAG 1.4.11 para componentes de interface, e reforçamos com texto sempre visível ao lado. Alvo de toque mínimo de 36px já está nos botões e itens de navegação do protótipo aprovado; manter em qualquer tela nova.

## 11. O que evitar

Registrado desde o início do projeto (`docs/00_PROJETO.md`, seção 7): nada de botão gigante, fonte grande demais, sombra pesada ou gradiente chamativo. A isso adicionamos, nesta rodada: nada de ilustração genérica de "saúde digital" (mãos segurando cruzes vermelhas, engrenagens com estetoscópio); nada de gradiente arco-íris decorativo fora da régua de marca (que já é, ela mesma, a única faixa multicor permitida); nada de texto de interface com emoji. O objetivo é um sistema que pareça ter sido desenhado por alguém que já trabalhou num balcão de farmácia hospitalar, não por um gerador de tela de dashboard.

## 12. Referência rápida — tokens CSS

Os valores abaixo já estão aplicados em `frontend/src/index.css` (`:root` e bloco `prefers-color-scheme: dark`). Esta seção é só espelho de consulta.

```css
:root {
  --fesf-purple: #61358c;
  --fesf-lavender: #7572a7;
  --fesf-teal: #79bfb4;
  --fesf-mint: #73d9a8;
  --fesf-gray: #575756;

  --bg: #f7f4f8;
  --surface: #ffffff;
  --surface-2: #eeeaf0;
  --ink: #2c2433;
  --muted: #73687d;
  --line: #dad3de;
  --line-soft: #e9e5eb;
  --accent: #754f9c;
  --accent-ink: #fcfafc;
  --accent-soft: #f0ebf4;
  --accent-strong: #543276;
  --warn: #886220;
  --warn-bg: #f7f0e3;
  --danger: #96404f;
  --danger-bg: #f4e6e8;
  --ok: #397463;
  --ok-bg: #e8f3ef;
  --unit-caf: #754f9c;
  --unit-uti: #6d6aaf;
  --unit-cc: #3b9184;
  --unit-emerg: #389468;
}
```

## 13. Pendências

1. Arquivo da fonte De Rotterdam (licenciado FESF) — solicitar à ASCOM para uso real na marca do sistema.
2. Logotipos vetoriais do SUS e do Governo do Estado da Bahia — necessários para completar a régua de assinatura de 4 marcas no letterhead de relatórios (seção 8).
3. Aplicar as classes `.rail-*` (seção 4) nos componentes de tela que já exibem a unidade ativa — hoje elas existem no CSS, mas nenhum componente as usa ainda.
