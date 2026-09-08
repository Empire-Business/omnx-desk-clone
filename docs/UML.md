# UML — Modelo de entidades e fluxo dos apps (omnx-desk)

> Engenharia reversa do schema real em produção (`wuzmckatbmlpkdxtfhqr`), 115
> tabelas no schema `public`. Diagramas por domínio — um ER com 115 entidades
> seria ilegível, então o núcleo está detalhado e o resto agrupado.
> Atualizado em: 04/08/2026 BRT · inclui o app Atendimento (Fase 4).

---

## 1. Núcleo multi-tenant — `tenants` é o hub de tudo

Desde as Fases A/B do multi-tenant, **toda tabela de negócio tem `tenant_id NOT NULL`**
apontando para `tenants`. O isolamento é por linha (RLS `tenant_isolation`).

```mermaid
erDiagram
  tenants   ||--o{ profiles     : "1 pessoa = 1 tenant"
  tenants   ||--o{ user_roles   : "papel por tenant"
  tenants   ||--o{ app_modules  : "apps ligados"
  tenants   ||--o{ clients      : ""
  tenants   ||--o{ contratos    : ""
  tenants   ||--o{ whatsapp_instances : ""
  auth_users ||--|| profiles    : "user_id"
  auth_users ||--o{ user_roles  : "user_id"

  tenants {
    uuid id PK
    text name
    text slug
    bool is_master "só 1 mestre"
    text primary_color
  }
  profiles {
    uuid user_id PK_FK
    uuid tenant_id FK
    text full_name
  }
  user_roles {
    uuid user_id FK
    app_role role "admin|manager|member"
    uuid tenant_id FK
  }
  app_modules {
    uuid tenant_id PK_FK
    text slug PK "dashboard|chat|contratos|cobranca|portal"
    bool enabled
    uuid updated_by
  }
```

> **Provisionamento:** o tenant `...001` é o **MESTRE** (`is_master`). Um admin do
> mestre cria empresas novas (tela `/empresas` → `provision-tenant` → novo tenant +
> `handle_new_user` carimba `users`/`profiles`/`user_roles` no tenant novo +
> `seed_tenant`). O trigger `seed_apps_on_tenant_insert` semeia os 5 `app_modules`.

---

## 2. Domínio Contratos / Vendas / Comissões (o mais rico)

```mermaid
erDiagram
  clients            ||--o{ contratos          : "cliente_id"
  products           ||--o{ contratos          : "produto_id"
  vendas_pendentes   ||--o| contratos          : "venda_pendente_id"
  users              ||--o{ contratos          : "estrategista_id / criado_por"
  contratos          ||--o{ comissoes          : "contrato_id"
  contratos          ||--o{ contrato_anexos    : ""
  users              ||--o{ comissoes          : "estrategista_id"
  extratos_mensais   ||--o{ comissoes          : "extrato_id (fechamento mensal)"
  products           ||--o{ produtos_comissao  : "regra de %/valor"
  clients            ||--o{ products           : "produto do cliente"
  contratos_kanban_colunas ||--o{ contratos    : "status_chave (kanban)"

  contratos {
    uuid id PK
    uuid tenant_id FK
    uuid cliente_id FK
    uuid produto_id FK
    text status_interno
    numeric valor_total
    text link_clicksign "assinatura -> ATIVO"
  }
  comissoes {
    uuid id PK
    uuid tenant_id FK
    uuid contrato_id FK
    uuid estrategista_id FK
    uuid extrato_id FK
    numeric valor
    text status
  }
```

> Dívida conhecida (Fase 3): componentes de `/contratos` ainda moram em
> `src/pages/comissoes/`. O modelo de dados já é próprio; falta desenredar o front.

---

## 3. Domínio Chat (OMNXChat)

```mermaid
erDiagram
  whatsapp_instances ||--o{ chat_departments   : "instance_id"
  whatsapp_instances ||--o{ chat_conversations : "instance_id"
  chat_departments   ||--o{ chat_conversations : "department_id"
  chat_contacts      ||--o{ chat_conversations : "contact_id"
  users              ||--o{ chat_conversations : "agente_id"
  chat_conversations ||--o{ chat_messages      : "conversation_id"
  chat_messages      ||--o| chat_messages      : "reply_to_id"
  users              ||--o{ chat_departments   : "gerente_id"

  chat_conversations {
    uuid id PK
    uuid tenant_id FK
    uuid instance_id FK
    uuid department_id FK
    uuid agente_id FK
  }
```

