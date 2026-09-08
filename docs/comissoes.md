# Comissões

> Módulo `/comissoes` — controle mensal de comissões e repasses dos consultores
> (estrategistas comissionados e prestadores de salário fixo).

Atualizado em: 07/05/2026 às 20h00 BRT

---

## Visão geral

O módulo permite à gestão acompanhar, ajustar e aprovar mês a mês os valores
devidos a cada consultor, gerando um extrato no padrão "Extrato de Produção
e Repasses" da Exos Consultoria Digital.

Existem dois tipos de consultor:

| Tipo            | Cálculo                                                                 |
|-----------------|-------------------------------------------------------------------------|
| `comissao`      | % sobre cada parcela do contrato fechado, com regra de corte do dia 15. |
| `salario_fixo`  | Lista manual de clientes/valores fixos por mês (ex: Matheus Henrique).  |

---

## Modelo de dados

```
users (existente)
  └─ tipo_consultor       : 'comissao' | 'salario_fixo' | NULL
  └─ salario_fixo_mensal  : numeric (apenas se tipo_consultor='salario_fixo')
  └─ cnpj_cpf             : text
  └─ ativo_comissoes      : boolean

produtos_comissao
  └─ produto_id (PK, FK products)
  └─ percentual_padrao   : numeric  -- % padrão sobre o valor de cada parcela
  └─ parcelas_padrao     : int      -- nº de parcelas sugerido (default 1)

estrategista_comissao_override (opcional, raro)
  └─ user_id (FK users)
  └─ produto_id (FK products)
  └─ percentual_custom

contratos
  └─ id, cliente_id, produto_id, estrategista_id (FK users)
  └─ data_fechamento, valor_total, num_parcelas
  └─ status              : 'ativo' | 'cancelado' | 'concluido'
  └─ observacoes
  └─ notion_page_id      : text NULL  -- idempotência da importação

comissoes               -- linha por (contrato, mês de referência)
  └─ id, contrato_id, estrategista_id
  └─ mes_referencia      : date (sempre dia 01)
  └─ valor_calculado     : numeric (a partir de % × parcela)
  └─ valor_final         : numeric (gestor pode editar)
  └─ status              : 'prevista' | 'aprovada' | 'paga' | 'cancelada' | 'postergada'
  └─ postergada_para     : date NULL
  └─ extrato_id          : FK extratos_mensais NULL
  └─ observacoes_gestor
  └─ editado_por (FK users), editado_em

extratos_mensais        -- snapshot aprovado de um mês
  └─ id, estrategista_id, mes_referencia
  └─ total_bruto, total_liquido
  └─ status              : 'rascunho' | 'aprovado' | 'pago'
  └─ aprovado_por, aprovado_em, pago_em
  └─ UNIQUE(estrategista_id, mes_referencia)

salario_fixo_itens      -- linhas manuais para consultor de salário fixo
  └─ id, extrato_id, cliente_id (NULL ok), descricao, valor
```

---

## Regras de negócio

### Corte do dia 15

Para cada contrato com `tipo_consultor='comissao'`:

- Fechado **até dia 15 (inclusive)** → 1ª parcela vence no **mês seguinte**.
- Fechado **a partir do dia 16** → 1ª parcela vence em **dois meses**.

Exemplo: contrato fechado em 10/abril → 1ª parcela compete a maio.
Contrato fechado em 20/abril → 1ª parcela compete a junho.

A função SQL `calcular_comissoes_contrato(contrato_id)` é executada via trigger
após inserção em `contratos` e gera N linhas em `comissoes` (uma por parcela).

### Edição pelo gestor

- O gestor pode editar `valor_final`, mover `mes_referencia` (`postergada_para`)
  ou cancelar (`status='cancelada'`) qualquer linha em status `prevista`.
- Toda edição é registrada em `editado_por` / `editado_em` + `observacoes_gestor`.
- Linhas em `aprovada`, `paga` ficam imutáveis (somente admin pode reabrir).

### Aprovação do extrato

