# Roadmap — Multi-tenant do omnx-desk (isolamento de dados)

> **Status:** Fases A, A.2, B e **C** concluídas e aplicadas em produção. Provisionamento de empresas (tenant + 1º admin) entregue. Os dados de negócio são isolados por tenant no banco, com teste cross-tenant passando. Resta apenas a parte da Fase C que vive no **outro repositório** (`crm-buscar-lead` / `crm-sync-stats`, no projeto `qzesffnkqgelmtfblzkr`).
> **Atualizado em:** 04/08/2026 às 18h20 BRT
> **Modelo atual:** multi-tenant com isolamento por RLS ativo; hoje ainda com 1 empresa (tenant `00000000-0000-0000-0000-000000000001`, marcada como MESTRE), pronto para receber a 2ª via tela **Empresas**.

## ✅ O que já foi aplicado

### Auditoria com 2ª empresa real — 04/08/2026 (migrations `20260804120000`–`20260804125500`)

Os testes anteriores usavam impersonação SQL. Desta vez criamos a empresa de verdade,
com admin próprio e login pela API (mesmo caminho do app), varremos as **103 tabelas**
e testamos escrita, Storage e o sentido inverso. **91 tabelas seguraram.** O que
faltava:

| Correção | Migration |
|---|---|
| `tenant_isolation` em `employees`, `positions`, `company_areas`, `subareas`, `profiles`, `tenant_integracoes` (liam — e as 2 primeiras **escreviam** — cross-tenant) | `120000` |
| `tenants`: SELECT só da própria empresa (ou admin do mestre); UPDATE deixou de ser `is_admin()` solto, que permitia reescrever a marca de qualquer empresa | `120000` |
| Storage: `contratos-anexos`/`reportes-anexos`/`vendas-comprovantes` liberavam arquivo **órfão** para qualquer tenant (comprovamos baixando um PDF da Aliança). `deliveries` e `pj-notas` não tinham trava alguma | `121000`, `125000`, `125500` |
| 11 funções internas passaram a carimbar `tenant_id` explícito, em vez de depender de `resolve_tenant_default()` — que só acerta com sessão de usuário **ou** com 1 tenant só. Com a 2ª empresa, gravação sem sessão passou a estourar NOT NULL | `122000` |
| Grupos internos de departamento liam `users`/`internal_conversations` sem filtro de tenant | `122000` |
| `handle_new_user` não cai mais no mestre por omissão: com 2+ empresas, cadastro sem `tenant_id` falha explicitamente | `123000` |
| `seed_tenant` clona áreas/subáreas/cargos do mestre — antes a empresa nova "pegava emprestado" o organograma alheio | `124000` |

Detalhe do Storage (`125000`/`125500`): a 1ª versão da regra usava `FOR ALL` e exigia
`owner = auth.uid()` no caso órfão, o que **quebrou todo upload** (no INSERT o owner
ainda não está gravado). Separamos por comando — INSERT aceita arquivo sem registro
ainda, leitura/alteração/remoção exigem o tenant certo — e passamos a ler também
`owner_id`, que é onde o Storage atual grava o autor.

Empresa de teste apagada ao fim; contagens da Aliança conferidas antes e depois
(333 contratos / 339 clientes / 1030 comissões / 35 usuários / 32 colaboradores).

- **Fase A** (`20260723120000_multitenant_fase_a_tenant_id.sql`): `tenant_id` + trigger de carimbo (`tg_set_tenant_id` / `resolve_tenant_default`) + backfill + índice em **98 tabelas de negócio**. Aditivo, não mudou acessos.
- **Fase A.2** (`20260723140000_multitenant_fase_a2_not_null.sql`): **APLICADA em 24/07/2026**. `SET NOT NULL` em `tenant_id` — hoje **106 tabelas** com `tenant_id NOT NULL` (0 nullable). Defesa extra contra insert via service_role sem tenant. Lock curto (tabelas pequenas, maior é `chat_messages` ~43k linhas).
- **Fase B** (`20260723130000_multitenant_fase_b_rls_isolation.sql`): policy **RESTRICTIVE** `tenant_isolation` em cada tabela (`tenant_id = get_user_tenant_id()`), combinando em AND com as regras de `perfil`. **98 policies**.
- **Provisionamento** (`20260723150000_multitenant_provisioning.sql` + edge function `provision-tenant` + tela `/empresas`): tenant MESTRE (`is_master`) cria empresas novas (tenant + 1º admin + `seed_tenant`). Porteiro `is_master_admin()`. `handle_new_user` tenant-aware. Fix do unique do kanban por tenant (`20260723160000`).
- **Fix `handle_new_user`** (`20260724130000`): passou a carimbar `user_roles.tenant_id` explícito. Bug achado no teste E2E — com >1 tenant + Fase A.2, criar usuário quebraria em `user_roles` (o carimbo automático resolve NULL sem sessão). Hoje (1 tenant) não afetava; teria quebrado ao criar a 2ª empresa.
- Órfão corrigido: usuário `herilly@...` ganhou profile no tenant único (senão ficaria sem acesso sob a Fase B).
- **Teste cross-tenant OK**: usuário do tenant 1 vê 324 contratos/336 clients/1032 comissões; usuário movido a um tenant fictício vê **0 de tudo**. Sem self-lockout.
- **Teste E2E do provisionamento OK** (transação com rollback, motor RLS real): empresa nova nasce com 5 apps + 6 colunas de kanban + 2 departamentos; o 1º admin é carimbado no tenant certo (users/profiles/user_roles), não herda cargo de outro tenant, e **vê 0 dados de negócio** — só os próprios 5 apps.

