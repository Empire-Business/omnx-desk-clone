# EmpireDesk - Documentação de Acompanhamento

> **Última atualização:** 10/03/2026  
> **Versão do Projeto:** 0.0.0  
> **Status:** Em desenvolvimento ativo

---

## 📋 Visão Geral

O **EmpireDesk** é uma plataforma completa de gestão para agências de marketing digital, integrando:

- **CRM de Clientes** - Cadastro e gestão de clientes e produtos
- **Gestão de Entregas** - Fluxo completo de aprovação de conteúdo
- **Portal do Cliente** - Acesso exclusivo para clientes visualizarem entregas
- **Chat (EmpireChat)** - Atendimento via WhatsApp integrado
- **Cobrança** - Sistema de recuperação de dívidas via WhatsApp
- **NPS** - Pesquisa de satisfação do cliente
- **Trilhas de Aprendizado** - Sistema de treinamento interno e para clientes

---

## ✅ Módulos Implementados

### 1. Autenticação e Autorização ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Login com email/senha | ✅ Completo | Integração com Supabase Auth |
| Perfis de usuário | ✅ Completo | 8 perfis: admin, gerente, estrategista, atendimento, cliente, agente_chat, agente_cobranca, admin_cobranca |
| Rotas protegidas | ✅ Completo | ProtectedRoute implementado |
| Contexto de auth | ✅ Completo | AuthContext com React Context API |

**Arquivos principais:**
- `src/contexts/AuthContext.tsx`
- `src/components/auth/ProtectedRoute.tsx`
- `src/types/auth.ts`

---

### 2. Dashboard ✅ (MVP)

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Layout base | ✅ Completo | KPIs mockados |
| Sidebar navegação | ✅ Completo | Com collapse/expand |
| Header/TopBar | ✅ Completo | Com notificações |
| KPIs dinâmicos | 🔄 Pendente | Aguardando integração com dados reais |

**Arquivos principais:**
- `src/pages/DashboardPage.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/AppLayout.tsx`

---

### 3. Gestão de Clientes ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Listar clientes | ✅ Completo | Com ordenação |
| Criar cliente | ✅ Completo | Form completo |
| Editar cliente | ✅ Completo | |
| Visualizar detalhes | ✅ Completo | Com produtos vinculados |
| Atribuição de equipe | ✅ Completo | Estrategista e atendimento |

**Arquivos principais:**
- `src/pages/clientes/ClientesPage.tsx`
- `src/pages/clientes/ClienteDetailPage.tsx`
- `src/hooks/useClientes.ts`
- `src/components/clientes/*`

---

### 4. Gestão de Produtos ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Listar produtos | ✅ Completo | Por cliente |
| Criar produto | ✅ Completo | |
| Editar produto | ✅ Completo | |
| Entregáveis | ✅ Completo | Tipos: post_feed, stories, reels, video, copy, arte, relatorio, outro |

**Arquivos principais:**
- `src/pages/produtos/ProdutosPage.tsx`
- `src/pages/produtos/ProdutoDetailPage.tsx`
- `src/hooks/useProdutos.ts`

---

### 5. Gestão de Entregas ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Listar entregas | ✅ Completo | Com filtros por status, cliente, responsável |
| Criar entrega | ✅ Completo | Vinculada a entregável |
| Fluxo de status | ✅ Completo | rascunho → aguardando_aprovacao → em_revisao → aprovado/reprovado → publicado |
| Versões de entrega | ✅ Completo | Suporte a múltiplas versões |
| Conteúdo (itens) | ✅ Completo | imagem, video, documento, link, texto |
| Aprovação | ✅ Completo | Com notas e histórico |
| Comentários | ✅ Completo | Por versão |

**Arquivos principais:**
- `src/pages/entregas/EntregasPage.tsx`
- `src/pages/entregas/EntregaDetailPage.tsx`
- `src/hooks/useEntregas.ts`
- `src/hooks/useApproval.ts`
- `src/hooks/useDeliveryContent.ts`
- `src/components/entregas/*`

---

### 6. Portal do Cliente ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Dashboard do cliente | ✅ Completo | Com KPIs de entregas |
| Lista de entregas | ✅ Completo | Com filtros de status |
| Detalhe da entrega | ✅ Completo | Com aprovação e comentários |
| Kanban de entregas | ✅ Completo | Visualização em board |
| Calendário de entregas | ✅ Completo | Visualização por data |
| Responder NPS | ✅ Completo | Interface do cliente |
| Trilhas de aprendizado | ✅ Completo | Acesso a conteúdos |

**Arquivos principais:**
- `src/pages/portal/*`
- `src/components/layout/PortalLayout.tsx`

---

