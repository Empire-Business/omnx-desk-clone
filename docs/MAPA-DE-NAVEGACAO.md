# Mapa de navegação — OMNX Desk

> Todas as telas do sistema, quem alcança cada uma e o que a protege.
> Gerado a partir das rotas reais de `src/App.tsx` e da fonte única de menus `src/config/navegacao.ts`.
> Atualizado em: 22/11/2026 BRT — Pesquisas NPS da equipe em `/relatorios/pesquisas` (versão anterior: 20/11/2026 BRT — `/login` com "Criar a primeira conta" no app recém-instalado e, do visual
> Cume, a barra superior e o menu em blocos (versão anterior: 07/11/2026 às 00h15 BRT — navegação nova (Conversas,
> Tickets, Íris, Ajustes), tabela rota antiga → nova (versão anterior: 06/11/2026 às 14h49 BRT))).

---

## Fonte única

Menus, abas, hub Ajustes, atalhos da ajuda com IA e o manual (`/manual`) leem de
`src/config/navegacao.ts` e das rotas de `src/App.tsx`. O teste
`src/config/navegacao.manual.test.ts` falha se um destino aponta para rota que
não existe, se um item de menu não é explicado no manual ou se o manual volta a
usar nomes retirados. Endereços antigos ficam em `src/config/rotasAntigas.ts`
(redirecionamentos **permanentes**; nunca remover uma linha).

## Como ler

Cada tela pode ter até **três camadas** de proteção, que se somam:

| Camada | O que faz | Onde vive |
|---|---|---|
| **Login** | Exige sessão ativa | `ProtectedRoute` |
| **App ligado** | O admin da empresa pode desligar o app inteiro | `RequireApp slug=…` (lê `app_modules`) |
| **Permissão** | O perfil da pessoa precisa poder no recurso | `usePermissoes.can()` no front, `ExigeAcesso` nas rotas com trava de página e RLS no banco |

> Esconder o item do menu **não** é proteção; é conveniência. A trava real é a
> RLS: sem permissão, a API não devolve o dado nem para quem digitar a URL.

---

## 1. Menus

| Onde | Itens |
|---|---|
| Barra lateral (computador) | Início · Clientes · Conversas, Tickets, Íris · Agenda, Aulas · Contratos · Relatórios, Pesquisas NPS (blocos separados por linha fina, só visual; Relatórios e Pesquisas NPS só para admin). Rodapé: Ajustes e Ajuda |
| Barra superior (computador, ≥ 768 px) | Busca global (⌘/Ctrl+K; só leitura: telas do menu que a pessoa pode acessar + clientes da carteira dela, via `useClientes`), Chat (atalho para Conversas), Avisos, menu do usuário (Meu perfil, Ajustes, tema, Sair) e Sair. Antes avisos, tema e usuário ficavam no rodapé da barra lateral; os componentes são os mesmos |
| Barra inferior (celular) | Início, Conversas, Tickets, Contratos, Mais |
| Painel "Mais" (celular) | Clientes, Íris, Agenda, Aulas, Relatórios, Pesquisas NPS, Ajustes, Notificações, Meus pedidos de suporte, Meu perfil, Ajuda, tema, Sair |
| Ajuda | Perguntar à Íris, Reportar um problema, Abrir o manual, Meus pedidos de suporte, Segurança, privacidade e IA. É um painel, não uma rota. No computador há também botão no canto inferior; em Conversas, no topo; no celular, Mais → Ajuda |

Item sem permissão ou de app desligado some e os demais se redistribuem.

---

## 2. Público (sem login)

| Rota | Tela | Observação |
|---|---|---|
| `/login` | Login | "Criar a primeira conta" só enquanto o app não tem nenhuma administradora (`desk_primeiro_acesso_aberto()`; app instalado recém-instalado). Na produção nunca aparece |
| `/reset-password` · `/trocar-senha` | Redefinir senha (a segunda é obrigatória no primeiro acesso) | |
| `/vendas/nova` | Formulário público de venda | Alimenta Contratos → Vendas novas |
| `/meet/:roomId` | Sala de reunião | |
| `/manual` | Manual de uso | Entrada independente (`main.tsx`), sem providers nem dados |

---

## 3. Início e núcleo

