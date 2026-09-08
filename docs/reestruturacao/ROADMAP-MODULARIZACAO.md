# Roadmap — Reestruturação Modular do omnx-desk

> Roadmap **vivo**: reflete o estado real do sistema, não só o plano.
> Base: `AUDITORIA-ATUAL.md` + o brief de reestruturação entregue pelo usuário.
> Atualizado em: 06/08/2026 às 12h00 BRT

---

## 📊 Cobertura do brief de reestruturação

Placar seção a seção do documento que originou este trabalho. É a resposta curta
para "o que já foi feito e o que falta".

| § | Frente | Situação |
|---|---|---|
| 1 | Ler regras + atualizar skill `omnx-code` | 🟢 Feita em 04/08 (v1.18 → **v1.20.1**, por tag verificada). Ficou pendente de 27/07 e foi fechada |
| 2 | Plataforma modular em sub-apps | 🟢 3 apps na Loja (Atendimento, Chat, Contratos) + núcleo |
| 3–4 | Decomposição em tasks + auditoria | 🟢 Tasks por entrega; auditorias em `AUDITORIA-ATUAL.md`, `UML.md`, `NIVEIS-DE-ACESSO.md` |
| 5 | Documentação obrigatória (33 docs) | 🟢 **Completa (06/08)** — entraram manual do usuário, manual de administração, guia de suporte, estratégia de rollback e plano de homologação |
| 6 | Cadastro central do usuário | 🟢 **Feito (06/08)** — a ficha do cliente reúne contratos, produtos, financeiro, conversas e demandas em abas |
| 7 | Apps ligáveis por subconta | 🟢 Feito, com 2 divergências conscientes (nascem ligados; Loja não mostra arquivados) |
| 8–9 | Revisão de UX + 10 princípios | 🟡 **Auditada e parcialmente corrigida (06/08)** — ver `AUDITORIA-UX-CHAT-CONTRATOS.md`. Falta fatiar a `ConversationView` (3.217 linhas) |
| 10 | App de Chat | 🟡 Auditado em 06/08: 4 áreas inalcançáveis pelo menu foram **removidas** por decisão do dono |
| 11 | App de Contratos + formulário de vendas | 🟢 Contratos modularizado; `/vendas/nova` alimenta o onboarding |
| 12 | Kanban de contratos configurável | 🟢 Colunas editáveis; exclusão de etapa com registro é barrada |
| 13 | App de Atendimento por segmento | 🟢 Feito (04/08) — Social Media, Clínica e Escritório |
| 14 | Canal de reporte de erros | 🟢 **Completo (06/08)** — captura automática + **e-mail para os admins do tenant** quando entra um reporte de categoria bug |
| 15 | Permissões por módulo | 🟢 **Fechado (06/08)** — os gates `admin \|\| gerente` viraram os recursos `clientes.carteira`, `chat.carteira` e `clientes.atribuir`, editáveis em `/admin`, sem ninguém ganhar ou perder acesso |
| 16 | Testes obrigatórios | 🔴 **63 testes** em 8 arquivos (6 novos em 04/08, na captura do reporte). Continua **sem E2E e sem teste de isolamento entre empresas** |
| 17 | Testes de usabilidade com terceiros | 🔴 Não iniciados |
| 18 | Estratégia de migração | 🟢 Multi-tenant aplicado e validado com empresa real (Fase C) |
| 19 | Observabilidade e auditoria | 🟢 **Feito (06/08)** — `app_logs` por app, captura global de erro/query/mutação e painel `/saude` (24h/7d/30d) |
| 20–21 | Critérios por task + entregáveis | 🟢 Seguidos nas entregas |
| 22 | 34 critérios de conclusão | 🟡 ~24 atendidos; os pendentes são UX (§8), testes (§16–17) e observabilidade (§19) |

### O que falta, em ordem de impacto (revisado em 06/08/2026)

