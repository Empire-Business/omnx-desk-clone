# NÍVEIS DE ACESSO — mapa das permissões atuais do omnx-desk

> **Objetivo:** documentar, sem alterar nada, como o controle de acesso funciona
> hoje. É o pré-requisito da **Fase 2** (unificação de permissões) do roadmap de
> modularização. Aqui está a fotografia do legado; a decisão do modelo unificado
> é a entrega E2.2.
> Atualizado em: 06/08/2026 às 12h00 BRT — inclui a matriz vigente de
> `permissoes_app` (§5) e o recurso `atendimento`.

---

## ⚠️ O problema: hoje existem 4 camadas de acesso sobrepostas

O sistema acumulou **quatro mecanismos** de autorização que convivem. Nenhum foi
removido — cada tela usa um ou uma combinação. A Fase 2 existe justamente para
unificar isto.

| # | Mecanismo | Onde vive | Para que serve hoje |
|---|---|---|---|
| 1 | **`users.perfil`** (texto) | `public.users.perfil` | Gate principal do **frontend** (menu, rotas, abas) |
| 2 | **`user_roles.role`** (enum `app_role`) | `public.user_roles` | Base do **RLS** no banco (`has_role()`, `is_admin()`) |
| 3 | **`users.acesso_contratos`** (bool) + `chat_departments.modulo_acesso` | `users` / `chat_departments` | Liberações finas (módulo Contratos; módulos do Chat) |
| 4 | **`is_master_admin()`** (novo, multi-tenant) | função no banco | Quem provisiona **empresas** (tela `/empresas`) |

> Além destas, há dois eixos que **não** são "nível de acesso de usuário", mas
> influenciam o que aparece:
> - **`app_modules`** (modularização): liga/desliga apps **por tenant** — é config
>   de instalação, não de pessoa.
> - **`tenant_id` + RLS** (multi-tenant): isola os dados por empresa; ortogonal ao
>   perfil (combina em AND).

---

## 1. `users.perfil` — o gate do frontend

Valores suportados (definidos no `CASE` do trigger `handle_new_user`):

| `perfil` | Em uso hoje? | Papel | `app_role` mapeado |
|---|---|---|---|
| `admin` | ✅ | Acesso total | `admin` |
| `gerente` | ✅ | Gestão (contratos, equipe) | `manager` |
| `admin_cobranca` | — (suportado) | Gestor de cobrança | `manager` |
| `estrategista` | ✅ | Atende clientes designados | `member` |
| `atendimento` | ✅ | Atendimento + só aba Onboarding de Contratos | `member` |
| `agente_chat` | — (suportado) | Operador de chat | `member` |
| `agente_cobranca` | — (suportado) | Operador de cobrança | `member` |
| `cliente` | ✅ | Área externa (Portal) | `member` |

> `perfis_em_uso` reais no banco: `admin, atendimento, cliente, estrategista, gerente`.
> Os demais estão previstos no trigger mas sem usuário ativo.

### Gates de menu/rota que dependem do perfil (`AppSidebar` / `RequireApp`)

| Regra no código | Condição | Aplicada em |
|---|---|---|
| `adminOnly` | `perfil === 'admin'` | Apps, Reportes, Admin |
| `masterOnly` | `is_master_admin()` | Empresas |
| `access: 'contratos'` | `admin` \|\| `gerente` \|\| `acesso_contratos`; `atendimento` vê só Onboarding | Contratos |
| `module` | `useMyModules()` (ver §3) | Itens de Chat |
| `appSlug` | `isAppEnabled(slug)` (modularização) | Dashboard, Chat, Contratos, Cobrança, Portal |

---

## 2. `user_roles.role` — a base do RLS

Enum `app_role`: **`admin` · `manager` · `member`**. Populado pelo
`handle_new_user` a partir do `perfil` (mapa na tabela acima). É o que as policies
de RLS consultam via `has_role()` / `is_admin()`.

> **Multi-tenant:** `user_roles` também tem `tenant_id` (carimbado explicitamente
> pelo `handle_new_user` desde 24/07/2026). Uma pessoa é admin **do seu tenant**,
> não global.

---

## 3. Liberações finas