| Rota | Tela | Proteção |
|---|---|---|
| `/` | **Início** (painel do que precisa de ação) | Login. Sem `RequireApp` de propósito: se Tickets estiver desligado, `HomePage` cai no Dashboard legado |
| `/clientes` · `/clientes/:id` | Clientes e ficha (inclui "Tickets deste cliente" e Responsáveis) | Login. Não-admin vê só os clientes atribuídos (RLS) |
| `/clientes/grupos` | **Grupos e clientes** (liga grupos/conversas de WhatsApp a clientes) | App `automacoes-wa` + só admin/gerente na página + RLS/RPC `vinculos_pode_gerir()` |
| `/notificacoes` | Notificações | Login |
| `/seguranca` | Segurança, privacidade e IA | Login |
| `/meus-reportes` | Meus pedidos de suporte | Todo usuário logado |
| `/configuracoes` | Meu perfil (e marca/ramo/integrações para quem administra) | Login; seções da empresa exigem `configuracoes.admin` |
| `/produtos` · `/produtos/:id` | Produtos (cadastro de entregáveis do cliente) | Login |
| `/aulas` · `/aulas/:id` | **Aulas da equipe**: trilhas internas (trilha → módulos → aulas), o progresso de quem vê e, para admin, Nova trilha / Novo módulo / Nova aula | Perfis admin, gerente, estrategista e atendimento (`TRAVAS_DE_PAGINA.aulas`, a mesma lista da RLS `team_read_internal_paths`). Gravar trilha/módulo/aula: só admin (RLS `admin_manage_*`). Progresso: cada um o seu (RLS `own_progress`) |
| `/relatorios/pesquisas` · `/relatorios/pesquisas/:id` | **Pesquisas NPS**: campanhas (`nps_surveys`) com placar NPS, Criar campanha e Copiar link (`/portal/nps/:surveyId`); na campanha, as respostas (`nps_responses`) com nota, comentário, cliente e data. Não envia nada pelo WhatsApp | Só admin, a mesma trava do relatório NPS (`TRAVAS_DE_PAGINA.pesquisas` = `TRAVAS_DE_PAGINA.relatorios`). Criar campanha: só admin (RLS `admin_manage_nps_surveys`). Copiar link fica desligado com o portal desligado |
| `/dashboard-legado` | Dashboard antigo, fora do menu | Login |
| `*` | "Não encontramos essa tela", com atalhos | Login |

---

## 4. Tickets — app `atendimento` (antes Atendimento/Demandas)

Itens filtrados por `can('atendimento','ver')`. Abas variam com o segmento da empresa.

| Rota | Tela | Proteção adicional |
|---|---|---|
| `/` | Painel (aba "Painel") | `can('atendimento','ver')` |
| `/tickets` | Lista de tickets (aceita `?status=` e `?cliente=<id>`) | `ver` |
| `/tickets/:id` | Ficha do ticket: status, Marcar como resolvido, Reabrir, Abrir no Chat, conversa de origem | Editar exige `editar`; excluir, `admin` |
| `/tickets/quadro` | Quadro de tickets, por etapa | Arrastar exige `editar` |
| `/tickets/analise` | Análise das conversas (sentimento) | App `chat` + `chat.ver` |
| `/tickets/configurar` | Etapas, tipos e ramo | `can('atendimento','admin')` |

Status mostrados (calculados, sem coluna própria): Aguardando equipe, Aguardando
cliente, Resolvido (pela equipe ou pela Íris, só com confirmação do cliente),
Reaberto, Aberto e Em andamento (tickets sem conversa). Regras em `src/lib/ticketStatus.ts`.

## 5. Conversas — app `chat` (antes OMNXChat)

Layout próprio (`ChatLayout`), fora do `AppLayout`. Gate: `RequireApp slug="chat"`.

| Rota | Tela | Proteção adicional |
|---|---|---|
| `/conversas` | Caixa de entrada | Visibilidade por departamento/números (RLS) |
| `/conversas/quadro` | Quadro de conversas | |
| `/conversas/contatos` | Contatos | |
| `/conversas/anotacoes` | Anotações | |
| `/conversas/configurar` | **Números e acessos** (também em Ajustes → WhatsApp) | Só admin/gerente |
| `/conversas/filas` | Filas de atendimento (departamentos) | |
| `/conversas/reunioes` | Reuniões marcadas | |