1. **Testes (§16–17).** Agora é a **única** lacuna vermelha, e por larga margem.
   São 63 testes, **todos unitários** — nenhum E2E e **nenhum teste de
   isolamento entre empresas**, justamente a garantia que mais importa num
   multi-tenant com 2 empresas em produção. Um vazamento entre tenants hoje só
   apareceria se alguém percebesse. O roteiro manual existe
   (`PLANO-DE-HOMOLOGACAO.md`); falta automatizar.
2. **Fatiar a `ConversationView`** (3.217 linhas, 68 botões, 37 estados). É o
   maior componente do sistema e o coração da operação — exige teste de
   regressão antes, por isso não entrou na revisão de UX de 06/08.
3. **Testes de usabilidade com terceiros (§17).** Não iniciados.

### Entregas de 06/08/2026

- §5 documentação: entraram os 5 documentos que faltavam.
- §6 cadastro central: ficha do cliente com financeiro, conversas e demandas.
- §8–9 UX: auditoria + remoção de 4 áreas órfãs do Chat + hierarquia das abas de
  Contratos + ramo da empresa movido para Configurações.
- §14: e-mail para os admins quando entra reporte de bug.
- §15: gates `admin || gerente` migrados para a matriz.
- §19: `app_logs` + painel `/saude`.
- Extra (pedido do usuário): aba **Sentimental** no Atendimento.

### Documentação (§5) — completa

Existem: `PRD` (com §0 de estado atual), `ARQUITETURA`, `UML.md` + `UML.html`,
`NIVEIS-DE-ACESSO`, `MAPA-DE-NAVEGACAO`, `SISTEMA-DE-TICKETS`, `MUDANCAS`,
`PROGRESS`, este roadmap, `multi-tenant-roadmap`, `AUDITORIA-ATUAL`,
**`AUDITORIA-UX-CHAT-CONTRATOS`**, **`MANUAL-DO-USUARIO`**,
**`MANUAL-DE-ADMINISTRACAO`**, **`GUIA-DE-SUPORTE`**,
**`ESTRATEGIA-DE-ROLLBACK`**, **`PLANO-DE-HOMOLOGACAO`**, `integracoes/`,
`handoffs/`.

---

## ⚠️ Princípios inegociáveis desta reestruturação

O omnx-desk **está em produção e em uso**. Toda a execução obedece a estas regras:

1. **Nada de produção é alterado sem branch dedicada + revisão + OK explícito do usuário.**
2. **Aditivo antes de destrutivo.** Toda mudança de módulo começa **reversível** (ex.: esconder do menu via flag) antes de qualquer remoção de código/dados.
3. **Remoção nunca é a primeira ação.** "Remover X" vira sempre uma **task de auditoria de uso** primeiro (checar dados reais em produção + referências no código). Se houver 1 cliente usando, para.
4. **Banco só via migration** (nunca SQL direto no painel). Migration + código no mesmo commit.
5. **Fase 0 é 100% documento.** Execução só começa na Fase 1, e cada fase declara o que é reversível.

---

## 🎯 Modelo-alvo (decidido)

- ~~**Distribuição:** 1 clone por cliente~~ — **superado.** O modelo virou **multi-tenant** (um banco, várias empresas, isolamento por `tenant_id` + RLS), com provisionamento pela tela `/empresas`. Decidido com o usuário em 23/07/2026.
- **Apps ligáveis por instalação:** o admin do clone liga/desliga apps. Nenhum app "some" de fábrica — a config vive no banco do clone.
- **Núcleo sempre ativo** (base que todos os apps usam).

### Mapa de apps

Estado real em 04/08/2026 (era plano, virou sistema):

| Camada | App | Onde vive |
|---|---|---|
| 🟢 **Loja de Apps** | **Atendimento** — demandas + painel, adaptável ao ramo da empresa. **É a tela inicial** | `/` e `/atendimento/*` |
| 🟢 **Loja de Apps** | **Chat** — conversas WhatsApp | `ChatLayout` (`/chat/*`) |
| 🟢 **Loja de Apps** | **Contratos** — gestão contratual, vendas, recebíveis | `/contratos/*` |
| 🔵 **Núcleo** (não desliga, fora da Loja) | Clientes, Colaboradores, Departamentos, Produtos, Configurações, Admin, Auditoria, Reportes | `AppLayout` |
| ⚪ **Legado** | Dashboard antigo — fora do menu, preservado | `/dashboard-legado` |
| ⚪ **Arquivado** (desligado, fora da tela) | Cobrança · Portal do Cliente | `/cobranca/*` · `/portal/*` |
| ⚫ **Removido** (Fase 6, 24/07) | Pipelines, Interações, telas internas de NPS/Entregas/Trilhas | — |

