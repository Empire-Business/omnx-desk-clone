# Auditoria da Arquitetura Atual — omnx-desk

> Fase 0 da Reestruturação Modular. Documento de descoberta — retrato do sistema **como está hoje**, baseado no código real (não em suposição).
> Atualizado em: 23/07/2026 BRT
>
> ⚠️ **NOTA (24/07/2026):** este documento é a fotografia de 23/07 e algumas premissas
> **mudaram**. Em especial: o modelo deixou de ser "1 empresa por clone (single-tenant
> físico)" e passou a ser **multi-tenant por linha** (`tenant_id` + RLS). Para o estado
> vigente, ver `../ARQUITETURA.md`, `../multi-tenant-roadmap.md` e `../UML.md`. Os
> problemas de permissões (§4) e a fronteira Contratos×Comissões (§9) foram tratados —
> ver `NIVEIS-DE-ACESSO.md` e o `ROADMAP-MODULARIZACAO.md` (Fase 3/6).

---

## 1. Contexto e objetivo da reestruturação

O omnx-desk será transformado em uma **plataforma modular** organizada em "apps" que o admin da instalação **liga/desliga** conforme a necessidade do cliente.

**Modelo de distribuição (confirmado):** o omnx-desk é um **template repository no GitHub**. Cada cliente recebe **um clone próprio** — repositório, deploy e **banco Supabase separados**. O isolamento entre clientes é **físico**, não por linha no banco.

> Consequência importante: **não é necessário** implementar multi-tenant pleno (coluna `tenant_id` em toda tabela + RLS por tenant). Isso está inclusive documentado no próprio código — a migration `20260722000000_tenant_integracoes_empire.sql` declara o modelo *"1 empresa por clone (Single-Tenant Lock)"*.

---

## 2. Estado atual — visão geral

O sistema **já possui uma modularização estrutural parcial**: as rotas são servidas por **4 layouts/shells independentes**, cada um com sua própria navegação. Isso é uma vantagem — Chat, Cobrança e Portal já são praticamente apps isolados.

| Shell / Layout | Rotas | Situação |
|---|---|---|
| `AppLayout` | `/` (Dashboard), `/clientes`, `/contratos/*`, `/produtos`, `/departamentos`, `/colaboradores`, `/configuracoes`, `/admin`, `/auditoria`, `/api-webhooks`, `/notificacoes`, `/nps`, `/relatorios`, `/pipelines`, `/entregas`, `/interacoes` | Miolo — mistura núcleo + vários módulos no mesmo menu |
| `ChatLayout` | `/chat/*` (~20 subrotas: inbox, bots, campanhas, kanban, csat, config, reuniões...) | **OMNXChat** — já isolado |
| `CobrancaLayout` | `/cobranca/*` (devedores, réguas, conversas, histórico) | **OMNXCobrança** — já isolado |
| `PortalLayout` | `/portal/*` (entregas, kanban, trilhas, nps) | **Portal do Cliente** — já isolado (voltado ao cliente final) |
| _(públicas)_ | `/login`, `/reset-password`, `/meet/:roomId`, `/vendas/nova` | Sem layout |

Todas as rotas do `App.tsx` (226 linhas) estão **vivas** — não são código morto.

---

## 3. Navegação / Menu

- **Sidebar real:** `src/components/layout/AppSidebar.tsx` (rodapé em `SidebarBottom.tsx`).
- **Menu estático dirigido por array em código:** constante `navItems` (linhas 45-67), em 3 seções — `PRINCIPAL`, `OPERAÇÃO`, `GESTÃO`. **Não vem de banco/config.**
- **Filtragem por permissão:** função `canSee` (linhas 135-148); cada item pode ter `roles`, `adminOnly`, `module`, `access: 'contratos'`.
- **Seletor de "hub"** (Desk / GT3 / CRM) hardcoded no sidebar; "CRM" marcado como "Em breve", GT3 aponta para `gt3.omnx.pro`. Puramente estático.

> **Não há sistema de feature flags nem de "app instalado/desligado" no nível da instalação.** A noção de "módulo" que existe (`useMyModules` em `useChat.ts`) é **visibilidade por usuário** (RBAC de menu), não ativação de app.

---

## 4. Autenticação & Permissões

- **Contexto:** `src/contexts/AuthContext.tsx` — Supabase Auth (senha, OTP e-mail, Google OAuth, reset). Busca perfil em `users` (`id, nome, email, perfil, foto_url, acesso_contratos`).
- **Guard de rota:** `src/components/auth/ProtectedRoute.tsx` — bloqueia não autenticados, suporta `allowedProfiles`, e tem **trava de domínio** (compara `profiles.tenant_id` com o tenant resolvido pelo domínio; se divergir, faz `signOut`).

### 🔴 Problema: dois sistemas de permissão coexistindo

1. **Perfil único (legado, em uso na UI):** `users.perfil TEXT CHECK IN ('admin','gerente','estrategista','atendimento','cliente','agente_chat','agente_cobranca','admin_cobranca')`. Quase todo o gating do front usa `user?.perfil === 'admin'`.
2. **RBAC formal (introduzido depois):** tabela `user_roles` + enum `app_role ('admin','manager','member')` + helpers SQL `has_role()`, `is_admin()`, etc. Usado nas RLS policies do organograma.
3. **Flags pontuais:** booleano `users.acesso_contratos`; `chat_departments.modulo_acesso`.