1. Gestor abre `/comissoes/aprovacoes` no início do mês.
2. Vê todas as comissões `prevista` para o `mes_referencia` corrente.
3. Vê alertas ao lado de cada estrategista (entregas atrasadas, ranking, chat).
4. Edita o que precisa, depois clica **Aprovar mês**.
5. Sistema cria `extratos_mensais` com `status='aprovado'`, vincula as linhas
   (`comissoes.extrato_id`) e marca cada linha como `status='aprovada'`.
6. Estrategista passa a enxergar o extrato na sua tela `/comissoes`.

### Visibilidade (RLS)

- **Estrategista** (`perfil='estrategista'`): vê só as suas comissões em
  status `aprovada/paga` e seus extratos `aprovado/pago`. Nunca vê de outros.
- **Gestor/Admin** (`perfil IN ('admin','gerente')`): vê tudo, edita tudo.

### Alertas para o gestor

A view `v_alertas_estrategista` consolida por `(estrategista_id, mes_referencia)`:

- `entregas_atrasadas`: contagem de `deliverables` com prazo vencido.
- `chat_negativo`: tickets/menções negativas dos clientes do estrategista.
- `ranking_pos`: posição no ranking interno (quando módulo estiver pronto).

O gestor vê esses alertas em destaque antes de aprovar o extrato.

---

## Layout do extrato (PDF)

Mesmo template do exemplo `extrato_Matheus_Henrique.pdf`:

```
EXTRATO DE PRODUÇÃO E REPASSES
Competência: <MÊS>/<ANO>
Data de emissão: <data>

[ Empresa Pagadora            ] [ Prestador de Serviços      ]
  Exos Consultoria Digital Ltda  <Nome do consultor>
  CNPJ: 49.732.649/0001-96       CNPJ/CPF: <doc>

| Cliente                  | Valor <Mês>/<Ano> |
|--------------------------|------------------:|
| <cliente 1>              | R$ ...            |
| <cliente 2>              | R$ ...            |
| ...                      |                   |
| Total a Repassar         | R$ ...            |
```

Implementação: rota `/comissoes/extrato/:id/print` renderiza HTML otimizado
para A4 + classe `print:` do Tailwind. Botão **Imprimir / Salvar PDF** dispara
`window.print()`. Não adicionamos `@react-pdf/renderer` para manter o bundle
enxuto — o navegador resolve a geração do PDF.

---

## Estrutura de pastas

```
src/
├── components/layout/ComissoesLayout.tsx
├── pages/comissoes/
│   ├── ComissoesDashboardPage.tsx        (gestor)
│   ├── ContratosPage.tsx                 (gestor)
│   ├── ProdutosComissaoPage.tsx          (gestor — % padrão)
│   ├── ConsultoresPage.tsx               (gestor — tipo, salário fixo)
│   ├── AprovacoesPage.tsx                (gestor — fluxo de aprovação mensal)
│   ├── ExtratosPage.tsx                  (lista; gestor vê todos, estrategista só os seus)
│   ├── ExtratoDetailPage.tsx
│   └── ExtratoPrintPage.tsx              (rota dedicada para impressão)
└── hooks/useComissoes.ts
```

---

## Importação histórica do Notion

Aguardando o usuário gerar a `NOTION_API_KEY` (integração interna read-only,
conectada às páginas de 2025 e 2026). Quando disponível:

1. Setar `NOTION_API_KEY` como secret na edge function (não comitar).
2. Edge function `notion-import` chama `databases.query` para cada página.
3. Mapeia cada linha em `contratos` (upsert por `notion_page_id`).
4. Trigger `calcular_comissoes_contrato` gera as linhas mensais.
5. Reusa o mesmo fluxo de aprovação para meses passados (gestor pode aprovar
   retroativamente).

---

## Fora de escopo (v1)

- Geração de boletos / integração com sistema de pagamento.
- Cálculo de impostos / retenção.
- Comissão escalonada (% maior conforme volume).
- Comissão compartilhada entre múltiplos estrategistas no mesmo contrato.