Dentro de uma conversa ligada a um cliente aparece o selo/lista **Tickets deste cliente**.

## 6. Contratos — app `contratos`

| Rota | Tela | Proteção adicional |
|---|---|---|
| `/contratos` | Visão geral | `contratos` ou `contratos.onboarding` (o menu aparece para quem tem uma das duas) |
| `/contratos/lista` | Lista de contratos | `can('contratos','ver')` |
| `/contratos/kanban` | **Quadro** de contratos | `ver` |
| `/contratos/onboarding` | **Vendas novas** | `contratos.onboarding`; é a única aba do perfil `atendimento` |
| `/contratos/recebiveis` | **A receber** (previsão de parcelas) | `ver` |
| `/contratos/:id` | Detalhe do contrato | |
| `/contratos/produtos` | Produtos de contrato | `can('contratos','admin')` |
| `/contratos/tags` | **Etiquetas** | `can('contratos','admin')` |

## 7. Íris — app `automacoes-wa` (antes Automações WhatsApp)

Item de menu só com `can('automacoes-wa','admin')` e app ligado. A página
`AutomacoesWaConfigPage` repete a trava (sem permissão volta para `/`) e a RLS
protege `wa_auto_*`, `wa_agente_*`, `cliente_canais` e `equipe_identidades`.

| Rota | Aba | Observação |
|---|---|---|
| `/ia` | Íris (personalidade, contexto, memória, canais, teste) | Salvar perfil via `wa-agente-admin`; memórias exigem também `pode_ver_restrito` |
| `/ia/alertas` | Pontos de atenção | Cliente com ticket aberto mostra o link "Ver o ticket aberto" (`/tickets?status=todos&cliente=<id>`, só para quem vê Tickets). "Esperando resposta" de quem já tem ticket aberto fica num bloco recolhido, sem perder nenhum alerta. Só tela: relatório e avisos da Íris não mudam |
| `/ia/tempo-resposta` | Tempo de resposta | Só admin/gerente |
| `/ia/aviso-diario` | Aviso diário para gestores | Prévia exige `perfil = 'admin'` |
| `/ia/resumo-semanal` | Resumo semanal para o cliente | |
| `/ia/reunioes` | Reuniões (agendamento em duas etapas) | |
| `/ia/historico` | Histórico de envios | |
| `/ia/conexao` | Conexão (provedor, número, modelos, teste) | Salvar token e teste exigem `perfil = 'admin'` |
| `/ia/comecar` | Primeiros passos | |
| `/ia/<outra>` | Cai nos Primeiros passos | |

## 8. Ajustes (hub) e telas administrativas

`/ajustes` mostra cartões filtrados pela mesma regra de cada destino.

| Grupo | Cartão → rota | Quem vê / proteção |
|---|---|---|
| Minha conta | Perfil, aparência e notificações → `/configuracoes` | Todos |
| Empresa | Marca, ramo e integrações → `/configuracoes` | `configuracoes.admin` |
| Equipe | Colaboradores → `/colaboradores`; Departamentos → `/departamentos` (`/departamentos/:id`); Minha equipe → `/minha-equipe` | Login; dados por RLS |
| WhatsApp | Números e acessos → `/conversas/configurar`; Filas → `/conversas/filas`; Conexão das mensagens automáticas → `/ia/conexao`; Grupos e clientes → `/clientes/grupos`; Reuniões marcadas → `/conversas/reunioes` | Apps `chat`/`automacoes-wa`; Números e Grupos só admin/gerente |
| Tickets e contratos | Etapas e tipos de ticket → `/tickets/configurar`; Produtos de contrato → `/contratos/produtos`; Etiquetas → `/contratos/tags` | `atendimento.admin` / `contratos.admin` |
| Permissões e módulos | Quem pode o quê → `/admin`; Módulos ligados → `/apps` | `/admin` só admin (trava na rota); `/apps` exige `apps.admin` |
| Suporte técnico | Problemas relatados → `/reportes`; Saúde do sistema → `/saude`; Registro de ações → `/auditoria`; Chaves de acesso → `/api-webhooks`; Empresas → `/empresas` | `reportes.admin`; `auditoria.admin` (saúde e auditoria); `configuracoes.admin` (API, trava na rota); Empresas só empresa-mãe (`is_master_admin()`) |