> Não é RBAC granular (matriz permissão × recurso × ação). É **perfil único** no front + RBAC de 3 papéis no banco + flags soltas. **Precisa ser unificado** para suportar permissões por app.

---

## 5. Multi-tenant / Isolamento

- Existe estrutura lógica de tenant: tabela `tenants`, `profiles(user_id, tenant_id)`, helper `get_user_tenant_id()`, RPC `get_tenant_by_domain()`, RLS nas tabelas de organograma.
- **Porém:** as tabelas de **negócio legadas** (`users`, chat, cobrança, contratos) **não têm `tenant_id`**. O isolamento efetivo é **físico (banco por clone)**, alinhado ao modelo Single-Tenant Lock.
- Não há `instancia_id`/`workspace`/`subconta` como tenant (as "instâncias" são de WhatsApp — `whatsapp_instances`).

> **Decisão de arquitetura:** manter o modelo single-tenant físico. A camada de liga/desliga de apps será **config por instalação**, não por subconta dentro de um banco compartilhado.

---

## 6. Configuração de módulos

- **Não existe** tabela de "apps instalados/ligados".
- `app_settings` (migration `20260311182959`): key-value global, RLS só-admin. Guarda parâmetros operacionais (SLAs, URLs, chaves), **não** toggles de módulo.
- `tenants.settings jsonb` existe mas está vazio (`DEFAULT '{}'`).
- `ConfiguracoesPage` trata de perfil/tema/PWA/push — **não** tem UI de ativar/desativar apps.

> É aqui que nasce a **Fase 1**: criar a camada de apps ligáveis (catálogo + estado por instalação + menu dinâmico).

---

## 7. Supabase

- **Migrations:** 84 arquivos em `supabase/migrations/` (de `20260310180128_create_users_table` a `20260722000000_tenant_integracoes_empire`).
- **Edge Functions:** ~36 funções em `supabase/functions/`. Destaques por domínio:
  - **Chat:** `chat-api`, `chat-broadcast-scheduler`, `chat-sla-monitor`, `uazapi-*`, `wa-warmup-*`, `ia-*` (bot, sentimento, sugestão, resumo).
  - **Contratos/Vendas:** `contrato-pdf`, `contrato-extract-pdf`, `contratos-alerts`, `notificar-contrato-assinado`, `empire-contrato-assinado-ghl`, `vendas-*`, `notion-import`.
  - **Cobrança:** `cobranca-scheduler`.
  - **Social Media:** `instagram-alerts`, `instagram-stats`, `instagram-stats-batch`.
  - **Infra:** `admin-create-user`, `send-email`, `send-push`, `webhook-dispatch`, `fetch-profile-pic`.

---

## 8. Reporte de erros / feedback

🔴 **Não existe** funcionalidade de reportar bug/erro/feedback/suporte hoje.
- Ocorrências de "report" no código são **relatórios de negócio**, não reporte de bugs.
- Item de menu "FAQ & Tutoriais" (`SidebarBottom.tsx`) é **stub** — `onClick` com `/* TODO: rota de FAQ */`, sem destino.
- Há infra de **auditoria** e **notificações**, mas nada de captura de erro do usuário final. Sem error tracking (Sentry) no código.

---

## 9. Acoplamentos e dívidas identificados

| # | Dívida | Impacto |
|---|---|---|
| 1 | `/contratos/*` é servido por componentes da pasta `src/pages/comissoes/` (`ContratosPage`, `ContratoDetailPage`, `ContratosKanbanPage`) + `ComissoesLayout.tsx` | Fronteira Contratos × Comissões não existe no código; nomenclatura confusa |
| 2 | Dois sistemas de permissão (`users.perfil` vs `user_roles`) | Bloqueia permissões por app; risco de brecha |
| 3 | Menu 100% estático em código | Impede liga/desliga de apps sem recompilar |
| 4 | Sem camada de "apps instalados" | Núcleo da modularização ainda não existe |
| 5 | Sem reporte de erros | Exigência do brief; construir do zero |
| 6 | Áreas candidatas a remoção (a confirmar): Pipelines, Interações, e parte de NPS/Entregas/Trilhas | Código morto/legado inflando o menu |

---

## 10. Conclusão da descoberta

O trabalho **não é** "criar apps do zero" nem "reescrever a fundação de dados". É:

1. **Aproveitar** os 4 shells já existentes como base dos apps.
2. **Construir** a camada de apps ligáveis (config por instalação + menu dinâmico) — _Fase 1_.
3. **Unificar** o modelo de permissões.
4. **Desenredar** Contratos de Comissões.
5. **Remover** o legado sem uso.
6. **Adicionar** o app de Atendimento Social Media e o Reporte de Erros.
7. **Limpar** a UX de cada app.

Próximo documento: `ROADMAP-MODULARIZACAO.md` (épicos, fases e ordem de execução).
