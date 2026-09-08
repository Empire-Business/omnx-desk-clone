# Integração omnx-desk → Empire (CRM de vendas) — multi-tenant

> **Status:** backend em produção (21/07/2026). Frontend em PR. **Ativação por-tenant pendente** (depende de trabalho no lado Empire — ver Roadmap).
> **Atualizado em:** 21/07/2026 às 18h00 BRT

## O que é

Toda venda fechada no omnx-desk é enviada ao dashboard **Empire** (CRM, projeto Supabase `qzesffnkqgelmtfblzkr`) via 3 funções-ponte (`crm-buscar-lead`, `crm-registrar-venda`, `crm-sync-stats`). Esta integração tornou o **lado omnx-desk multi-tenant**: em vez de um único secret global, cada instância/tenant usa **seu próprio secret**, guardado no Supabase Vault, enviado no header `x-omnx-desk-secret`. Modelo **"1 empresa por clone"**.

Spec do contrato (lado dev): `C:\Users\junio\Downloads\OMNX-DESK-INTEGRACAO-SPEC-DEV.md`.

## Arquitetura (lado omnx-desk — feito)

- **Cofre:** tabela `tenant_integracoes` (`tenant_id`, `provider='empire'`, `secret_key_id`→Vault, `base_url`, `rotation_version`). RLS: só admin lê (e só o ponteiro).
- **RPCs:** `save_omnx_integracao_secret` / `get_omnx_integracao_status` / `revoke_omnx_integracao` (admin, guarda interna) e `get_omnx_bridge_credential` (**service_role only**, decifra). Fail-closed.
- **Runtime:** `supabase/functions/_shared/empire-bridge.ts` resolve o secret do tenant (cofre) com fallback ao env legado `EMPIREDESK_BRIDGE_SECRET` (transição, sem regressão).
- **Functions religadas:** `vendas-sincronizar-crm`, `vendas-buscar-lead-crm`, `vendas-publicas-create` + nova `empire-conexao-test` (botão "Testar conexão").
- **UI:** Configurações → Integrações (só admin): colar/rotacionar o secret + testar + remover.

## Como o Empire identifica o tenant

`crm-registrar-venda` faz SHA-256 do secret recebido → RPC `resolve_workspace_by_omnx_desk_secret_digest` → workspace dono. Isolamento cross-tenant: 403 se a oportunidade for de outro workspace. Enquanto não há secret por-tenant cadastrado, cai no secret global legado.

## Segurança

Auditado (security-auditor v1.10, 21/07/2026): **gate PASS**, 0 P0/P1. Segredo nunca volta ao browser; Vault sem acesso a anon/authenticated; RPC de decifra é service_role only. Relatório em `security-report/`.

---

## 🗺️ Roadmap / pendências (retomar depois)

### 1. [PENDENTE — lado Empire `GHL-SUPABASE`] Painel/RPC para GERAR o secret por conta
**Bloqueia a ativação do caminho multi-tenant.** Hoje o Empire só tem o *resolver* (`resolve_workspace_by_omnx_desk_secret_digest`) — **não há RPC nem UI para emitir/rotacionar** o secret `omnx_desk` de um workspace. Falta construir no repo `GHL-SUPABASE` (produção do CRM, governança própria):
- RPC `save/generate` admin-guarded: gera secret forte, grava no Vault, seta `metadata.secret_sha256 = sha256(secret)` em `workspace_integration_credentials` (provider `omnx_desk`).
- Card visual em Administração → Integrações → omnx-desk (gerar / rotacionar / revelar-uma-vez).
- Teste ponta a ponta: gerar no Empire → colar no omnx-desk → "Testar conexão" verde com `source: tenant` → venda de teste aparecendo no dashboard do workspace certo.

### 2. [PENDENTE — lado Empire] Tornar `crm-buscar-lead` e `crm-sync-stats` multi-tenant
Hoje ainda são globais (não filtram por workspace). Quando entrar o 2º tenant, um tenant poderia buscar leads/stats de outro. Aplicar o mesmo roteamento por secret→digest→workspace do `crm-registrar-venda`.

### 3. [PENDENTE — omnx-desk] Abrir/mergear o PR do frontend
Branch `feat/integracao-empire-multitenant` pushada; PR ainda não aberto (gh CLI sem auth). Após merge, o Vercel publica a aba Integrações.

### 4. [FUTURO] Aposentar o secret global legado
Quando todas as instâncias tiverem secret por-tenant cadastrado, remover o fallback `EMPIREDESK_BRIDGE_SECRET` (env) das edge functions e do helper.
