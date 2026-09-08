# OMNX Desk — Progresso do Desenvolvimento

**Última atualização:** 04/08/2026 às 19h30 BRT

> Histórico por entrega, mais recente no topo. O que **falta** não mora aqui —
> mora no placar do brief em
> [`reestruturacao/ROADMAP-MODULARIZACAO.md`](./reestruturacao/ROADMAP-MODULARIZACAO.md).

## 2026-08-04 — App Atendimento, catálogo enxuto e Atendimento como tela inicial

- **App Atendimento** (Fase 4 do roadmap): demandas com etapa, responsável, prazo,
  aprovação, comentários e histórico automático por trigger; painel operacional,
  lista com filtros, kanban e configuração. 5 tabelas multi-tenant com RLS.
- **Segmento por empresa** (`tenants.atendimento_segmento`): Social Media, Clínica
  e Escritório mudam abas, métricas e vocabulário. Clínica não tem kanban nem
  métrica de aprovação — paciente não aprova peça.
- **Catálogo de apps reorganizado:** Loja com 3 apps; Dashboard virou legado em
  `/dashboard-legado` (fora do menu, não apagado); Cobrança e Portal arquivados.
- **Atendimento assumiu a tela inicial**, com o ícone que era do Dashboard.
  `HomePage` cai no legado se o app estiver desligado ou o perfil não tiver
  permissão — senão desligar o app deixaria a empresa sem home.
- **Dois defeitos latentes corrigidos:** `has_permissao()` no banco não tinha a
  escada de ações que o front tem (quem tinha `editar` não passava em `ver`), e
  as FKs de usuário nasceram apontando para `auth.users` em vez de `public.users`,
  o que quebraria o join do nome do responsável.
- **Skill `omnx-code` atualizada** v1.18 → v1.20.1, fechando o §1 do brief.

## 2026-07-27 — Zeragem das pendências dos roadmaps + auditoria

Varredura das 4 frentes que estavam em aberto. O levantamento no banco mostrou que
**parte já estava feita e nunca fora marcada** (a sentinela de datas já aplicada, a
duplicata do Danilo já inexistente, 4 das 6 linhas operacionais já sumidas).

- **Onda 1 — segurança e higiene:** headers no `vercel.json`, limites nos 3 buckets que
  estavam sem teto, CHECK de 5 MB no .docx dos modelos, `app_modules` para RESTRICTIVE,
  `types.ts` regenerado e `as any` removidos.
- **Onda 2 — duas datas de contrato:** `data_assinatura` (gatilho do Clicksign) e
  `data_pagamento` (derivada da entrada). Backfill 300/300 e 23. `data_fechamento`
  **intocada de propósito** — alterá-la dispararia recálculo de comissão em massa.
  Faturamento conferido antes/depois: R$ 4.853.945,25 em 221 ativos, idêntico.
- **Onda 3 — Fase 2 (permissões por app):** `permissoes_app` (perfil × recurso × ação) +
  `has_permissao()` + hook `can()`. Seed reproduz o gate anterior — 12/12 asserções.
  Matriz editável em `/admin`. 4 telas migradas; o resto segue no gate legado.
- **Onda 4 — Fase C do multi-tenant:** a ponte com o Empire dependia de uma função com
  `IF v_count <> 1 THEN RETURN` — quebraria para **todos** no dia da 2ª empresa. Agora
  resolve por tenant. Storage isolado por tenant sem mudar nenhum caminho de arquivo.
- **Onda 5 — pendências menores:** anexos e acompanhamento no reporte de erros, cadastro
  central de usuário completo.
- **Auditoria pré-deploy:** 1 P0 (regressão da Onda 4 — função com o secret da ponte
  aberta a `PUBLIC`) e 1 P1 (recursão na RLS de `users` mascarando escalonamento, que
  também quebrava a edição de colaboradores em produção). Ambos corrigidos com prova de
  exploração negativa. Gate `PASS`.
- **Bug reportado pelo usuário:** busca de contratos não achava por nome — eram duas
  causas somadas (sem normalização de acento + lista aberta filtrada por status,
  escondendo ~105 contratos). Corrigidas com teste.

**Pendências:** Fase 4 (App Atendimento) adiada para PRD próprio; Fases 7/8 contínuas;
`crm-buscar-lead`/`crm-sync-stats` no repo do CRM; decisão sobre 10 comissões previstas
(R$ 9.000) em 2 contratos sem data real; 91 contratos com valor zerado.

## 2026-07-23/24 — Épico Multi-tenant + Modularização + Higiene