> O Atendimento acabou **maior** do que o previsto aqui: em vez de só um
> dashboard que lê o Chat, virou o app onde a demanda do cliente é registrada e
> trabalhada. O painel de métricas é uma das abas, não o app inteiro.

---

## 📌 Status atual (atualizado 04/08/2026 às 21h00 BRT)

| Frente | Situação |
|---|---|
| Multi-tenant (isolamento por `tenant_id` + RLS) | 🟢 **Feito** (FASE A/A.2/B aplicadas) — `tenant_id NOT NULL` em 106 tabelas |
| Provisionamento de tenants (Empresas + `provision-tenant`) | 🟢 **Feito** — tela `/empresas` (só admin do mestre) cria empresa + 1º admin + seed |
| **Fase 0** — Auditoria + Roadmap | 🟢 **Completa** · `UML.md` + `NIVEIS-DE-ACESSO.md` feitos |
| **Fase 1** — Liga/desliga de apps | 🟢 **Feito** — catálogo reorganizado em 04/08: Loja com **Chat, Atendimento e Contratos**; Dashboard virou `nucleo`; Cobrança e Portal viraram `arquivado` (desligados, religáveis) |
| **Fase 4** — App Atendimento (Social Media) | 🟢 **Feito (04/08)** — demandas + painel operacional + kanban + configuração de tipos/etapas |
| **Fase 5** — Reporte de erros | 🟢 **Feito + captura automática (04/08)** — print da tela, ring buffer de console e de rede desde o boot, com mascaramento de segredo |
| **Fase 3** — Desenredar Contratos × Comissões | 🟢 **Feito** (24/07) — Contratos saiu de `comissoes/`; `ComissoesLayout` removido |
| **Fase 6** — Remoção do legado morto | 🟢 **Feito** (24/07) — Comissões órfãs, Pipelines, Interações removidos; NPS/Entregas/Trilhas internos limpos (Portal preservado) |
| **Fase 2** — Unificação de permissões | 🟡 **19 telas migradas (04/08)** — todos os gates de admin puro saíram do `perfil`. Sobraram 16 pontos `admin \|\| gerente`, que sao regra de negocio e dependem de decisao de produto |
| **Fase C** do multi-tenant | 🟢 **Feito (27/07)** — ponte por tenant + storage isolado; resta só o que vive no repo do CRM |
| Cadastro central de usuário (§6 do brief) | 🟢 **Feito (27/07)** — `UserForm` reúne papel, departamento e liberação de Contratos |
| Segurança pré-deploy | 🟢 **Auditada (27/07)** — 1 P0 + 1 P1 achados e corrigidos com re-teste; gate `PASS` |
| Fases 7, 8 | 🔴 Pendentes (contínuas — UX por app e testes/observabilidade) |

### O que a auditoria de 27/07 achou (vale registrar)

- **P0 — regressão da própria Onda 4.** `REVOKE ... FROM anon, authenticated` **não** remove
  o grant implícito de `PUBLIC` que o Postgres dá a toda função nova. A função nova que
  devolve o secret da ponte Empire ficou executável por qualquer usuário logado. Não vazou
  (a tabela de integrações está vazia), mas vazaria no dia do cadastro do secret.
  **Regra que fica:** ao clonar função sensível, o controle de acesso **não** vem junto —
  sempre `REVOKE FROM PUBLIC` explícito.
- **P1 — pré-existente.** A policy de `users` consultava `users` dentro dela mesma →
  recursão infinita: **a edição de colaboradores estava quebrada em produção**, para todos.
  A mesma policy permitia editar a própria linha sem restringir colunas, então corrigir só
  a recursão abriria auto-promoção a admin. Corrigidos juntos (policy via `is_admin()` +
  trigger que barra mudança de `perfil`/`acesso_contratos`/`ativo`/`tenant_id`).

