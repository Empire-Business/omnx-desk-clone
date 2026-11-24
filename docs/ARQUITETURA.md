# ARQUITETURA — omnx-desk

Integração Íris/GT3 publicada em produção em 27/10/2026, com autorização
expressa e teste real somente com Bruno: robô próprio, DM privada e carteira de
Jin (24 clientes) derivada no servidor. Migrations e correção das prévias do chat
aplicadas; evidências e limites em [IRIS-GT3.md](IRIS-GT3.md).
Estado operacional final: **piloto ativo somente para Bruno, em modo teste, carteira de Jin com 24 clientes; aviso às 08:00 America/Sao_Paulo, de segunda a sexta**.

> Documento canônico de arquitetura. Retrata o sistema **como está hoje**, já com o
> multi-tenant por linha aplicado. Complementa `reestruturacao/AUDITORIA-ATUAL.md`
> (que é a fotografia de 23/07, anterior à virada multi-tenant) e `UML.md`.
> Atualizado em: 06/11/2026 às 14h49 BRT — delta de atendimento e ajuda interna; §8: área da Íris, alertas contextuais e aviso sem agenda (versão anterior: 27/10/2026 às 15h48 BRT).

> **Adendo SSO:** `provision-tenant` aceita o ator técnico Empire OS por
> `X-Platform-Key`, reconcilia por `external_ref` e devolve um magic link de uso único.
> Senha e link de sessão não são persistidos no Empire OS.

---

## ⚠️ Mudança de modelo (importante)

A `AUDITORIA-ATUAL.md` descreve o modelo antigo — **"1 empresa por clone"
(single-tenant físico)**. Essa decisão **foi revista**: o omnx-desk passou a ser
**multi-tenant por linha** (vários tenants no mesmo banco, isolados por
`tenant_id` + RLS). Este documento reflete o modelo **atual e vigente**. Toda
tabela nova nasce multi-tenant.

---

## 1. Diagrama textual da arquitetura

### Delta publicado — atendimento e ajuda interna (06/11/2026)