A plataforma deixou de ser "1 empresa por clone" e virou **multi-tenant por linha**
(vários tenants no mesmo banco, isolados por `tenant_id` + RLS). Detalhes em
`docs/multi-tenant-roadmap.md` e `docs/reestruturacao/ROADMAP-MODULARIZACAO.md`;
changelog em `docs/MUDANCAS.md`.

- **Multi-tenant Fases A/A.2/B:** `tenant_id NOT NULL` em 106 tabelas + RLS
  RESTRICTIVE `tenant_isolation`. Teste cross-tenant e E2E de provisionamento OK.
- **Provisionamento de empresas:** tenant MESTRE cria empresas novas via tela
  `/empresas` + edge function `provision-tenant` + `seed_tenant`. Fix do
  `handle_new_user` (carimbo de `user_roles.tenant_id`) achado em teste.
- **Modularização:** catálogo `app_modules` com 5 apps ligáveis por tenant
  (dashboard/chat/contratos/cobranca/portal); guards `RequireApp`; tela `/apps`.
- **Reporte de erros** (`/reportes`), **desenredo Contratos×Comissões**, e
  **remoção de legado morto** (Comissões órfãs, Pipelines com drop das tabelas
  `sales_*`, Interações; telas internas de NPS/Entregas/Trilhas — Portal preservado).
- **Documentação:** criados `ARQUITETURA.md`, `UML.md`, `MUDANCAS.md`,
  `NIVEIS-DE-ACESSO.md`, `integracoes/README.md` e `integracoes/vercel.md`.

**Pendências (fora do épico):** Fase C do multi-tenant (edge `crm-*` + storage por
tenant, só relevante com a 2ª empresa), unificação de permissões (Fase 2),
App Atendimento (Fase 4), headers de segurança no `vercel.json` e `/security-auditor`.

## 2026-07-02 — Comissões por produto: tipo "valor total" + valores cadastrados

Bruno passou a tabela de comissões por produto. Como a comissão desses produtos é o
**valor total do contrato** (não por parcela), foi criado o tipo `valor_total` em
`produtos_comissao` (constraint + `calcular_comissoes_contrato` divide o valor pelas
parcelas). UI de Produtos (%) ganhou a opção "R$ total".

- Produtos criados no catálogo: **Acelerador Mensal** (R$500) e **Acelerador Advanced**
  (R$1.200) — contratos existentes vinculados.
- **BPO de Conteúdo** e **BPO Performance**: R$3.250 total (obs: R$3.850 quando 2
  conteúdos/dia — ajustar por contrato).
- Comissões zeradas corrigidas no banco: Erik Cabral 3×R$400, Carla 4×R$812,50,
  Bruno Dal Rovere R$500, Deane da Silva R$500 (criada), Davi Garcia R$3.250 e
  4 contratos BPO Performance de parcela única R$3.250.
- Ficam zerados (a definir): BPO Unlimited (Bruno Sevarolli), Acelerador de Audiência
  (Elvislaine) e Gabriel Campaner (contrato sem produto).

## 2026-07-02 — Módulo Contratos no menu principal + melhorias no Onboarding

Contratos e Onboarding saíram do módulo Comissões e viraram um módulo próprio no
menu principal (`/contratos`), com abas internas: **Dashboard | Contratos | Kanban |
Onboarding**. Rotas antigas (`/comissoes/contratos*`, `/comissoes/vendas-pendentes`)
redirecionam para as novas.

- **Novo dashboard de contratos** (`/contratos`): faturamento ativo, contratos ativos,
  ticket médio, distribuição por status, fechamentos por mês (12m), ranking de
  faturamento por produto e por estrategista.
- **Permissões**: mesmas de antes — módulo visível p/ admin/gerente/`acesso_contratos`;
  perfil atendimento vê só a aba Onboarding (dashboard redireciona).
- **Onboarding — edição ampliada**: além dos dados cadastrais, agora dá pra editar
  produto (select dos produtos cadastrados, sem texto livre), valor total negociado,
  pagamentos (adicionar/editar/remover) e comprovantes (anexar/remover), tudo com
  registro no histórico de edições.
- **Modal do Onboarding redesenhado**: header e rodapé fixos, corpo rolável, mais largo.
- **Bug de fuso corrigido**: datas de pagamento (`YYYY-MM-DD`) eram exibidas com 1 dia
  a menos (parse UTC); agora formatadas com parse manual.
- **Status dinâmico de contrato**: ao anexar o link/arquivo Clicksign (assinatura),
  o contrato sai de rascunho/"Não iniciado" e vira `ativo`/`ATIVO` automaticamente
  (no fluxo do chat e na tela de detalhe).
- **Contrato criado do onboarding mais completo**: preenche Empresa (razão social),
  Valor parcela (derivado do total quando não explícito), Vencimento (data da 1ª
  parcela) e endereço estruturado.
