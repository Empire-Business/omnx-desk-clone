# Plano — Duas datas do contrato (Assinatura x Pagamento)

> Status: **APROVADO e implementado em 27/07/2026** (migrations `20260727130000`,
> `20260727135000`, `20260727140000`). Restam decisões de dados — ver §8.
> Criado em: 21/07/2026 BRT
> Autor: alinhamento Bruno + IA

## 1. Problema atual

Hoje o contrato tem **uma única data** (`contratos.data_fechamento`) que mistura conceitos e está poluída por bugs de importação do Notion:

- **`1901-01-01`** → sentinela de "sem data" do import antigo.
- **`2026-05-11`** → data em que o lote foi **importado** (gravou a data do import como se fosse a data do contrato). Afeta ~30 contratos.
- Datas reais em outros.

Consequência: relatórios por período e cálculo de comissão usam uma data que muitas vezes não é a real.

## 2. Modelo proposto — duas datas, cada uma por um evento

| Campo (novo) | Significado | Quando é preenchida | Origem |
|---|---|---|---|
| `data_assinatura` | Quando o contrato foi **assinado** | Ao anexar o **Clicksign** (`link_clicksign` ganha valor) | Gatilho no banco |
| `data_pagamento` | Quando a **entrada** foi paga | Quando a venda vem do **onboarding** e a entrada é registrada | Fluxo de onboarding / `entrada` |

Regra de ouro (definida pelo Bruno):
- **Data de assinatura = só existe quando há contrato do Clicksign.** Sem Clicksign ⇒ **sem data de assinatura**.
- **Data de pagamento = veio do onboarding e pagou a entrada.**

### O que acontece com `data_fechamento`?
Vira uma **data de exibição derivada** (a "data principal" que a lista mostra), calculada como:
`coalesce(data_assinatura, data_pagamento, sentinela)`.
Assim as telas e métricas continuam funcionando sem reescrever tudo de uma vez.

## 3. Preenchimento automático (gatilhos)

1. **Assinatura** — estender o gatilho que já existe em `link_clicksign`
   (`trg_notificar_contrato_assinado`) para, quando `link_clicksign` passa de vazio→preenchido,
   gravar `data_assinatura = now()` (se ainda estiver vazia).
2. **Pagamento** — no fluxo de onboarding (quando a entrada é confirmada), gravar `data_pagamento`.

## 4. "Sem data de assinatura" — sentinela em vez de vazio

Decisão do Bruno: contratos **sem data real** recebem uma **data muito antiga (sentinela)** em vez de ficar vazio,
**pra ficarem fora das comissões e das métricas** até alguém entrar e preencher a data real.

- Sentinela proposta: **`1900-01-01`** (mesma convenção que o próprio Notion usa para "sem data").
- **Guarda no cálculo de comissão:** a função `calcular_comissoes_contrato` deve **pular** contratos
  com `data_fechamento = sentinela` (ou nula), pra não gerar comissão de contrato sem data real.
- **Métricas:** já filtram por faixa de data → `1900` fica naturalmente fora do faturamento/período.

Fluxo do usuário: o contrato aparece como **"Sem data de assinatura"** na lista; o operador entra,
descobre a data real (no Clicksign) e preenche → sai da sentinela e passa a contar normalmente.

## 5. Migração dos dados atuais

1. `data_assinatura` ← `data_fechamento` **quando** houver `link_clicksign` **e** a data for real
   (não for `1901`, `1900`, nem `2026-05-11` de import).
2. `data_pagamento` ← derivar de `entrada`/`pagamentos`/onboarding quando existir.
3. Contratos sem nenhuma data real → `data_fechamento = 1900-01-01` (sentinela "sem data").
4. Os **30 contratos** com `data_fechamento = 2026-05-11` (data de import):
   - **6 já corrigidos** com a data real do irmão de transferência (Danilo, Marcos, Mei Yi Ho, Evandro, José Benito, Raphael).
   - **24 restantes** não têm data em lugar nenhum do export → vão para a **sentinela**.

## 6. Impacto em comissões e métricas

- Comissões **`paga`** nunca são apagadas pela função de cálculo (verificado). Migração é segura.
- Para contratos importados (`notion_page_id` preenchido), a função **não** regenera comissões —
  só sincroniza o estrategista. Mudar datas neles não recria histórico.
- A guarda da sentinela (item 4) evita gerar comissão nova para contrato sem data real.

## 7. Bug do filtro que "some" — CORRIGIDO

**Causa:** a lista guarda os filtros na URL (query string), mas o botão *Voltar* do detalhe fazia
`navigate('/contratos/lista')` fixo, **sem** a query string → voltava com os filtros zerados.
**Correção aplicada:** o *Voltar* agora usa `navigate(-1)` (retorna à URL anterior, com os filtros),
com fallback para a lista limpa quando não há histórico. *(precisa de deploy para valer em produção)*

## 8. Decisões pendentes / próximos passos

- [x] **Modelo aprovado** (27/07/2026).
- [x] **Sentinela `1900-01-01` confirmada** + guarda em `calcular_comissoes_contrato`:
  contrato sem data real não gera comissão prevista (as pagas nunca são tocadas).
- [x] **Sentinela já aplicada** — 15 contratos hoje, 0 sem data.
- [x] **Colunas + gatilhos + UI** implementados. Backfill: 300/300 contratos com
  Clicksign ganharam `data_assinatura`; 23 ganharam `data_pagamento`.
  `data_fechamento` **não foi alterada** — mexer nela dispararia recálculo de comissão
  em massa. Faturamento ativo conferido antes/depois: R$ 4.853.945,25 em 221 contratos.
- [x] **Duplicata Danilo (276 × 373)**: não existe mais. Hoje há um único contrato de
  R$ 25.000 no nome (Danilo Farias de Moraes).

### Decidido em 27/07/2026

- [x] **Duplicata Augusto Kraemer** — resolvida. O rascunho de 22/07 (sem Clicksign, 0
  comissões) foi apagado; ficou o contrato `ativo` de 23/07, com Clicksign.
  Hoje: 1 contrato, R$ 18.000.
- [x] **Linhas operacionais** — decisão: **deixar como estão**. Sobraram só `Cami` e
  `Vendedor de 1 milhao`, ambas com valor R$ 0, então já não afetam o faturamento.

### Ainda aguardando decisão do Bruno

- [ ] **10 comissões previstas (R$ 9.000)** em 2 contratos sem data real. A lista foi
  entregue em 27/07; decisão foi **manter por enquanto**, sem apagar:

  | Contrato | Estrategista | Parcelas | Valor |
  |---|---|---|---|
  | Clientes de Alto Valor | Virendra | 8ª a 12ª de 12 (jan–mai/2027) | 5 × R$ 900 |
  | Sandro San | Matheus Henrique | 8ª a 12ª de 12 (jan–mai/2027) | 5 × R$ 900 |

  A guarda da sentinela **não alcança** esses dois: ambos são importados do Notion
  (`notion_page_id` preenchido) e, para importados, `calcular_comissoes_contrato` retorna
  antes de chegar na guarda. Ou seja, só saem por ação manual ou preenchendo a data real.

- [ ] **91 contratos com `valor_total = 0`** — precisam da fonte da verdade; não dá para
  corrigir automaticamente.
