# Integração com cami-plataforma-lb

> Status: **ativa · edge function deployada (07/05/2026)**
> Atualizado em: 07/05/2026 às 21h30 BRT

A plataforma `cami-plataforma-lb` é onde clientes e consultores/estrategistas executam tarefas de produção de conteúdo (roteiro, edição, aprovação). O omnx-desk consome esses dados em **modo read-only** via edge function, sem tabela espelho.

---

## Visão geral

```
omnx-desk (este projeto)                cami-plataforma-lb
─────────────────────                   ──────────────────
Dashboard / Entregas & Avaliações       content_cards
  ├─ useCamiDeliveries (front)          content_approvals
  └─ supabase.functions.invoke          workspaces
        ↓
     edge function "cami-deliveries"  ──→  query no Supabase do cami
        ↓                                    (com service_role do cami)
     payload normalizado                   filtra/junta/mapeia
```

**Princípios:**
- Sem tabela espelho no omnx — a edge function é a única ponte.
- Service-role key do cami **só vive como secret do Supabase do omnx**, nunca em `.env` versionado.
- Cache no front via React Query (`staleTime: 5 min`).
- Quando a integração estiver desligada, `isCamiIntegrationReady()` retorna `false` e o front mostra placeholder amigável sem chamar a função.

---

## Contrato da edge function `cami-deliveries`

### Localização sugerida
```
supabase/functions/cami-deliveries/index.ts
```

### Secrets necessárias (painel Supabase do omnx → Edge Functions → Secrets)
| Nome                       | Origem                                                   |
|----------------------------|----------------------------------------------------------|
| `CAMI_SUPABASE_URL`        | URL do projeto Supabase do `cami-plataforma-lb`          |
| `CAMI_SERVICE_ROLE_KEY`    | service_role do Supabase do cami (read-only via RLS bypass) |

> ⚠️ **Não adicionar nenhuma dessas variáveis ao `.env` do omnx.** Apenas no painel.

### Input (body do `supabase.functions.invoke`)
```ts
{
  clientId?: string                  // filtra por cliente do omnx
  status?: CamiDeliveryStatus[]      // filtra por status
  includeArchived?: boolean          // default false
}
```

### Output
```ts
{
  deliveries: CamiDelivery[]         // ver tipo em src/hooks/useCamiDeliveries.ts
  unmappedWorkspaces?: string[]      // workspaces do cami sem cliente correspondente no omnx
  fetchedAt: string                  // ISO timestamp
}
```

### Lógica do servidor

1. **Autorização**: validar JWT do usuário chamando `getUser()`. Se for `admin`/`gerente`, devolve tudo. Se for estrategista, filtra por `clients` que ele tem assignment ativo.

2. **Mapeamento workspace cami → cliente omnx**:
   - Precisa de uma coluna no omnx (ex: `clients.cami_workspace_id`) ligando os dois sistemas.
   - Se essa coluna ainda não existir, a function deve retornar `unmappedWorkspaces` populado para o front exibir alerta.

3. **Query no Supabase do cami** (usar `createClient(CAMI_SUPABASE_URL, CAMI_SERVICE_ROLE_KEY)`):
   ```sql
   SELECT
     c.id, c.title, c.description, c.channel, c.final_format,
     c.status, c.stage, c.responsible, c.responsible_party,
     c.scriptwriter, c.editor_name, c.designer, c.poster_name,
     c.script_deadline, c.edit_deadline, c.production_date, c.publish_date,
     c.client_deadline_at, c.destination_profiles, c.labels,
     c.publish_url, c.source_file_url, c.internal_notes,
     c.delivered_at, c.client_approved_at, c.roteiro_approved_at,
     c.consultant_submitted_at, c.created_at, c.updated_at,
     c.created_by AS estrategista_cami_user_id,
     c.workspace_id,
     w.name AS workspace_name,
     -- Avaliação: pega o último approval com client_rating válido por card
     a.client_rating AS rating,
     a.client_notes AS rating_notes,
     a.client_action_at AS rating_at,
     COALESCE(a.auto_approved, false) AS auto_approved
   FROM content_cards c
   LEFT JOIN workspaces w ON w.id = c.workspace_id
   LEFT JOIN LATERAL (
     SELECT client_rating, client_notes, client_action_at, auto_approved
     FROM content_approvals
     WHERE card_id = c.id
     ORDER BY client_action_at DESC NULLS LAST
     LIMIT 1
   ) a ON TRUE
   WHERE ($1::text IS NULL OR c.workspace_id = ANY($1::uuid[]))
   ORDER BY c.updated_at DESC
   LIMIT 500;
   ```

4. **Resolução de estrategista**:
   - O cami guarda `created_by` (user no Supabase do cami).
   - O omnx tem outro user pool. A function precisa traduzir: `cami.users.email → omnx.users.email → omnx.users.id`.
   - Devolve `estrategista_user_id` já como id do omnx (ou `null` se não bater).

5. **Filtro de status/archived** aplicado ao final.

### Códigos de erro
- `401` se sem JWT
- `403` se usuário não tem acesso ao client filtrado
- `503` se secrets do cami estiverem ausentes (com mensagem clara)

---

## Como ligar a integração

1. Confirmar que a coluna de mapeamento `clients.cami_workspace_id` (ou similar) existe no omnx — criar migration se não existir.
2. Garantir que o pool de usuários (`users.email`) bate entre os dois projetos.
3. Adicionar secrets `CAMI_SUPABASE_URL` e `CAMI_SERVICE_ROLE_KEY` no painel do Supabase do omnx.
4. Implementar `supabase/functions/cami-deliveries/index.ts` seguindo o contrato acima.
5. Deploy: `supabase functions deploy cami-deliveries`.
6. Trocar `isCamiIntegrationReady()` em `src/hooks/useCamiDeliveries.ts` para retornar `true`.
7. Smoke test: dashboard deve mostrar o card "Performance por estrategista" com a sub-aba **Entregas & Avaliações** alimentada por dados reais.

---

## Modelo das avaliações (referência do cami)

| Campo                             | Tipo        | Origem (cami)                        |
|-----------------------------------|-------------|--------------------------------------|
| `rating`                          | int 1-5     | `content_approvals.client_rating`    |
| `rating_notes`                    | text        | `content_approvals.client_notes`     |
| `rating_at`                       | timestamptz | `content_approvals.client_action_at` |
| `auto_approved`                   | bool        | `content_approvals.auto_approved`    |

**Regras de agregação adotadas no omnx:**
- `auto_approved = true` → não conta na média (evita inflar score por timeout).
- Mínimo de **3 avaliações** pra `scoreEntregas` virar valor (senão fica `null`).
- Conversão: `score = round(((avg_rating - 1) / 4) * 100)` → escala 0–100.

---

## Arquivos no omnx que dependem deste contrato

| Arquivo                                     | Papel                                            |
|---------------------------------------------|--------------------------------------------------|
| `src/hooks/useCamiDeliveries.ts`            | Tipos `CamiDelivery`, `CamiDeliveryStats`, hook  |
| `src/hooks/useDashboardMetrics.ts`          | Calcula `scoreEntregas` por estrategista         |
| `src/components/dashboard/PerformancePanel.tsx` | Renderiza a sub-aba "Entregas & Avaliações"  |
| `src/components/dashboard/CamiDeliveriesPanel.tsx` | Lista entregas no overview                |
| `src/pages/entregas/EntregasCamiPage.tsx`   | Página completa de entregas                      |