Rotas com trava de página própria (`TRAVAS_DE_PAGINA`, `ExigeAcesso`): `/admin`,
`/auditoria`, `/api-webhooks`, `/relatorios` (só admin; chega-se por Quem pode o quê → Acesso rápido), `/aulas`,
`/relatorios/pesquisas` e `/relatorios/pesquisas/:id` (mesma trava de `/relatorios`).

Fora do menu: `/disparo` (disparo por tag; acessa-se digitando a URL, a trava é o
gate de admin dentro da página) e `/dashboard-legado`.

## 9. Apps arquivados (desligados)

Rotas existem, mas `RequireApp` bloqueia porque `app_modules.enabled = false`. Nenhum dado foi apagado.

| Rota | App |
|---|---|
| `/cobranca/*` (`devedores`, `reguas`, `instancias`, `conversas`, `historico`) | Cobrança |
| `/portal/*` (`entregas`, `kanban`, `calendario`, `nps/:surveyId`, `trilhas`) | Portal do Cliente |

---

## 10. Rota antiga → nova

Todos os redirecionamentos são permanentes e preservam `?busca` e `#âncora`
(links enviados no WhatsApp, push, notificações gravadas, favoritos). Fonte: `src/config/rotasAntigas.ts`.

| Antiga | Nova |
|---|---|
| `/atendimento` | `/` |
| `/atendimento/demandas` · `/atendimento/demandas/:id` | `/tickets` · `/tickets/:id` |
| `/atendimento/kanban` | `/tickets/quadro` |
| `/atendimento/sentimento` | `/tickets/analise` |
| `/atendimento/config` | `/tickets/configurar` |
| `/chat` · `/chat/inbox` | `/conversas` |
| `/chat/kanban` | `/conversas/quadro` |
| `/chat/contatos` · `/chat/anotacoes` | `/conversas/contatos` · `/conversas/anotacoes` |
| `/chat/config` | `/conversas/configurar` |
| `/chat/instancias` | `/conversas/configurar?aba=instancias` |
| `/chat/acessos` | `/conversas/configurar?aba=acessos` |
| `/chat/departamentos` | `/conversas/filas` |
| `/chat/reunioes` | `/conversas/reunioes` |
| `/chat/relatorio-semanal` | `/tickets/analise` |
| `/chat/*` (outras) | `/conversas/*` (404 amigável se não existir) |
| `/automacoes-wa` · `/inicio` · qualquer aba desconhecida | `/ia/comecar` |
| `/automacoes-wa/iris` · `/assistente` | `/ia` |
| `/automacoes-wa/relatorio` · `/gestores` | `/ia/aviso-diario` |
| `/automacoes-wa/resumo` | `/ia/resumo-semanal` |
| `/automacoes-wa/reunioes` · `/agendamento` | `/ia/reunioes` |
| `/automacoes-wa/alertas` | `/ia/alertas` |
| `/automacoes-wa/tempo-resposta` | `/ia/tempo-resposta` |
| `/automacoes-wa/historico` | `/ia/historico` |
| `/automacoes-wa/conexao` | `/ia/conexao` |
| `/automacoes-wa/vinculos` | `/clientes/grupos` |
| `/comissoes/vendas-pendentes` | `/contratos/onboarding` (Vendas novas) |
| `/usuarios` | `/colaboradores` |
| `/contratos/modelos` | `/contratos/produtos` |

Os slugs de app no banco (`atendimento`, `chat`, `automacoes-wa`, `contratos`) não mudaram.

---

## Relacionados

- Permissões por perfil: [`reestruturacao/NIVEIS-DE-ACESSO.md`](./reestruturacao/NIVEIS-DE-ACESSO.md)
- Entidades e fluxos: [`UML.md`](./UML.md) · [`UML.html`](./UML.html)
- Catálogo de apps e roadmap: [`reestruturacao/ROADMAP-MODULARIZACAO.md`](./reestruturacao/ROADMAP-MODULARIZACAO.md)