### 7. EmpireChat (WhatsApp) 🔄

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Instâncias WhatsApp | ✅ Completo | CRUD completo |
| Departamentos | ✅ Completo | Com configurações de SLA |
| Lista de conversas | ✅ Completo | Com filtros |
| Conversa em tempo real | ✅ Completo | Realtime subscription |
| Envio de mensagens | ✅ Completo | Via Edge Function |
| Atribuição de agente | ✅ Completo | |
| Fechar conversa | ✅ Completo | |
| Mensagens do agente | ✅ Completo | |
| **Kanban de atendimento** | 🔄 Pendente | Interface visual |
| **Respostas rápidas** | 🔄 Pendente | Templates de mensagem |
| **Métricas de atendimento** | 🔄 Pendente | Relatórios |

**Arquivos principais:**
- `src/hooks/useChat.ts`
- `src/components/chat/ConversationView.tsx`
- `supabase/functions/uazapi-webhook`
- `supabase/functions/uazapi-send-message`

---

### 8. Módulo de Cobrança 🔄

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Instâncias de cobrança | ✅ Completo | Configurações de envio |
| Réguas de cobrança | ✅ Completo | CRUD completo |
| Passos da régua | ✅ Completo | Com mensagens templates |
| Cadastro de devedores | ✅ Completo | Individual e importação em lote |
| Controle de status | ✅ Completo | ativa, pausada, encerrada, pago |
| Histórico de envios | ✅ Completo | |
| **Scheduler automático** | ✅ Completo | Edge Function |
| **Relatórios de cobrança** | 🔄 Pendente | |
| **Dashboard financeiro** | 🔄 Pendente | |

**Arquivos principais:**
- `src/hooks/useCobranca.ts`
- `src/pages/cobranca/*`
- `supabase/functions/cobranca-scheduler`

---

### 9. NPS (Net Promoter Score) ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Criar pesquisa | ✅ Completo | Vinculada a cliente/entrega |
| Responder pesquisa | ✅ Completo | Interface pública no portal |
| Estatísticas | ✅ Completo | Média, promotores, neutros, detratores, NPS Score |
| Listagem de respostas | ✅ Completo | |

**Arquivos principais:**
- `src/hooks/useNps.ts`
- `src/pages/nps/NpsPage.tsx`
- `src/pages/portal/PortalNpsPage.tsx`

---

### 10. Trilhas de Aprendizado ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Trilhas (paths) | ✅ Completo | Tipo: interno ou cliente |
| Módulos | ✅ Completo | Organizados por ordem |
| Aulas/Lições | ✅ Completo | Tipos: video, texto, pdf, link |
| Progresso do usuário | ✅ Completo | Marcar como concluído |
| Visualização no portal | ✅ Completo | Para clientes |

**Arquivos principais:**
- `src/hooks/useTrilhas.ts`
- `src/pages/trilhas/TrilhasPage.tsx`
- `src/pages/trilhas/TrilhaDetailPage.tsx`
- `src/pages/portal/PortalTrilhasPage.tsx`

---

### 11. Gestão de Usuários ✅

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Listar usuários | ✅ Completo | |
| Criar usuário | ✅ Completo | |
| Editar usuário | ✅ Completo | Nome, perfil, status |
| Atribuições | ✅ Completo | Vincular a clientes |

**Arquivos principais:**
- `src/hooks/useUsers.ts`
- `src/pages/usuarios/UsuariosPage.tsx`
- `src/components/usuarios/*`

---

### 12. Notificações 🔄

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Badge de notificações | ✅ Completo | No header |
| **Central de notificações** | 🔄 Pendente | Página completa |
| **Push notifications** | 🔄 Pendente | |
| **Notificações por email** | 🔄 Pendente | |

**Arquivos principais:**
- `src/hooks/useNotifications.ts`
- `src/components/layout/NotificationBell.tsx`

---

### 13. IA Bot 🤖

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Hook de integração | ✅ Base | useIaBot.ts criado |
| **Respostas automáticas** | 🔄 Pendente | Integração completa |
| **Treinamento do bot** | 🔄 Pendente | |

**Arquivos principais:**
- `src/hooks/useIaBot.ts`
- `supabase/functions/ia-bot-respond`

---

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais (Supabase)

```
users                          - Usuários do sistema
clients                        - Clientes
client_assignments             - Vinculação usuário-cliente
products                       - Produtos por cliente
deliverables                   - Entregáveis (tipos de conteúdo)
deliveries                     - Entregas (instâncias)
delivery_versions              - Versões de entrega
delivery_content_items         - Itens de conteúdo
delivery_approvals             - Aprovações
delivery_comments              - Comentários

whatsapp_instances             - Instâncias WhatsApp (chat)
chat_departments               - Departamentos de atendimento
chat_contacts                  - Contatos WhatsApp
chat_conversations             - Conversas
chat_messages                  - Mensagens

cobranca_instances             - Instâncias de cobrança
cobranca_reguas                - Réguas de cobrança
cobranca_regua_passos          - Passos das réguas
cobranca_devedores             - Devedores
cobranca_sends                 - Envios realizados

nps_surveys                    - Pesquisas NPS
nps_responses                  - Respostas NPS

learning_paths                 - Trilhas de aprendizado
learning_modules               - Módulos
teaching_lessons               - Aulas
learning_progress              - Progresso do usuário
```