- **Migration**: policy de INSERT no bucket `vendas-comprovantes` p/ perfis
  admin/gerente/atendimento (aplicada em produção via MCP).

## 2026-06-25 — Chat: aba "Todos" mostra todos os grupos para atendimento

O perfil atendimento via poucos grupos mesmo na aba "Todos". Causas: (1) grupos de
clientes com estrategista atribuído saem da Caixa; (2) instâncias com `ocultar_grupos`
escondiam ~100 grupos de todos; (3) o default de escopo era reaplicado em re-renders,
impedindo permanecer em "Todos".

- `useConversations` ganhou flag `incluir_grupos_ocultos`: a aba "Todos" passa a exibir
  também os grupos de instâncias com `ocultar_grupos = true` (Caixa segue escondendo).
- `ChatInboxPage`: ativa a flag quando `clientScope === 'todos'`.
- Default de escopo por perfil agora é aplicado **uma única vez** (via ref) ao carregar
  o perfil — a escolha de aba do usuário não é mais sobrescrita.

## 2026-06-25 — Correção: e-mail de contrato assinado não chegava ao Bruno

A edge function `notificar-contrato-assinado` passou (em 09/06) a exigir um usuário
autenticado, mas o front a chamava via `supabase.functions.invoke` sem garantir o
envio do `access_token` da sessão — resultando em `401 Unauthorized` engolido em
silêncio. Nenhum e-mail era enviado desde então.

- Novo helper `src/lib/notificarContratoAssinado.ts`: envia o `access_token` da sessão
  explicitamente no header `Authorization` e propaga o erro do servidor.
- Os 3 pontos de disparo (salvar contrato, editar o campo de link, criar pelo chat)
  passaram a usar o helper e a **avisar na tela** quando o envio falha.
- Corrigido buraco no `ContratoDetailPage`: criar um contrato já com o link do
  Clicksign preenchido agora também dispara a notificação (antes só o update disparava).
- Reenviados manualmente os 6 e-mails atrasados (contratos com link adicionado entre
  09/06 e 25/06).

## 2026-05-07 — Módulo Comissões (`/comissoes`)

Entrega inicial do módulo de comissões dos consultores:
- Schema completo (`contratos`, `comissoes`, `extratos_mensais`, `produtos_comissao`, `salario_fixo_itens`) com RLS isolando estrategistas.
- Função SQL `calcular_comissoes_contrato` aplicando regra do dia 15 (corte → mês seguinte ou dois meses).
- Função `aprovar_extrato_mes` para fechamento mensal pelo gestor.
- View `v_alertas_estrategista` com entregas atrasadas (placeholders prontos para chat e ranking).
- Frontend: layout próprio `/comissoes`, sidebar dedicada, páginas Dashboard, Aprovações, Contratos, Produtos (%), Consultores, Extratos + visão de impressão A4 no padrão Exos.
- Edge function `notion-import` para puxar histórico das databases 2025 e 2026 (idempotente via `notion_page_id`).
- Doc completa em `docs/comissoes.md`.

Pendências: rodar a importação após o secret `NOTION_API_KEY` ser configurado no Supabase, executar `/security-auditor` antes do deploy, e ligar os sinais de chat/ranking quando os módulos estiverem maduros.


---

## Roadmap — Status por Fase

### Core EmpireDesk (Fases 1-12) — 100%

| Fase | Nome | Status |
|------|------|--------|
| 1 | Base do sistema (login, perfis, controle de acesso, cadastro) | ✅ Concluída |
| 2 | Produtos e Entregáveis (cadastro, geração automática de entregas) | ✅ Concluída |
| 3 | Conteúdo Rico (upload de todos os tipos, histórico de versões) | ✅ Concluída |
| 4 | Fluxo de Aprovação (aprovar/rejeitar, estrelas, feedback, notificações) | ✅ Concluída |
| 5 | Portal do Cliente (dashboard, lista de entregas, detalhe) | ✅ Concluída |
| 6 | Kanban e Calendário (drag-and-drop, calendário, visão consolidada) | ✅ Concluída |
| 7 | NPS (pesquisa periódica, pós-entrega, manual, relatório) | ✅ Concluída |
| 8 | Notificações (e-mails via Edge Function, notificações internas) | ✅ Concluída |
| 9 | Trilhas para Clientes (módulos, aulas, progresso, vinculação a produtos) | ✅ Concluída |
| 10 | Trilhas Internas (equipe, atribuição por perfil, acompanhamento) | ✅ Concluída |
| 11 | Relatórios (6 relatórios com exportação PDF/CSV) | ✅ Concluída |
| 12 | Refinamentos (interações, audit logs, resumo diário) | ✅ Concluída |