- **`users.acesso_contratos`** (bool): dá acesso ao módulo Contratos a quem não é
  `admin`/`gerente`.
- **`chat_departments.modulo_acesso`** + `users.department_id`: o hook
  `useMyModules()` resolve os módulos de Chat visíveis. **`admin` → todos os
  módulos** (`'all'`); os demais herdam do `modulo_acesso` do(s) departamento(s) a
  que pertencem.

---

## 4. `is_master_admin()` — o super-admin do multi-tenant

Função `SECURITY DEFINER`: retorna true se o usuário logado é `admin` **do tenant
marcado como `is_master`**. É o porteiro do provisionamento de empresas (tela
`/empresas` + edge function `provision-tenant`). Só existe **um** tenant mestre
(índice único `uq_tenants_unico_mestre`).

---

## 5. Matriz vigente — `permissoes_app` (perfil × recurso × ação)

Esta é a matriz **realmente gravada no banco** (conferida em 04/08/2026 no tenant
principal). Toda linha vale por tenant; um tenant novo nasce com esta mesma matriz
via `seed_permissoes_on_tenant_insert()`.

Ações em escada: **`admin` ⊃ `editar` ⊃ `ver`** — quem pode editar, pode ver.
Desde `20260804160000`, a escada vale **nos dois lados**: no front
(`usePermissoes.can`) e no banco (`has_permissao()`). Antes, só no front.

| Recurso \ Perfil | admin | gerente | estrategista | atendimento | agente_chat | admin_cobranca | agente_cobranca | cliente |
|---|---|---|---|---|---|---|---|---|
| `*` (curinga) | **admin** | — | — | — | — | — | — | — |
| `dashboard` | admin | ver | ver | ver | — | ver | — | — |
| `chat` | admin | editar | editar | editar | editar | — | — | — |
| **`atendimento`** | admin | **editar** | **editar** | **editar** | — | — | — | — |
| `contratos` | admin | editar | — | — | — | — | — | — |
| `contratos.onboarding` | admin | editar | — | editar | — | — | — | — |
| `clientes` | admin | editar | editar | ver | — | — | — | — |
| `colaboradores` | admin | ver | — | — | — | — | — | — |
| `cobranca` | admin | ver | — | — | — | admin | editar | — |
| `portal` | admin | — | — | — | — | — | — | ver |

**Como ler o traço (—):** sem acesso nenhum ao recurso. O `admin` cobre tudo pelo
curinga `*` — é o fail-safe que impede um seed errado trancar o dono do tenant.

**Onde cada gate é aplicado no app Atendimento:**

| Camada | O que checa | Efeito de não passar |
|---|---|---|
| `AppSidebar` | `can('atendimento','ver')` + app ligado | Item some do menu |
| `RequireApp slug="atendimento"` | `app_modules.enabled` | Rota não abre por URL |
| `AtendimentoTabs` | `can('atendimento','admin')` | Aba Configuração some |
| RLS `atendimento_demandas` | `has_permissao('atendimento','ver'/'editar')` | API não devolve nem aceita dado |
| RLS `atendimento_tipos`/`etapas` (escrita) | `is_admin()` | Só admin configura o fluxo |
| RLS `storage.objects` (anexos) | `has_permissao` + tenant do anexo | Arquivo não é lido nem enviado |

> Note que esconder o menu **não** é proteção — é conveniência. A trava real do
> Atendimento está na RLS: um perfil sem permissão não lê as demandas nem
> chamando a API direto com a anon key.

---

## 6. Migração para a matriz — onde estamos (04/08/2026)

A Fase 2 é **aditiva**: o gate legado (`users.perfil`) e a matriz convivem até a
última tela migrar. `usePermissoes.can()` cai no gate antigo enquanto as regras
carregam ou se a leitura falhar, então nada quebra no meio do caminho.

### Já migrado para `can(recurso, ação)`

