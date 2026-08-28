# Importação de estoque inicial (planilha → sistema)

Sim, dá para importar os dados da planilha de conferência para o cadastro
de medicamentos + estoque físico inicial. Não existe uma tela de "importar
planilha" no sistema (é fora do escopo do MVP, mesma decisão que já vale
para cadastro de usuário — ver `docs/00_PROJETO.md`), mas existe agora um
script de uso único (`backend/scripts/importar_estoque_inicial.py`) que lê
a planilha e cadastra tudo direto no banco, testado e validado nesta sessão.

## Preparar a planilha

Uma única aba/arquivo, **uma linha por lote físico** (não por medicamento —
se o mesmo remédio está em mais de uma unidade ou tem mais de um lote,
uma linha para cada). O cabeçalho (primeira linha) precisa ter exatamente
estes nomes de coluna:

| Coluna | Obrigatória | O que é | Valores aceitos |
|---|---|---|---|
| `medicamento` | sim | Nome do medicamento | texto livre |
| `apresentacao` | sim | Forma farmacêutica | texto livre — aceita as siglas próprias do hospital (ex. `FA`, `CP`), não é mais uma lista fechada |
| `concentracao` | não | Dosagem/concentração | texto livre, ex. `500mg/mL` |
| `fabricante` | não | Fabricante do medicamento | texto livre, ex. `EMS` |
| `acondicionamento` | não | Onde é guardado | `ambiente` ou `geladeira`, ou deixe em branco |
| `estoque_minimo` | não | Gatilho do alerta de estoque crítico | número inteiro (padrão `0` se vazio) |
| `unidade` | sim | Onde o lote está fisicamente hoje | `CAF`, `UTI`, `Centro Cirúrgico`, `Emergência` **ou o nome exato de um carrinho de emergência** (ver nota abaixo) |
| `numero_lote` | sim | Número/código do lote | texto livre |
| `data_validade` | sim | Validade do lote | `DD/MM/AAAA` (ex. `15/12/2026`) |
| `quantidade` | sim | Quantidade física do lote | número inteiro maior que zero |
| `valor_unitario` | não* | Valor pago por unidade | número, aceita vírgula (`2,10`) ou ponto |
| `origem` | sim | Como o item chegou | `compra` ou `doacao` |
| `numero_nota_fiscal` | sim, se `origem=compra` | Número da NF | texto livre |
| `numero_afm` | não | Número AFM, se houver | texto livre |
| `e_antimicrobiano` | não | Entra na vigilância de antimicrobianos (DOT)? | `sim`/`não` (ou `true`/`false`, `1`/`0`) |
| `e_controlado` | não | É medicamento controlado? | `sim`/`não` |

\* `valor_unitario` é obrigatório e deve ser maior que zero quando
`origem=compra`; para `doacao` pode ficar em branco (o script zera
automaticamente).

**Lote num carrinho de emergência**: na coluna `unidade`, escreva o nome
**exato** do carrinho (não o nome da unidade onde ele fica) — o script já
reconhece carrinhos, não só as 4 unidades reais. Os 25 carrinhos já
cadastrados no sistema (migrations `0003_carrinhos_emergencia`,
`0012_kits_hemorragicos` e `0013_maleta_uti_pediatrica`):

| Carrinho | Fica em |
|---|---|
| Carro de Emergência Unidade Canguru | CAF |
| Carro de Emergência Centro de Parto Normal | CAF |
| Carro de Emergência Alojamento Conjunto | CAF |
| Kit de Emergência Hemorrágico ALCON Posto 1 | CAF |
| Kit de Emergência Hemorrágico ALCON Posto 2 | CAF |
| Kit de Emergência Hemorrágico CPN | CAF |
| Carro de Emergência UTI Neonatal Nº 1 | UTI |
| Carro de Emergência UTI Neonatal Nº 2 | UTI |
| Carro de Emergência UTI Pediátrica 1 | UTI |
| Carro de Emergência UTI Pediátrica 2 | UTI |
| Carro de Emergência UCI Neonatal | UTI |
| Maleta UTI Pediátrica | UTI |
| Carro de Emergência do Ambulatório | Emergência |
| Maleta UTI Neo/UCINCO | Emergência |
| Carro de Emergência Enfermaria Pediátrica | Emergência |
| Carro de Emergência Pronto Socorro Obstétrico | Emergência |
| Carro de Emergência Centro Obstétrico | Emergência |
| Carro de Emergência Sala da Tomografia | Emergência |
| Carro de Emergência Sala Exame Pediátrico | Emergência |
| Carro de Emergência: Urgência e Emergência Pediátrica | Emergência |
| Kit de Emergência Hemorrágico CO nº 1 | Emergência |
| Kit de Emergência Hemorrágico CO nº 2 | Emergência |
| Kit de Emergência Hemorrágico Emergência Obstétrica | Emergência |
| Carro de Emergência Centro Cirúrgico Nº 1 | Centro Cirúrgico |
| Carro de Emergência Centro Cirúrgico Nº 2 | Centro Cirúrgico |