---

## 3.5. Domínio Atendimento (app Social Media — Fase 4)

O app nasce em 04/08/2026 com cinco tabelas. `atendimento_tipos` e
`atendimento_etapas` são **configuração por tenant**, não enum: é trocando esses
dois conjuntos que o mesmo app passa a atender outro segmento (clínica,
escritório) sem migration nova.

```mermaid
classDiagram
  class tenants { uuid id }
  class clients { uuid id; text nome }
  class users { uuid id; text nome; text perfil }

  class atendimento_tipos {
    uuid id
    uuid tenant_id
    text nome
    bool ativo
    int ordem
  }
  class atendimento_etapas {
    uuid id
    uuid tenant_id
    text nome
    text cor
    int ordem
    bool is_final
  }
  class atendimento_demandas {
    uuid id
    uuid tenant_id
    text codigo "DEM-00001"
    text titulo
    text prioridade "baixa|media|alta|urgente"
    date prazo
    text aprovacao "nao_enviado|aguardando|aprovado|ajustes"
    jsonb anexos
    timestamptz concluida_em
  }
  class atendimento_comentarios {
    uuid id
    uuid demanda_id
    text texto
  }
  class atendimento_historico {
    uuid id
    uuid demanda_id
    text campo
    text valor_de
    text valor_para
  }

  tenants "1" --> "N" atendimento_tipos
  tenants "1" --> "N" atendimento_etapas
  tenants "1" --> "N" atendimento_demandas
  clients "1" --> "N" atendimento_demandas : cliente_id
  users "1" --> "N" atendimento_demandas : responsavel_id
  atendimento_tipos "1" --> "N" atendimento_demandas : tipo_id
  atendimento_etapas "1" --> "N" atendimento_demandas : etapa_id (RESTRICT)
  atendimento_demandas "1" --> "N" atendimento_comentarios
  atendimento_demandas "1" --> "N" atendimento_historico
```

**Decisões que o diagrama não mostra:**

- `etapa_id` é **RESTRICT**, não CASCADE: o banco recusa apagar uma etapa que
  ainda tem demanda dentro. É a regra do §12 do brief aplicada onde não dá para
  contornar pela UI — o usuário precisa realocar antes.
- `aprovacao` é campo próprio, separado da etapa. Uma peça pode estar "em revisão
  interna" **e** já ter voltado com pedido de ajuste do cliente: são dois fatos.
- `atendimento_historico` é escrito por **trigger**, não pelo front. Assim a
  trilha registra a mudança venha ela da tela de detalhe, do kanban ou de uma
  correção manual no banco.

### Ciclo de vida da demanda

```mermaid
stateDiagram-v2
  [*] --> Solicitado
  Solicitado --> EmProducao: responsável assume
  EmProducao --> EmRevisao: peça pronta
  EmRevisao --> AguardandoAprovacao: enviada ao cliente
  AguardandoAprovacao --> Ajustes: cliente pediu mudança
  Ajustes --> EmProducao
  AguardandoAprovacao --> Aprovado: cliente aprovou
  Aprovado --> Publicado: no ar
  Publicado --> [*]

  note right of Publicado
    Etapa com is_final = true.
    O trigger carimba concluida_em;
    voltar para etapa de trabalho limpa o carimbo.
  end note
```

---

## 4. Mapa das 115 tabelas por domínio