### O que a entrega de 04/08 achou pelo caminho

- **`has_permissao()` não tinha a escada que o front tem.** A função no banco
  comparava a ação exata, então quem tinha `editar` **não** passava numa checagem
  de `ver` — enquanto `usePermissoes.can` no front sempre tratou `editar` como
  suficiente. Ninguém tinha percebido porque, até então, **nenhuma policy chamava
  a função**: o gate vivia só no front. O Atendimento é o primeiro app com gate na
  RLS, e aí a divergência viraria bug de verdade — a matriz de `/admin` grava uma
  linha por par (perfil, recurso), então marcar "editar" apagaria a linha "ver" e
  derrubaria o acesso de quem acabou de ganhar permissão. Corrigido em
  `20260804160000`, alinhando os dois lados.
- **FKs de usuário nasceram apontando para `auth.users`**, fora do padrão do
  projeto (todo o resto aponta para `public.users`). Não é estética: o PostgREST
  só monta o join `responsavel:users(nome)` com FK para o schema exposto — sem
  isso, a tela não teria como mostrar o nome do responsável. Corrigido antes de
  qualquer dado existir.

**Divergências conscientes do brief (decididas com o usuário):**
- Brief pede "nenhum app ativo por padrão"; fizemos o **contrário de propósito** — tudo nasce ligado, pra quem já usa em produção não perder acesso.
- Modelo passou a ser **multi-tenant** (vários tenants por banco, via provisionamento), e não mais "banco por clone". Toda tabela nova nasce multi-tenant.
- ~~Skill `Omnx-code` não foi atualizada~~ — **resolvido em 04/08/2026**: atualizada
  de v1.18 para **v1.20.1** por tag verificada (o repo foi renomeado para
  `mestre-code` upstream). O item 1 do brief deixou de ser pendência.

---

## 🗺️ Fases

### Fase 0 — Descoberta e planejamento ✅ (em andamento, só docs)
- [x] Auditoria da arquitetura atual (`AUDITORIA-ATUAL.md`)
- [x] Mapa de apps + modelo-alvo (este doc)
- [x] `UML.md` — diagrama de entidades atuais + fluxo dos apps (engenharia reversa do schema) — feito 24/07/2026
- [x] `NIVEIS-DE-ACESSO.md` — matriz de permissões atual (base pra unificação) — feito 24/07/2026
- **Entregável:** documentação aprovada. **Critério de passagem:** usuário aprova o roadmap.

---

### Fase 1 — Fundação modular: camada de apps ligáveis 🟡 (parcial)
> **Reversível e aditivo** — não remove nada; só adiciona a capacidade de ligar/desligar.
> Implementação real: tabela única `app_modules` **por tenant** (não a split apps/app_installations), fail-open (app só some se admin desligar).

- [x] **E1.1** Migration `20260723170000_create_app_modules_multitenant.sql`: `app_modules` com `tenant_id` + RLS `tenant_isolation` + escrita só admin. Seed por tenant + trigger `seed_apps_on_tenant_insert`.
- [x] **E1.2** Seed dos apps atuais **todos ligados** por tenant.
- [x] **E1.3** Hook `src/hooks/useAppModules.ts` (`useIsAppEnabled`, fail-open).
- [x] **E1.4** Menu dinâmico: `AppSidebar` esconde app desligado (via `appSlug` + `isAppEnabled`).
- [x] **E1.5** Guard de rota `src/components/auth/RequireApp.tsx` (app off não abre por URL).
- [x] **E1.6** Tela **`/apps`** (admin) — toggle com confirmação.
- [x] **E1.7** Registro de auditoria (quem ligou/desligou) — `useToggleAppModule` grava `updated_by = auth.uid()`.
- [x] **Estender a Cobrança e Portal** — `20260724120000_app_modules_cobranca_portal.sql` adiciona `cobranca` e `portal` ao catálogo (5 apps, todos ligados); rotas `/cobranca` e `/portal` protegidas por `RequireApp`. Cobrança/Portal não têm item no AppSidebar real (acesso por URL/links contextuais); o guard de rota é o que importa.
- **Critério de aceite:** admin desliga app de teste; some do menu e da URL; religar restaura; dados intactos. ✅ (5 apps)
- **Follow-up técnico:** policy PERMISSIVE (padrão do projeto é RESTRICTIVE — alinhar); regenerar `types.ts` p/ remover `as any`.

