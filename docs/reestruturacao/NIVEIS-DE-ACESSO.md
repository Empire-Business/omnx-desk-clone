# NÍVEIS DE ACESSO — mapa das permissões atuais do omnx-desk

> **Objetivo:** documentar, sem alterar nada, como o controle de acesso funciona
> hoje. É o pré-requisito da **Fase 2** (unificação de permissões) do roadmap de
> modularização. Aqui está a fotografia do legado; a decisão do modelo unificado
> é a entrega E2.2.
> Atualizado em: 19/11/2026 às 17h30 BRT — §4: superadmin só por `users.perfil` (D4 do ensaio real).
> Versão anterior: 27/10/2026 às 09h26 BRT — §5.1: Íris, Vínculos e WhatsApp da
> equipe (admin/gerente com `automacoes-wa · admin`). Inclui a matriz vigente de
> `permissoes_app` (§5), o recurso `atendimento` e o recurso `automacoes-wa` (§5.1).

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
marcado como `is_master`**. Desde 19/11/2026 (migração `20261119180100`) "admin" aqui é
só `users.perfil = 'admin'`, a mesma régua de `is_admin()`: `user_roles.role` não dá mais
superadministração. Antes, quem era rebaixado pela tela de Colaboradores (que muda só
`users.perfil`) continuava superadmin pelo papel antigo. No app instalado, exige ainda a
sessão confirmada pelo segundo fator (`aal2`). É o porteiro do provisionamento de empresas (tela
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
| **`automacoes-wa`** | admin (curinga) | — | — | — | — | — | — | — |

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

### 5.1 Recurso `automacoes-wa` (App Automações WhatsApp, 26/10/2026)

A migration `20261026120000` **não semeia** linha nova em `permissoes_app`: o
curinga `('*','admin')` do perfil `admin` já cobre o recurso. Nenhum outro perfil
nasce com acesso — quem precisar, o admin libera em `/admin` (o recurso aparece
na lista como "Automações WhatsApp").

O que cada ação libera **de verdade**:

| Ação | Libera | Onde é checado |
|---|---|---|
| `ver` | Ler o histórico de envios (`wa_auto_envios`) pela API | RLS `wa_auto_envios_select` |
| `editar` | Tudo de `ver` + **agendar**: marcar reunião e enviar o link no grupo | `wa-auto-agendar` chama `has_permissao('automacoes-wa','editar')` com o JWT da pessoa |
| `admin` | Tudo de `editar` + abrir a tela `/automacoes-wa` e ler/gravar configuração, gestores e regras | `AppSidebar`, `AutomacoesWaConfigPage` (`can(...,'admin')`) e RLS `wa_auto_config_admin`, `wa_auto_gestores_admin`, `wa_auto_regras_anomalia_admin` |

Travas que **não** seguem a matriz (ficam presas a `users.perfil = 'admin'`):

| Ação | Por quê |
|---|---|
| Salvar token UAZAPI / chave Zernio (RPC `save_omnx_integracao_secret`) | Mesma guarda da ponte Empire; segredo de integração é só do dono da conta |
| Envio de teste (`wa-auto-testar-envio`) e prévia (`wa-auto-backtest`) | As funções conferem `perfil = 'admin'` direto |

> Consequência prática: um `gerente` que receba `automacoes-wa · admin` em
> `/admin` abre a tela e muda horários/gestores, mas **não** salva token nem usa o
> teste/prévia (recebe "sem permissão"). Hoje só `ver` não tem tela própria —
> o histórico só é visível dentro da página, que exige `admin`.

Camadas independentes, todas em AND: app ligado (`app_modules`), permissão,
`tenant_isolation` RESTRICTIVE nas 4 tabelas `wa_auto_*`. Ninguém logado escreve
em `wa_auto_envios` (só `SELECT` concedido); só as edge functions gravam.

#### Íris, Vínculos e WhatsApp da equipe (27/10/2026)

Algumas partes da tela exigem **duas** coisas ao mesmo tempo: ser **admin ou
gerente** (perfil) **e** ter `automacoes-wa · admin`. É a função
`vinculos_pode_gerir()` = `pode_ver_restrito()` AND `has_permissao('automacoes-wa','admin')`.
Um gerente só vê essas partes se o admin der a ele a permissão do app em `/admin`;
um estrategista com a permissão do app **não** vê (não é admin/gerente).

| O quê | Quem | Onde é checado |
|---|---|---|
| Aba **Assistente** (ligar a Íris, nome, grupos, membros, "Proteger conexão", simular, aprendizados) | `automacoes-wa · admin` | Página + RLS das tabelas `wa_agente_*` (escrita por coluna) + `wa-agente-admin` (`has_permissao` com o JWT) |
| Seção **WhatsApp pessoal da equipe** (`equipe_identidades`) | Admin/gerente **com** `automacoes-wa · admin` | RLS (`pode_ver_restrito` + `has_permissao`); a tela só lê os 4 últimos dígitos (sem GRANT de telefone completo nem LID); só cria/apaga origem `cadastro` |
| Aba **Vínculos** (`cliente_canais`) | Admin/gerente **com** `automacoes-wa · admin` | Aba escondida para outros perfis + RLS de leitura com `vinculos_pode_gerir()`; front sem escrita direta: lista, busca e decide pelas RPCs `vinculos_listar`/`vinculos_buscar_clientes`/`vinculos_decidir`, que conferem de novo |
| Botão "Recalcular sugestões" e prévia da análise por cliente | Admin/gerente com `automacoes-wa · admin` | `wa-vinculos-sugerir` / `wa-relacionamento-analisar` conferem `vinculos_pode_gerir` com o JWT da pessoa (só a empresa dela) |
| Ler `cliente_relacionamento` (satisfação/risco por cliente) | Quem pode ver o cliente (`user_can_access_client`: admin/gerente/atendimento todos; estrategista só a carteira) ou admin/gerente | RLS; escrita só pelo servidor |
| "Ver transcrição" no Chat (`chat_midia_texto`) | Quem vê a mensagem | RLS espelha a de `chat_messages` (inclusive grupo restrito) |
| Vincular contato a cliente pelo Chat | Continua como antes, mas só vira decisão do canal se a pessoa enxerga todos os contatos do canal; senão vira só "sugerido". Perfil `cliente` nunca | `private.vinculo_do_chat` |

**Íris no WhatsApp (fora da tela):** fala só com quem está no grupo interno
liberado. No grupo com **"Todos no grupo veem tudo"** (`acesso_total`, ligado no
"Report Entregas"), **qualquer participante** pergunta sobre qualquer cliente da
empresa e — risco aceito pelo dono em 27/10/2026 — pode ensinar preferências e
usar `ajustar_relatorio` sem cadastro. Fora desse modo: membro cadastrado vê só a
própria carteira; `ajustar_relatorio` exige `automacoes-wa · editar`; valores de
contrato/comissão e conteúdo de conversa seguem as permissões do sistema
(`contratos`, `comissoes`, `chat`). `match_contact_to_client` deixou de ser
chamável por usuário logado (só o servidor).

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
## Adendo — SSO do Empire OS (12/09/2026 às 15h53 BRT)

`provision-tenant` possui um ator técnico separado dos papéis humanos: o Empire OS.
Ele só cria/reconcilia um tenant e seu primeiro `admin` quando apresenta a
`X-Platform-Key` server-side correta. Nenhum papel do Desk recebe essa chave e nenhum
usuário pode enviar `tenant_id` para obter sessão em outro tenant. O owner entra pelo
provedor OIDC `custom:empire-os`, com o mesmo e-mail e senha validados no Empire OS;
a senha não é copiada para o Desk e o acesso permanece preso ao tenant reconciliado.

| Ação | Empire OS autenticado por chave | owner/admin do tenant | demais membros | anônimo |
|---|---|---|---|---|
| Criar/reconciliar tenant por `external_ref` | sim | não por esta rota | não | não |
| Autorizar SSO OIDC do owner para o tenant reconciliado | sim | sim, pela própria conta | não | não |
| Ler a chave de plataforma | não | não | não | não |

### Ativação de membro vinda do Empire OS

| Ação | Empire OS com chave | owner/admin | membro | anônimo |
|---|---|---|---|---|
| Criar tenant e primeiro admin | sim | não por esta rota | não | não |
| Incluir identidade em tenant já reconciliado | sim, por `external_ref` | não por esta rota | recebe `atendimento` | não |
| Incluir antes do owner criar o tenant | não (`owner_not_activated`) | não | não | não |
| Escolher `tenant_id` ou papel no navegador | não | não | não | não |