Contrato: `prd.md` §0.8. A reorganização preserva os shells, URLs e gates existentes.
Atendimento, WhatsApp e Contratos ganham prioridade; opções de formatos de marketing
deixam os novos cadastros sem excluir registros anteriores.
O manual público é a fonte canônica da ajuda interna. Um endpoint autenticado
responde somente sobre uso da plataforma, sem ferramentas de consulta/alteração
de clientes. Os links da interface respeitam permissões e apps disponíveis.
O vínculo WhatsApp/ticket precisa de chave estável por pendência, resolução explícita,
idempotência e proteção da baixa manual. A ausência na memória resumida não encerra caso.
Correção de requisito do dono: a evidência de resolução é reconhecida automaticamente
pela IA em conversa natural, sem código/comando obrigatório. O classificador usa um
catálogo fechado de tickets abertos autorizados e referências reais das mensagens;
o worker aplica a conclusão somente após conferir escopo, origem e revisão, mantendo
casos ambíguos abertos. “Explícita” aqui qualifica a evidência de solução, não um
comando escrito pela equipe. Motivo, referências e versão do classificador ficam rastreáveis.
Produção foi autorizada expressamente. As duas migrations e os serviços foram
publicados, com catálogo/fontes conferidos. Webhook v90, analisador v9 e ajuda v2
estão ativos; duas migrations aplicadas (`20261106195505`, `20261106195522`) e
cron de 15 minutos ativo. O frontend foi publicado por GitHub→Vercel após a
[PR #29](https://github.com/Empire-Business/omnx-desk/pull/29), main `cb8676c6faca8d78854ded26c14b0a2163456795`.
Menus e opções de Nova demanda foram observados com Bruno autenticado; uma
pergunta real à ajuda recebeu resposta com IA, fontes e atalhos. A disponibilidade
HTTP observada dos serviços não comprova resolução de pedidos. Resolução/reabertura
real de WhatsApp, semântica do classificador, SQL/RLS/concorrência e isolamento
negativo entre empresas seguem pendentes. Evidências finais em
`reestruturacao/REORGANIZACAO-DESK.md`.

Antes da publicação, a etapa local registrava que a migration nova seria somente preparada/revisada, sem autorização de publicação nem de banco.

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

## 1.1 Contrato e clientes atendidos (adendo de 06/11/2026)

O contrato financeiro continua único. `contratos.cliente_id` identifica o principal; a relação `contrato_clientes` armazena adicionais e `contrato_clientes_atendidos` expõe o conjunto, respeitando a leitura autorizada. Atendimento e memória da Íris continuam por cliente. O lifecycle considera todos os atendidos; consumidores operacionais usam projeção própria sem financeiro. Não somar receita depois de expandir associações. Regras e operação: [CONTRATOS-VIGENCIA.md](CONTRATOS-VIGENCIA.md).

## 2. Camadas e responsabilidades

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Frontend** | React 18 + TS (strict), Vite | UI, roteamento, gating por perfil/app |
| **Estado servidor** | TanStack Query | Cache e sincronização com o Supabase |
| **Validação** | Zod + React Hook Form | Formulários e contratos de dados |
| **Auth** | Supabase Auth (GoTrue) | Senha, OTP, Google OAuth, reset |
| **Dados** | Postgres + **RLS** | Persistência + isolamento por tenant |
| **Lógica de servidor** | Edge Functions (Deno) | Integrações, tarefas com `service_role`, webhooks |
| **Agendamento** | pg_cron | SLA monitor, cobrança scheduler, alertas, monitor de sync, Automações WhatsApp (§8) |
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
- **Fase 9 (Automações WhatsApp):** telas de prévia e de agendamento ainda não
  existem no front (ver §8.6).

---

## 8. App Automações WhatsApp (`automacoes-wa`, Fase 9)

> Fonte: `docs/prd.md` §0.6 e `reestruturacao/ROADMAP-MODULARIZACAO.md` Fase 9.
> Backend das etapas 9.1–9.5 já está em produção. **Tudo nasce desligado** em
> cada empresa: nada sai até o admin ligar na tela.

Pense no app como um **carteiro automático**: o admin diz *para quem*, *quando* e
*por qual correio* (UAZAPI ou Zernio); o agendador do banco (pg_cron) acorda a
cada 15 min, pergunta "alguém está na hora?" e, se estiver, a edge function monta
a carta e entrega. O histórico (`wa_auto_envios`) é o protocolo de cada entrega.

### 8.1 Diagrama

```
┌──────────────── Navegador (quem tem automacoes-wa · admin) ────────────────┐
│ /automacoes-wa/:aba  Início · Conexão · Relatório diário · Pontos de       │
│  atenção · Assistente · Resumo semanal · Reuniões · Histórico · Vínculos*  │
│  (* Vínculos e "WhatsApp pessoal da equipe": só admin/gerente)             │
└───┬───────────────┬────────────────────┬───────────────────────────────────┘
    │ supabase-js   │ RPC                │ functions.invoke (JWT do usuário)
    │ (RLS)         │ vinculos_*         │
    ▼               ▼                    ▼
 wa_auto_config    cliente_canais     wa-auto-testar-envio · wa-auto-backtest
 wa_auto_gestores  (vínculo por       wa-auto-agendar · wa-auto-templates
 wa_auto_regras_   canal)             wa-agente-admin (proteger número, simular,
   anomalia        equipe_identidades   boas-vindas) · wa-vinculos-sugerir (botão)
 wa_agente_*       (WhatsApp da       wa-relacionamento-analisar (só prévia)
 wa_auto_envios    equipe)

WhatsApp ─► UAZAPI ─► uazapi-webhook  (…/uazapi-webhook/k/<token> = número protegido)
              grava a mensagem + AUTOR (cliente | equipe | ia) ─► chat_messages
              herda o vínculo pelo canal ◄─ cliente_canais
              áudio/imagem ─► fila chat_midia_texto
              chamou a Íris no grupo liberado? ─► fila wa_agente_pedidos
              (áudio: citando a Íris = quote; de membro  │ (pg_net na hora + varredura 1/min)
               sem menção/citação = gatilho 'audio')     ▼
                                       wa-agente-responder ─► OpenRouter (Claude Opus 5.5)
                                       áudio: transcrição pronta ou NA HORA (Gemini 2.5 Flash)
                                       ─► grava 'ok' em chat_midia_texto; gatilho 'audio' só
                                          segue se o nome da Íris aparecer na fala
                                       ferramentas só de leitura, escopo do servidor
                                       ─► resposta no MESMO grupo, pela UAZAPI

┌──────────────────────── pg_cron (horário de Brasília) ─────────────────────────┐
│ wa-agente-varredura-1min           (1 min)    ──► wa-agente-responder           │
│ wa-midia-processar-5min            (5 min)    ──► wa-midia-processar ─► Gemini   │
│ wa-relacionamento-analisar-diario  (06:00–07:45, a cada 15 min)                  │
│                                               ──► wa-relacionamento-analisar     │
│ wa-vinculos-sugerir-diario         (06:30)    ──► wa-vinculos-sugerir            │
│ wa-auto-relatorio-diario-15min     (15 min)   ──► wa-auto-relatorio-diario       │
│ wa-auto-resumo-semanal-15min       (15 min)   ──► wa-auto-resumo-semanal         │
│ retenções: envios 90 d · pedidos 30 d · execuções 90 d · relacionamento_hist 180 d│
└───────────────── todos com header x-cron-secret (segredo lido do Vault) ────────┘

Linha do tempo do cliente (cliente_timeline: todas as conversas, todos os números,
com autor e transcrição; nunca grupo interno)
   ├─► wa-relacionamento-analisar ─► cliente_relacionamento (+ _hist)
   │                                   └─► relatório diário: "Clientes insatisfeitos" / "Clientes em risco"
   └─► Íris: historico_cliente

Envio: Edge functions → _shared/wa-provider.ts → UAZAPI (POST {base}/send/text)
                                               → Zernio (POST /inbox/conversations …)
IA (sempre OpenRouter, data_collection 'deny'):
  mensagens da UAZAPI reescritas → Claude Sonnet 5.5 · resumo semanal, Íris e
  relacionamento → Claude Opus 5.5 · áudio → Gemini 2.5 Flash · imagem → Gemini 2.5 Flash-Lite
```

### 8.2 Peças

| Peça | Onde | Papel |
|---|---|---|
| Tabelas da base | migration `20261026120000` | `wa_auto_config` (1 por empresa), `wa_auto_gestores` (máx. 10), `wa_auto_regras_anomalia` (4 regras), `wa_auto_envios` (histórico) |
| Cofre de segredos | `20261026140000` | `tenant_integracoes.provider` aceita `uazapi`/`zernio`; token/chave no **Vault**; `base_url` só `https://*.uazapi.com` ou `https://*.zernio.com` (`wa_base_url_permitida`) |
| Adaptador | `supabase/functions/_shared/wa-provider.ts` | `resolveWaProvider(admin, tenantId)` lê config + segredo e devolve `sendText`/`sendTemplate`; timeout 12 s, no máx. 1 nova tentativa só quando não duplica; disjuntor |
| Regras puras | `_shared/wa-mensagem.ts` (espelho de `src/lib/waMensagem.ts`), `_shared/wa-relatorio.ts`, `wa-auto-resumo-semanal/regras.ts` | Modelos de mensagem, chave de idempotência, validação de destino, conversão modelo → template oficial |
| Coleta do relatório | `_shared/wa-relatorio-dados.ts` | Lê as 4 anomalias e grupos sem cliente, sempre com `.eq('tenant_id', …)`; não lê reuniões enquanto não houver integração de agenda; opções "separar por estrategista" e "só clientes ativos" (`20261027100000`) |
| Agendador | `20261026160000` e `20261026170000` | Segredo `wa_auto_cron_secret` no Vault; RPC `wa_auto_cron_secret_confere`; RPC `wa_auto_queda_volume`; jobs do diário, semanal e retenção |
| Trava do link | `20261026180000` | Índice único `uq_wa_auto_envios_agendamento_reuniao`: 1 link pendente/enviado por reunião |
| Grupos internos restritos | `20261026260000` | `chat_contacts.restrito_admin`: grupo interno só aparece para admin/gerente |
| **Íris — base** | `20261027090000`, `20261027091000` | `wa_webhook_tokens` (só o sha256 do token de cada número), `wa_agente_membros`, `wa_agente_grupos` (+ `acesso_total`), `wa_agente_grupo_numeros` (principal + reservas), fila `wa_agente_pedidos` (única por `message_id_wpp`), log `wa_agente_execucoes` (sem texto), colunas `agente_*` em `wa_auto_config` |
| **Íris — aprendizado** | `20261027101000` | `wa_agente_aprendizados`: preferências ensinadas pela equipe (máx. 50 ativas por empresa), entram no prompt abaixo das regras |
| **Íris — perfil administrativo** | Sem nova migration | Uma linha JSON versionada em `app_settings.valor`, chave `wa_agente_perfil:<tenant_id>`; personalidade e contexto de até 32 mil caracteres cada (64 mil no total), autor, data e revisão para controle de concorrência |
| **Vínculos pelo canal** | `20261027110000` | `cliente_canais` (sugerido/confirmado/rejeitado/interno/não é cliente), `vinculos_execucoes`, RPCs `vinculos_*`, `match_contact_to_client` corrigida, cópia `private.backup_vinculos_20261027_*` |
| **Autoria** | `20261027120000` | Colunas `autor_*` em `chat_messages`; `equipe_identidades` (números da empresa, membros da Íris e WhatsApp pessoal da equipe; LID aprendido); gatilho "aguardando resposta" usa `autor_tipo` |
| **Transcrição/descrição** | `20261027130000` | `chat_midia_texto` (fila + texto, mesma RLS da mensagem), RPC `chat_midia_reivindicar` |
| **Linha do tempo** | `20261027140000` | `cliente_timeline`, `cliente_canais_resumo` (só servidor); exclusão de grupo interno dentro do banco |
| **Relacionamento** | `20261027150000` | `cliente_relacionamento` (1 linha por cliente) + `cliente_relacionamento_hist` (só acrescenta); RPC `wa_auto_grupos_sem_cliente`; desagenda `wa-auto-satisfacao-diaria` |

### 8.3 As edge functions

| Função | Quem chama | Autenticação | `verify_jwt` no gateway |
|---|---|---|---|
| `wa-auto-testar-envio` | Botão "Enviar teste" (aba Conexão) | JWT + `users.perfil = 'admin'` | padrão (`true`) |
| `wa-auto-backtest` | Prévia do relatório e painel "Pontos de atenção" | JWT + `users.perfil = 'admin'` (painel aceita `automacoes-wa · admin`) | padrão (`true`) |
| `wa-auto-agendar` | Reuniões (ações `grupos`, `marcar`, `enviar_link`) | JWT + `has_permissao('automacoes-wa','editar')` | padrão (`true`) |
| `wa-auto-templates` | Modelos oficiais (Zernio) | JWT + `users.perfil = 'admin'` | padrão (`true`) |
| `wa-agente-admin` | Área Íris: ler/salvar perfil administrativo, "Proteger conexão", simular, boas-vindas e catálogo de ferramentas (somente leitura) | JWT + `has_permissao('automacoes-wa','admin')` | padrão (`true`) |
| `wa-agente-responder` | Gatilho da fila (pg_net) + varredura de 1 min | `x-cron-secret` conferido no Vault | **`false`** |
| `wa-auto-relatorio-diario` | pg_cron | `x-cron-secret` | **`false`** |
| `wa-auto-resumo-semanal` | pg_cron | `x-cron-secret` | **`false`** |
| `wa-vinculos-sugerir` | pg_cron 06:30 e botão "Recalcular sugestões" | `x-cron-secret`, ou JWT + `vinculos_pode_gerir` (1×/min) | **`false`** |
| `wa-midia-processar` | pg_cron a cada 5 min (só se houver pendente) | `x-cron-secret` | **`false`** |
| `wa-relacionamento-analisar` | pg_cron 06:00–07:45; prévia de até 5 clientes pela tela | `x-cron-secret`, ou JWT + `vinculos_pode_gerir` (só `dry_run`) | **`false`** |
| `wa-auto-satisfacao` | **Aposentada** (job desagendado em `20261027150000`; fica para rollback) | `x-cron-secret` | **`false`** |

> As funções de cron **precisam** de `verify_jwt = false` (`supabase/config.toml`):
> o cron não tem JWT, a proteção real é o segredo. Um redeploy sem a flag faz o
> cron receber 401. As que também aceitam o botão da tela validam o JWT por dentro.

### 8.4 Fluxos

**Relatório diário** — o cron chama a cada 15 min → a função lista as empresas com
`relatorio_ativo` cuja `relatorio_hora` (fuso de Brasília) já passou, com tolerância
de 3 h → para cada gestor ativo: reserva a linha em `wa_auto_envios` com a chave
`relatorio_diario:<telefone>:<AAAA-MM-DD>` **antes** de enviar → envia (UAZAPI =
texto; Zernio = modelo `template_relatorio`) → atualiza o status. Pausa de 1,5 s
entre gestores. O histórico guarda só **contagens**, nunca nomes de cliente.
O modo manual da mesma função aceita JWT de administrador ativo, confere empresa,
app e um único grupo cadastrado, e compartilha a coleta e a redação do diário.
Antes de enviar, reserva `wa_auto_envios.id = request_id` e uma chave manual
separada do cron; repetir o pedido devolve o resultado registrado sem reenviar,
inclusive quando a entrega ficou incerta. A prévia manual não grava nem envia.
O destino pode ser um gestor no privado **ou um grupo interno** (só grupo sem
vínculo com cliente, marcado como restrito). Opções (`20261027100000`, ligadas na
empresa principal a pedido do Sandro, envio às 08:00 no grupo interno):
`relatorio_agrupar_estrategista` (pontos de atenção separados pelo estrategista
do cliente; sem responsável → "Sem estrategista") e `relatorio_so_clientes_ativos`
(contato sem cadastro vira só uma linha de contagem; pendência de contrato
`PAUSADO` fica fora, sem ocultar outras ocorrências válidas do mesmo cliente).
O painel, o envio diário e as consultas de alertas/carteira da Íris usam as mesmas
opções salvas, inclusive quando compartilham a coleta em cache. Seções da mensagem:
"Clientes sem resposta", **"Clientes insatisfeitos"** (análise da IA em
`cliente_relacionamento`), **"Clientes em risco"** (regra: silêncio, pendência
antiga, queda de conversas e criticidade contextual), "Contratos parados", "Queda no volume" e
**"Grupos ativos sem cliente vinculado"** (sempre; RPC `wa_auto_grupos_sem_cliente`,
um item por grupo mesmo que esteja em vários números, com "parece ser de <cliente>"
quando há sugestão) seguida do link para a aba Vínculos. Sem a tabela nova, o
relatório volta sozinho a ler `wa_auto_satisfacao`.

A análise contextual é considerada antes do aviso de horas sem resposta, inclusive
na deduplicação por cliente e no agrupamento por estrategista. Alertas excluídos
pelos filtros ou pelo gestor não suprimem outra ocorrência válida. O aviso não
exibe seção nem estado vazio de reuniões; ferramentas de agenda da Íris ficam
indisponíveis. O modelo oficial passa a `omnx_aviso_diario_v2`, com três variáveis;
envio oficial exige selecionar essa versão aprovada, sem alterar templates externos.

**Prévia (backtest)** — monta a mesma mensagem com dados reais, **não envia**, não
lê token. Aceita `regras` no corpo para testar limiares antes de salvar. Grava uma
linha `status = 'simulado'` (máx. 20 prévias/hora por empresa).

**Quem recebe o quê (regra de produto, 26/10/2026):**

| Mensagem | Destinatário | Conteúdo |
|---|---|---|
| Aviso/resumo **diário** | **Gestor**, no privado, ou o **grupo interno** da equipe | Todos os clientes com ponto de atenção + grupos sem cliente + reuniões do dia |
| Resumo **semanal** | **Cliente**, no grupo dele **ou** no privado (conversa direta) do cliente | Assuntos tratados e próximos passos, escrito para o cliente — **sem** risco, clima ou avaliação interna |

**Resumo semanal** — mesmo esquema de cron, no `resumo_dia`/`resumo_hora`;
`resumo_destino` escolhe o canal **do cliente**:
- `grupo`: cada grupo de WhatsApp vinculado a um cliente ativo, na instância
  configurada.
- `privado`: a conversa direta com o cliente.

Para cada cliente, a IA resume **só as mensagens daquela conversa** (no código
atual: mín. 5 mensagens de texto, até 300, até 12 mil caracteres). A conversa vai
ao prompt como dado não confiável; a saída é JSON validado e higienizado; o
destino vem do cadastro, nunca do texto da IA. Limites por execução: 20 conversas
na IA no total, 5 por empresa, 3 tentativas de IA por conversa/dia.
Grupo **só pela UAZAPI** — na Zernio o grupo é pulado (`oficial_sem_grupo`).

**Agendamento em duas etapas** (`wa-auto-agendar`, ação humana, sem cron):
1. `marcar` — grava em `meetings` com `status = 'scheduled'`, **sem link**,
   `metadata.origem = 'automacoes-wa'`. Duplo clique não cria duas reuniões.
2. `enviar_link` — envia no grupo do cliente o texto
   `Olá, <cliente>! Segue o link da nossa reunião de <data> às <hora>: <link>`.
   O grupo é **derivado do cliente** no servidor (nunca vem do corpo). O link sai
   **uma vez só** (chave por reunião + grupo, índice único por reunião e
   `meetings.metadata.link_enviado_em`). Sempre pela **UAZAPI**, mesmo que a
   empresa use a Zernio. Se o link não for informado, usa o salvo na reunião ou
   a sala interna `APP_URL/meet/<sala>?role=guest`.

### 8.4.1 Íris — assistente da equipe no WhatsApp (27/10/2026)

> Plano: "Assistente da equipe no WhatsApp" (fases 1a–1e). Antes chamada "Anah";
> o nome é configurável na área Íris (`/automacoes-wa/iris`; alias antigo preservado).

Pense numa **colega de plantão no grupo da equipe**: só fala quando alguém chama
pelo nome, consulta o sistema (só leitura) e responde ali mesmo.

1. **Onde responde:** só no grupo interno **"Report Entregas"**, liberado na aba
   Assistente. **Nunca no privado** (`agente_privado = false`): o número que ela
   usa (Suporte4) também conversa com clientes. O grupo está com **"Todos no
   grupo veem tudo"** (`wa_agente_grupos.acesso_total`): qualquer participante
   pode perguntar e ela responde sobre todos os clientes da empresa. Sem essa
   opção, vale a interseção das carteiras de quem está no grupo; se houver alguém
   de fora da equipe, entra em **modo restrito** (nada de cliente).
2. **Quando é acionada** (`wa-agente-gatilho.ts`): @menção do número, resposta a
   uma mensagem dela ou o nome dela no começo da frase ("Íris, …").
3. **Webhook protegido:** o `uazapi-webhook` só aciona a Íris quando a mensagem
   chega pelo endereço com token (`/uazapi-webhook/k/<token>`) e o token bate com
   o número. Sem token (ou token inválido), a mensagem é gravada no Chat como
   sempre, mas a Íris não é chamada. O token é gerado pelo botão "Proteger
   conexão" (`wa-agente-admin` → `proteger_webhook`); no banco fica só o sha256
   (`wa_webhook_tokens`); trocar a chave deixa a antiga valendo mais 10 minutos.
4. **Fila:** o pedido entra em `wa_agente_pedidos` (único por `message_id_wpp`,
   então a mesma mensagem recebida por 2 números não gera 2 respostas). Um gatilho
   acorda `wa-agente-responder` na hora (pg_net) e uma varredura de 1 min pega o
   que sobrou. Número principal + reservas por grupo (`wa_agente_grupo_numeros`).
5. **Resposta:** Claude Opus 5.5 via OpenRouter (env `WA_AGENTE_MODELO`, só
   modelos Claude), loop de ferramentas com limite de passos e tempo, travas de
   limite por pessoa/empresa e teto diário em US$. A saída é validada (sem
   telefone completo, e-mail e CPF mascarados, só links vindos das ferramentas).
   Log `wa_agente_execucoes` guarda resultado, ferramentas, tokens e custo, **sem
   o texto** da pergunta ou da resposta.
6. **Ferramentas (empresa e carteira vêm do servidor, nunca da IA):**
   - Clientes e atendimento: `buscar_cliente`, `situacao_cliente`,
     `listar_alertas`, `satisfacao_cliente`, `satisfacao_lista`,
     `resumo_conversa_cliente`, `historico_cliente`, `buscar_contato`,
     `resumo_conversa_contato`, `desempenho_atendimento`, `carteira_estrategista`.
   - Negócio: `visao_geral`, `listar_clientes`, `contratos_cliente`,
     `contratos_resumo`, `listar_contratos`, `recebiveis_resumo`,
     `comissoes_resumo`, `vendas_pendentes`, `demandas_resumo`, `equipe`.
   - Aprendizado: `registrar_aprendizado`, `listar_aprendizados`,
     `esquecer_aprendizado`, `ajustar_relatorio`.
   - Resolução declarada no WhatsApp: `resolver_alerta`, que identifica um
     cliente e um tipo atual de alerta a partir da mensagem original do pedido.
     Reutiliza `wa_auto_alertas_ignorados` com modo `resolvido`, sem mudar
     cliente, contrato, regras ou a análise administrativa. Exige administração
     do módulo fora dos grupos internos de acesso total; nesses grupos,
     participantes sem cadastro individual também podem resolver. Pedido,
     usuário quando identificado e nome legível são rastreados no registro.
     Não é oferecida na política de carteira GT3. A trava de aprendizado após
     leitura permanece; a resolução possui validação independente da intenção
     e do alvo na mensagem original, sem autorização por conteúdo recuperado.
   Valores de contrato e comissão só com a permissão correspondente; conteúdo de
   conversa só com permissão de Chat. Conversa vai ao prompt como **dado não
   confiável**.
7. **Aprendizado** (`wa_agente_aprendizados`): quando alguém diz "responda mais
   curto", a Íris grava a preferência (máx. 50 ativas, 5–400 caracteres). Elas
   entram no prompt **abaixo** das regras de segurança. Validação determinística
   recusa instruções sobre regras, permissões, destinos, envio a clientes, dados
   sensíveis, links ou "finja ser…". Depois de ler dados na mesma execução, a Íris
   não grava aprendizado nem muda o aviso (trava contra instrução escondida em
   conversa de cliente). `ajustar_relatorio` só mexe numa lista branca (horário,
   separar por estrategista, só clientes ativos, tipos de alerta, horas de "sem
   resposta") — nunca destinos, provedor, grupos ou membros.
   **Risco aceito pelo dono (27/10/2026):** no grupo de acesso total, **qualquer
   pessoa do grupo** pode ensinar preferências e usar `ajustar_relatorio`, sem
   cadastro. Esses aprendizados curtos (5–400 caracteres por instrução) são
   separados do perfil administrativo. A lista de aprendizados tem filtros e
   paginação, autor, origem (WhatsApp/tela), data, ativo/desativado e ações atuais.
   Não há aprovação intermediária nem aprendizado passivo de toda conversa.
8. **Perfil administrativo longo:** a área Íris oferece editores de personalidade
   e contexto, até **32 mil caracteres por campo e 64 mil no total**, preservando
   parágrafos. Sem registro salvo, os dois editores e o runtime usam o padrão
   preenchido `iris-v1`, identificado como “Padrão em uso; ainda não personalizado”,
   sem gravá-lo automaticamente. `wa-agente-admin` lê/salva uma linha por tenant em
   `app_settings`, com autor e data; revisão do editor e CAS impedem sobrescrever
   alteração concorrente. A empresa vem da sessão, nunca do corpo da requisição.
   O envio real e a simulação usam o mesmo loader e conteúdo, abaixo das regras
   fixas, dos acessos e dos dados atuais das ferramentas. Modo restrito não busca
   nem inclui o perfil; erros de leitura não são substituídos silenciosamente
   pelo padrão. Ferramentas e conversas não editam esse perfil. A área também reúne
   catálogo real de ferramentas, pessoas/canais, teste e atividade.
   Memória analítica e histórico por cliente são leituras de
   `cliente_relacionamento`/`_hist` com o usuário autenticado e RLS existentes;
   exigem `automacoes-wa/admin` e `pode_ver_restrito`. Sem análise salva, a tela
   informa a ausência; não inventa lembranças nem executa análise na abertura.

### 8.4.2 Satisfação e histórico por cliente (27/10/2026)

> Plano: "Íris e satisfação dos clientes: histórico de conversas" (F0–F6).
> Motivo: a análise antiga (`wa-auto-satisfacao`) lia **por conversa**, 14 dias,
> sem memória, e não alcançava nenhum dos 115 clientes ativos com contrato
> vigente — 80,6% das mensagens estavam em grupos sem vínculo e a equipe aparecia
> como "Cliente" nos grupos.

| Etapa | Peça | Como funciona |
|---|---|---|
| 1. Vínculo | `cliente_canais` + `wa-vinculos-sugerir` (06:30) + aba **Vínculos** | O vínculo é do **canal** (id do grupo ou telefone), não da linha do contato: vale em todos os números. Confirmação automática só quando é certo (vínculo antigo, mesmo grupo já vinculado em outro número, telefone de um único cliente). Nome de grupo/participante só **sugere**; uma pessoa aceita na tela. Um gatilho mantém `chat_contacts.client_id` e `chat_contact_clients` sincronizados (o Chat continua igual). |
| 2. Autoria | `uazapi-webhook` + `equipe_identidades` | Cada mensagem ganha `autor_tipo` (cliente, equipe, ia, sistema, desconhecido). Equipe = número da empresa, membro da Íris ou WhatsApp pessoal cadastrado; o LID do grupo é aprendido. Por telefone/LID só com webhook protegido por token. Reconhecer só pelo nome não apaga "aguardando resposta" (nome é fácil de imitar). |
| 3. Mídia | `chat_midia_texto` + `wa-midia-processar` (5 min) | Áudio e imagem sem legenda entram numa fila; a função baixa do Storage e transcreve (Gemini 2.5 Flash) ou descreve (Gemini 2.5 Flash-Lite) via OpenRouter, com `data_collection: 'deny'`. Limites: 15 MB, 15 min de áudio, 300 por empresa/dia. Nunca de grupo interno. O Chat mostra "Ver transcrição". |
| 4. Linha do tempo | `cliente_timeline` (SQL, só servidor) | Junta todas as conversas confirmadas do cliente, de todos os números, sem duplicata, com autor e transcrição; rótulos G1/P1 em vez de telefone. Grupo interno, restrito, grupos da Íris, destinos do aviso diário e WhatsApp da equipe ficam de fora **dentro do banco**. |
| 5. Análise | `wa-relacionamento-analisar` (06:00–07:45) → `cliente_relacionamento` | Por **cliente** ativo com contrato vigente e canal confirmado. IA (Claude Opus 5.5) só se houve mensagem nova; na 1ª vez lê 90 dias. Guarda resumo (memória), satisfação **só pelo que o cliente demonstra**, pendências, eventos e tendência. Métricas e **risco por regra** (sem IA): alto = insatisfeito (confiança ≥ 0,6) ou cancelamento; médio = atenção (≥ 0,7), pendência > 5 dias úteis, silêncio ≥ 21 dias ou queda > 60%. Pendências podem incluir criticidade contextual validada: alta somente com cobrança reiterada, prazo crítico ou serviço bloqueado, justificativa segura e confiança ≥ 0,8; acesso a contrato pendente pode ser médio. Risco operacional não muda a satisfação. Cada mudança vira uma foto em `cliente_relacionamento_hist` (retenção prevista no SQL: 180 dias). |
| 6. Consumo | Relatório diário + Íris (`historico_cliente`) | Relatório: "Clientes insatisfeitos" e "Clientes em risco". Íris: resumo, risco, métricas, canais e as últimas mensagens (conteúdo só com permissão de Chat). |

**Custo estimado (plano, preços Opus 5.5 US$ 4/20 por milhão de tokens):**
análise por cliente ≈ US$ 0,07 por cliente com mensagem nova → US$ 90–125/mês
(a antiga gastava US$ 150–180/mês analisando quase só leads); transcrição de
áudio < US$ 2/mês; descrição de imagem < US$ 1/mês; backfill único de 90 dias ≈
US$ 25 (análise) + < US$ 10 (áudios). Íris: ≈ US$ 0,08–0,10 por pergunta típica,
US$ 0,20–0,30 nas pesadas.

### 8.5 Decisões de segurança (revisão design F1–F7)

| Requisito | Como ficou |
|---|---|
| F1 cron sem JWT anon | Segredo gerado no próprio banco, lido do Vault a cada execução; não fica gravado em `cron.job` |
| F2 tenant explícito | Toda consulta com `service_role` tem `.eq('tenant_id', …)`; o tenant vem de `get_tenant_do_usuario`, nunca do corpo |
| F3 segredos | Token/chave no Vault; só `service_role` decifra (`get_omnx_bridge_credential_tenant`); nunca voltam ao navegador |
| F4 IA / destino | Destino sempre do cadastro (gestor E.164, grupo ou número do cliente); texto da IA nunca escolhe destinatário; resumo do cliente só usa mensagens da conversa daquele cliente |
| F5 minimização | Histórico sem texto de conversa nem token; retenção de 90 dias |
| F6 idempotência e limites | `UNIQUE (tenant_id, chave_idempotencia)`, reserva antes do envio, disjuntor (5 falhas seguidas em 15 min pausa o provedor da empresa), limites por hora |
| F7 permissões | Config só com `automacoes-wa · admin`; histórico com `ver`; agendar com `editar` |
| Íris (27/10) | Webhook com token por número; fila idempotente; escopo e empresa do servidor; saída validada; log sem conteúdo; aprendizado abaixo das regras e com lista de recusa; nunca no privado |
| Vínculos e histórico (27/10) | `cliente_canais`, `equipe_identidades`, `cliente_relacionamento`: RLS RESTRICTIVE por empresa; front sem escrita direta (só RPC); `cliente_timeline` e reivindicações só `service_role`; grupo interno excluído dentro do banco; conversa pseudonimizada ("Pessoa 1") antes de ir à IA; logs só com contagens |

### 8.6 Pendências conhecidas (em 27/10/2026)

- **Dono:** cadastrar o WhatsApp pessoal de cada pessoa da equipe (aba
  Assistente → "WhatsApp pessoal da equipe"). Sem isso, a mensagem da equipe no
  grupo do cliente só é reconhecida pelo nome e não apaga "aguardando resposta".
- **Dono/gerente:** revisar os grupos na aba Vínculos (estimativa do plano: ~54
  grupos ativos e ~30 privados, menos de 1 hora).
- **Proteger todos os números** ("Proteger conexão"): só número protegido aciona
  a Íris e grava autoria por telefone/LID. Fase 3 do plano: depois disso, recusar
  webhook sem token.
- **Trocar os tokens UAZAPI antigos** que ficaram versionados neste repositório
  (já removidos de `integracoes/uazapi.md`, mas continuam no histórico do Git) e
  atualizar os secrets `UAZAPI_TOKEN_*`.
- **Calibração F6:** conjunto-ouro de ~30 clientes rotulados pelo dono/CS; meta de
  concordância ≥ 80% e nenhum "insatisfeito" falso entre os satisfeitos.
- **Íris — demais ações pelo chat:** alterar cadastro e situação contratual
  exige executor próprio, recurso/estado esperado, autorização específica e
  confirmação rastreável. `resolver_alerta` implementa somente a baixa
  declarada de alerta; não substitui essas operações. Agenda continua adiada.
- **Fora do app, achados na investigação:** função `soniox-token` publicada mas
  fora do repositório (parece entregar a chave da Soniox ao navegador — conferir);
  `ia-weekly-analysis` parada desde 09/10; job `instagram-stats-weekly-close` com
  segredo escrito direto no comando do cron (deveria ler do Vault).
- **Zernio:** modelos (templates) ainda não cadastrados na Meta; grupo pela
  oficial não suportado; `template_link` existe na config mas não é usado (o
  link vai sempre pela UAZAPI). Ver `integracoes/zernio.md`.
- **Fallback UAZAPI por env** (`UAZAPI_TOKEN_<instância>`) é transitório.

## Delta: responsáveis operacionais e manual público (28/10/2026)

A atribuição operacional do cliente terá executor transacional próprio com
revisão/idempotência/histórico. Contratos e comissões mantêm seus responsáveis
próprios: a troca de carteira não deve disparar sincronização bidirecional.
O hash da carteira GT3 incorpora revisões monotônicas dos clientes autorizados.
O manual `/manual` usa entrada de renderização separada, sem montar o app privado;
seu conteúdo é estático e não contém dados de produção. Desenho e limites de
publicação em `docs/RESPONSAVEIS-CLIENTE.md`.

## Delta: tempo de resposta (03/11/2026, preparação local)

`tempo-resposta-admin` usa somente sessão de usuário e RPCs administrativas
autorizadas. Captura da mensagem é explícita após webhook autenticado ou envio
humano confirmado; não infere confiança do nome/origem legado. Episódios,
segmentos, calendário e pausas ficam no Desk com histórico. `iris-gt3` oferece
ações de candidatos/confirmação/recibo escopadas à conexão com segredo da ponte.
GT3 possui worker separado, opt-in por workspace, deduplicação e commit atômico
da mensagem/entrega. Não há transação distribuída. Migrações novas não aplicadas;
contrato e limites em `docs/TEMPO-RESPOSTA.md`.