---

### Fase 2 — Unificação de permissões
> Pré-requisito pra "permissões por app". Mexe em auth → **muito cuidado, branch + revisão + testes por perfil**.

- **E2.1** Mapear todo uso de `users.perfil` × `user_roles` × `acesso_contratos` × `modulo_acesso` (doc `NIVEIS-DE-ACESSO.md`).
- **E2.2** Definir modelo unificado (papéis + permissões por app) — **decisão de produto documentada**.
- [x] **E2.2** Modelo decidido (27/07): **papel × recurso × ação**. O papel é `users.perfil`
  (texto) e não `user_roles.role`, porque o enum de 3 valores não distingue atendimento de
  estrategista — que veem telas diferentes. "Recurso" cobre app (`chat`) e sub-área
  (`contratos.onboarding`); a ação é escada (`admin` ⊃ `editar` ⊃ `ver`).
- [x] **E2.3** Migration `20260727150000` + `20260727160000`: tabela `permissoes_app`
  multi-tenant, função `has_permissao()` e seed que **reproduz o gate anterior** —
  verificado com 12 asserções (perfil × recurso), 12/12 iguais. Ninguém ganhou nem
  perdeu acesso.
- [→] **E2.4** Migrar o front tela a tela. Feitas: `ContratosTabs`, `AppSidebar`,
  `ContratosDashboardPage`, `FluxoFuturoPage`. As demais seguem no gate legado — o hook
  `usePermissoes` mantém o comportamento antigo como fallback até a última migrar.
- **Salvaguardas:** admin sempre passa (impede seed errado trancar o dono); o bool
  `acesso_contratos` continua valendo por pessoa, mas nunca concede ação `admin`.
- **Critério:** ligar um app não dá acesso a todos; cada papel vê só o que deve.

---

### Fase 3 — Desenredar Contratos × Comissões + higiene 🟢 (feito 24/07/2026)
- [x] **E3.1** Movidos p/ `src/pages/contratos/` (via `git mv`, comportamento idêntico):
  `ContratosPage`, `ContratoDetailPage`, `ContratosKanbanPage` + `recorrencia.ts`/
  `recorrencia.test.ts` (usado só por `ContratosPage`). Imports do `App.tsx` atualizados.
  Teste de recorrência: 3/3 passando no novo caminho.
- [x] **E3.2** `ComissoesLayout` removido (era 100% órfão — ninguém importava).
- [x] **E3.3** Fronteira confirmada: as 7 páginas de comissão puras
  (`AprovacoesPage`, `ComissoesDashboardPage`, `ConsultoresPage`, `ExtratosPage`,
  `ExtratoDetailPage`, `ExtratoPrintPage`, `ProdutosComissaoPage`) estão **órfãs**
  neste repo (sem rota nem import) — a versão viva vive no projeto **OMNX-Comissões**
  separado. Candidatas à remoção na Fase 6 (auditoria-primeiro), não removidas agora.
- **Critério:** nenhuma rota importa de `comissoes/`; comportamento idêntico. ✅

---

### Fase 4 — App Atendimento (Social Media) 🟢 (feito 04/08/2026)
> **Escopo decidido pelo usuário:** gestão de demandas **+** painel operacional
> (as duas coisas juntas), não só o dashboard de métricas previsto originalmente.
> O motivo: um painel que só lê o Chat mostra número; o que faltava era **onde
> registrar o pedido do cliente** — hoje ele vive no WhatsApp e se perde.