| Tela / componente | Recurso · ação |
|---|---|
| `ContratosTabs`, `ContratosDashboardPage`, `FluxoFuturoPage` | `contratos` |
| `ProdutosCatalogoPage`, `TagsAdminPage`, `ContratosKanbanPage` (gerir colunas) | `contratos · admin` |
| `ChatInstanciasPage`, `ChatAcessosPage` | `chat · admin` |
| `AppsPage` | `apps · admin` |
| `ReportesPage` | `reportes · admin` |
| `ConfiguracoesPage`, `BrandSection`, `IntegracoesSection` | `configuracoes · admin` |
| `ColaboradoresPage` | `colaboradores · admin` |
| `DepartamentosPage`, `DepartamentoDetailPage` | `departamentos · admin` |
| `DisparoPage` | `disparo · admin` |
| `AppSidebar` (itens Atendimento, Apps, Reportes) | recurso do item |

**Ganho concreto:** essas permissões deixaram de ser fixas no código. O dono da
conta pode delegar a triagem de reportes ou a gestão de colaboradores pela tela
`/admin`, sem precisar promover alguém a admin — que era a única saída antes.

**Exceção proposital:** o item **Admin** (`/admin`) continua preso a
`perfil === 'admin'`. É a tela que **edita a própria matriz**: delegá-la por ela
mesma permitiria auto-promoção.

### Migrados em 06/08/2026 — os gates `admin || gerente`

Os pontos abaixo eram regra de negócio ("quem enxerga a carteira inteira"), não
gate de administração. Viraram **três recursos novos**, semeados exatamente para
quem já tinha o acesso — ninguém ganhou nem perdeu nada no dia da migração:

| Recurso | O que decide | Quem recebeu no seed |
|---|---|---|
| `clientes.carteira` | Ver todos os clientes ou só os atribuídos | admin (curinga), gerente, **atendimento** |
| `chat.carteira` | Ver todas as conversas e o filtro por agente | admin (curinga), gerente |
| `clientes.atribuir` | Atribuir estrategista/atendente, editar nota e time | admin (curinga), gerente |

`atendimento` entrou só em `clientes.carteira` porque `useClientes` já fazia
`admin || gerente || atendimento`. Separar os dois recursos foi proposital: um
recurso único teria dado a ele acesso a todas as conversas, que ele não tinha.

Migrados: `ClientesListPage`, `ClientesPage`, `ClienteDetailPage`,
`ChatInboxPage`, `ConversationView` (2 pontos), `useClientes`,
`useDashboardMetrics`. Os hooks perguntam pela RPC `has_permissao()` — a mesma
função que a RLS usa —, com o gate antigo como fallback em caso de falha de rede.

### Ainda no gate legado — e por quê

O que sobrou **não é sobre quem está logado**, e por isso não cabe na matriz:

| Onde | Por que fica |
|---|---|
| `ChatAcessosPage` (linhas 97 e 459) | Lê o perfil **da linha listada** para marcar "acesso total". É exibição de estado de outra pessoa, não permissão de quem olha |
| `UserAccessPanel`, `UserForm`, `ColaboradoresPage` (`isCeo`) | Adaptam o formulário ao **perfil editado**, não ao de quem está logado |
| `ChatContatosPage` (`canManageContacts`) | Inclui `estrategista` — é regra própria do Chat, não a mesma pergunta da carteira |
| `useMyModules` (`useChat`) | É sobre módulos de departamento do Chat (`modulo_acesso`), eixo diferente do perfil |
| Edge functions `cami-deliveries`, `instagram-stats` | Rodam no servidor com service role; migrar exige redeploy de function e teste próprio |

Nenhum desses é "carteira inteira" disfarçada — por isso não entraram na
migração de 06/08. Trocá-los pela matriz mudaria o significado da regra, não só
a fonte dela.

---

## Projetos vizinhos (não confundir)

- **OMNX-Comissões** (frontend separado que compartilha este Supabase) usa uma
  tabela **própria** de papéis: `comissoes_papeis` (`admin` / `revisor` / `normal`),
  desacoplada de `users.perfil`.

---

## Direção para a Fase 2 (a decidir — E2.2)

O alvo é **um** modelo: papéis + permissões **por app**, de forma que "ligar um app
não dá acesso a tudo". A migração deve ser **aditiva** (o legado acima continua
funcionando até cada módulo migrar), com testes por perfil em branch/preview.
Candidatos a aposentar depois de migrar: o texto livre `users.perfil` como gate de
UI, em favor de `user_roles` + uma tabela de permissões por app.