### EmpireChat — WhatsApp (Fases 13-20) — 100%

| Fase | Nome | Status |
|------|------|--------|
| 13 | EmpireChat — Base (instâncias UAZAPI, webhook, inbox, envio/recebimento) | ✅ Concluída |
| 14 | EmpireChat — Conversas (atribuição, transferência, notas, realtime) | ✅ Concluída |
| 15 | EmpireChat — IA (sentimento, sugestão de resposta, resumo, alertas) | ✅ Concluída |
| 16 | EmpireChat — Métricas (dashboard realtime, TMA/TMR, CSAT, score IA) | ✅ Concluída |
| 17 | EmpireChat — Automações (regras de bot, horários, respostas automáticas) | ✅ Concluída |
| 18 | EmpireChat — API e Webhooks (REST pública, HMAC-SHA256, API keys) | ✅ Concluída |
| 19 | EmpireChat — Campanhas (disparos em massa, agendamento, relatório) | ✅ Concluída |
| 20 | EmpireChat — Grupos (suporte a grupos WhatsApp, atribuição a dept.) | ✅ Concluída |

### EmpireCobranca (Fases 21-24) — 100%

| Fase | Nome | Status |
|------|------|--------|
| 21 | EmpireCobranca — Base (instâncias, devedores, réguas, envio automático) | ✅ Concluída |
| 22 | EmpireCobranca — IA (variação de mensagem por IA, seleção de modelo) | ✅ Concluída |
| 23 | EmpireCobranca — Inbox (conversas de cobrança, atribuição, anotações) | ✅ Concluída |
| 24 | EmpireCobranca — Importação e Relatórios (CSV, dashboard, exportação) | ✅ Concluída |

### Empire IA Bot (Fases 25-27) — 100%

| Fase | Nome | Status |
|------|------|--------|
| 25 | Empire IA Bot — Base (config de bots, regras de ativação, prompt, documentos) | ✅ Concluída |
| 26 | Empire IA Bot — Tool Calls (tools internas e externas, loop de execução, logs) | ✅ Concluída |
| 27 | Empire IA Bot — Playground (teste de bot sem envio real, logs de execução) | ✅ Concluída |

---

## Sprints Executadas

| Sprint | Escopo |
|--------|--------|
| 1 | Chat core: quick replies, notes, contact panel, filters, media, realtime |
| 2 | Attendance flow: transfer, new conv, status ticks, kanban DnD |
| 3 | IA + Automacao: bot config, auto-activation, SLA monitor, metrics dashboard |
| 4 | Cobranca completa: scheduler fix, IA variation, manual send, dashboard metrics |
| 5 | IA Avancada + Contatos: sentiment, suggest reply, summarize, contacts + tags, badges |
| 6 | Campanhas + Automacoes: broadcast + scheduler, automations page, business hours |
| 7 | CSAT + Relatorios: CSAT page + envio, 6 reports CSV/PDF, cobranca conversas inbox |
| 8 | Polish & Extras: grupos WhatsApp, notificacoes 7 tipos, config admin 7 secoes, bot tool calls |
| 9 | Final: API REST + API Keys, Webhooks HMAC, Audit logs, Interactions, Templates, Email queue |

---

## Inventário atual (04/08/2026)

Números conferidos no repositório e no banco nesta data — não copiados de
versões anteriores deste documento.

| | Quantidade |
|---|---|
| Telas (`src/pages/**/*.tsx`) | 78 |
| Edge Functions (`supabase/functions/`) | 38 + `_shared` |
| Migrations versionadas | ver `supabase/migrations/` |
| Empresas (tenants) em produção | 2 |
| Apps na Loja | 3 (Atendimento, Chat, Contratos) |

> O inventário tela a tela e function a function **saiu daqui de propósito**:
> ficava defasado a cada entrega e ninguém percebia. Para saber quais telas
> existem e quem alcança cada uma, use [`MAPA-DE-NAVEGACAO.md`](./MAPA-DE-NAVEGACAO.md),
> que é gerado a partir das rotas reais. Para as functions, `ls supabase/functions`.

---

## Infraestrutura

- **Supabase:** projeto `wuzmckatbmlpkdxtfhqr` (sa-east-1), multi-tenant com RLS
  `tenant_isolation` em todas as tabelas de negócio
- **Deploy:** Vercel (branch `main` → produção), domínio `desk.omnx.pro`
- **Buckets:** `chat-media`, `deliveries`, `vendas-comprovantes`,
  `reportes-anexos`, `atendimento-anexos`, `pj-notas` — todos com limite de
  tamanho e isolados por tenant
- **Cron:** SLA do chat (5 min), scheduler de cobrança (1 h), monitor de
  sincronização de vendas (diário)