| Domínio | Tabelas (principais) |
|---|---|
| **Multi-tenant / acesso** | `tenants`, `profiles`, `user_roles`, `users`, `employees`, `positions`, `employee_positions`, `app_modules`, `app_settings` |
| **Clientes** | `clients`, `client_assignments`, `client_contracts`, `client_notes`, `client_interactions`, `client_alerts` |
| **Contratos / Vendas / Comissões** | `contratos`, `contrato_anexos`, `contrato_modelos`, `contrato_tags`, `contratos_kanban_colunas`, `contratos_audit_log`, `vendas_pendentes`, `comissoes`, `extratos_mensais`, `produtos_comissao`, `products`, `salario_fixo_itens`, `pj_*` |
| **Chat (OMNXChat)** | `chat_conversations`, `chat_messages`, `chat_contacts`, `chat_departments`, `chat_department_agents`, `chat_csat`, `chat_quick_replies`, `chat_templates`, `whatsapp_instances`, `ia_bots`, `ia_bot_*`, `wa_warmup_*` |
| **Atendimento (Social Media)** | `atendimento_tipos`, `atendimento_etapas`, `atendimento_demandas`, `atendimento_comentarios`, `atendimento_historico` |
| **Cobrança** | `cobranca_devedores`, `cobranca_instances`, `cobranca_reguas`, `cobranca_regua_passos`, `cobranca_sends` |
| **Entregas / Portal / Trilhas** | `deliverables`, `deliveries`, `delivery_*`, `learning_*`, `nps_surveys`, `nps_responses` |
| **Interno / colaboração** | `internal_conversations`, `internal_messages`, `internal_posts`, `dept_team_messages`, `meetings`, `meeting_feedback` |
| **Infra / auditoria** | `audit_logs`, `notifications`, `email_queue`, `push_subscriptions`, `api_keys`, `webhooks`, `webhook_logs`, `reportes_erro`, `social_snapshots` |

---

## 5. Fluxo dos apps (modularização)

Desde 04/08/2026 o catálogo tem três camadas — ver
`20260804130000_catalogo_apps_reorganizado.sql`:

| Categoria | O que significa | Apps |
|---|---|---|
| `app` | Liga/desliga na tela `/apps` | **Atendimento** (tela inicial), Chat, Contratos |
| `nucleo` | Fora da Loja de Apps | Dashboard — **legado** desde 04/08, sem item de menu, vive em `/dashboard-legado` |
| `arquivado` | Fora de uso: desligado e fora da tela | Cobrança, Portal |

A rota `/` é o painel de Atendimento, **sem `RequireApp`**: se a home dependesse
do app estar ligado, desligá-lo deixaria a empresa sem tela inicial. Quem decide
é `HomePage` — cai no Dashboard legado quando o app está desligado ou o perfil
não tem permissão no recurso.

O **segmento da empresa** (`tenants.atendimento_segmento`) define abas, métricas
e vocabulário do app. Catálogo de ramos em `src/lib/atendimentoSegmentos.ts`.

```mermaid
flowchart TD
  A[Login / AuthContext] --> B{ProtectedRoute<br/>trava de domínio + tenant}
  B --> C[AppLayout - núcleo]
  C --> H{HomePage /}
  H -->|app ligado + permissão| N[Painel de Atendimento]
  H -->|senão| D[Dashboard legado /dashboard-legado]
  C -->|appSlug| E[OMNXChat /chat]
  C -->|appSlug + permissão| N2[Atendimento /atendimento/*]
  C -->|appSlug + acesso_contratos| F[Contratos /contratos]
  B -->|RequireApp cobranca — arquivado| G[Cobrança /cobranca]
  B -->|RequireApp portal — arquivado| P[Portal do Cliente /portal]
  C -->|adminOnly| I[Apps /apps · Reportes · Admin]
  C -->|masterOnly is_master_admin| J[Empresas /empresas]

  K[(app_modules por tenant)] -.liga/desliga.-> E & N2 & F & G
  S[(tenants.atendimento_segmento)] -.define abas e métricas.-> N & N2
```

> `RequireApp` é **fail-open**: se a leitura de `app_modules` falhar, o app aparece.
> Um app só some quando um admin o desliga explicitamente. Ver
> [`NIVEIS-DE-ACESSO.md`](./reestruturacao/NIVEIS-DE-ACESSO.md) para os gates de perfil.
>
> O Atendimento é o primeiro app cujo gate vive **também no banco**: as policies
> chamam `has_permissao('atendimento', …)`. Esconder o menu não protege nada —
> a RLS é que impede um perfil sem permissão de ler as demandas pela API.