Essa mesma lista também aparece no campo "Carrinho de destino" da tela
**Reposição de Carrinhos**, se preferir conferir a grafia exata por lá em
vez de copiar daqui.

**Importante sobre `medicamento` + `apresentacao` + `concentracao`**: essas
três colunas juntas identificam um medicamento do catálogo. Se a mesma
combinação aparecer em várias linhas (ex. Amoxicilina em CAF e também em
UTI), o script cria o **medicamento uma única vez** (usa os dados
`acondicionamento`/`estoque_minimo`/`e_antimicrobiano`/`e_controlado` da
**primeira** linha em que aparece) e só cria um lote novo para cada linha
seguinte. Se a grafia do nome variar entre linhas (ex. "Dipirona" numa
linha e "Dipirona Sódica" noutra), o script vai tratar como dois
medicamentos diferentes — vale revisar a planilha antes para manter o nome
idêntico em todas as linhas do mesmo remédio.

Pode ser `.xlsx` (Excel) ou `.csv`.

## Rodar a importação

Sempre em duas etapas — nunca direto com `--confirmar`:

```powershell
cd "C:\caminho\para\ESTOQUE FARMACIA\backend"
.venv\Scripts\python.exe scripts\importar_estoque_inicial.py --arquivo "C:\caminho\estoque.xlsx" --usuario-login ananda.carvalho
```

Isso **não grava nada no banco** — só valida e mostra, linha por linha,
o que está com problema (coluna vazia, data mal formatada, unidade
digitada errado, etc.). Corrija a planilha e rode de novo até a lista de
erros ficar vazia (ou aceitável — linhas com erro são simplesmente
ignoradas, as demais são importadas normalmente).

Quando estiver satisfeito com o resultado do modo teste, rode de novo com
`--confirmar` para gravar de verdade:

```powershell
.venv\Scripts\python.exe scripts\importar_estoque_inicial.py --arquivo "C:\caminho\estoque.xlsx" --usuario-login ananda.carvalho --confirmar
```

`--usuario-login` precisa ser o login de um usuário já cadastrado
(farmacêutico ou coordenador) — ele fica registrado como autor de cada
entrada na trilha de auditoria, exatamente como se tivesse cadastrado cada
lote manualmente pela tela.

## O que o script faz por baixo dos panos

Para cada linha válida, cria (se ainda não existir) o medicamento no
catálogo, e cria um lote de estoque + o registro correspondente na trilha
de auditoria (`movimentacoes`, tipo `entrada`) — o mesmo rastro que ficaria
se alguém tivesse usado a tela **Entrada** manualmente. A única diferença
proposital: a tela normal só permite Entrada na CAF (regra de negócio do
dia a dia); este script permite gravar diretamente em qualquer unidade
real, porque é carga inicial — está registrando o que **já existe**
fisicamente em cada lugar, não uma entrada nova pela CAF.

## Testado nesta sessão

Rodado com uma planilha de exemplo (3 linhas: 2 válidas cobrindo o mesmo
medicamento em duas unidades diferentes, 1 com erro proposital de data
vazia) — o modo teste identificou o erro corretamente, o modo `--confirmar`
gravou as 2 linhas válidas, e a consulta via API confirmou os dados certos
(quantidade, valor com vírgula convertido, unidade, flag de
antimicrobiano). Dado de teste removido (desativado) depois da validação.
