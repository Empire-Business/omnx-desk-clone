# Mapa de navegação — OMNX Desk

> Todas as telas do sistema, quem alcança cada uma e o que a protege.
> Gerado a partir das rotas reais de `src/App.tsx`.
> Atualizado em: 04/08/2026 às 19h30 BRT

---

## Como ler

Cada tela pode ter até **três camadas** de proteção, que se somam:

| Camada | O que faz | Onde vive |
|---|---|---|
| **Login** | Exige sessão ativa | `ProtectedRoute` |
| **App ligado** | O admin da empresa pode desligar o app inteiro | `RequireApp slug=…` (lê `app_modules`) |
| **Permissão** | O perfil da pessoa precisa poder no recurso | `usePermissoes.can()` no front + RLS no banco |

> Esconder o item do menu **não** é proteção — é conveniência. A trava real é a
> RLS: sem permissão, a API não devolve o dado nem para quem digitar a URL.

---

## 1. Público (sem login)

| Rota | Tela | Observação |
|---|---|---|
| `/login` | Login | |
| `/reset-password` | Redefinir senha | |
| `/vendas/nova` | Formulário público de venda | Usada pelos closers; alimenta o onboarding de Contratos |
| `/meet/:roomId` | Sala de reunião | |

---

## 2. Tela inicial

| Rota | Tela | Proteção |
|---|---|---|
| `/` | **Painel de Atendimento** | Login. Sem `RequireApp` de propósito |

`HomePage` decide o que renderizar: se o app Atendimento estiver desligado na
empresa, ou o perfil não tiver permissão nele, cai no **Dashboard legado**. Sem
essa saída, desligar o app deixaria a empresa sem tela inicial.

---

## 3. App Atendimento — `slug: atendimento`

Abas variam conforme o **segmento da empresa** (`tenants.atendimento_segmento`):
clínica não tem Kanban.

| Rota | Tela | Proteção adicional |
|---|---|---|
| `/` | Painel | `can('atendimento','ver')` |
| `/atendimento` | → redireciona para `/` | Mantém vivo link antigo |
| `/atendimento/demandas` | Lista com busca e filtros | `can('atendimento','ver')` |
| `/atendimento/demandas/:id` | Detalhe da demanda | Editar exige `editar`; excluir, `admin` |
| `/atendimento/kanban` | Kanban por etapa | Arrastar exige `editar` |
| `/atendimento/config` | Ramo, etapas e tipos | `can('atendimento','admin')` |

---

## 4. App OMNXChat — `slug: chat`

Layout próprio (`ChatLayout`). Itens internos ainda filtram por
`useMyModules()` (departamento), não pela matriz nova.

| Rota | Tela |
|---|---|
| `/chat` | Inbox |
| `/chat/instancias` · `/chat/departamentos` · `/chat/acessos` | Configuração de números, filas e acessos |
| `/chat/contatos` · `/chat/kanban` | Contatos e kanban de conversas |
| `/chat/metricas` · `/chat/csat` · `/chat/relatorios` · `/chat/relatorio-semanal` | Indicadores |
| `/chat/bots` · `/chat/bots/:id` · `/chat/automacoes` · `/chat/automacao` | IA e automações |
| `/chat/campanhas` · `/chat/templates` · `/chat/respostas-rapidas` | Disparos e modelos |
| `/chat/anotacoes` · `/chat/conteudo` · `/chat/reunioes` | Apoio |
| `/chat/config` | Configurações do app |

---

## 5. App Contratos — `slug: contratos`

| Rota | Tela | Proteção adicional |
|---|---|---|
| `/contratos` | Dashboard | `can('contratos','ver')` |
| `/contratos/onboarding` | Vendas a processar | `contratos.onboarding` — é a única aba do perfil `atendimento` |
| `/contratos/lista` · `/contratos/kanban` | Lista e kanban | `can('contratos','ver')` |
| `/contratos/recebiveis` | Fluxo futuro | `can('contratos','ver')` |
| `/contratos/:id` | Detalhe do contrato | |
| `/contratos/produtos` · `/contratos/tags` | Catálogo e tags | `can('contratos','admin')` |
| `/contratos/modelos` | → redireciona para Produtos | Link antigo |

---

## 6. Núcleo (sem app — sempre disponível)

| Rota | Tela | Proteção adicional |
|---|---|---|
| `/clientes` · `/clientes/:id` | Clientes | Não-admin vê só os clientes atribuídos |
| `/colaboradores` | Colaboradores | `/usuarios` redireciona para cá |
| `/departamentos` · `/departamentos/:id` · `/minha-equipe` | Estrutura de equipe | |
| `/produtos` · `/produtos/:id` | Produtos | |
| `/relatorios` · `/notificacoes` | Relatórios e avisos | |
| `/configuracoes` | Preferências e marca | |
| `/meus-reportes` | Acompanhar os próprios reportes | Todo usuário logado |

### Só admin

| Rota | Tela |
|---|---|
| `/admin` | Matriz de permissões |
| `/apps` | Loja de Apps |
| `/reportes` | Triagem de reportes de erro |
| `/auditoria` | Log de auditoria |
| `/api-webhooks` | API keys e webhooks |
| `/disparo` | Disparo por tag no CRM — **fora do menu**, acessa-se digitando a URL |

### Só admin do tenant mestre

| Rota | Tela |
|---|---|
| `/empresas` | Provisionamento de empresas (`is_master_admin()`) |

---

## 7. Telas fora do menu (legado e acesso direto)

| Rota | Tela | Por que continua existindo |
|---|---|---|
| `/dashboard-legado` | Dashboard antigo | Concentra métricas de contratos, entregas e Instagram sem outro lugar |
| `/disparo` | Disparo por tag | Decisão do usuário (28/07): não listar no menu. A trava real é o gate de admin dentro da página |

---

## 8. Apps arquivados (desligados)

Rotas existem, mas `RequireApp` bloqueia porque `app_modules.enabled = false`.
Não aparecem na Loja de Apps. Nenhum dado foi apagado.

| Rota | App |
|---|---|
| `/cobranca/*` | Cobrança — dashboard, devedores, réguas, instâncias, conversas, histórico |
| `/portal/*` | Portal do Cliente — entregas, kanban, calendário, NPS, trilhas |

---

## Relacionados

- Permissões por perfil: [`reestruturacao/NIVEIS-DE-ACESSO.md`](./reestruturacao/NIVEIS-DE-ACESSO.md)
- Entidades e fluxos: [`UML.md`](./UML.md) · [`UML.html`](./UML.html)
- Catálogo de apps e roadmap: [`reestruturacao/ROADMAP-MODULARIZACAO.md`](./reestruturacao/ROADMAP-MODULARIZACAO.md)