- **Fase C** (`20260727170000_onda4_fase_c_tenant.sql`, aplicada 27/07/2026):
  - `get_omnx_bridge_credential_tenant(tenant, provider)` resolve a credencial da ponte
    **por tenant**. A função anterior tinha `IF v_count <> 1 THEN RETURN` — só respondia
    enquanto existisse uma única integração ativa no banco, e cairia para todos no dia
    da 2ª empresa.
  - As 5 edge functions que usam a ponte passaram a resolver o tenant do objeto sobre o
    qual agem: `vendas-buscar-lead-crm` e `empire-conexao-test` pelo usuário logado,
    `vendas-sincronizar-crm` e `vendas-publicas-create` pela venda, e
    `empire-contrato-assinado-ghl` pelo contrato.
  - **Storage isolado por tenant** via policy RESTRICTIVE em `contratos-anexos` e
    `vendas-comprovantes`. O tenant do objeto é resolvido pela entidade dona, então
    **nenhum caminho de arquivo mudou** e nenhum upload existente quebrou.

### Pendências
- **Fase C — parte no outro repositório**: `crm-buscar-lead` e `crm-sync-stats` vivem no
  projeto `qzesffnkqgelmtfblzkr` (CRM Empire) e continuam globais. Redeploy lá exige
  `verify_jwt=false` — sem a flag, a ponte quebra com 401.
- **Ativação da ponte**: `tenant_integracoes` está vazia, então a integração roda hoje pelo
  fallback legado (env). A resolução por tenant só entra em ação quando o secret for
  cadastrado pela tela de Integrações.

## Onde estamos hoje (diagnóstico)

**Já existe (fundação):**
- Tabela `tenants` (+ branding por domínio, cores, logo, `custom_domain`).
- `profiles.tenant_id`, helpers `get_user_tenant_id()`, `has_role()`, `is_admin()` etc.
- Signup "admin-first": num clone novo, o 1º usuário vira dono de um tenant novo.
- Trava de domínio no `ProtectedRoute` (se o tenant do usuário ≠ tenant do domínio → signOut).
- Conector Empire por-tenant (ver `docs/integracoes/empire.md`).

**NÃO existe (o que falta pra ser multi-tenant de verdade):**
- As tabelas de negócio **não têm `tenant_id`**: clientes, entregas, produtos, chat, cobrança, contratos, comissões, vendas_pendentes, etc.
- O RLS delas é `USING (true)` + filtro por `perfil` — **qualquer usuário logado enxerga os dados de todos**. Sem isolamento por empresa.
- O frontend lê `users.perfil` (modelo legado) pra autorização; `profiles.tenant_id` só é usado pra branding/trava de domínio.

## O que precisa ser feito (fases sugeridas)

> ⚠️ É a mudança mais sensível possível no banco de produção. Fazer com backup (PITR), em fases pequenas e testadas, cada uma reversível. Nada de `db push` integral (histórico dessincronizado — usar Management API).

### Fase A — Adicionar `tenant_id` (aditivo, sem quebrar nada)
- `ALTER TABLE ... ADD COLUMN tenant_id uuid REFERENCES tenants(id)` em todas as tabelas de negócio.
- Backfill: preencher com o tenant default do clone (há só 1 hoje).
- Trigger `BEFORE INSERT` pra preencher automaticamente (via `get_user_tenant_id()` ou tenant único), padrão fail-closed (igual ao que o Empire fez na Fase 6).
- `NOT NULL` pelo caminho seguro (`NOT VALID` → `VALIDATE` → `SET NOT NULL`).
- Índice por `tenant_id` em cada tabela.

### Fase B — Reescrever o RLS pra isolar por tenant
- Trocar `USING (true)` por `tenant_id = (SELECT get_user_tenant_id())` (com `(SELECT ...)` por performance).
- Manter as regras de `perfil` como camada adicional (AND).
- Testar cross-tenant: usuário do tenant A não pode ler/escrever dado do tenant B (verificar com re-query, não só grep).

### Fase C — Frontend e edge functions cientes de tenant
- Autorização passar a considerar `tenant_id` além de `perfil`.
- Edge functions (ex.: `vendas-*`) resolverem o tenant dono da venda (hoje resolvem "o único tenant"); quando houver >1, resolver por `vendas_pendentes.tenant_id`.
- Storage: paths por tenant + policies por tenant.

### Fase D — Compatibilidade com empire-manager (fusão futura)
- Seguir o padrão 1:1 do empire-manager (enums, UUIDs alinháveis) — ver comentários das migrations de org (`20260508150000...`). Alinhar `tenants.id` na fusão.

## Pendências do conector Empire (relacionadas)
Ver `docs/integracoes/empire.md` → seção Roadmap:
1. Painel/RPC de geração do secret `omnx_desk` no lado Empire (bloqueia ativação).
2. `crm-buscar-lead` e `crm-sync-stats` multi-tenant (ainda globais).
3. Abrir/mergear PR do front + aposentar secret global legado.

## Critério de "pronto"
O omnx-desk é multi-tenant pleno quando: duas empresas coexistem na mesma instância, cada uma só vê seus próprios dados (provado por teste cross-tenant), e um clone novo nasce isolado automaticamente.