---

## 🛠️ Tecnologias Utilizadas

| Categoria | Tecnologia | Versão |
|-----------|------------|--------|
| **Framework** | React | 19.2.0 |
| **Build Tool** | Vite | 7.3.1 |
| **Linguagem** | TypeScript | 5.9.3 |
| **Estilização** | Tailwind CSS | 4.2.1 |
| **Backend** | Supabase | 2.99.0 |
| **Query Client** | TanStack Query | 5.90.21 |
| **Routing** | React Router DOM | 7.13.1 |
| **Ícones** | Lucide React | 0.577.0 |
| **State** | Zustand | 5.0.11 |
| **DND** | @dnd-kit | 6.3.1 |

---

## 📁 Estrutura de Pastas

```
src/
├── components/
│   ├── auth/              # Componentes de autenticação
│   ├── chat/              # Componentes do EmpireChat
│   ├── clientes/          # Componentes de clientes
│   ├── entregas/          # Componentes de entregas
│   ├── layout/            # Layouts (Sidebar, TopBar, etc)
│   ├── ui/                # Componentes UI genéricos
│   └── usuarios/          # Componentes de usuários
├── contexts/
│   └── AuthContext.tsx    # Contexto de autenticação
├── hooks/                 # Custom hooks (TanStack Query)
├── lib/
│   ├── supabase.ts        # Cliente Supabase
│   └── utils.ts           # Utilitários
├── pages/                 # Páginas da aplicação
│   ├── clientes/
│   ├── cobranca/
│   ├── entregas/
│   ├── notificacoes/
│   ├── nps/
│   ├── portal/            # Portal do cliente
│   ├── produtos/
│   ├── trilhas/
│   ├── usuarios/
│   ├── chat/
│   ├── DashboardPage.tsx
│   └── LoginPage.tsx
├── types/
│   ├── auth.ts
│   └── database.ts
├── App.tsx
├── index.css
└── main.tsx

supabase/
└── functions/
    ├── cobranca-schedler/      # Agendador de cobranças
    ├── ia-bot-respond/         # Respostas da IA
    ├── uazapi-send-message/    # Envio de mensagens WhatsApp
    └── uazapi-webhook/         # Webhook de recebimento
```

---

## 🎯 Roadmap

### Fase 1 - MVP (Concluído) ✅
- [x] Autenticação
- [x] CRUD de Clientes
- [x] CRUD de Produtos
- [x] Fluxo de Entregas
- [x] Portal do Cliente básico

### Fase 2 - Comunicação (Em Andamento) 🔄
- [x] EmpireChat base
- [x] Cobrança automatizada
- [ ] Kanban de atendimento
- [ ] Respostas rápidas
- [ ] Templates de mensagem

### Fase 3 - Inteligência (Pendente) 📋
- [ ] IA Bot completo
- [ ] Análise de sentimento
- [ ] Sugestões automáticas
- [ ] Relatórios avançados

### Fase 4 - Escala (Pendente) 📋
- [ ] Notificações push
- [ ] Emails transacionais
- [ ] API pública
- [ ] White-label

---

## 📝 Registro de Alterações

### 10/03/2026 - Documentação Inicial
- Criada documentação de acompanhamento do projeto
- Mapeamento completo de funcionalidades implementadas
- Identificação de gaps e roadmap futuro

---

## 🐛 Issues Conhecidos

1. **Dashboard principal** - KPIs estão mockados, precisam integrar com dados reais
2. **Página de Chat** - Apenas placeholder, interface completa pendente
3. **Página de Configurações** - Apenas placeholder
4. **Página de Notificações** - Placeholder, funcionalidade básica no header apenas

---

## 💡 Próximos Passos Recomendados

1. **Completar EmpireChat**
   - Interface de conversa
   - Kanban de atendimento
   - Respostas rápidas

2. **Dashboard com dados reais**
   - Integrar KPIs com queries reais
   - Gráficos de evolução

3. **Módulo de Configurações**
   - Configurações gerais
   - Personalização de marca

4. **Melhorias no Portal**
   - Personalização por cliente
   - Mais visualizações

---

## 📞 Contato e Suporte

- **Repositório:** GitHub - EmpireDesk
- **Ambiente:** Desenvolvimento local (Vite)
- **Backend:** Supabase

---

*Este documento deve ser atualizado a cada nova funcionalidade implementada ou alteração significativa no projeto.*