- [x] **E4.1** Segmento como **dado, não código**: `atendimento_tipos` e
  `atendimento_etapas` são configuráveis por tenant. Trocar esses dois conjuntos
  faz o mesmo app atender clínica/escritório sem migration nova. Social Media é o
  primeiro seed (`seed_atendimento_social_media`).
- [x] **E4.2** Painel operacional (`/atendimento`) — atrasadas, vencendo hoje,
  vencendo na semana, esperando o cliente, com ajuste pedido, entregues no mês,
  distribuição por etapa e por responsável. Métricas calculadas no cliente:
  o volume é de dezenas por mês, uma RPC seria complexidade sem ganho.
- [x] **E4.3** Fluxo completo da demanda: lista com busca/filtros, kanban com
  arraste (dnd-kit, mesmo padrão de Contratos), detalhe com comentários,
  aprovação do cliente e histórico automático por trigger.
- [x] **E4.4** Entrou no catálogo como app ligável (`slug: atendimento`) com
  permissões próprias — `gerente`, `estrategista` e `atendimento` operam.
- **Migrations:** `20260804130000` (catálogo), `20260804140000` (schema),
  `20260804160000` (escada de permissões).
- **Critério:** ✅ demanda tem dono, prazo, etapa e situação de aprovação; o app
  liga/desliga por tenant; a RLS barra quem não tem permissão.

**Ajuste do mesmo dia (04/08, noite) — pedido do usuário:**
- **Atendimento virou a tela inicial** (`/`), no lugar e com o ícone do Dashboard.
  O Dashboard antigo continua em `/dashboard-legado`, fora do menu — não foi
  apagado porque concentra métricas de contratos, entregas e Instagram sem outro
  lugar. `HomePage` decide: app desligado ou perfil sem permissão cai no legado,
  senão a home ficaria em branco para quem não usa o app.
- **Segmento por empresa** (`tenants.atendimento_segmento`): Social Media, Clínica
  e Escritório. Define abas, métricas e vocabulário — a clínica não tem kanban
  nem "aguardando aprovação", porque paciente não aprova peça. Catálogo em
  `src/lib/atendimentoSegmentos.ts`; trocar o ramo é aditivo (nada é apagado).
- **Seção "Apps arquivados" saiu da tela** `/apps` a pedido do usuário. Cobrança
  e Portal seguem desligados no banco; religar exige mexer no banco de propósito.

**Não entrou nesta versão (registrado, não esquecido):**
- Upload de anexo pela UI — o bucket `atendimento-anexos` e as policies existem,
  a coluna `anexos` existe, mas a tela ainda não envia arquivo.
- Ligação com o Chat (criar demanda a partir de uma conversa) e com as métricas
  do Instagram (`instagram-stats`), que era a ideia original da E4.2.
- Reordenar etapas por arraste: a ordem existe no banco, mas a tela de
  configuração só acrescenta no fim.

---

### Fase 5 — Canal estruturado de reporte de erros 🟢 (feito)
> App novo e isolado, multi-tenant. Commits `83c884a` (feature) + ajustes de UX do botão.

- [x] **E5.1** Migration `20260723180000_create_reportes_erro.sql`: `reportes_erro` com `tenant_id` + RLS (usuário vê os próprios; admin tria todos do tenant) + protocolo automático `ERR-0000X` + 10 status.
- [x] **E5.2** Botão flutuante "Reportar problema" (`src/components/suporte/ReportarProblema.tsx`) — captura contexto técnico (`src/lib/reporte-contexto.ts`) **sem** senhas/tokens.
- [x] **E5.3** Painel de triagem `src/pages/ReportesPage.tsx` (`/reportes`, admin) — filtro por status + status/prioridade/nota interna.
- [x] **E5.4** Confirmação com protocolo.
- [x] **§14.2 anexos** (27/07): bucket privado `reportes-anexos` (5 MB, imagem/PDF), até 3 por
  reporte, isolado por tenant. O upload acontece **depois** da criação porque o caminho do
  arquivo carrega o id do reporte — é dele que a RLS deriva o dono.
