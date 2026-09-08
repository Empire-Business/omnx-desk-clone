# ARQUITETURA — omnx-desk

> Documento canônico de arquitetura. Retrata o sistema **como está hoje**, já com o
> multi-tenant por linha aplicado. Complementa `reestruturacao/AUDITORIA-ATUAL.md`
> (que é a fotografia de 23/07, anterior à virada multi-tenant) e `UML.md`.
> Atualizado em: 24/07/2026 às 10h30 BRT

---

## ⚠️ Mudança de modelo (importante)

A `AUDITORIA-ATUAL.md` descreve o modelo antigo — **"1 empresa por clone"
(single-tenant físico)**. Essa decisão **foi revista**: o omnx-desk passou a ser
**multi-tenant por linha** (vários tenants no mesmo banco, isolados por
`tenant_id` + RLS). Este documento reflete o modelo **atual e vigente**. Toda
tabela nova nasce multi-tenant.

---

## 1. Diagrama textual da arquitetura

```
┌───────────────────────────────────────────────────────────────┐
│  Navegador (desk.omnx.pro)                                     │
│  React 18 + TS + Vite · Tailwind + shadcn/ui · React Router    │
│  TanStack Query (estado servidor) · Zod (validação)           │
└───────────────┬───────────────────────────────────────────────┘
                │ HTTPS (Cloudflare WAF/TLS na frente)
                │
        ┌───────▼────────┐        ┌──────────────────────────┐
        │  Vercel (CDN)  │        │  Supabase (sa-east-1)     │
        │  build do front│        │  projeto wuzmckatbmlp... │
        └────────────────┘        │                          │
                │ supabase-js      │  • Postgres + RLS        │
                └─────────────────►│    (tenant_isolation)    │
                                   │  • Auth (GoTrue)         │
                                   │  • Storage (buckets)     │
                                   │  • ~40 Edge Functions    │
                                   │  • Cron (pg_cron)        │
                                   └──────────┬───────────────┘
                                              │
             ┌────────────────────────────────┼────────────────────────┐
             ▼                ▼                ▼                        ▼
        UAZAPI(WhatsApp)  Empire/CRM(GHL)   Resend(e-mail)   OpenRouter/CloudConvert/LiveKit
```

---

## 2. Camadas e responsabilidades

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Frontend** | React 18 + TS (strict), Vite | UI, roteamento, gating por perfil/app |
| **Estado servidor** | TanStack Query | Cache e sincronização com o Supabase |
| **Validação** | Zod + React Hook Form | Formulários e contratos de dados |
| **Auth** | Supabase Auth (GoTrue) | Senha, OTP, Google OAuth, reset |
| **Dados** | Postgres + **RLS** | Persistência + isolamento por tenant |
| **Lógica de servidor** | Edge Functions (Deno) | Integrações, tarefas com `service_role`, webhooks |
| **Agendamento** | pg_cron | SLA monitor, cobrança scheduler, alertas, monitor de sync |
| **CDN/Segurança** | Cloudflare | WAF, TLS, rate limiting na borda |
| **Deploy** | Vercel | `main` → produção; outras branches → preview |

---

## 3. Estrutura de pastas (frontend)

```
src/
├── App.tsx                 # Roteamento central (4 shells + rotas públicas)
├── contexts/AuthContext    # Sessão + perfil do usuário
├── components/
│   ├── layout/             # AppSidebar (menu real), AppLayout, ChatLayout,
│   │                       #   CobrancaLayout, PortalLayout
│   └── auth/               # ProtectedRoute (trava de domínio) · RequireApp (guard de app)
├── hooks/                  # useAppModules, useProvisionTenant, useChat, useCobranca...
├── pages/                  # Uma pasta por domínio (chat/, cobranca/, portal/,
│                           #   contratos via comissoes/, empresas/, ...)
└── lib/                    # supabase client, utils, page-title

supabase/
├── migrations/             # Fonte de verdade do schema (aplicadas via MCP)
└── functions/              # Edge Functions (Deno)
```

> Os **4 shells** (`AppLayout`, `ChatLayout`, `CobrancaLayout`, `PortalLayout`) são
> a base física dos "apps" da modularização. Ver `reestruturacao/ROADMAP-MODULARIZACAO.md`.

---

## 4. Fluxo de dados (exemplo: enviar mensagem no Chat)

```
UI (ChatInboxPage) → useChat (TanStack Query) → supabase-js
   → Edge Function uazapi-send-message (service_role) → UAZAPI → WhatsApp
   ← webhook uazapi-webhook grava chat_messages (RLS carimba tenant_id)
   ← Realtime (Postgres changes) → UI atualiza
```

---

## 5. Estratégia de banco — multi-tenant por linha

- **Isolamento:** toda tabela de negócio tem `tenant_id NOT NULL` (106 tabelas).
  Carimbo automático no INSERT (`tg_set_tenant_id`); leitura/escrita filtradas por
  policy **RESTRICTIVE** `tenant_isolation` (`tenant_id = get_user_tenant_id()`),
  combinada em AND com as regras de perfil.
- **Provisionamento:** tenant MESTRE cria empresas novas; cada uma nasce isolada e
  com seu kit inicial (ver `multi-tenant-roadmap.md`).
- **Migrations:** aplicadas via **Supabase Management API / MCP** (o `db push`
  falha por histórico dessincronizado). Migration + código no mesmo commit.
- **Segurança:** `SUPABASE_SERVICE_ROLE_KEY` **nunca** no `.env`/código; segredos
  por tenant no **Vault**. Ver `integracoes/README.md` e a skill `/security-auditor`.

---

## 6. Decisões de arquitetura (e o porquê)

| Decisão | Justificativa |
|---|---|
| Multi-tenant por linha (não banco-por-clone) | Operar N empresas numa instância; provisionamento self-service; base para fusão futura com empire-manager |
| RLS RESTRICTIVE + perfil em AND | Isolamento por tenant é inegociável e independente das regras de papel |
| 4 shells como base dos apps | Chat/Cobrança/Portal já eram isolados — reaproveitar em vez de reescrever |
| `app_modules` fail-open | Em produção em uso, nada pode sumir por acidente — app só some por ação de admin |
| Edge Functions para `service_role` | Nunca expor a chave privilegiada ao browser |

---

## 7. Pendências arquiteturais (roadmaps)

- **Fase C (multi-tenant):** edge functions `crm-buscar-lead`/`crm-sync-stats` ainda
  globais; storage por tenant. Ver `multi-tenant-roadmap.md`.
- **Fase 2 (permissões):** unificar as 4 camadas de acesso. Ver
  `reestruturacao/NIVEIS-DE-ACESSO.md`.
- **Fase 3:** desenredar Contratos de `src/pages/comissoes/`.