- [x] **§14.5 acompanhamento** (27/07): tela `/meus-reportes`, com status em linguagem de
  usuário e um campo `resposta_usuario` separado da `resposta_interna` (nota de triagem
  continua privada da equipe).
- [x] **§14.6 vínculo com task** (27/07): como não existe módulo de tarefas no app, virou
  `link_externo` — o admin cola o link do issue/card onde a correção é acompanhada.
- **Nota:** rota `/reportes` e item de menu vivem em `App.tsx`/`AppSidebar.tsx` (não commitados — misturados com WIP de provisionamento do usuário).

---

### Fase 6 — Auditoria de uso + remoção do legado (reversível primeiro) 🟢 (concluída 24/07/2026)
- **E6.1** Auditoria de uso real (dados) + auditoria de dependências da fronteira interno×Portal:
  | Feature | Dados | Decisão |
  |---|---|---|
  | **7 páginas órfãs de Comissão** | sem rota/import | ✅ removidas (Fase 3) |
  | **Pipelines / Oportunidades** | 168 oport. | ✅ removida por completo (tela + painel do cliente + hook + tabelas `sales_*` dropadas; dump salvo) |
  | **Interações** | 0 | ✅ removida (tela + `useInteractions` + tabela `client_interactions` dropada — 0 consumidores vivos) |
  | **NPS** interno | 0/0 | ✅ tela `NpsPage` removida; **`useNps.ts` + tabelas `nps_*` mantidos** (Portal + Relatórios usam) |
  | **Entregas** interno | 0/1 | ✅ `EntregasPage` + `EntregaDetailPage` + `EntregaForm` removidos; **`EntregasCamiPage` MANTIDA** (Dashboard usa na aba Entregas); hooks/componentes do Portal intactos |
  | **Trilhas** interno | 0/0 | ✅ `TrilhasPage`/`TrilhaDetailPage` (já órfãs) removidas; **`useTrilhas.ts` mantido** (Portal + Relatórios) |
- **Aprendizado:** a auditoria de dependências + grep de refs evitou 1 quebra —
  `EntregasCamiPage` parecia morta mas é renderizada pelo Dashboard (aba Entregas).
- **Critério:** nada removido sem evidência de não-uso + fronteira com o Portal preservada. ✅

---

### Fase 7 — Revisão de UX por app
- Auditoria de UX + arquitetura de informação de cada app (Chat, Contratos, Atendimento).
- Aplicar os 10 princípios (uma finalidade por tela, botões descritivos, estados vazios orientados, etc.).
- Prioridade: Contratos e Atendimento (os mais carregados).

---

### Fase 8 — Testes, homologação e observabilidade
- Testes por perfil, isolamento entre apps, regressão.
- Logs estruturados + métricas por módulo (sem dados sensíveis).
- Homologação em branch/preview antes de qualquer merge em `main`.

---

## 🔗 Dependências (ordem recomendada)

```
Fase 0 (docs) ──► Fase 1 (liga/desliga apps) ──► Fase 2 (permissões)
                        │                              │
                        ├──► Fase 5 (reporte erros, paralelo possível)
                        └──► Fase 3 (desenredar contratos)
Fase 2 ──► Fase 4 (App Atendimento) ──► Fase 7 (UX)
Fase 1 ──► Fase 6 (auditoria + remoção legado)
Todas ──► Fase 8 (testes/homologação)
```

## ⚠️ Riscos iniciais

| Risco | Mitigação |
|---|---|
| Mexer em auth (Fase 2) quebrar acesso em produção | Aditivo; testes por perfil; branch + preview; legado ativo até migrar |
| Remover algo em uso por cliente | Fase 6 é auditoria-primeiro + desligar reversível antes de remover |
| Menu dinâmico esconder algo por engano | Seed inicial liga tudo; mudança só por ação explícita do admin |
| Rename Contratos×Comissões quebrar imports | Rename mecânico + testes; comportamento idêntico |

## 📌 Decisões pendentes (aguardando usuário)
- Quais de NPS/Entregas/Trilhas realmente não têm uso (→ vira task E6.1, não decisão agora).
- Modelo exato de papéis unificados (→ E2.2, decisão de produto).
