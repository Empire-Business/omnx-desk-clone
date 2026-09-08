# OMNX Desk — PRD
**Versão:** 3.0 · atualizado em 04/08/2026 às 19h00 BRT
**Arquivo:** `docs/prd.md`

> **Leia primeiro a seção 0.** Da seção 1 em diante, este documento é o PRD
> original de 2025 (então chamado *EmpireDesk*), mantido **na íntegra como
> registro histórico**. Boa parte dele ainda descreve o sistema; outra parte foi
> superada. A seção 0 diz o que vale hoje e o que não vale mais — consulte-a
> antes de tomar qualquer decisão com base no restante.

---

## 0. Estado atual do produto (04/08/2026)

### 0.1 O que o produto é hoje

O **OMNX Desk** é uma plataforma **multi-tenant e modular**: um banco atende
várias empresas, isoladas por `tenant_id` + RLS, e cada empresa liga/desliga os
apps que usa numa Loja de Apps interna (`/apps`).

Duas mudanças de rumo desde o PRD original, **decididas com o usuário** e
registradas em `docs/reestruturacao/ROADMAP-MODULARIZACAO.md`:

1. **Multi-tenant, não "um clone por cliente".** O plano inicial era distribuir
   um repositório por cliente, com banco próprio. Hoje é um sistema só, com
   provisionamento de empresas pela tela `/empresas`.
2. **Apps nascem ligados**, ao contrário do que o brief de reestruturação pedia.
   O sistema já está em produção — fazer o contrário tiraria acesso de quem usa.

### 0.2 Apps do produto

Todo requisito funcional pertence a um app. Não existe funcionalidade solta.

| App | `slug` | Estado | O que faz |
|---|---|---|---|
| **Atendimento** | `atendimento` | 🟢 Ativo — **tela inicial** | Demandas dos clientes + painel operacional. Adapta-se ao ramo da empresa (§0.3) |
| **OMNXChat** | `chat` | 🟢 Ativo | Conversas de WhatsApp, IA, campanhas, CSAT |
| **Contratos** | `contratos` | 🟢 Ativo | Gestão contratual, kanban, recebíveis, onboarding de vendas |
| Dashboard | `dashboard` | ⚪ Legado | Painel antigo (contratos, entregas, Instagram). Fora do menu, em `/dashboard-legado` |
| Cobrança | `cobranca` | ⚪ Arquivado | Régua de cobrança. Desligado; dados preservados |
| Portal do Cliente | `portal` | ⚪ Arquivado | Área externa do cliente final. Desligado; sem uso real verificado no banco |

**Núcleo** (não é app, está sempre disponível): Clientes, Colaboradores,
Departamentos, Produtos, Configurações, Admin, Auditoria, Reportes de erro.

### 0.3 O app Atendimento adapta-se ao ramo da empresa

Cada empresa tem um **segmento** (`tenants.atendimento_segmento`) que define o
vocabulário, as abas e as métricas. É o que permite o mesmo app servir uma
agência e uma clínica sem código duplicado.

| | Social Media | Clínica | Escritório |
|---|---|---|---|
| Unidade de trabalho | demanda | atendimento | demanda |
| Quem é atendido | cliente | paciente | cliente |
| Abas | Painel, Demandas, Kanban | Painel, Atendimentos | Painel, Demandas, Kanban |
| Métricas de aprovação | sim | não | não |

Catálogo dos ramos: `src/lib/atendimentoSegmentos.ts`. Acrescentar um ramo novo é
uma entrada nesse arquivo + um valor no CHECK da coluna — nenhuma tela muda.

### 0.4 O que do PRD original NÃO vale mais

| Seção | O que dizia | O que vale hoje |
|---|---|---|
| Título e nome | "EmpireDesk" | **OMNX Desk** (domínio `desk.omnx.pro`) |
| §3.2 Matriz de permissões | Matriz por perfil, fixa no código | `permissoes_app` (perfil × recurso × ação) — matriz vigente em `docs/reestruturacao/NIVEIS-DE-ACESSO.md` |
| §4.5 Kanban do Portal | Portal do cliente como entrega central | Portal **arquivado** — sem cliente final usando |
| §4.6 NPS · §4.7/4.8 Trilhas | Módulos internos completos | Telas internas **removidas** (Fase 6); tabelas mantidas pelo Portal e Relatórios |
| §4.9–4.10 | Notificações e Relatórios como módulos | Continuam, dentro do núcleo |
| §12 Roadmap (fases 1–31) | Roadmap original | **Concluído/superado.** O roadmap vivo é `docs/reestruturacao/ROADMAP-MODULARIZACAO.md` |
| "Somente leitura, nunca edite" | Regra do documento | Superada: o PRD é documento vivo. O histórico fica preservado abaixo |

O que **continua valendo** do original: a stack (§2), os módulos de Chat (§4.11),
Cobrança (§4.12) e IA Bot (§4.13) como especificação de comportamento, o design
system (§9) e as regras de segurança (§11).

### 0.5 Onde está o resto

| Assunto | Documento |
|---|---|
| Roadmap vivo (fases, o que falta) | `docs/reestruturacao/ROADMAP-MODULARIZACAO.md` |
| Permissões por perfil | `docs/reestruturacao/NIVEIS-DE-ACESSO.md` |
| Entidades e fluxos | `docs/UML.md` · `docs/UML.html` |
| Histórico de entregas | `docs/MUDANCAS.md` |
| Isolamento multi-tenant | `docs/multi-tenant-roadmap.md` |

---

## ⚠️ Instrução importante (histórica — ver §0)

Este é o **primeiro arquivo a ser criado** ao iniciar o projeto. Cole o conteúdo exato deste PRD em `docs/prd.md` antes de qualquer outra ação. Este arquivo é **somente leitura** — nunca edite após a criação.

> **Nota de 04/08/2026:** esta regra foi superada. O PRD passou a ser documento
> vivo — o estado atual está na §0, e o texto abaixo permanece como registro do
> que foi planejado em 2025.

---

## 1. Visão geral do produto

### 1.1 O que é o EmpireDesk?

O **EmpireDesk** é o sistema central de operação da **Empire Zap**, uma agência de marketing e consultoria. É um portal interno e externo que resolve quatro problemas críticos de qualquer agência em crescimento:

| Problema | Como o EmpireDesk resolve |
|---|---|
| Ninguém sabe o que foi ou não entregue | Cada entrega é rastreada com status em tempo real, prazo e responsável |
| O cliente não tem visibilidade nem voz | Portal dedicado onde o cliente aprova, rejeita, avalia e comenta |
| Aprovação de conteúdo é caótica | Fluxo estruturado com histórico de versões, rastreabilidade e notificações |
| O conhecimento não está centralizado | Módulo de trilhas e aulas para clientes e para a equipe interna |
| A comunicação com clientes é caótica e dispersa no WhatsApp pessoal | Módulo EmpireChat: central de atendimento WhatsApp multi-número com IA, métricas e atribuição |

### 1.2 Explicação em linguagem simples

Pense no EmpireDesk como uma central de comando da agência. De um lado, os funcionários (estrategistas, gerentes, atendimento) acessam um painel interno onde veem tudo que precisa ser feito, o que está atrasado, e o que os clientes já aprovaram. Do outro lado, cada cliente tem seu próprio portal onde consegue ver exatamente o que a agência está entregando, aprovar conteúdos antes de publicar, dar uma nota para cada entrega e acompanhar tudo num quadro visual tipo Kanban. Tudo fica registrado, sem WhatsApp, sem e-mail perdido, sem confusão.

---

## 2. Stack tecnológica (obrigatória, sem exceção)

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | **React 18+** | Componentes funcionais, hooks |
| Linguagem | **TypeScript** | Strict mode — `"strict": true` no `tsconfig.json`. Zero `any` |
| Build | **Vite** | Com `@vitejs/plugin-react` |
| Estilização | **Tailwind CSS** | Utility-first, mobile-first |
| Componentes UI | **shadcn/ui** | Design system padrão |
| Ícones | **Lucide React** | 1.000+ ícones SVG open-source |
| Backend/DB/Auth | **Supabase** | PostgreSQL + Auth + Storage + Edge Functions |
| Roteamento | **React Router v6** | Com rotas protegidas via `ProtectedRoute` |
| Fetch/Cache | **TanStack Query v5** | Dados assíncronos com cache |
| Estado global | **Zustand** | Apenas onde Context não for suficiente |
| Deploy | **Vercel / Lovable Cloud** | Via GitHub sync |

> ❌ **Proibido:** Next.js, Angular, Vue, Bootstrap, MUI, jQuery, Create React App, ou qualquer tecnologia fora desta lista.

---

## 3. Perfis de usuário e controle de acesso

O controle de acesso é o requisito mais crítico do sistema. **Implementar desde a Fase 1.** Cada query no banco deve filtrar pelo usuário logado. Um estrategista nunca pode ver dados de clientes que não são seus — nem por URL direta, nem por API.

### 3.1 Perfis disponíveis

| Perfil | Descrição |
|---|---|
| `admin` | Dono da agência ou diretor de operações. Acesso total ao sistema. |
| `gerente` | Coordenador/gerente de contas. Monitora a operação, não configura. |
| `estrategista` | Funcionário interno que executa os serviços. Vê apenas seus clientes. |
| `atendimento` | Responsável pelo relacionamento. Acompanha, não executa entregas. |
| `cliente` | Acessa o portal externo. Vê apenas seus próprios dados. |
| `agente_chat` | Usuário interno focado exclusivamente no atendimento WhatsApp (EmpireChat). Sem acesso ao restante do EmpireDesk. |
| `agente_cobranca` | Usuário interno focado exclusivamente no módulo de cobranças (EmpireCobrança). Sem acesso a nenhuma outra área. |
| `admin_cobranca` | Acesso total ao módulo EmpireCobrança. Sem acesso ao restante do EmpireDesk. |

### 3.2 Matriz de permissões

| Ação | Admin | Gerente | Estrategista | Atendimento | Cliente |
|---|---|---|---|---|---|
| Cadastrar produtos e entregáveis | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cadastrar clientes | ✅ | ❌ | ❌ | ❌ | ❌ |
| Criar/desativar usuários | ✅ | ❌ | ❌ | ❌ | ❌ |
| Atribuir estrategistas a clientes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver painel geral de todos os clientes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver clientes da própria carteira | ✅ | ✅ | ✅ (atribuídos) | ✅ (carteira) | ❌ |
| Subir conteúdo em entregas | ✅ | ❌ | ✅ | ❌ | ❌ |
| Aprovar/rejeitar entrega | ❌ | ❌ | ❌ | ❌ | ✅ |
| Avaliar com estrelas | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver NPS geral da agência | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver NPS dos próprios clientes | ✅ | ✅ | ❌ | ✅ | ❌ |
| Configurar pesquisas de NPS | ✅ | ❌ | ❌ | ❌ | ❌ |
| Criar/editar trilhas e aulas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Acessar trilhas internas da equipe | ✅ | ✅ | ✅ | ✅ | ❌ |
| Acessar trilhas de clientes | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver logs de auditoria | ✅ | ❌ | ❌ | ❌ | ❌ |
| Registrar interações com cliente | ✅ | ❌ | ❌ | ✅ | ❌ |
| Comentários internos em entregas | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## 4. Módulos do sistema

### 4.1 Módulo de Produtos e Entregáveis

**O que é:** Configuração do "cardápio" da agência. O admin define quais produtos a agência oferece e quais entregáveis compõem cada produto.

#### Produto
Um serviço comercializável. Exemplos: *Gestão de Tráfego Pago*, *Social Media Premium*, *Consultoria de Branding*.

Campos:
- `nome` — nome comercial do produto
- `descricao` — descrição interna
- `prazo_aprovacao_dias` — prazo automático de aprovação pelo cliente (configurável)
- `ativo` — boolean

#### Entregável
Uma tarefa recorrente ou pontual vinculada a um produto.

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Ex: "Post para Instagram — Feed" |
| `descricao` | text | O que deve conter |
| `periodicidade` | enum | Única / Semanal / Quinzenal / Mensal / Trimestral |
| `prazo_relativo` | string | Ex: "até o dia 5 de cada mês" |
| `requer_aprovacao` | boolean | Se sim, só fica "concluída" após aprovação do cliente |
| `tipos_conteudo_aceitos` | JSON | imagem, video, pdf, texto, link, audio, legenda |
| `visivel_cliente` | boolean | Se aparece no portal do cliente |
| `aparece_kanban` | boolean | Se aparece no Kanban do cliente |
| `data_publicacao` | date | Data alvo para publicação (usada no Calendário) |

#### Geração automática de entregas
Quando um cliente é vinculado a um produto, o sistema gera automaticamente as entregas previstas para os próximos 30, 60 ou 90 dias (configurável). O sistema continua gerando entregas futuras automaticamente conforme o tempo passa.

---

### 4.2 Módulo de Clientes

#### Cadastro do cliente

| Campo | Tipo |
|---|---|
| `nome_empresa` | string |
| `nome_contato_principal` | string |
| `email_acesso` | string (login do portal) |
| `data_inicio_contrato` | date |
| `produtos_contratados` | relação N:N com products |
| `estrategista_responsavel` | FK → users |
| `atendimento_responsavel` | FK → users |
| `status_contrato` | enum: Ativo / Pausado / Encerrado |
| `observacoes_internas` | text (não visível ao cliente) |
| `nps_frequencia_dias` | integer (30, 60 ou 90) |

#### Regras
- Um cliente pode ter **múltiplos usuários** acessando o portal (ex: dono + gerente de marketing).
- Um cliente pode contratar **múltiplos produtos**. O portal organiza entregáveis por produto. O Kanban pode ser filtrado por produto.

---

### 4.3 Módulo de Entregas e Conteúdo Rico

#### Tipos de conteúdo suportados

| Tipo | Formatos | Como aparece para o cliente |
|---|---|---|
| Imagem | JPG, PNG, GIF, WebP | Preview inline, ampliar e baixar |
| Vídeo (upload) | MP4, MOV, WebM | Player embutido |
| Vídeo (link) | YouTube, Vimeo, URL | iframe embed |
| Documento | PDF, DOCX, XLSX, PPTX | PDF inline; outros com ícone + download |
| Texto formatado | Rich text | Renderizado direto na tela |
| Link externo | qualquer URL | Card com preview Open Graph |
| Áudio | MP3, WAV | Player de áudio embutido |
| Arte/Creative | AI, PSD, Figma link | Link ou download + thumbnail |
| Legenda/Copy | texto puro | Bloco copiável com um clique |

Uma entrega pode ter **múltiplos itens de conteúdo**. O estrategista adiciona quantos blocos quiser.

#### Status de uma entrega

| Status | Emoji | Significado |
|---|---|---|
| Agendada | 🔵 | Entrega futura, fora do prazo ainda |
| Pendente | 🟡 | Prazo chegou, aguardando o estrategista |
| Em risco | 🟠 | Faltam X dias para o prazo, ainda não feita |
| Atrasada | 🔴 | Passou do prazo sem envio |
| Aguardando aprovação | 🕐 | Conteúdo subido, aguardando cliente |
| Em revisão | 🔁 | Cliente rejeitou, estrategista precisa corrigir |
| Aprovada | 🟢 | Cliente aprovou |
| Publicada | 📅 | Conteúdo foi ao ar |
| Concluída | 🟢 | Sem aprovação, marcada como feita |
| Concluída com atraso | ⚫ | Entregue fora do prazo |
| Cancelada | ⚪ | Admin ou gerente cancelou |

> **Nota técnica:** O status da entrega deve ser **calculado dinamicamente** — não salvo como campo fixo. O status "Aguardando aprovação" é inferido quando existe uma `delivery_version` sem `delivery_approval` associado. Isso evita inconsistências.

#### Histórico de versões
Cada envio de conteúdo gera uma nova versão numerada (v1, v2, v3...). O cliente pode ver o histórico e comparar versões. A versão mais recente é sempre a destacada.

#### Comentários internos
Admin, gerente, atendimento e estrategista podem comentar em qualquer entrega. Esses comentários **nunca** são visíveis ao cliente. Toda ação fica registrada com timestamp.

---

### 4.4 Módulo de Aprovação e Feedback

#### Fluxo de aprovação

```
Estrategista finaliza entrega
        ↓
Status → "Aguardando aprovação"
        ↓
Cliente recebe notificação (e-mail + portal)
        ↓
    ┌───┴───┐
  Aprova   Rejeita (comentário obrigatório)
    ↓           ↓
"Aprovada"  "Em revisão"
            Estrategista notificado com motivo
                ↓
            Estrategista corrige e reenvia → novo ciclo
```

#### Aprovação automática
O admin pode configurar um prazo (ex: "se o cliente não responder em 3 dias úteis, aprovação automática"). Configurável por produto.

#### Avaliação com estrelas (1 a 5)
Após aprovar, o cliente pode (não é obrigado) dar uma nota. A nota fica visível para toda a equipe interna. O sistema calcula automaticamente:
- Média por estrategista
- Média por tipo de entregável
- Média por cliente

#### Feedback escrito
Campo livre disponível tanto ao aprovar quanto ao rejeitar. Visível para toda a equipe interna. O cliente pode ver seus próprios feedbacks no histórico.

#### Regras importantes
- Apenas o cliente pode aprovar. Nenhum membro da equipe interna pode aprovar em nome do cliente.
- Se uma entrega não requer aprovação, o estrategista marca como concluída diretamente.

---

### 4.5 Módulo de Kanban e Calendário (Portal do Cliente)

#### Kanban — colunas padrão

| Coluna | Quem move | Significado |
|---|---|---|
| 🔵 Em produção | Sistema | Estrategista ainda trabalhando |
| 🕐 Aguardando sua revisão | Sistema (quando estrategista envia) | Pronto para revisão do cliente |
| 🔁 Em revisão / Ajuste solicitado | Sistema (quando cliente rejeita) | Aguardando correção |
| 🟢 Aprovado — pronto para publicar | Cliente (ao aprovar) | Conteúdo aprovado |
| 📅 Publicado | Cliente ou Estrategista | Histórico de publicados |

#### Interações do cliente no Kanban
- Arrastar de "Aguardando revisão" → "Aprovado": aprova a entrega (sistema pede confirmação + nota + comentário).
- Arrastar de "Aguardando revisão" → "Em revisão": rejeita (campo obrigatório para motivo).
- Arrastar de "Aprovado" → "Publicado": marca como publicado.
- Não pode arrastar para colunas anteriores (não pode "desaprovar").

#### Card do Kanban — o que mostra
- Thumbnail do conteúdo (imagem de capa ou ícone do tipo)
- Nome do entregável
- Data de publicação prevista
- Número de itens de conteúdo (ex: "1 imagem + 1 legenda")
- Número de versão
- Indicador de urgência se data de publicação estiver próxima

#### Filtros do Kanban
- Por produto (se cliente tiver mais de um)
- Por tipo de conteúdo
- Por período

> **Nota técnica:** Usar `dnd-kit` para drag-and-drop. O drag é apenas uma forma visual de executar ações já existentes (aprovar, rejeitar, publicar). Não criar estado de Kanban separado no banco — usar `kanban_overrides` apenas para overrides manuais.

#### Calendário
- Vista mensal e semanal
- Conteúdos distribuídos por `data_publicacao`
- Cores: verde (aprovado), amarelo (aguardando revisão), laranja (em revisão), cinza (publicado)
- Clique no card abre o mesmo modal de detalhes do Kanban
- **Não permite arrastar** — apenas leitura com clique

#### Visão da equipe interna
Estrategista e gerente têm visão de Kanban/Calendário consolidada com filtros por cliente — permite ver tudo que está aguardando aprovação, rejeitado ou com publicação próxima.

---

### 4.6 Módulo de NPS

#### Quando o NPS aparece para o cliente
- **NPS periódico:** a cada X dias (configurável por cliente: 30, 60 ou 90).
- **NPS pós-entrega:** após conclusão de um entregável específico (configurável).
- **NPS manual:** admin dispara para um cliente ou para toda a base.

> **Regra:** Não exibir NPS no primeiro login, nem logo após evento negativo (rejeição, entrega atrasada). Configurar delay mínimo. Registrar quando o cliente fechou sem responder, para não exibir novamente no mesmo dia.

#### Estrutura da pesquisa

**Passo 1 — Nota (0 a 10):**
> "De 0 a 10, o quanto você indicaria a [nome da agência] para um amigo ou parceiro de negócios?"

**Passo 2 — Feedback qualitativo:**
- Nota 9–10 (Promotor): "Que ótimo! O que mais te agradou no nosso trabalho?"
- Nota 7–8 (Neutro): "Obrigado! O que poderíamos melhorar para chegar ao 10?"
- Nota 0–6 (Detrator): "Sentimos muito. O que aconteceu? Como podemos melhorar?"

O passo 2 pode ser pulado pelo cliente.

#### Classificação

| Nota | Classificação | Cor |
|---|---|---|
| 9 ou 10 | Promotor | 🟢 Verde |
| 7 ou 8 | Neutro | 🟡 Amarelo |
| 0 a 6 | Detrator | 🔴 Vermelho |

**Cálculo:** `NPS = % Promotores − % Detratores` (varia de -100 a +100)

#### Onde o NPS aparece internamente
- Dashboard do admin e gerente: NPS atual + histórico mês a mês.
- Detalhe de cada cliente: histórico completo de respostas.
- Alerta automático quando cliente responde com nota 0–6: notificação para admin, gerente e atendimento responsável.
- Relatório de NPS exportável.

---

### 4.7 Módulo de Aulas e Trilhas — Clientes

#### Estrutura

```
Trilha
└── Módulo
    └── Aula (vídeo / texto / PDF / link / combinação)
```

- Trilhas são vinculadas a produtos. Ao contratar o produto, o cliente tem acesso automático às trilhas vinculadas.
- Admin pode liberar trilhas avulsas para clientes específicos independentemente do produto.

#### Tipos de aula suportados
- Vídeo (YouTube, Vimeo ou upload direto)
- Texto/artigo com editor rico
- PDF para download
- Link externo
- Combinação de tipos

#### Progresso e rastreamento
- Quais aulas foram assistidas
- % de conclusão por módulo e por trilha
- Data da última aula assistida
- Gerente e atendimento podem ver o progresso de cada cliente

#### Ordem
- Trilha **livre**: assiste na ordem que quiser
- Trilha **sequencial**: precisa concluir a aula anterior para desbloquear a próxima (configurável pelo admin)

---

### 4.8 Módulo de Aulas e Trilhas — Equipe Interna

Separado do portal do cliente. Acessível apenas por admin, gerente, estrategista e atendimento.

Estrutura idêntica ao módulo de clientes. Exemplos de trilhas internas:
- "Onboarding de novos estrategistas"
- "Como usar o EmpireDesk"
- "Processo de criação e envio de conteúdo"
- "Treinamento de ferramentas de tráfego pago"

#### Atribuição
Admin pode atribuir trilhas a um perfil inteiro (ex: todos os Estrategistas) ou a um usuário específico, com prazo de conclusão.

#### Acompanhamento pelo gerente
Painel com: quem tem trilhas atribuídas, % de conclusão, quem não começou, quem está com prazo vencido.

---

### 4.9 Módulo de Notificações e Alertas

#### Para o Estrategista

| Gatilho | Mensagem |
|---|---|
| Entrega entra em "Pendente" | "Nova entrega pendente: [nome] para [cliente]." |
| Entrega entra em "Em risco" | "Atenção: [entrega] para [cliente] vence em [N] dias." |
| Entrega entra em "Atrasada" | "A entrega [X] para [cliente] está atrasada." |
| Cliente rejeita entrega | "⚠️ [Cliente] rejeitou [entrega]. Motivo: [comentário]." |
| Cliente aprova entrega | "✅ [Cliente] aprovou [entrega]." |
| Cliente avalia com 1 ou 2 estrelas | "Atenção: [cliente] deu [N] estrelas para [entrega]." |

#### Para o Atendimento

| Gatilho | Mensagem |
|---|---|
| Entrega do cliente é rejeitada | "[Cliente] rejeitou [entrega]. Estrategista notificado." |
| Entrega do cliente está atrasada | "Entrega atrasada para [cliente]: [nome da entrega]." |
| Cliente responde NPS com nota 0–6 | "🚨 NPS Detrator: [cliente] deu nota [N]. Feedback: [texto]." |
| Avaliação baixa (1 ou 2 estrelas) | "Avaliação baixa de [cliente] em [entrega]." |

#### Para o Gerente/Admin

| Gatilho | Mensagem |
|---|---|
| Qualquer entrega atrasada | Alerta com cliente, entregável e estrategista. |
| NPS Detrator | "🚨 [Cliente] respondeu NPS com nota [N]." |
| Estrategista com X+ entregas atrasadas | Alerta de sobrecarga da equipe. |
| Cliente com % de conclusão abaixo do threshold | Alerta de risco de churn. |
| Cliente sem acessar o portal há X dias | Alerta de desengajamento. |

#### Para o Cliente

| Gatilho | Mensagem |
|---|---|
| Novo conteúdo para revisão | "Sua agência enviou [N] novos conteúdos para aprovação." |
| Data de publicação próxima | "Lembrete: [conteúdo] será publicado amanhã." |
| Nova aula adicionada às trilhas | "Novo conteúdo disponível na trilha [X]." |
| NPS periódico | "Como está sendo sua experiência? Responda em 30 segundos." |

#### Canais
- E-mail (para todos os eventos)
- Notificação interna no portal (sino no topo da tela)
- Resumo diário por e-mail (opcional, configurável pelo usuário)

> **Nota técnica:** Usar fila para envio de e-mails — nunca travar a operação aguardando resposta do servidor de e-mail. Agrupar notificações do mesmo tipo em sequência rápida (5 aprovações em 2 minutos = 1 e-mail, não 5).

---

### 4.10 Módulo de Relatórios

| Relatório | Conteúdo | Exportação |
|---|---|---|
| Entregas por Cliente | Todas as entregas no período, status, responsável, data de conclusão | PDF + CSV |
| Performance por Estrategista | Entregas no prazo, com atraso, rejeições, média de estrelas, taxa de aprovação v1 | CSV |
| Saúde da Carteira | % entregas concluídas, conteúdos aguardando aprovação, NPS, estrelas, semáforo por cliente | PDF + CSV |
| NPS | NPS geral, histórico mês a mês, distribuição promotores/neutros/detratores, comentários, clientes sem resposta | CSV |
| Avaliações por Entregável | Média de estrelas por tipo de entregável em todos os clientes | CSV |
| Engajamento com Trilhas | Clientes acessando trilhas, completaram, nunca acessaram; equipe: trilhas internas | CSV |

---

---

## 4.11 Módulo EmpireChat — WhatsApp Multi-Número com IA

> Este módulo transforma o EmpireDesk numa central de atendimento completa, inspirada no BotConversa. Toda a comunicação WhatsApp da agência passa por aqui — centralizada, rastreada, medida e assistida por IA.

---

### 4.11.1 Visão geral e arquitetura do módulo

```
[WhatsApp]
    ↕ (mensagens, mídias, eventos)
[UAZAPI — instâncias multi-número]
    ↕ (webhooks de entrada / API REST de saída)
[Supabase Edge Functions — gateway central]
    ↕
[EmpireDesk — banco, regras, IA, UI]
    ↕ (OpenRouter API)
[Modelos de IA — análise, resumo, sugestões, alertas]
```

> ⚠️ **Para o programador — UAZAPI:** Antes de implementar qualquer integração, usar o plugin Playwright para navegar e ler a documentação oficial completa da UAZAPI. Mapear todos os endpoints de envio, recebimento, grupos, mídias e webhooks antes de escrever uma linha de código.

> ⚠️ **Para o programador — OpenRouter:** Antes de implementar, usar o plugin Playwright para navegar e ler a documentação oficial em https://openrouter.ai/docs. Mapear endpoints de chat completion, listagem de modelos, headers de autenticação e estrutura de request/response.

---

### 4.11.2 Gestão de números (Instâncias UAZAPI)

O admin pode conectar **quantos números quiser**. Cada número é uma instância UAZAPI independente.

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Ex: "SAC Principal", "Vendas" |
| `numero_whatsapp` | string | Número formatado |
| `instance_id` | string | ID da instância na UAZAPI |
| `instance_token` | string | Token — Supabase Secret, NUNCA no banco público |
| `webhook_url` | string | URL da Edge Function que recebe eventos |
| `status` | enum | `conectado` / `desconectado` / `aguardando_qr` / `banido` |
| `qr_code` | text | QR code base64 para parear (polling a cada 30s) |
| `departamento_padrao_id` | FK | Departamento padrão para novas conversas |
| `auto_reply_fora_horario` | boolean | Enviar resposta automática fora do horário |
| `mensagem_fora_horario` | text | Texto da resposta automática |
| `ativo` | boolean | |

#### Fluxo de conexão de um novo número
1. Admin clica em "Adicionar número"
2. Sistema chama UAZAPI para criar nova instância (via Edge Function) — recebe `instance_id` e `instance_token`
3. Token armazenado como Supabase Secret (nunca no banco ou no cliente)
4. Sistema exibe QR Code via polling a cada 30s para o admin escanear
5. UAZAPI confirma conexão → status atualizado para `conectado`
6. Sistema registra o webhook da instância apontando para a Edge Function `uazapi-webhook`

---

### 4.11.3 Departamentos e filas

| Campo | Descrição |
|---|---|
| `nome` | Ex: "Suporte Técnico" |
| `instancia_id` | FK → whatsapp_instances |
| `agentes` | Relação N:N com users |
| `distribuicao` | enum: `manual` / `round_robin` / `menor_carga` |
| `sla_primeira_resposta_minutos` | SLA de primeira resposta |
| `sla_resolucao_horas` | SLA de resolução |
| `mensagem_boas_vindas` | Enviada automaticamente ao entrar no dept. |
| `ativo` | boolean |

---

### 4.11.4 Contatos WhatsApp

| Campo | Descrição |
|---|---|
| `numero` | Número WhatsApp |
| `nome` | Capturado do WhatsApp ou cadastrado manualmente |
| `foto_perfil_url` | URL da foto de perfil |
| `client_id` | FK opcional → clients (vincula ao cliente EmpireDesk) |
| `tags` | Array de tags |
| `notas` | Anotações internas |
| `bloqueado` | boolean |
| `opt_out` | boolean — pediu para não ser contactado |
| `ultima_mensagem_em` | timestamptz |

---

### 4.11.5 Conversas

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | |
| `instancia_id` | FK | Qual número |
| `contato_id` | FK | Com quem |
| `departamento_id` | FK | Departamento atual |
| `agente_id` | FK | Agente responsável (null = sem atribuição) |
| `status` | enum | `aberta` / `em_atendimento` / `aguardando_cliente` / `resolvida` / `arquivada` |
| `canal` | enum | `privado` / `grupo` |
| `grupo_id` | string | ID do grupo WhatsApp (se canal = grupo) |
| `protocolo` | string | Ex: #2025-00142 (gerado automaticamente) |
| `tags` | array | |
| `primeira_mensagem_em` | timestamptz | |
| `primeira_resposta_agente_em` | timestamptz | Para cálculo de TMR |
| `resolvida_em` | timestamptz | |
| `motivo_encerramento` | text | |
| `nota_satisfacao` | integer | CSAT 1-5 respondido pelo cliente |
| `feedback_satisfacao` | text | |
| `sla_primeira_resposta_violado` | boolean | |
| `sla_resolucao_violado` | boolean | |
| `ia_resumo` | text | Resumo gerado por IA |
| `ia_sentimento` | enum | `positivo` / `neutro` / `negativo` |
| `ia_score_satisfacao` | float | Score 0-1 atualizado em tempo real |
| `ia_categoria` | text | Categoria classificada pela IA |

#### Status de uma conversa

| Status | Emoji | Significado |
|---|---|---|
| Aberta | 🔵 | Nova, sem atribuição |
| Em atendimento | 🟡 | Atribuída a agente, aguardando resposta |
| Aguardando cliente | 🕐 | Agente respondeu, aguardando retorno |
| Resolvida | 🟢 | Encerrada com sucesso |
| Arquivada | ⚫ | Encerrada sem resolução |

---

### 4.11.6 Mensagens

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | |
| `conversa_id` | FK | |
| `message_id_wpp` | string | ID da mensagem no WhatsApp (retornado pela UAZAPI) |
| `direcao` | enum | `entrada` / `saida` |
| `remetente_id` | string | user_id (saída) ou whatsapp_contacts.id (entrada) |
| `tipo` | enum | `texto` / `imagem` / `video` / `audio` / `documento` / `sticker` / `localizacao` / `contato` / `template` |
| `conteudo` | text | Texto ou caption |
| `midia_url` | text | URL no Supabase Storage |
| `midia_mime_type` | text | |
| `reply_to_message_id` | FK | Mensagem citada |
| `status` | enum | `enviando` / `enviado` / `entregue` / `lido` / `falhou` |
| `enviada_em` | timestamptz | |
| `entregue_em` | timestamptz | |
| `lida_em` | timestamptz | |
| `deletada_em` | timestamptz | |
| `editada_em` | timestamptz | |
| `conteudo_editado` | text | Conteúdo original antes da edição |
| `enviado_por_ia` | boolean | Se foi sugerida/aceita da IA |
| `nota_interna` | boolean | Nota interna — não enviada ao cliente |

---

### 4.11.7 Inbox — Interface principal de atendimento

```
┌──────────────┬──────────────────────────────┬──────────────────┐
│  LISTA DE    │      CONVERSA ATIVA          │   PAINEL         │
│  CONVERSAS   │                              │   LATERAL        │
│              │  [mensagens em ordem]        │                  │
│  Filtros:    │  [notas internas em destaque]│  Dados do        │
│  • Número    │                              │  contato         │
│  • Status    │  [área de digitação]         │                  │
│  • Agente    │  [anexar][IA][nota][enviar]  │  Histórico       │
│  • Dept.     │                              │  conversas       │
│  • Tag       │                              │                  │
│  • Sentimento│                              │  Entregas        │
│  • SLA       │                              │  EmpireDesk      │
│              │                              │                  │
│  Busca       │                              │  Notas internas  │
│  global      │                              │  do contato      │
└──────────────┴──────────────────────────────┴──────────────────┘
```

#### Card na lista de conversas mostra:
- Foto de perfil, nome e número
- Preview da última mensagem (50 chars)
- Tempo desde a última mensagem
- Indicador de status (cor)
- Ícone da instância/número
- Departamento e agente atribuído
- Badge de SLA em risco (vermelho se violado, amarelo se próximo)
- Ícone de sentimento IA (verde/amarelo/vermelho)
- Contador de mensagens não lidas

#### Filtros da inbox:
- Por instância/número
- Por status da conversa
- Por agente (todas / minhas / sem atribuição)
- Por departamento
- Por tag
- Por período
- Por sentimento IA
- Busca full-text em mensagens e nomes de contato

---

### 4.11.8 Funcionalidades dentro de uma conversa

**Envio:** texto com formatação WhatsApp, imagens, vídeos, documentos, áudio, gravação no navegador, localização, emojis, citar/responder mensagem, status de entrega em tempo real.

**Notas internas:** campo separado, fundo diferenciado, nunca enviado ao cliente.

**Respostas rápidas:** biblioteca de textos prontos, ativadas com `/` no campo de digitação. Suportam variáveis automáticas ({{nome}}, {{protocolo}}).

**Transferência:** para outro agente ou departamento. Novo responsável notificado. Histórico completo.

**Encerramento:** pede motivo configurável, dispara CSAT (delay configurável), gera resumo por IA.

**Histórico:** todas as conversas anteriores do contato visíveis no painel lateral.

**Vinculação EmpireDesk:** agente vincula o contato WhatsApp a um cliente do EmpireDesk. Painel lateral passa a mostrar entregas, NPS e status desse cliente.

---

### 4.11.9 Suporte a Grupos WhatsApp

- Grupos detectados automaticamente via webhook
- Aparecem na inbox com indicador visual próprio
- Agente responde no grupo diretamente pelo sistema
- Histórico completo registrado
- Silenciar grupos individualmente
- Grupos atribuídos a departamento específico

---

### 4.11.10 Iniciar conversa do zero (Outbound)

1. Agente clica em "Nova conversa"
2. Busca número ou contato existente
3. Seleciona qual instância (número) usar para enviar
4. Escreve a primeira mensagem
5. Sistema envia via UAZAPI REST API (via Edge Function)
6. Conversa aparece na inbox normalmente

---

### 4.11.11 Templates e mensagens estruturadas

| Campo | Descrição |
|---|---|
| `nome` | Nome interno |
| `conteudo` | Texto com variáveis: {{nome}}, {{protocolo}}, {{empresa}} |
| `variaveis` | Lista de variáveis suportadas |
| `categoria` | Saudação / Encerramento / CSAT / Informativo |

---

### 4.11.12 Campanhas / Disparos em massa

> ⚠️ Documentar claramente para o usuário os riscos de banimento. Exibir aviso explícito na tela de criação de campanha.

#### Campos da campanha

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome da campanha |
| `instancia_id` | FK | Número que vai disparar |
| `lista_contatos` | — | Seleção por tag, departamento ou upload CSV |
| `mensagem_base` | text | Texto-base com variáveis. Ex: "Olá {{nome}}, temos uma novidade para você!" |
| `usar_ia_variacao` | boolean | Se `true`, a IA gera uma versão única da mensagem para cada destinatário |
| `modelo_ia_variacao` | string | Modelo OpenRouter selecionado pelo admin para esta funcionalidade |
| `instrucao_ia` | text | Prompt de instrução para a IA. Ex: "Reescreva a mensagem abaixo de forma diferente, mantendo o mesmo significado, tom amigável e incluindo o nome {{nome}}" |
| `agendamento` | timestamptz | Data e hora de início |
| `intervalo_min_segundos` | integer | Intervalo mínimo entre envios (padrão: 8s) |
| `intervalo_max_segundos` | integer | Intervalo máximo entre envios (padrão: 25s) |
| `limite_por_hora` | integer | Máximo de mensagens por hora — **teto fixo: 60** |
| `status` | enum | `rascunho` / `agendada` / `em_andamento` / `pausada` / `concluida` |

#### Regras de envio com intervalo aleatório

O sistema simula comportamento humano:

1. Antes de enviar cada mensagem, a Edge Function `chat-broadcast-scheduler` sorteia um intervalo aleatório entre `intervalo_min_segundos` e `intervalo_max_segundos`
2. O limite de 60 mensagens/hora é **um teto fixo não configurável acima disso** — independe do intervalo sorteado. O scheduler verifica o contador de envios da última hora antes de cada disparo e pausa se o limite foi atingido
3. Se o limite horário for atingido, o scheduler aguarda até o início do próximo ciclo de 60 minutos e retoma automaticamente
4. O scheduler registra o timestamp exato de cada envio para cálculo correto da janela de 1 hora

#### Variação de mensagem por IA (anti-repetição)

Quando `usar_ia_variacao = true`:

1. Para cada destinatário, antes de enviar, a Edge Function chama o OpenRouter com `instrucao_ia` + `mensagem_base` + variáveis preenchidas do contato
2. O modelo gera uma versão única da mensagem — mesmo significado, palavras diferentes
3. A mensagem gerada é salva em `chat_campaign_contacts.mensagem_enviada` (para auditoria)
4. Se a chamada de IA falhar, usa a `mensagem_base` com variáveis substituídas como fallback
5. O modelo usado é selecionado pelo admin no painel — qualquer modelo disponível no OpenRouter

> **Para o programador:** A geração de variações deve ocorrer sob demanda (uma por vez, antes do envio de cada mensagem), não em lote antecipado. Isso garante que não haja acúmulo de tokens desnecessário e que o intervalo aleatório seja respeitado naturalmente entre a geração e o envio.

#### Relatório da campanha

Total enviados, entregues, lidos, erros, respostas recebidas, custo estimado de tokens IA (se variação ativa).

---

### 4.11.13 Horário de atendimento

Configurável por departamento ou instância: dias da semana, horários, fuso horário, mensagem automática fora do horário.

---

### 4.11.14 Automações — regras configuráveis via formulário

| Gatilho | Ação disponível |
|---|---|
| Nova mensagem com palavra-chave X | Enviar resposta automática Y |
| Conversa sem resposta do agente por X min | Alertar agente + gerente |
| Conversa aberta há mais de X horas | Escalar para gerente |
| Mensagem fora do horário | Enviar mensagem fora do horário |
| Primeira mensagem de novo contato | Enviar boas-vindas |
| Conversa encerrada | Disparar CSAT após N minutos |
| Nota de satisfação ≤ 2 | Alertar gerente imediatamente |
| Score IA abaixo do threshold | Disparar alerta de insatisfação |

---

### 4.11.15 IA integrada via OpenRouter

> ⚠️ **Para o programador:** Ler documentação oficial em https://openrouter.ai/docs via Playwright antes de implementar. A chave OpenRouter fica EXCLUSIVAMENTE como Supabase Secret, nunca no cliente.

#### Configuração no painel admin — seleção de modelo por funcionalidade

O admin configura **um modelo independente para cada funcionalidade de IA**. O sistema lista todos os modelos disponíveis consultando o endpoint de modelos do OpenRouter em tempo real (Edge Function `openrouter-list-models`). A lista é atualizada a cada acesso à tela de configuração.

O admin seleciona o modelo desejado em cada campo abaixo, a partir de um dropdown com todos os modelos do OpenRouter:

| Funcionalidade | Campo de configuração | Padrão sugerido |
|---|---|---|
| Análise de sentimento | `modelo_sentimento` | `openai/gpt-4o-mini` |
| Sugestão de resposta ao agente | `modelo_sugestao` | `openai/gpt-4o` |
| Resumo automático de conversa | `modelo_resumo` | `openai/gpt-4o-mini` |
| Classificação de assunto | `modelo_classificacao` | `openai/gpt-4o-mini` |
| Variação de mensagem em campanhas | `modelo_campanha_variacao` | `openai/gpt-4o-mini` |
| Variação de mensagem em cobranças | `modelo_cobranca_variacao` | `openai/gpt-4o-mini` |

Para cada modelo, o admin também configura:
- **Temperatura** (0.0 a 1.0) — controla criatividade da resposta
- **Máximo de tokens** — limite de custo por chamada

Todos os campos ficam salvos na tabela `chat_ia_config`. Qualquer alteração pelo admin tem efeito imediato — sem redeploy.

> A lista de modelos do OpenRouter inclui centenas de opções (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama 3, Mistral, Qwen, DeepSeek, e muitos outros). O admin escolhe livremente qual usar em cada funcionalidade.

#### Funcionalidades (todas via Edge Function)

**1. Análise de sentimento em tempo real**
A cada mensagem recebida, Edge Function `ia-analyze-message` analisa e atualiza `conversations.ia_score_satisfacao`. Indicador visual na inbox atualizado via Supabase Realtime.

**2. Sugestão de resposta**
Botão "💡 Sugerir" no campo de digitação. Edge Function `ia-suggest-reply` envia o contexto da conversa e retorna 2-3 sugestões. Agente aceita, edita ou ignora. Mensagens aceitas marcadas com `enviado_por_ia = true`.

**3. Resumo automático de conversa**
Edge Function `ia-summarize-conversation` ao encerrar. Salvo em `conversations.ia_resumo`. Visível no histórico e relatórios.

**4. Alertas automáticos de insatisfação**
- Se `ia_score_satisfacao` cair abaixo do threshold configurado (padrão 0.3): notificação imediata para gerente e atendimento + indicador visual de alerta na conversa
- Se cliente usar palavras críticas ("cancelar", "absurdo", "nunca mais", "processo", etc.): alerta de urgência independente do score

**5. Classificação de conversa**
Após encerramento: classifica o assunto em categorias pré-definidas pelo admin. Salvo em `conversations.ia_categoria`.

**6. Score de qualidade de atendimento por agente**
Análise periódica de conversas encerradas. Avalia: tempo de resposta, linguagem, resolução do problema. Disponível nos relatórios de performance.

---

### 4.11.16 Métricas e dashboard de atendimento

#### Dashboard em tempo real (Supabase Realtime)

| Métrica | Descrição |
|---|---|
| Conversas abertas agora | Total por instância e departamento |
| Conversas sem atribuição | Aguardando agente |
| Conversas com SLA em risco | Próximas do prazo de primeira resposta |
| Conversas com SLA violado | Já passaram do prazo |
| Agentes online / ausentes | Com status de disponibilidade |
| TMA — Tempo Médio de Atendimento | Início ao encerramento |
| TMR — Tempo Médio de Resposta | Mensagem do cliente à resposta do agente |
| Score satisfação IA médio | Score médio das conversas ativas |
| CSAT do dia / semana / mês | Média das notas recebidas |
| Alertas de IA disparados hoje | Quantidade e gravidade |

#### Relatórios históricos exportáveis

| Relatório | Conteúdo |
|---|---|
| Volume de conversas | Por período, instância, departamento, agente |
| Tempo de primeira resposta | Média, mediana, por agente |
| Tempo de resolução | Média e distribuição |
| Violações de SLA | Quantas, por departamento/agente |
| CSAT histórico | Notas ao longo do tempo por agente |
| Score IA de satisfação | Evolução do sentimento por período |
| Performance por agente | TMA, TMR, CSAT, score qualidade IA |
| Horários de pico | Volume por hora do dia / dia da semana |
| Campanhas | Resultados de cada disparo |

---

### 4.11.17 Pesquisa de CSAT pós-atendimento

Ao encerrar, o sistema dispara automaticamente (delay configurável) para o contato via WhatsApp:

> "Como você avalia o atendimento que recebeu hoje? Responda com um número de 1 a 5:
> 1 — Muito ruim | 2 — Ruim | 3 — Regular | 4 — Bom | 5 — Excelente"

O contato responde pelo próprio WhatsApp. O sistema interpreta a resposta (número ou palavras-chave) e registra automaticamente. Campo de feedback qualitativo opcional na sequência.

---

### 4.11.18 API REST pública e Webhooks

#### API REST (Supabase Edge Functions)

Autenticação: Bearer token (API Key gerada no painel, armazenada com hash no banco).

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/chat/send-message` | POST | Envia mensagem via instância |
| `/api/chat/conversations` | GET | Lista conversas com filtros |
| `/api/chat/conversations/:id` | GET | Detalhe com mensagens |
| `/api/chat/conversations/:id/assign` | PATCH | Atribuir a agente |
| `/api/chat/conversations/:id/transfer` | PATCH | Transferir dept/agente |
| `/api/chat/conversations/:id/close` | PATCH | Encerrar conversa |
| `/api/chat/contacts` | GET/POST | Listar ou criar contatos |
| `/api/chat/contacts/:id` | GET/PATCH | Detalhe ou editar |
| `/api/chat/instances` | GET | Listar instâncias ativas |
| `/api/chat/broadcast` | POST | Criar e disparar campanha |

API Keys têm permissões granulares configuráveis e podem ser revogadas individualmente.

#### Webhooks de saída (outbound)

O admin cadastra URLs externas para receber eventos. Cada webhook: URL de destino, eventos selecionados, secret para verificação HMAC-SHA256, log dos últimos 100 disparos com status HTTP.

| Evento | Quando dispara |
|---|---|
| `message.received` | Nova mensagem recebida |
| `message.sent` | Mensagem enviada com sucesso |
| `message.delivered` | Mensagem entregue |
| `message.read` | Mensagem lida |
| `conversation.opened` | Nova conversa iniciada |
| `conversation.assigned` | Atribuída a agente |
| `conversation.transferred` | Transferida |
| `conversation.closed` | Encerrada |
| `csat.received` | Cliente respondeu CSAT |
| `sla.violated` | SLA violado |
| `ia.alert` | IA detectou insatisfação ou urgência |
| `instance.disconnected` | Número desconectado |

#### Webhook de entrada (UAZAPI → EmpireDesk)

```
POST /functions/v1/uazapi-webhook
Headers: X-Instance-Token: [verificado via Supabase Secrets]

Eventos processados:
- message (entrada/saída)
- message_ack (status de entrega/leitura)
- message_reaction
- message_delete
- message_edit
- group_join / group_leave
- connection_update (status da instância)
- qrcode_updated (novo QR code)
```

---

### 4.11.19 Controle de acesso — EmpireChat

Novo sub-perfil: **`agente_chat`** — focado exclusivamente no atendimento WhatsApp, sem acesso ao restante do EmpireDesk.

| Ação | Admin | Gerente | Agente Chat | Estrategista | Atendimento |
|---|---|---|---|---|---|
| Adicionar/remover instâncias UAZAPI | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver todas as conversas (todos os números) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver conversas do próprio departamento | ✅ | ✅ | ✅ | ✅ | ✅ |
| Atribuir conversa a outro agente | ✅ | ✅ | ❌ | ❌ | ✅ |
| Transferir conversa de departamento | ✅ | ✅ | ❌ | ❌ | ✅ |
| Iniciar conversa (outbound) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar/editar respostas rápidas e templates | ✅ | ✅ | ❌ | ❌ | ❌ |
| Criar campanhas e disparos em massa | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver dashboard de métricas em tempo real | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver relatórios de atendimento | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configurar automações e regras de bot | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar IA (modelo, temperatura, threshold) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Usar sugestões de IA na conversa | ✅ | ✅ | ✅ | ✅ | ✅ |
| Configurar webhooks externos | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gerar/revogar API keys | ✅ | ❌ | ❌ | ❌ | ❌ |

---

### 4.11.20 Telas do módulo EmpireChat

- **Inbox** — lista de conversas + conversa ativa + painel lateral do contato
- **Dashboard de atendimento** — métricas em tempo real via Supabase Realtime
- **Contatos** — lista completa com filtros, tags, busca e vínculo EmpireDesk
- **Detalhe do contato** — histórico de conversas, dados, tags, notas
- **Grupos** — lista de grupos WhatsApp monitorados
- **Campanhas** — criar, agendar e acompanhar disparos em massa
- **Relatórios de atendimento** — histórico completo com exportação PDF/CSV
- **Configurações do EmpireChat:**
  - Instâncias (números) — conectar via QR Code, status em tempo real, gerenciar
  - Departamentos — criar, SLA, distribuição de conversas
  - Horários de atendimento por departamento/instância
  - Respostas rápidas e templates com variáveis
  - Automações e regras de bot (via formulário)
  - Configurações de IA — modelo por funcionalidade, temperatura, thresholds
  - API keys — gerar, revogar, permissões granulares
  - Webhooks externos — URL, eventos, log de disparos
  - CSAT — ativar/desativar, mensagem, delay

---

### 4.11.21 Realtime no EmpireChat

Usar **Supabase Realtime** para:
- Novas mensagens aparecem na tela sem refresh
- Status de entrega/leitura atualizado em tempo real
- Lista de conversas atualizada quando nova conversa chega ou muda de status
- Indicador de "digitando" (verificar suporte na documentação UAZAPI)
- Status de disponibilidade dos agentes em tempo real
- Alertas de SLA e IA como toasts sem refresh de página

---

## 4.12 Módulo EmpireCobrança — WhatsApp Multi-Número para Cobranças

> Módulo completamente separado do EmpireChat. Focado exclusivamente em régua de cobrança via WhatsApp. Possui seus próprios números, usuários, configurações e relatórios. O acesso ao EmpireCobrança não dá acesso ao EmpireChat e vice-versa.

---

### 4.12.1 Visão geral

O EmpireCobrança permite criar réguas de cobrança automatizadas via WhatsApp: sequências de mensagens escalonadas enviadas para devedores em intervalos configurados, com variação de texto por IA para evitar detecção de spam.

Usa a mesma infraestrutura técnica (UAZAPI + OpenRouter) do EmpireChat, mas com banco de dados, telas, permissões e lógica completamente separados.

---

### 4.12.2 Perfil exclusivo: `agente_cobranca`

Novo perfil de usuário dedicado ao módulo de cobranças. Não enxerga nenhuma outra área do sistema (EmpireDesk, EmpireChat, trilhas, entregas, etc.).

| O que pode fazer | O que NÃO pode fazer |
|---|---|
| Ver todas as cobranças atribuídas a si | Ver cobranças de outros agentes (a menos que seja admin_cobranca) |
| Visualizar conversas de cobrança dos seus devedores | Acessar EmpireChat, entregas, clientes, NPS ou qualquer outra área |
| Registrar observações internas em cobranças | Criar ou editar réguas de cobrança |
| Encerrar uma cobrança manualmente | Criar ou remover instâncias de número |
| Ver relatórios das próprias cobranças | Ver relatórios gerais da operação |

Novo perfil de gestão: **`admin_cobranca`** — acesso total ao módulo de cobranças, sem acesso ao restante do EmpireDesk.

---

### 4.12.3 Instâncias de número para cobranças

O admin pode conectar **quantos números quiser** exclusivamente para cobranças. Totalmente separado dos números do EmpireChat.

Usa a mesma lógica de conexão via QR Code (UAZAPI), mas os tokens ficam em Supabase Secrets com prefixo `COBRANCA_TOKEN_{instance_id}` para não conflitar com os tokens do EmpireChat.

| Campo | Descrição |
|---|---|
| `nome` | Ex: "Cobrança Nível 1", "Cobrança VIP" |
| `numero_whatsapp` | Número formatado |
| `instance_id` | ID da instância na UAZAPI |
| `status` | `conectado` / `desconectado` / `aguardando_qr` / `banido` |
| `limite_envios_por_hora` | Máximo de mensagens/hora — **teto fixo: 60** |
| `ativo` | boolean |

---

### 4.12.4 Devedores (Contacts de Cobrança)

| Campo | Descrição |
|---|---|
| `id` | UUID |
| `nome` | Nome do devedor |
| `numero` | Número WhatsApp |
| `documento` | CPF ou CNPJ |
| `valor_divida` | Decimal |
| `data_vencimento` | Data original de vencimento |
| `dias_em_atraso` | Calculado automaticamente |
| `descricao_divida` | Ex: "Fatura Outubro/2025" |
| `client_id` | FK opcional → clients (se o devedor for um cliente do EmpireDesk) |
| `agente_id` | FK → users (agente_cobranca responsável) |
| `tags` | Array de tags: ["vip", "reincidente", "negociando"] |
| `status_cobranca` | enum — ver abaixo |
| `notas` | Anotações internas |
| `opt_out` | boolean — solicitou parar de receber mensagens |
| `criado_em` | timestamptz |

#### Status de cobrança

| Status | Descrição |
|---|---|
| `ativa` | Em processo de cobrança, régua rodando |
| `negociando` | Agente em negociação manual |
| `paga` | Débito quitado |
| `acordo` | Acordo de parcelamento feito |
| `encerrada` | Encerrada sem pagamento (perda) |
| `pausada` | Régua pausada manualmente |
| `opt_out` | Devedor pediu para parar |

---

### 4.12.5 Réguas de Cobrança

Uma régua é uma sequência de mensagens automáticas enviadas com intervalos definidos.

| Campo | Descrição |
|---|---|
| `nome` | Ex: "Régua Padrão 30 dias", "Régua VIP" |
| `instancia_id` | FK → cobranca_instances (qual número vai usar) |
| `passos` | JSON — lista ordenada de passos (ver abaixo) |
| `ativo` | boolean |

#### Estrutura de um passo da régua

```json
{
  "ordem": 1,
  "dias_apos_vencimento": 1,
  "hora_envio": "09:00",
  "mensagem_base": "Olá {{nome}}, identificamos que sua fatura de R${{valor}} venceu em {{data_vencimento}}. Podemos ajudar a regularizar?",
  "usar_ia_variacao": true,
  "instrucao_ia": "Reescreva a mensagem abaixo de forma única, mantendo as variáveis {{nome}}, {{valor}} e {{data_vencimento}}, tom respeitoso e profissional.",
  "modelo_ia": "openai/gpt-4o-mini"
}
```

Passos de exemplo de uma régua de 30 dias:

| Passo | Dias após vencimento | Hora | Tom |
|---|---|---|---|
| 1 | +1 dia | 09:00 | Lembrete amigável |
| 2 | +3 dias | 10:00 | Lembrete com urgência leve |
| 3 | +7 dias | 09:30 | Aviso de pendência |
| 4 | +15 dias | 10:00 | Alerta de consequências |
| 5 | +30 dias | 09:00 | Última tentativa antes de encaminhamento |

---

### 4.12.6 Regras de envio (idênticas às campanhas)

- Intervalo **aleatório** entre envios: sorteado entre `intervalo_min_segundos` e `intervalo_max_segundos` configurados na instância
- Limite fixo de **máximo 60 mensagens por hora** por instância — não configurável acima disso
- Não envia fora do horário configurado (ex: apenas entre 08:00 e 20:00)
- Não envia em domingos (configurável)
- Se `usar_ia_variacao = true`, a IA gera uma versão única da mensagem para cada devedor antes do envio
- A mensagem gerada é salva em `cobranca_sends.mensagem_enviada` para auditoria
- O modelo de IA usado é selecionado pelo admin_cobranca no painel (qualquer modelo do OpenRouter)

---

### 4.12.7 Conversas de Cobrança

Quando o devedor responde uma mensagem da régua, o sistema cria (ou reabre) uma conversa de cobrança.

- Conversas de cobrança ficam em uma inbox separada da inbox do EmpireChat
- O agente de cobrança vê apenas as conversas dos seus devedores
- O agente pode responder manualmente pelo sistema (via UAZAPI)
- O agente pode marcar a cobrança como "Negociando", "Paga", "Acordo", etc.
- Notas internas visíveis apenas para a equipe

---

### 4.12.8 Importação de devedores

O admin_cobranca pode importar devedores via:
- Upload de planilha CSV com mapeamento de colunas
- Vinculação manual de um cliente EmpireDesk como devedor
- Cadastro manual individual

---

### 4.12.9 Dashboard e relatórios de cobrança

#### Dashboard em tempo real

| Métrica | Descrição |
|---|---|
| Total de devedores ativos | Por instância e agente |
| Valor total em cobrança | Soma dos débitos em processo |
| Mensagens enviadas hoje | Por instância |
| Respostas recebidas hoje | Devedores que responderam |
| Cobranças pagas hoje | Quantidade e valor total |
| Taxa de resposta geral | % de devedores que responderam |
| Taxa de recuperação | % de cobranças que resultaram em pagamento ou acordo |

#### Relatórios exportáveis

| Relatório | Conteúdo |
|---|---|
| Histórico de cobranças | Por devedor, com todos os envios, respostas e status |
| Performance por régua | Taxa de resposta e recuperação por régua |
| Performance por agente | Cobranças resolvidas, acordos fechados |
| Extrato de envios | Log completo de cada mensagem enviada |
| Devedores sem resposta | Lista de quem nunca respondeu nenhum passo |
| Cobranças por status | Visão consolidada de todos os status |

---

### 4.12.10 Telas do módulo EmpireCobrança

- **Inbox de cobrança** — conversas ativas de devedores que responderam
- **Dashboard de cobrança** — métricas em tempo real
- **Devedores** — lista completa com filtros (status, agente, régua, valor, dias em atraso)
- **Detalhe do devedor** — histórico de envios, respostas, notas internas
- **Réguas de cobrança** — criar e editar réguas com múltiplos passos
- **Importar devedores** — upload CSV com mapeamento de colunas
- **Relatórios** — todos os relatórios com exportação
- **Configurações da Cobrança:**
  - Instâncias (números) — conectar via QR, status, limite/hora
  - Horários de envio — janela de envio permitida
  - Configurações de IA — modelo por funcionalidade, temperatura
  - Usuários — gestão de agentes_cobranca e admins_cobranca

---

### 4.12.11 Banco de dados — tabelas do módulo EmpireCobrança

```sql
-- INSTÂNCIAS DE NÚMERO PARA COBRANÇA (separadas das instâncias do EmpireChat)
cobranca_instances
  id UUID PK
  nome TEXT NOT NULL
  numero_whatsapp TEXT
  instance_id TEXT NOT NULL  -- ID na UAZAPI
  status TEXT CHECK (status IN ('conectado','desconectado','aguardando_qr','banido')) DEFAULT 'aguardando_qr'
  qr_code TEXT
  limite_por_hora INTEGER DEFAULT 60 CHECK (limite_por_hora <= 60)
  intervalo_min_segundos INTEGER DEFAULT 8
  intervalo_max_segundos INTEGER DEFAULT 25
  hora_inicio_envio TIME DEFAULT '08:00'
  hora_fim_envio TIME DEFAULT '20:00'
  enviar_domingo BOOLEAN DEFAULT false
  ativo BOOLEAN DEFAULT true
  criado_em TIMESTAMPTZ DEFAULT now()

-- RÉGUAS DE COBRANÇA
cobranca_reguas
  id UUID PK
  nome TEXT NOT NULL
  instancia_id UUID FK → cobranca_instances
  passos JSONB NOT NULL  -- array ordenado de passos (ver 4.12.5)
  ativo BOOLEAN DEFAULT true
  criado_por UUID FK → users
  criado_em TIMESTAMPTZ DEFAULT now()

-- DEVEDORES
cobranca_devedores
  id UUID PK
  nome TEXT NOT NULL
  numero TEXT NOT NULL
  documento TEXT
  valor_divida DECIMAL(15,2) NOT NULL
  data_vencimento DATE NOT NULL
  descricao_divida TEXT
  client_id UUID FK → clients  -- vínculo opcional
  regua_id UUID FK → cobranca_reguas
  agente_id UUID FK → users
  tags TEXT[] DEFAULT '{}'
  status TEXT CHECK (status IN ('ativa','negociando','paga','acordo','encerrada','pausada','opt_out')) DEFAULT 'ativa'
  passo_atual INTEGER DEFAULT 0
  proximo_envio_em TIMESTAMPTZ
  notas TEXT
  opt_out BOOLEAN DEFAULT false
  importado_via TEXT  -- 'csv' | 'manual' | 'client_link'
  criado_em TIMESTAMPTZ DEFAULT now()

-- LOG DE ENVIOS DA RÉGUA
cobranca_sends
  id UUID PK
  devedor_id UUID FK → cobranca_devedores
  instancia_id UUID FK → cobranca_instances
  message_id_wpp TEXT
  passo_numero INTEGER NOT NULL
  mensagem_base TEXT NOT NULL
  mensagem_enviada TEXT NOT NULL  -- versão final (base ou variação IA)
  gerada_por_ia BOOLEAN DEFAULT false
  modelo_ia_usado TEXT
  status TEXT CHECK (status IN ('enviando','enviado','entregue','lido','falhou')) DEFAULT 'enviando'
  enviada_em TIMESTAMPTZ DEFAULT now()
  entregue_em TIMESTAMPTZ
  lida_em TIMESTAMPTZ
  erro_descricao TEXT

-- CONVERSAS DE COBRANÇA (quando devedor responde)
cobranca_conversas
  id UUID PK
  devedor_id UUID FK → cobranca_devedores
  instancia_id UUID FK → cobranca_instances
  agente_id UUID FK → users
  status TEXT CHECK (status IN ('aberta','em_atendimento','resolvida','arquivada')) DEFAULT 'aberta'
  resolvida_em TIMESTAMPTZ
  criado_em TIMESTAMPTZ DEFAULT now()

-- MENSAGENS DAS CONVERSAS DE COBRANÇA
cobranca_mensagens
  id UUID PK
  conversa_id UUID FK → cobranca_conversas
  message_id_wpp TEXT
  direcao TEXT CHECK (direcao IN ('entrada','saida')) NOT NULL
  tipo TEXT DEFAULT 'texto'
  conteudo TEXT
  midia_url TEXT
  nota_interna BOOLEAN DEFAULT false
  enviada_em TIMESTAMPTZ DEFAULT now()
  status TEXT CHECK (status IN ('enviando','enviado','entregue','lido','falhou')) DEFAULT 'enviando'
```

---

---

## 4.13 Módulo Empire IA Bot — Bots Conversacionais via WhatsApp

> **Desativado por padrão.** O bot de IA nunca é ativado automaticamente. Cada ativação é explícita, granular (por tag, segmento ou situação) e reversível com um clique.

Este módulo adiciona a capacidade de bots de IA conversacionais ao **EmpireChat** (atendimento) e ao **EmpireCobrança** (cobranças), usando o OpenRouter como provedor de IA. O bot pode ser configurado com personalidade, instruções, documentos de contexto, ações e tool calls — tudo pelo painel admin, sem código.

---

### 4.13.1 Conceito central: Bots são configurações, não código

Um **Bot** é um conjunto de configurações salvo no banco de dados:

- Qual modelo de IA usar (qualquer modelo do OpenRouter)
- Qual é o prompt de sistema (personalidade, tom, instruções de comportamento)
- Quais documentos de contexto o bot pode consultar (base de conhecimento, políticas, FAQ, tabela de preços, etc.)
- Quais ações o bot pode executar (tool calls)
- Em quais situações o bot deve ser ativado
- Quando o bot deve escalar para um humano

O admin configura tudo pelo painel — sem precisar tocar em código. Trocar o modelo, editar o prompt ou adicionar um documento de contexto tem efeito imediato.

---

### 4.13.2 Onde o bot pode ser ativado

| Módulo | Onde se aplica |
|---|---|
| **EmpireChat** | Em conversas de atendimento — responde clientes automaticamente no lugar do agente |
| **EmpireCobrança** | Em conversas de cobrança — negocia, responde dúvidas e orienta o devedor |

Cada módulo tem sua própria lista de bots configuráveis e suas próprias regras de ativação.

---

### 4.13.3 Regras de ativação — quando o bot assume

O bot **nunca** é ativado por padrão. A ativação é sempre explícita, baseada em uma ou mais das seguintes condições (configuráveis no painel):

#### Por tag do contato
O bot é ativado apenas para contatos que tenham uma tag específica. Exemplos:
- Tag `bot-ativo` → bot responde automaticamente
- Tag `vip` → bot NÃO é ativado (humano sempre)
- Tag `lead-frio` → bot faz qualificação automática

#### Por segmento/departamento (EmpireChat)
O bot é ativado para todas as conversas de um departamento específico. Exemplo: "Suporte Nível 1 — respostas automáticas ativadas".

#### Por situação específica
Condições baseadas em estado da conversa ou do devedor:

| Situação | Exemplo de uso |
|---|---|
| Fora do horário de atendimento | Bot responde enquanto a equipe está offline |
| Conversa sem agente atribuído por X minutos | Bot assume se nenhum humano responder em 10 min |
| Primeira mensagem de novo contato | Bot faz triagem e qualificação inicial |
| Devedor em passo específico da régua (cobrança) | Bot negocia quando devedor responde o passo 3 |
| Status da cobrança = "negociando" | Bot auxilia na negociação de acordo |

#### Combinação de condições
O admin pode combinar condições (AND/OR). Exemplo: "Ativar bot SE tag=`lead-frio` E fora do horário de atendimento".

---

### 4.13.4 Controles de ativação — fácil ligar/desligar

#### Toggle global do bot
Cada bot tem um toggle `ativo` (boolean). Desativar o toggle para o bot inteiro imediatamente sem precisar mexer em regras de ativação. O admin pode ligar/desligar com um clique na tela de configuração do bot.

#### Toggle por conversa
Dentro de qualquer conversa (EmpireChat ou cobrança), o agente pode:
- **Pausar o bot** naquela conversa específica (ex: para assumir o controle manualmente) — o bot para de responder apenas nessa conversa
- **Retomar o bot** quando quiser delegar de volta
- A troca de controle fica registrada no histórico da conversa com timestamp

#### Override por tag em tempo real
O admin pode adicionar ou remover uma tag de um contato a qualquer momento. Se remover a tag que ativa o bot, o bot para de responder aquele contato imediatamente nas próximas mensagens.

#### Indicador visual na inbox
Na lista de conversas da inbox, um ícone 🤖 indica que o bot está ativo naquela conversa. Ícone ⏸️ indica que o bot foi pausado manualmente.

---

### 4.13.5 Configuração do Bot — o que o admin pode personalizar

#### Identidade e comportamento

| Campo | Descrição |
|---|---|
| `nome` | Nome interno do bot. Ex: "Bot de Triagem", "Bot de Cobrança Amigável" |
| `descricao` | Descrição interna do propósito |
| `modelo_openrouter` | Modelo de IA (selecionado de todos os modelos do OpenRouter em tempo real) |
| `temperatura` | 0.0 a 1.0 — controla criatividade das respostas |
| `max_tokens_por_resposta` | Limite de tamanho da resposta |
| `prompt_sistema` | Editor de texto rico com o prompt completo de sistema. Define personalidade, tom, restrições de comportamento, como saudar, como se despedir, o que pode e não pode falar |
| `nome_do_bot_para_cliente` | Nome que o bot usa ao se apresentar. Ex: "Sou a Ana, assistente virtual da Empire Zap" |
| `revelar_que_e_ia` | boolean — se o bot deve revelar que é IA quando perguntado diretamente |

#### Documentos de contexto (Base de Conhecimento)

O admin pode fazer upload ou colar texto de documentos que o bot usará como contexto ao responder. Cada documento tem:

| Campo | Descrição |
|---|---|
| `titulo` | Ex: "FAQ Geral", "Tabela de Preços", "Política de Cobrança", "Script de Vendas" |
| `tipo` | `texto` / `pdf` / `url` |
| `conteudo` | Texto puro colado direto, PDF enviado via upload, ou URL para buscar |
| `resumo_automatico` | Resumo gerado pela IA ao fazer upload (para exibição no painel) |
| `ativo` | boolean — permite desativar um documento sem apagar |
| `tokens_estimados` | Estimativa de tokens que este documento ocupa no contexto |

Os documentos são incluídos no contexto da conversa antes de cada chamada de IA, dentro do limite de tokens configurado. O admin controla a ordem de prioridade dos documentos quando o contexto total exceder o limite.

#### Memória e contexto da conversa

| Campo | Descrição |
|---|---|
| `historico_mensagens_incluir` | Quantas mensagens anteriores incluir no contexto (padrão: 20) |
| `incluir_dados_contato` | boolean — incluir nome, tags e notas do contato no contexto |
| `incluir_dados_cliente_empiredesk` | boolean — incluir dados de entregas, NPS e status do cliente EmpireDesk (se vinculado) |
| `incluir_dados_devedor` | boolean — incluir valor da dívida, dias em atraso, passo da régua (EmpireCobrança) |

#### Regras de escalada para humano

O bot automaticamente para de responder e notifica um agente humano quando:

| Condição | Campo de configuração |
|---|---|
| Cliente usa palavra de escalada | `palavras_escalada` — ex: ["falar com humano", "atendente", "gerente", "reclamação"] |
| Bot não encontra resposta com confiança acima de X% | `threshold_confianca_escalada` |
| Conversa atingiu N mensagens sem resolver | `max_mensagens_antes_escalada` |
| Cliente demonstra insatisfação (score IA) | `score_ia_minimo_para_continuar` |
| Horário de atendimento humano | `escalar_dentro_do_horario` boolean |

Ao escalar:
1. Bot envia mensagem configurável informando que irá transferir para um humano
2. Status da conversa muda para "Em atendimento" (sem agente atribuído)
3. Notificação disparada para o departamento/gerente
4. Bot para de responder naquela conversa até o agente encerrar ou devolver ao bot manualmente

#### Tool Calls — Ações que o bot pode executar

O admin configura quais ações o bot pode executar autonomamente durante a conversa. Cada tool call tem:

| Campo | Descrição |
|---|---|
| `nome_da_tool` | Nome interno. Ex: `consultar_status_entrega`, `registrar_pagamento_prometido` |
| `descricao_para_ia` | Descrição em linguagem natural que a IA usa para decidir quando chamar esta tool. Ex: "Use esta tool quando o cliente perguntar sobre o status de uma entrega específica" |
| `tipo` | `interna` / `webhook_externo` |
| `parametros` | Esquema JSON dos parâmetros que a IA deve preencher antes de chamar |
| `ativo` | boolean |

**Tools internas disponíveis (sem configuração extra):**

| Tool | O que faz |
|---|---|
| `get_client_deliveries` | Busca as entregas recentes do cliente vinculado |
| `get_client_nps` | Retorna o NPS atual do cliente |
| `add_contact_tag` | Adiciona uma tag ao contato |
| `remove_contact_tag` | Remove uma tag do contato |
| `create_internal_note` | Cria uma nota interna na conversa |
| `escalate_to_human` | Escala a conversa para um agente humano |
| `close_conversation` | Encerra a conversa |
| `get_debtor_info` | Retorna dados do devedor (EmpireCobrança) |
| `register_payment_promise` | Registra uma promessa de pagamento do devedor |
| `update_debtor_status` | Atualiza o status da cobrança |
| `pause_collection_rule` | Pausa a régua de cobrança para aquele devedor |

**Tools externas via Webhook:**
O admin configura uma URL de webhook externa. O bot chama essa URL via Edge Function com os parâmetros preenchidos e usa a resposta como contexto para continuar a conversa. Isso permite integrar o bot com sistemas externos (CRM, ERP, sistema de pagamentos, etc.) sem precisar de código no EmpireDesk.

Exemplo de tool externa: `consultar_boleto` → chama a API do sistema financeiro externo e retorna o status do boleto para o bot informar ao cliente.

---

### 4.13.6 Fluxo técnico de uma mensagem processada pelo bot

```
Cliente envia mensagem no WhatsApp
        ↓
Edge Function uazapi-webhook recebe evento
        ↓
Sistema verifica se a conversa tem bot ativo:
  - Bot global ativo? (toggle global)
  - Bot pausado nesta conversa? (override manual)
  - Condições de ativação satisfeitas? (tags, segmento, situação)
        ↓
    [Bot NÃO ativo]           [Bot ATIVO]
    Fluxo normal de            Chama Edge Function
    atendimento humano         ia-bot-respond
                                    ↓
                          Monta o contexto:
                          - prompt_sistema
                          - documentos de contexto ativos
                          - histórico de N mensagens
                          - dados do contato / cliente / devedor
                                    ↓
                          Chama OpenRouter API com o modelo configurado
                                    ↓
                          Verifica se a IA quer executar tool call
                          [Sim] → executa tool, adiciona resultado ao contexto
                          e chama OpenRouter novamente
                                    ↓
                          Verifica regras de escalada
                          [Escalar] → notifica humano, bot para
                                    ↓
                          Envia resposta via uazapi-send-message
                          Salva mensagem com enviado_por_ia = true
                          Atualiza score de satisfação IA
```

---

### 4.13.7 Banco de dados — tabelas do módulo Empire IA Bot

```sql
-- CONFIGURAÇÕES DE BOTS
ia_bots
  id UUID PK
  nome TEXT NOT NULL
  descricao TEXT
  modulo TEXT CHECK (modulo IN ('empirechat','cobranca')) NOT NULL
  modelo_openrouter TEXT NOT NULL
  temperatura FLOAT DEFAULT 0.7
  max_tokens_por_resposta INTEGER DEFAULT 500
  prompt_sistema TEXT NOT NULL
  nome_do_bot_para_cliente TEXT
  revelar_que_e_ia BOOLEAN DEFAULT true
  historico_mensagens_incluir INTEGER DEFAULT 20
  incluir_dados_contato BOOLEAN DEFAULT true
  incluir_dados_cliente_empiredesk BOOLEAN DEFAULT false
  incluir_dados_devedor BOOLEAN DEFAULT false
  -- Escalada para humano
  palavras_escalada TEXT[] DEFAULT '{}'
  threshold_confianca_escalada FLOAT DEFAULT 0.4
  max_mensagens_antes_escalada INTEGER DEFAULT 30
  score_ia_minimo_para_continuar FLOAT DEFAULT 0.2
  escalar_dentro_do_horario BOOLEAN DEFAULT true
  mensagem_ao_escalar TEXT DEFAULT 'Vou te transferir para um de nossos atendentes. Um momento!'
  -- Controle
  ativo BOOLEAN DEFAULT false  -- DESATIVADO POR PADRÃO
  criado_por UUID FK → users
  criado_em TIMESTAMPTZ DEFAULT now()

-- DOCUMENTOS DE CONTEXTO (base de conhecimento do bot)
ia_bot_documents
  id UUID PK
  bot_id UUID FK → ia_bots
  titulo TEXT NOT NULL
  tipo TEXT CHECK (tipo IN ('texto','pdf','url')) NOT NULL
  conteudo TEXT  -- texto puro ou URL
  storage_url TEXT  -- se PDF, URL no Supabase Storage
  resumo_automatico TEXT
  tokens_estimados INTEGER
  ordem INTEGER DEFAULT 0  -- prioridade quando contexto excede limite
  ativo BOOLEAN DEFAULT true
  criado_em TIMESTAMPTZ DEFAULT now()

-- TOOL CALLS CONFIGURADAS POR BOT
ia_bot_tools
  id UUID PK
  bot_id UUID FK → ia_bots
  nome_da_tool TEXT NOT NULL  -- usado pela IA no function calling
  descricao_para_ia TEXT NOT NULL
  tipo TEXT CHECK (tipo IN ('interna','webhook_externo')) NOT NULL
  parametros_schema JSONB  -- JSON Schema dos parâmetros esperados
  webhook_url TEXT  -- se tipo = webhook_externo
  webhook_secret TEXT  -- para autenticação no webhook externo
  ativo BOOLEAN DEFAULT true

-- REGRAS DE ATIVAÇÃO DO BOT
ia_bot_activation_rules
  id UUID PK
  bot_id UUID FK → ia_bots
  -- Cada regra é uma condição. Múltiplas regras do mesmo bot = OR (qualquer uma ativa o bot)
  -- Dentro de uma regra, múltiplos campos preenchidos = AND
  tipo_regra TEXT NOT NULL
  -- tipos: 'tag_contato' | 'departamento' | 'fora_do_horario' | 'sem_agente_minutos'
  --        'primeira_mensagem' | 'passo_regua' | 'status_cobranca' | 'manual_apenas'
  config JSONB NOT NULL
  -- ex para 'tag_contato':    {"tag": "bot-ativo"}
  -- ex para 'departamento':   {"department_id": "uuid-aqui"}
  -- ex para 'sem_agente_minutos': {"minutos": 10}
  -- ex para 'passo_regua':    {"passo": 3}
  -- ex para 'status_cobranca': {"status": "negociando"}
  descricao TEXT  -- descrição legível da regra para o painel
  ativo BOOLEAN DEFAULT true

-- OVERRIDE DE BOT POR CONVERSA (pausado/retomado manualmente pelo agente)
ia_bot_conversation_overrides
  id UUID PK
  bot_id UUID FK → ia_bots
  -- Para EmpireChat:
  conversa_id UUID FK → conversations
  -- Para EmpireCobrança:
  cobranca_conversa_id UUID FK → cobranca_conversas
  pausado BOOLEAN DEFAULT false
  pausado_por UUID FK → users
  pausado_em TIMESTAMPTZ
  retomado_por UUID FK → users
  retomado_em TIMESTAMPTZ
  motivo TEXT

-- LOG DE EXECUÇÕES DO BOT (auditoria de cada resposta gerada)
ia_bot_execution_logs
  id UUID PK
  bot_id UUID FK → ia_bots
  -- Conversa (uma das duas, dependendo do módulo)
  conversa_id UUID FK → conversations
  cobranca_conversa_id UUID FK → cobranca_conversas
  mensagem_cliente_id UUID  -- FK para a mensagem que disparou o bot
  mensagem_bot_id UUID  -- FK para a mensagem gerada e enviada
  modelo_usado TEXT
  tokens_prompt INTEGER
  tokens_resposta INTEGER
  tools_chamadas JSONB  -- array de tool calls executadas nesta rodada
  escalou_para_humano BOOLEAN DEFAULT false
  motivo_escalada TEXT
  executado_em TIMESTAMPTZ DEFAULT now()
  duracao_ms INTEGER  -- tempo de resposta da chamada de IA
```

---

### 4.13.8 Telas do módulo Empire IA Bot

Acessível para `admin` e `gerente` dentro das configurações do EmpireChat e do EmpireCobrança.

- **Lista de Bots** — todos os bots configurados, com status ativo/inativo, módulo e botão de toggle rápido
- **Criar / Editar Bot:**
  - Aba "Identidade" — nome, modelo (dropdown com todos os modelos OpenRouter em tempo real), temperatura, tokens, nome para o cliente, revelar que é IA
  - Aba "Prompt e Comportamento" — editor de texto rico para o prompt de sistema com preview
  - Aba "Base de Conhecimento" — lista de documentos, upload de PDF, colar texto, URL; reordenar por drag-and-drop; estimativa de tokens por documento
  - Aba "Tool Calls" — lista de tools ativas; adicionar tool interna ou externa (formulário com nome, descrição para IA, schema de parâmetros, webhook URL)
  - Aba "Regras de Ativação" — adicionar condições (tag, departamento, situação); visualização em formato "Se [condição] OU [condição], bot ativa"; botão de teste de regra
  - Aba "Escalada" — configurar palavras de escalada, thresholds, mensagem de transição
  - Aba "Configurações Avançadas" — histórico de mensagens, incluir dados do contato/cliente/devedor, limite de tokens de contexto
- **Playground / Teste de Bot** — interface de simulação de conversa para o admin testar o bot antes de ativar em produção, sem enviar mensagens reais
- **Logs de Execução** — histórico de todas as execuções do bot com: modelo usado, tokens consumidos, tools chamadas, se escalou, tempo de resposta

---

### 4.13.9 Indicadores na Inbox (EmpireChat e EmpireCobrança)

- 🤖 na lista de conversas indica que o bot está ativo e respondendo
- ⏸️ indica que o bot foi pausado manualmente pelo agente naquela conversa
- Mensagens enviadas pelo bot aparecem com badge "IA" discreto ao lado do nome
- Botão de toggle "Pausar Bot / Retomar Bot" fixo no topo da conversa quando há bot configurado e ativo para aquele contato

---

### 4.13.10 Edge Functions do módulo Empire IA Bot

| Edge Function | Responsabilidade |
|---|---|
| `ia-bot-respond` | Função principal. Monta contexto (prompt + documentos + histórico + dados), chama OpenRouter, processa tool calls em loop até ter resposta final, verifica regras de escalada, envia mensagem via UAZAPI |
| `ia-bot-check-activation` | Verifica se uma conversa deve ter o bot ativado, consultando regras de ativação. Chamada pela `uazapi-webhook` antes de decidir o fluxo |
| `ia-bot-execute-tool` | Executa uma tool call individual (interna ou webhook externo) e retorna o resultado para a `ia-bot-respond` |
| `ia-bot-upload-document` | Processa upload de documentos de contexto: extrai texto de PDFs, busca URL, gera resumo automático via IA, estima tokens |

> ⚠️ **Para o programador:** A `ia-bot-respond` pode fazer múltiplas chamadas ao OpenRouter em sequência (quando há tool calls). Implementar loop de no máximo 5 iterações para evitar chamadas infinitas. Registrar todas as iterações em `ia_bot_execution_logs.tools_chamadas`.

---

### 4.13.11 Atualização nas regras do `claude.md`

Adicionar ao `docs/claude.md`:

```
## Regras específicas do módulo Empire IA Bot
56. NUNCA ativar um bot por padrão — ativo = false em todas as inserções de ia_bots
57. SEMPRE verificar ia_bot_conversation_overrides antes de processar mensagem com bot
58. SEMPRE verificar ia_bot_activation_rules antes de ativar o bot em qualquer conversa
59. NUNCA expor a chave OpenRouter na ia-bot-respond — usar Supabase Secrets
60. SEMPRE salvar log em ia_bot_execution_logs para cada execução, incluindo tokens e tools chamadas
61. SEMPRE implementar limite de 5 iterações de tool calls por rodada para evitar loops
62. NUNCA enviar mensagem como bot se o campo pausado = true em ia_bot_conversation_overrides
63. SEMPRE usar o modelo configurado no ia_bots.modelo_openrouter, nunca hardcodar modelo
64. SEMPRE incluir badge enviado_por_ia = true em mensagens geradas pelo bot
```

---


## 5. Banco de dados

> Implementar via migrations versionadas em `supabase/migrations/`. Nunca editar o banco diretamente. Ativar RLS em todas as tabelas com dados de usuário.

### 5.1 Schema completo

```sql
-- USUÁRIOS
users
  id UUID PK
  nome TEXT NOT NULL
  email TEXT UNIQUE NOT NULL
  perfil TEXT NOT NULL CHECK (perfil IN ('admin','gerente','estrategista','atendimento','cliente','agente_chat','agente_cobranca','admin_cobranca'))
  ativo BOOLEAN DEFAULT true
  criado_em TIMESTAMPTZ DEFAULT now()

-- CLIENTES
clients
  id UUID PK
  nome_empresa TEXT NOT NULL
  data_inicio_contrato DATE
  status_contrato TEXT CHECK (status_contrato IN ('ativo','pausado','encerrado'))
  observacoes_internas TEXT
  nps_frequencia_dias INTEGER DEFAULT 30
  criado_em TIMESTAMPTZ DEFAULT now()

-- USUÁRIOS DE CLIENTES (portal externo, múltiplos por cliente)
client_users
  id UUID PK
  client_id UUID FK → clients
  user_id UUID FK → users
  UNIQUE (client_id, user_id)

-- ATRIBUIÇÕES INTERNAS (estrategista / atendimento por cliente)
client_assignments
  id UUID PK
  client_id UUID FK → clients
  user_id UUID FK → users
  tipo TEXT CHECK (tipo IN ('estrategista','atendimento'))
  ativo BOOLEAN DEFAULT true

-- PRODUTOS
products
  id UUID PK
  nome TEXT NOT NULL
  descricao TEXT
  prazo_aprovacao_dias INTEGER DEFAULT 3
  ativo BOOLEAN DEFAULT true

-- ENTREGÁVEIS (componentes de um produto)
deliverables
  id UUID PK
  product_id UUID FK → products
  nome TEXT NOT NULL
  descricao TEXT
  periodicidade TEXT CHECK (periodicidade IN ('unica','semanal','quinzenal','mensal','trimestral'))
  prazo_relativo TEXT
  requer_aprovacao BOOLEAN DEFAULT true
  visivel_cliente BOOLEAN DEFAULT true
  aparece_kanban BOOLEAN DEFAULT true
  tipos_conteudo_aceitos JSONB  -- ex: ["imagem","texto","link"]
  ativo BOOLEAN DEFAULT true

-- PRODUTOS CONTRATADOS POR CLIENTE
client_products
  id UUID PK
  client_id UUID FK → clients
  product_id UUID FK → products
  data_inicio DATE NOT NULL

-- ENTREGAS (instâncias geradas por cliente_product + deliverable)
deliveries
  id UUID PK
  client_product_id UUID FK → client_products
  deliverable_id UUID FK → deliverables
  responsavel_id UUID FK → users
  prazo DATE
  data_publicacao DATE
  concluida_em TIMESTAMPTZ
  concluida_por UUID FK → users
  cancelada_em TIMESTAMPTZ
  criado_em TIMESTAMPTZ DEFAULT now()

-- VERSÕES DE UMA ENTREGA
delivery_versions
  id UUID PK
  delivery_id UUID FK → deliveries
  numero_versao INTEGER NOT NULL
  criada_em TIMESTAMPTZ DEFAULT now()
  criada_por UUID FK → users

-- ITENS DE CONTEÚDO DE UMA VERSÃO
delivery_content_items
  id UUID PK
  delivery_version_id UUID FK → delivery_versions
  tipo TEXT CHECK (tipo IN ('imagem','video','video_link','pdf','documento','texto','link','audio','legenda'))
  conteudo TEXT  -- URL (storage ou externo) ou texto puro
  nome_arquivo TEXT
  ordem INTEGER DEFAULT 0

-- APROVAÇÕES E FEEDBACKS DOS CLIENTES
delivery_approvals
  id UUID PK
  delivery_id UUID FK → deliveries
  version_id UUID FK → delivery_versions
  status TEXT CHECK (status IN ('aprovado','rejeitado'))
  client_user_id UUID FK → users
  comentario TEXT
  nota_estrelas INTEGER CHECK (nota_estrelas BETWEEN 1 AND 5)
  feedback_escrito TEXT
  criado_em TIMESTAMPTZ DEFAULT now()

-- COMENTÁRIOS INTERNOS DA EQUIPE
delivery_comments
  id UUID PK
  delivery_id UUID FK → deliveries
  user_id UUID FK → users
  texto TEXT NOT NULL
  visivel_cliente BOOLEAN DEFAULT false
  criado_em TIMESTAMPTZ DEFAULT now()

-- OVERRIDES DO KANBAN (apenas para overrides manuais do cliente)
kanban_overrides
  id UUID PK
  delivery_id UUID FK → deliveries
  client_id UUID FK → clients
  coluna_atual TEXT
  movido_por UUID FK → users
  movido_em TIMESTAMPTZ DEFAULT now()

-- PESQUISAS DE NPS
nps_surveys
  id UUID PK
  client_id UUID FK → clients
  disparado_em TIMESTAMPTZ DEFAULT now()
  disparado_por TEXT  -- 'auto' ou user_id
  tipo TEXT CHECK (tipo IN ('periodico','pos_entrega','manual'))

-- RESPOSTAS DE NPS
nps_responses
  id UUID PK
  nps_survey_id UUID FK → nps_surveys
  client_user_id UUID FK → users
  nota INTEGER CHECK (nota BETWEEN 0 AND 10)
  feedback_qualitativo TEXT
  respondido_em TIMESTAMPTZ DEFAULT now()

-- TRILHAS DE APRENDIZADO
trails
  id UUID PK
  nome TEXT NOT NULL
  descricao TEXT
  tipo TEXT CHECK (tipo IN ('cliente','interno'))
  sequencial BOOLEAN DEFAULT false
  ativo BOOLEAN DEFAULT true

-- VINCULAÇÃO TRILHA → PRODUTO
trail_product_links
  id UUID PK
  trail_id UUID FK → trails
  product_id UUID FK → products

-- ATRIBUIÇÃO TRILHA → USUÁRIO ESPECÍFICO
trail_user_links
  id UUID PK
  trail_id UUID FK → trails
  user_id UUID FK → users
  prazo DATE

-- ATRIBUIÇÃO TRILHA → PERFIL INTEIRO
trail_assignments
  id UUID PK
  trail_id UUID FK → trails
  perfil TEXT
  prazo DATE

-- MÓDULOS DE TRILHA
modules
  id UUID PK
  trail_id UUID FK → trails
  nome TEXT NOT NULL
  ordem INTEGER DEFAULT 0

-- AULAS
lessons
  id UUID PK
  module_id UUID FK → modules
  nome TEXT NOT NULL
  tipo TEXT CHECK (tipo IN ('video','texto','pdf','link','misto'))
  conteudo_url TEXT
  conteudo_texto TEXT
  ordem INTEGER DEFAULT 0
  bloqueada BOOLEAN DEFAULT false

-- PROGRESSO DE AULAS
lesson_progress
  id UUID PK
  lesson_id UUID FK → lessons
  user_id UUID FK → users
  concluida BOOLEAN DEFAULT false
  concluida_em TIMESTAMPTZ
  UNIQUE (lesson_id, user_id)

-- REGISTRO DE INTERAÇÕES COM CLIENTES
interactions
  id UUID PK
  client_id UUID FK → clients
  user_id UUID FK → users
  tipo TEXT CHECK (tipo IN ('ligacao','email','reuniao','anotacao'))
  descricao TEXT
  criado_em TIMESTAMPTZ DEFAULT now()

-- NOTIFICAÇÕES
notifications
  id UUID PK
  user_id UUID FK → users
  tipo TEXT
  mensagem TEXT NOT NULL
  lida BOOLEAN DEFAULT false
  criado_em TIMESTAMPTZ DEFAULT now()

-- LOGS DE AUDITORIA
audit_logs
  id UUID PK
  user_id UUID FK → users
  acao TEXT NOT NULL
  detalhes JSONB
  criado_em TIMESTAMPTZ DEFAULT now()
```

-- ============================================================
-- MÓDULO EMPIRECHAT (WHATSAPP)
-- ============================================================

-- INSTÂNCIAS UAZAPI (números conectados)
whatsapp_instances
  id UUID PK
  nome TEXT NOT NULL
  numero_whatsapp TEXT
  instance_id TEXT NOT NULL  -- ID na UAZAPI
  webhook_url TEXT
  status TEXT CHECK (status IN ('conectado','desconectado','aguardando_qr','banido')) DEFAULT 'aguardando_qr'
  qr_code TEXT
  departamento_padrao_id UUID FK → chat_departments
  auto_reply_fora_horario BOOLEAN DEFAULT false
  mensagem_fora_horario TEXT
  ativo BOOLEAN DEFAULT true
  criado_em TIMESTAMPTZ DEFAULT now()
  -- NOTA: instance_token armazenado como Supabase Secret, nunca nesta tabela

-- DEPARTAMENTOS DE ATENDIMENTO
chat_departments
  id UUID PK
  instancia_id UUID FK → whatsapp_instances
  nome TEXT NOT NULL
  distribuicao TEXT CHECK (distribuicao IN ('manual','round_robin','menor_carga')) DEFAULT 'manual'
  sla_primeira_resposta_minutos INTEGER DEFAULT 60
  sla_resolucao_horas INTEGER DEFAULT 24
  mensagem_boas_vindas TEXT
  ativo BOOLEAN DEFAULT true

-- AGENTES POR DEPARTAMENTO
chat_department_agents
  id UUID PK
  department_id UUID FK → chat_departments
  user_id UUID FK → users
  UNIQUE (department_id, user_id)

-- HORÁRIOS DE ATENDIMENTO
chat_business_hours
  id UUID PK
  instancia_id UUID FK → whatsapp_instances  -- null = global
  department_id UUID FK → chat_departments   -- null = para toda instância
  dia_semana INTEGER CHECK (dia_semana BETWEEN 0 AND 6)  -- 0=dom, 6=sab
  hora_inicio TIME NOT NULL
  hora_fim TIME NOT NULL
  fuso_horario TEXT DEFAULT 'America/Sao_Paulo'

-- CONTATOS WHATSAPP
whatsapp_contacts
  id UUID PK
  numero TEXT NOT NULL UNIQUE
  nome TEXT
  foto_perfil_url TEXT
  client_id UUID FK → clients  -- vínculo opcional com cliente EmpireDesk
  tags TEXT[] DEFAULT '{}'
  notas TEXT
  bloqueado BOOLEAN DEFAULT false
  opt_out BOOLEAN DEFAULT false
  criado_em TIMESTAMPTZ DEFAULT now()
  ultima_mensagem_em TIMESTAMPTZ

-- CONVERSAS
conversations
  id UUID PK
  instancia_id UUID FK → whatsapp_instances
  contato_id UUID FK → whatsapp_contacts
  departamento_id UUID FK → chat_departments
  agente_id UUID FK → users
  status TEXT CHECK (status IN ('aberta','em_atendimento','aguardando_cliente','resolvida','arquivada')) DEFAULT 'aberta'
  canal TEXT CHECK (canal IN ('privado','grupo')) DEFAULT 'privado'
  grupo_id TEXT
  protocolo TEXT UNIQUE NOT NULL  -- gerado automaticamente: #YYYY-NNNNN
  tags TEXT[] DEFAULT '{}'
  primeira_mensagem_em TIMESTAMPTZ DEFAULT now()
  primeira_resposta_agente_em TIMESTAMPTZ
  resolvida_em TIMESTAMPTZ
  motivo_encerramento TEXT
  nota_satisfacao INTEGER CHECK (nota_satisfacao BETWEEN 1 AND 5)
  feedback_satisfacao TEXT
  sla_primeira_resposta_violado BOOLEAN DEFAULT false
  sla_resolucao_violado BOOLEAN DEFAULT false
  ia_resumo TEXT
  ia_sentimento TEXT CHECK (ia_sentimento IN ('positivo','neutro','negativo'))
  ia_score_satisfacao FLOAT CHECK (ia_score_satisfacao BETWEEN 0 AND 1)
  ia_categoria TEXT
  criado_em TIMESTAMPTZ DEFAULT now()

-- TRANSFERÊNCIAS DE CONVERSA (histórico)
conversation_transfers
  id UUID PK
  conversa_id UUID FK → conversations
  de_agente_id UUID FK → users
  para_agente_id UUID FK → users
  de_departamento_id UUID FK → chat_departments
  para_departamento_id UUID FK → chat_departments
  motivo TEXT
  transferido_por UUID FK → users
  transferido_em TIMESTAMPTZ DEFAULT now()

-- MENSAGENS
chat_messages
  id UUID PK
  conversa_id UUID FK → conversations
  message_id_wpp TEXT  -- ID retornado pela UAZAPI
  direcao TEXT CHECK (direcao IN ('entrada','saida')) NOT NULL
  remetente_id TEXT  -- user_id ou whatsapp_contacts.id
  tipo TEXT CHECK (tipo IN ('texto','imagem','video','audio','documento','sticker','localizacao','contato','template')) NOT NULL
  conteudo TEXT
  midia_url TEXT
  midia_mime_type TEXT
  reply_to_message_id UUID FK → chat_messages
  status TEXT CHECK (status IN ('enviando','enviado','entregue','lido','falhou')) DEFAULT 'enviando'
  enviada_em TIMESTAMPTZ DEFAULT now()
  entregue_em TIMESTAMPTZ
  lida_em TIMESTAMPTZ
  deletada_em TIMESTAMPTZ
  editada_em TIMESTAMPTZ
  conteudo_editado TEXT
  enviado_por_ia BOOLEAN DEFAULT false
  nota_interna BOOLEAN DEFAULT false  -- true = nota interna, não enviada ao cliente

-- RESPOSTAS RÁPIDAS
chat_quick_replies
  id UUID PK
  nome TEXT NOT NULL
  conteudo TEXT NOT NULL
  variaveis JSONB  -- ex: {"nome": "Nome do contato", "protocolo": "Número de protocolo"}
  categoria TEXT
  ativo BOOLEAN DEFAULT true

-- TEMPLATES DE MENSAGEM
chat_templates
  id UUID PK
  nome TEXT NOT NULL
  conteudo TEXT NOT NULL
  variaveis JSONB
  categoria TEXT CHECK (categoria IN ('saudacao','encerramento','csat','informativo'))
  ativo BOOLEAN DEFAULT true

-- CAMPANHAS DE DISPARO EM MASSA
chat_campaigns
  id UUID PK
  nome TEXT NOT NULL
  instancia_id UUID FK → whatsapp_instances
  mensagem_base TEXT NOT NULL          -- texto-base com variáveis
  usar_ia_variacao BOOLEAN DEFAULT false
  modelo_ia_variacao TEXT              -- modelo OpenRouter para variação (sobrescreve chat_ia_config se preenchido)
  instrucao_ia TEXT                    -- prompt de instrução para geração de variações
  agendamento TIMESTAMPTZ
  intervalo_min_segundos INTEGER DEFAULT 8   -- intervalo mínimo aleatório entre envios
  intervalo_max_segundos INTEGER DEFAULT 25  -- intervalo máximo aleatório entre envios
  limite_por_hora INTEGER DEFAULT 60 CHECK (limite_por_hora <= 60)  -- teto fixo: máximo 60/hora
  status TEXT CHECK (status IN ('rascunho','agendada','em_andamento','pausada','concluida')) DEFAULT 'rascunho'
  total_contatos INTEGER DEFAULT 0
  total_enviados INTEGER DEFAULT 0
  total_entregues INTEGER DEFAULT 0
  total_lidos INTEGER DEFAULT 0
  total_erros INTEGER DEFAULT 0
  enviados_ultima_hora INTEGER DEFAULT 0  -- contador da janela de 60 min atual
  ultima_hora_reset_em TIMESTAMPTZ        -- quando o contador foi zerado
  criado_por UUID FK → users
  criado_em TIMESTAMPTZ DEFAULT now()

-- DESTINATÁRIOS DE CAMPANHA
chat_campaign_contacts
  id UUID PK
  campanha_id UUID FK → chat_campaigns
  contato_id UUID FK → whatsapp_contacts
  mensagem_enviada TEXT    -- mensagem final enviada (pode ser variação da IA ou mensagem_base)
  gerada_por_ia BOOLEAN DEFAULT false
  status TEXT CHECK (status IN ('pendente','enviado','entregue','lido','erro')) DEFAULT 'pendente'
  enviado_em TIMESTAMPTZ
  erro_descricao TEXT

-- AUTOMAÇÕES / REGRAS DE BOT
chat_automations
  id UUID PK
  nome TEXT NOT NULL
  instancia_id UUID FK → whatsapp_instances
  department_id UUID FK → chat_departments
  gatilho_tipo TEXT NOT NULL  -- 'palavra_chave' / 'sem_resposta_minutos' / 'aberta_horas' / 'fora_horario' / 'novo_contato' / 'encerramento' / 'nota_baixa' / 'score_ia_baixo'
  gatilho_config JSONB  -- configuração específica do gatilho (palavras, tempo, threshold, etc.)
  acao_tipo TEXT NOT NULL  -- 'enviar_mensagem' / 'atribuir_agente' / 'transferir_dept' / 'alertar_gerente' / 'disparar_csat'
  acao_config JSONB
  ativo BOOLEAN DEFAULT true
  criado_em TIMESTAMPTZ DEFAULT now()

-- CONFIGURAÇÕES DE IA POR WORKSPACE
chat_ia_config
  id UUID PK
  modelo_sentimento TEXT DEFAULT 'openai/gpt-4o-mini'
  modelo_sugestao TEXT DEFAULT 'openai/gpt-4o'
  modelo_resumo TEXT DEFAULT 'openai/gpt-4o-mini'
  modelo_classificacao TEXT DEFAULT 'openai/gpt-4o-mini'
  modelo_campanha_variacao TEXT DEFAULT 'openai/gpt-4o-mini'  -- para variação de mensagens em campanhas
  modelo_cobranca_variacao TEXT DEFAULT 'openai/gpt-4o-mini'  -- para variação de mensagens em cobranças
  temperatura_sentimento FLOAT DEFAULT 0.1
  temperatura_sugestao FLOAT DEFAULT 0.7
  temperatura_resumo FLOAT DEFAULT 0.3
  temperatura_campanha_variacao FLOAT DEFAULT 0.9  -- alta para máxima variação
  temperatura_cobranca_variacao FLOAT DEFAULT 0.8
  max_tokens_sentimento INTEGER DEFAULT 50
  max_tokens_sugestao INTEGER DEFAULT 300
  max_tokens_resumo INTEGER DEFAULT 500
  max_tokens_variacao INTEGER DEFAULT 400
  threshold_alerta_score FLOAT DEFAULT 0.3  -- abaixo disto dispara alerta
  palavras_criticas TEXT[]  -- ex: ['cancelar', 'absurdo', 'processo']
  csat_ativo BOOLEAN DEFAULT true
  csat_delay_minutos INTEGER DEFAULT 5
  csat_mensagem TEXT

-- API KEYS PARA INTEGRAÇÃO EXTERNA
chat_api_keys
  id UUID PK
  nome TEXT NOT NULL  -- nome amigável: ex: "Integração CRM"
  key_hash TEXT NOT NULL UNIQUE  -- hash da chave, nunca a chave em texto
  permissoes TEXT[]  -- ex: ['send_message', 'read_conversations']
  ativo BOOLEAN DEFAULT true
  criado_por UUID FK → users
  criado_em TIMESTAMPTZ DEFAULT now()
  ultimo_uso_em TIMESTAMPTZ

-- WEBHOOKS EXTERNOS DE SAÍDA
chat_webhooks
  id UUID PK
  nome TEXT NOT NULL
  url TEXT NOT NULL
  secret TEXT  -- para assinatura HMAC-SHA256 (armazenado encriptado)
  eventos TEXT[]  -- ex: ['message.received', 'conversation.closed']
  ativo BOOLEAN DEFAULT true
  criado_em TIMESTAMPTZ DEFAULT now()

-- LOG DE DISPAROS DE WEBHOOK
chat_webhook_logs
  id UUID PK
  webhook_id UUID FK → chat_webhooks
  evento TEXT NOT NULL
  payload JSONB
  status_http INTEGER
  resposta TEXT
  disparado_em TIMESTAMPTZ DEFAULT now()


### 5.2 RLS Policies — resumo por tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | Próprio registro; admin vê todos | Admin | Próprio registro; admin | Admin |
| `clients` | Admin/gerente: todos; estrategista/atendimento: atribuídos; cliente: próprio | Admin | Admin | Admin |
| `client_users` | Admin/gerente: todos; cliente: próprio | Admin | Admin | Admin |
| `client_assignments` | Admin/gerente: todos; estrategista/atendimento: próprias | Admin/gerente | Admin/gerente | Admin |
| `products` | Equipe interna: todos; cliente: contratados | Admin | Admin | Admin |
| `deliverables` | Equipe interna: todos; cliente: visíveis | Admin | Admin | Admin |
| `client_products` | Admin/gerente: todos; estrategista/atendimento: atribuídos; cliente: próprios | Admin | Admin | Admin |
| `deliveries` | Admin/gerente: todos; estrategista: dos seus clientes; atendimento: da carteira; cliente: próprias | Sistema | Estrategista (próprias); admin/gerente | Admin |
| `delivery_versions` | Mesma regra de deliveries | Estrategista (próprias) | — | Admin |
| `delivery_content_items` | Mesma regra de delivery_versions | Estrategista | Estrategista (própria versão) | Admin |
| `delivery_approvals` | Equipe interna: todos; cliente: próprias | Cliente | — | Admin |
| `delivery_comments` | Equipe: todos; cliente: apenas `visivel_cliente=true` | Equipe | Próprio comentário | Admin |
| `nps_surveys` | Admin/gerente: todos; atendimento: carteira; cliente: próprias | Admin/sistema | Admin | Admin |
| `nps_responses` | Admin/gerente: todos; atendimento: carteira; cliente: próprias | Cliente | — | Admin |
| `trails` | Interno: tipo=interno; cliente: vinculadas ao produto | Admin | Admin | Admin |
| `lesson_progress` | Próprio registro | Sistema | Sistema | Admin |
| `notifications` | Próprio registro | Sistema | Próprio (marcar como lida) | Admin |
| `audit_logs` | Admin apenas | Sistema | — | — |

---

## 6. Arquitetura e estrutura de pastas

```
src/
├── components/
│   ├── ui/                        → componentes shadcn/ui
│   ├── layout/                    → Layout, Header, Sidebar, Footer
│   ├── deliveries/                → componentes de entregas
│   ├── kanban/                    → Kanban e Calendário
│   ├── approvals/                 → fluxo de aprovação
│   ├── nps/                       → pesquisas NPS
│   ├── trails/                    → trilhas e aulas
│   ├── reports/                   → relatórios
│   └── notifications/             → sino e lista de notificações
├── hooks/
│   ├── useAuth.ts
│   ├── useDeliveries.ts
│   ├── useClients.ts
│   ├── useNotifications.ts
│   └── useNPS.ts
├── integrations/
│   └── supabase/
│       ├── client.ts
│       └── types.ts               → gerado via Supabase CLI
├── lib/
│   └── utils.ts                   → cn(), formatters, helpers
├── pages/
│   ├── auth/
│   │   ├── Login.tsx
│   │   ├── ForgotPassword.tsx
│   │   └── ResetPassword.tsx
│   ├── admin/
│   │   ├── Dashboard.tsx
│   │   ├── Products.tsx
│   │   ├── Clients.tsx
│   │   ├── Users.tsx
│   │   ├── Reports.tsx
│   │   └── Settings.tsx
│   ├── manager/
│   │   ├── Dashboard.tsx
│   │   ├── Performance.tsx
│   │   └── Portfolio.tsx
│   ├── strategist/
│   │   ├── Agenda.tsx
│   │   ├── Clients.tsx
│   │   └── Delivery.tsx
│   ├── account/
│   │   ├── Clients.tsx
│   │   └── ClientDetail.tsx
│   └── client-portal/
│       ├── Dashboard.tsx
│       ├── Kanban.tsx
│       ├── Calendar.tsx
│       ├── Deliveries.tsx
│       ├── DeliveryDetail.tsx
│       ├── Trails.tsx
│       └── TrailDetail.tsx
│   └── empire-chat/
│       ├── Inbox.tsx
│       ├── ConversationView.tsx
│       ├── Dashboard.tsx
│       ├── Contacts.tsx
│       ├── ContactDetail.tsx
│       ├── Groups.tsx
│       ├── Campaigns.tsx
│       ├── Reports.tsx
│       └── settings/
│           ├── Instances.tsx
│           ├── Departments.tsx
│           ├── BusinessHours.tsx
│           ├── QuickReplies.tsx
│           ├── Templates.tsx
│           ├── Automations.tsx
│           ├── AISettings.tsx
│           ├── APIKeys.tsx
│           └── Webhooks.tsx
├── contexts/
│   ├── AuthContext.tsx
│   └── NotificationsContext.tsx
├── types/
│   └── index.ts                   → interfaces e types globais
├── App.tsx                        → roteamento principal
├── main.tsx
└── index.css                      → tokens CSS do design system

supabase/
├── config.toml
├── migrations/
└── functions/
    ├── send-notification/         → envio de e-mails
    ├── generate-deliveries/       → geração automática de entregas
    ├── nps-scheduler/             → agendamento de NPS
    ├── open-graph-preview/        → scraping para preview de links
    ├── export-report/             → geração de PDF/CSV para relatórios
    │
    │   [EmpireChat — UAZAPI]
    ├── uazapi-webhook/            → recebe todos os eventos da UAZAPI
    ├── uazapi-send-message/       → envia mensagens via UAZAPI (com token seguro)
    ├── uazapi-manage-instance/    → cria/conecta/desconecta instâncias, QR code
    │
    │   [EmpireChat — IA / OpenRouter]
    ├── ia-analyze-message/        → análise de sentimento em tempo real
    ├── ia-suggest-reply/          → sugestão de resposta para agente
    ├── ia-summarize-conversation/ → resumo automático ao encerrar conversa
    ├── ia-classify-conversation/  → classificação de assunto após encerramento
    ├── openrouter-list-models/    → lista modelos disponíveis no OpenRouter
    │
    │   [EmpireChat — API e Webhooks]
    ├── chat-api-gateway/          → API REST pública (autenticada por API key)
    ├── chat-webhook-dispatcher/   → dispara webhooks externos com HMAC-SHA256
    │
    │   [EmpireChat — Automações]
    ├── chat-broadcast-scheduler/  → processa campanhas em massa com delay
    ├── chat-sla-monitor/          → cron: verifica SLAs e dispara alertas
    └── chat-csat-dispatcher/      → dispara mensagem CSAT após encerramento
    │
    │   [EmpireCobrança]
    ├── cobranca-scheduler/        → cron: verifica próximos envios da régua, respeita janela horária e limite 60/hora
    ├── cobranca-send-message/     → envia mensagem de cobrança via UAZAPI (token separado nos Supabase Secrets)
    ├── cobranca-ia-variacao/      → gera variação única de mensagem de cobrança via OpenRouter
    └── cobranca-webhook/          → recebe eventos UAZAPI das instâncias de cobrança
    │
    │   [Empire IA Bot]
    ├── ia-bot-check-activation/   → verifica se conversa deve ativar o bot (regras de ativação)
    ├── ia-bot-respond/            → processa mensagem, monta contexto, chama OpenRouter, tool calls em loop (máx 5 iter), envia resposta
    ├── ia-bot-execute-tool/       → executa tool call individual (interna ou webhook externo)
    └── ia-bot-upload-document/    → processa PDF/URL de documento de contexto, gera resumo, estima tokens

public/
.env.example
.env
vite.config.ts
tailwind.config.ts
tsconfig.json
components.json
```

---

## 7. Telas do sistema

### 7.1 Área Pública
- Login
- Esqueci minha senha
- Redefinir senha

### 7.2 Área do Admin
- Dashboard geral (entregas, aprovações pendentes, NPS, alertas)
- Gestão de produtos (listar, criar, editar, arquivar)
- Gestão de entregáveis por produto
- Gestão de clientes (listar, criar, editar)
- Detalhe do cliente (produtos, entregas, Kanban interno, NPS, avaliações)
- Gestão de usuários
- Kanban/Calendário consolidado (todos os clientes)
- Trilhas de clientes (criar, editar módulos e aulas)
- Trilhas internas (criar, editar módulos e aulas)
- Configuração de NPS (frequência, templates, disparo manual)
- Relatórios (todos os módulos, com exportação)
- Configurações gerais
- Logs de auditoria

### 7.3 Área do Gerente
- Dashboard geral (igual ao admin, sem editar configurações)
- Kanban/Calendário consolidado com filtros por cliente e estrategista
- Painel de performance por estrategista
- Painel de saúde da carteira (NPS + semáforo de entregas)
- Detalhe do cliente (leitura + comentários internos)
- Detalhe de entrega (histórico de versões, feedbacks, comentários internos)
- Acompanhamento de trilhas internas da equipe
- Relatórios

### 7.4 Área do Estrategista
- Minha agenda (próximos prazos + conteúdos aguardando revisão)
- Lista de meus clientes
- Detalhe do cliente (entregas + Kanban + histórico)
- Detalhe da entrega (subir versão, histórico, feedbacks do cliente)
- Upload de conteúdo rico (editor com todos os tipos)
- Trilhas internas
- Meu perfil

### 7.5 Área do Atendimento
- Lista de clientes da minha carteira
- Detalhe do cliente (entregas, NPS, avaliações, histórico de interações)
- Registro de interação
- Meu perfil

### 7.6 Portal do Cliente
- Dashboard (resumo do mês: aprovados, pendentes, publicados)
- Kanban com drag-and-drop
- Calendário por data de publicação
- Lista de entregas (tabela com filtros)
- Detalhe de entrega (todos os itens de conteúdo, histórico de versões, aprovar/rejeitar, nota, feedback)
- Histórico de entregas passadas com feedbacks
- Minhas trilhas (lista com progresso)
- Detalhe da trilha (módulos, aulas, player)
- Meu perfil

---

## 8. Edge Functions planejadas

| Edge Function | Responsabilidade |
|---|---|
| `send-notification` | Envio de e-mails (notificações, alertas, NPS). Usar fila. Integrar com Resend ou similar. |
| `generate-deliveries` | Geração automática de entregas futuras quando cliente é vinculado a produto. Rodar periodicamente (cron). |
| `nps-scheduler` | Verificar quais clientes têm NPS vencido e disparar pesquisas automaticamente. |
| `open-graph-preview` | Fazer scraping de Open Graph ao cadastrar um link externo em entrega. |
| `export-report` | Gerar PDF ou CSV de relatórios sob demanda. |
| `uazapi-webhook` | **[EmpireChat]** Recebe todos os eventos da UAZAPI (mensagens, status, grupos, QR code). Valida o token da instância, processa o evento, salva no banco, dispara realtime e gatilhos de automação. |
| `uazapi-send-message` | **[EmpireChat]** Envia mensagem via UAZAPI REST API. Recebe parâmetros do sistema, busca o token da instância nos Secrets, chama a UAZAPI. Nunca expõe o token ao cliente. |
| `uazapi-manage-instance` | **[EmpireChat]** Cria, conecta e desconecta instâncias UAZAPI. Gerencia QR code polling. |
| `ia-analyze-message` | **[EmpireChat/IA]** Analisa sentimento de mensagem via OpenRouter. Atualiza `ia_score_satisfacao` e dispara alertas se threshold for violado. |
| `ia-suggest-reply` | **[EmpireChat/IA]** Gera 2-3 sugestões de resposta para a conversa atual via OpenRouter. |
| `ia-summarize-conversation` | **[EmpireChat/IA]** Gera resumo automático ao encerrar conversa via OpenRouter. |
| `ia-classify-conversation` | **[EmpireChat/IA]** Classifica o assunto da conversa em categorias após encerramento. |
| `openrouter-list-models` | **[EmpireChat/IA]** Consulta endpoint de modelos do OpenRouter e retorna lista atualizada para o painel admin. |
| `chat-api-gateway` | **[EmpireChat]** Gateway da API pública REST do EmpireChat. Valida API keys, executa ações (enviar mensagem, listar conversas, etc.). |
| `chat-webhook-dispatcher` | **[EmpireChat]** Dispara webhooks externos quando eventos ocorrem. Assina payload com HMAC-SHA256. Registra log. |
| `chat-broadcast-scheduler` | **[EmpireChat]** Processa campanhas de disparo em massa respeitando o intervalo entre envios. |
| `chat-sla-monitor` | **[EmpireChat]** Roda periodicamente (cron). Verifica SLAs de conversas ativas, dispara alertas e atualiza flags de violação. |
| `chat-csat-dispatcher` | **[EmpireChat]** Disparado após encerramento de conversa. Aguarda o delay configurado e envia mensagem de CSAT via UAZAPI. |

> **Antes de implementar qualquer Edge Function:** consultar a documentação oficial do Supabase Edge Functions em https://supabase.com/docs/guides/functions. Chaves de API de terceiros ficam exclusivamente em Supabase Secrets — nunca no cliente.
>
> **Para Edge Functions do EmpireChat:** usar Playwright para pesquisar documentação da UAZAPI e do OpenRouter antes de implementar. Os tokens UAZAPI e a chave OpenRouter ficam EXCLUSIVAMENTE em Supabase Secrets.

---

## 9. Design system

- Todo token de cor definido como variável CSS em `src/index.css`
- Mapeados no `tailwind.config.ts` seguindo o padrão shadcn/ui
- Tokens: `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--radius`
- **Nunca usar cores hardcoded em nenhum arquivo**
- Componentes shadcn/ui são a base — personalizar via tokens, não via CSS avulso
- `<Skeleton />` do shadcn/ui obrigatório em todos os componentes com dados assíncronos
- Design **mobile-first** — responsivo em todos os breakpoints padrão do Tailwind
- Todos os formulários usam **React Hook Form + Zod**

---

## 10. Variáveis de ambiente

O arquivo `.env.example` deve ser criado com o seguinte conteúdo (valores em branco):

```env
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# E-mail (Resend ou similar — apenas em Edge Functions, não no cliente)
# RESEND_API_KEY=  → definir em Supabase Secrets, nunca aqui

# Storage (S3 / Cloudflare R2 — apenas em Edge Functions)
# STORAGE_ACCESS_KEY=  → definir em Supabase Secrets
# STORAGE_SECRET_KEY=  → definir em Supabase Secrets
# STORAGE_BUCKET=      → definir em Supabase Secrets

# EmpireChat — UAZAPI (apenas em Edge Functions via Supabase Secrets)
# UAZAPI_BASE_URL=     → URL base da UAZAPI (ex: https://api.uazapi.dev)
# UAZAPI_API_KEY=      → Chave de admin da UAZAPI → Supabase Secret
# Tokens EmpireChat por instância    → Supabase Secrets com chave: UAZAPI_TOKEN_{instance_id}
# Tokens EmpireCobrança por instância → Supabase Secrets com chave: COBRANCA_TOKEN_{instance_id}

# EmpireChat — OpenRouter (apenas em Edge Functions via Supabase Secrets)
# OPENROUTER_API_KEY=  → Supabase Secret — NUNCA no cliente ou no .env do projeto
```

O `.env` real nunca vai ao repositório. O `.gitignore` deve incluí-lo desde o primeiro commit.

---

## 11. Segurança

### Regras absolutas
- Nenhuma chave, senha ou token hardcoded em nenhuma hipótese
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são as únicas variáveis do Supabase no cliente
- Chaves de APIs de terceiros exclusivamente em Supabase Secrets → Edge Functions
- `.env` no `.gitignore` desde o primeiro commit
- Nenhum dado sensível aparece em logs ou no console

### Autenticação e autorização
- Todas as rotas privadas usam `<ProtectedRoute>` que verifica sessão ativa
- Sessão gerenciada pelo Supabase Auth
- Permissões verificadas no banco via RLS — nunca apenas no cliente
- Perfis de usuário gerenciados via tabela `users` + RLS policies

### Banco de dados
- RLS ativado em **todas** as tabelas com dados de usuário
- Nenhuma query expõe dados de outros usuários
- Inputs validados com Zod antes de qualquer operação no banco
- Migrations versionadas em `supabase/migrations/`

---

## 12. Roadmap de desenvolvimento

Cada fase deve estar 100% funcional antes de começar a próxima.

| Fase | Nome | Entregáveis | Prioridade |
|---|---|---|---|
| 1 | Base do sistema | Login, perfis, controle de acesso rigoroso, cadastro de clientes e usuários | 🔴 Alta |
| 2 | Produtos e Entregáveis | Cadastro de produtos, entregáveis, geração automática de entregas | 🔴 Alta |
| 3 | Conteúdo Rico | Upload e exibição de todos os tipos de conteúdo, histórico de versões | 🔴 Alta |
| 4 | Fluxo de Aprovação | Aprovação/rejeição, nota de estrelas, feedback, notificações | 🔴 Alta |
| 5 | Portal do Cliente | Dashboard, lista de entregas, detalhe com visualização e interação | 🔴 Alta |
| 6 | Kanban e Calendário | Drag-and-drop no portal, calendário, visão consolidada para equipe | 🟡 Média |
| 7 | NPS | Pesquisa periódica, pós-entrega e manual, popup, classificação e relatório | 🟡 Média |
| 8 | Notificações | E-mails e notificações internas para todos os gatilhos | 🟡 Média |
| 9 | Trilhas para Clientes | Cadastro de trilhas, módulos e aulas, vinculação a produtos, progresso | 🟡 Média |
| 10 | Trilhas Internas | Trilhas da equipe, atribuição por perfil e prazo, acompanhamento | 🟢 Baixa |
| 11 | Relatórios | Todos os relatórios com exportação em PDF e CSV | 🟢 Baixa |
| 12 | Refinamentos | Registro de interações, logs de auditoria, resumo diário por e-mail | 🟢 Baixa |
| 13 | EmpireChat — Base | Instâncias UAZAPI, webhook de entrada, inbox básica, envio/recebimento de mensagens, departamentos | 🔴 Alta |
| 14 | EmpireChat — Conversas | Atribuição, transferência, notas internas, status em tempo real (Supabase Realtime), histórico | 🔴 Alta |
| 15 | EmpireChat — IA | Integração OpenRouter, seleção de modelo no painel, análise de sentimento, sugestão de resposta, alertas | 🔴 Alta |
| 16 | EmpireChat — Métricas | Dashboard em tempo real, TMA/TMR, CSAT, score IA, relatórios de atendimento | 🟡 Média |
| 17 | EmpireChat — Automações | Regras de bot, horários de atendimento, respostas automáticas, CSAT automático | 🟡 Média |
| 18 | EmpireChat — API e Webhooks | API REST pública, webhooks de saída com HMAC, API keys gerenciáveis | 🟡 Média |
| 19 | EmpireChat — Campanhas | Disparos em massa, agendamento, relatório de campanha | 🟢 Baixa |
| 20 | EmpireChat — Grupos | Suporte a grupos WhatsApp, atribuição a departamentos | 🟢 Baixa |

| 21 | EmpireCobrança — Base | Instâncias, devedores, réguas, envio automático com intervalo aleatório e limite 60/hora | 🔴 Alta |
| 22 | EmpireCobrança — IA | Variação de mensagem por IA (OpenRouter), seleção de modelo no painel | 🔴 Alta |
| 23 | EmpireCobrança — Inbox | Inbox de conversas de cobrança, atribuição a agentes, anotações | 🟡 Média |
| 24 | EmpireCobrança — Relatórios | Importação CSV, dashboard, relatórios com exportação | 🟡 Média |
| 25 | Empire IA Bot — Base | Configuração de bots, regras de ativação, toggle por conversa, prompt + documentos de contexto | 🟡 Média |
| 26 | Empire IA Bot — Tool Calls | Tools internas e externas via webhook, loop de execução, logs | 🟡 Média |
| 27 | Empire IA Bot — Playground | Interface de teste de bot sem envio real, logs de execução | 🟢 Baixa |
| 28 | Contratos — Página Dedicada | Visão cross-client com filtros, MRR cards, busca, export CSV | 🔴 Alta |
| 29 | Comissões — Módulo Completo | Regras por produto/papel, cálculo automático, aprovação, dashboard, visão vendedor | 🔴 Alta |
| 30 | Contratos & Comissões — Relatórios | MRR/ARR, churn, ranking vendedores, comissões por usuário, inadimplência | 🟡 Média |
| 31 | Migração Notion → EmpireDesk | Script de importação, validação, período paralelo, go-live | 🔴 Alta |

---

## 13. Ordem de execução recomendada

```
1. Setup do projeto (Vite + React + TS + Tailwind + shadcn/ui)
2. Design system (tokens CSS + tailwind.config.ts + index.css)
3. Schema do Supabase (tabelas + migrations + RLS policies)
4. Autenticação (Supabase Auth + AuthContext + ProtectedRoute)
5. Componentes base (Layout, Header, Footer, Sidebar, rotas por perfil)
6. Módulo de Produtos e Entregáveis (admin)
7. Módulo de Clientes e Atribuições (admin)
8. Geração automática de entregas (Edge Function)
9. Upload de conteúdo rico + histórico de versões (estrategista)
10. Fluxo de aprovação completo (cliente + notificações básicas)
11. Portal do Cliente (dashboard, lista, detalhe de entrega)
12. Kanban com drag-and-drop + Calendário
13. NPS (pesquisas, popup, relatório)
14. Notificações completas (e-mail via Edge Function + notificações internas)
15. Trilhas para Clientes
16. Trilhas Internas da equipe
17. Relatórios completos + exportação
18. Registro de interações + logs de auditoria
19. Polish, testes e deploy
```

---

## 14. Estrutura de documentação a criar durante a execução

Ao iniciar o projeto, criar os seguintes arquivos na pasta `docs/`:

```
docs/
├── prd.md                           → este documento — somente leitura
├── claude.md                        → regras de comportamento da IA
├── arquitetura.md                   → arquitetura completa do sistema
├── design-system.md                 → tokens, componentes shadcn/ui, padrões visuais
├── banco-de-dados.md                → schema, RLS policies, migrations, Edge Functions
├── integracoes.md                   → serviços externos e Edge Functions correspondentes
├── seguranca.md                     → regras e checklists de segurança
│
└── roadmap/
    ├── _index.md                    → painel de controle: épicos, DAG, progresso global
    │
    ├── grupo-01-foundation/
    │   ├── G01-T01_TODO_0%_setup-projeto.md
    │   ├── G01-T02_TODO_0%_design-system-tokens.md
    │   ├── G01-T03_TODO_0%_supabase-schema-migrations.md
    │   └── G01-T04_TODO_0%_autenticacao-perfis.md
    │
    ├── grupo-02-admin-core/
    │   ├── G02-T01_TODO_0%_produtos-entregaveis.md
    │   ├── G02-T02_TODO_0%_clientes-atribuicoes.md
    │   └── G02-T03_TODO_0%_gestao-usuarios.md
    │
    ├── grupo-03-entregas/
    │   ├── G03-T01_TODO_0%_geracao-automatica-entregas.md
    │   ├── G03-T02_TODO_0%_upload-conteudo-rico.md
    │   ├── G03-T03_TODO_0%_historico-versoes.md
    │   └── G03-T04_TODO_0%_fluxo-aprovacao.md
    │
    ├── grupo-04-portal-cliente/
    │   ├── G04-T01_TODO_0%_dashboard-cliente.md
    │   ├── G04-T02_TODO_0%_lista-entregas.md
    │   ├── G04-T03_TODO_0%_detalhe-entrega.md
    │   ├── G04-T04_TODO_0%_kanban-drag-and-drop.md
    │   └── G04-T05_TODO_0%_calendario-publicacao.md
    │
    ├── grupo-05-nps/
    │   ├── G05-T01_TODO_0%_pesquisa-nps-portal.md
    │   └── G05-T02_TODO_0%_relatorio-nps.md
    │
    ├── grupo-06-notificacoes/
    │   ├── G06-T01_TODO_0%_notificacoes-internas.md
    │   └── G06-T02_TODO_0%_email-edge-function.md
    │
    ├── grupo-07-trilhas/
    │   ├── G07-T01_TODO_0%_trilhas-clientes.md
    │   └── G07-T02_TODO_0%_trilhas-internas.md
    │
    ├── grupo-08-relatorios/
    │   └── G08-T01_TODO_0%_relatorios-exportacao.md
    │
    ├── grupo-09-refinamentos/
    │   ├── G09-T01_TODO_0%_registro-interacoes.md
    │   └── G09-T02_TODO_0%_logs-auditoria.md
    │
    ├── grupo-10-empirechat-base/
    │   ├── G10-T01_TODO_0%_uazapi-instancias-webhook.md
    │   ├── G10-T02_TODO_0%_contatos-e-conversas.md
    │   ├── G10-T03_TODO_0%_inbox-realtime.md
    │   ├── G10-T04_TODO_0%_departamentos-e-atribuicao.md
    │   └── G10-T05_TODO_0%_envio-recebimento-midias.md
    │
    ├── grupo-11-empirechat-ia/
    │   ├── G11-T01_TODO_0%_openrouter-integracao.md
    │   ├── G11-T02_TODO_0%_analise-sentimento-tempo-real.md
    │   ├── G11-T03_TODO_0%_sugestao-resposta-ia.md
    │   ├── G11-T04_TODO_0%_resumo-classificacao-ia.md
    │   └── G11-T05_TODO_0%_alertas-insatisfacao-ia.md
    │
    ├── grupo-12-empirechat-metricas/
    │   ├── G12-T01_TODO_0%_dashboard-atendimento-realtime.md
    │   ├── G12-T02_TODO_0%_csat-pesquisa-satisfacao.md
    │   └── G12-T03_TODO_0%_relatorios-atendimento.md
    │
    ├── grupo-13-empirechat-automacoes/
    │   ├── G13-T01_TODO_0%_regras-bot-automacoes.md
    │   ├── G13-T02_TODO_0%_horarios-atendimento.md
    │   └── G13-T03_TODO_0%_respostas-rapidas-templates.md
    │
    ├── grupo-14-empirechat-api/
    │   ├── G14-T01_TODO_0%_api-rest-publica.md
    │   ├── G14-T02_TODO_0%_webhooks-externos-hmac.md
    │   └── G14-T03_TODO_0%_api-keys-gerenciamento.md
    │
    ├── grupo-15-empirechat-extras/
    │   ├── G15-T01_TODO_0%_campanhas-disparo-massa.md
    │   └── G15-T02_TODO_0%_suporte-grupos-whatsapp.md
    │
    ├── grupo-16-cobranca-base/
    │   ├── G16-T01_TODO_0%_cobranca-instancias-uazapi.md
    │   ├── G16-T02_TODO_0%_cobranca-devedores-reguas.md
    │   ├── G16-T03_TODO_0%_cobranca-envio-automatico.md
    │   └── G16-T04_TODO_0%_cobranca-ia-variacao.md
    │
    ├── grupo-17-cobranca-gestao/
    │   ├── G17-T01_TODO_0%_cobranca-inbox-conversas.md
    │   ├── G17-T02_TODO_0%_cobranca-importacao-csv.md
    │   └── G17-T03_TODO_0%_cobranca-relatorios.md
    │
    ├── grupo-16-cobranca-base/
    │   ├── G16-T01_TODO_0%_cobranca-instancias-uazapi.md
    │   ├── G16-T02_TODO_0%_cobranca-devedores-reguas.md
    │   ├── G16-T03_TODO_0%_cobranca-envio-automatico.md
    │   └── G16-T04_TODO_0%_cobranca-ia-variacao.md
    │
    ├── grupo-17-cobranca-gestao/
    │   ├── G17-T01_TODO_0%_cobranca-inbox-conversas.md
    │   ├── G17-T02_TODO_0%_cobranca-importacao-csv.md
    │   └── G17-T03_TODO_0%_cobranca-relatorios.md
    │
    ├── grupo-18-ia-bot/
    │   ├── G18-T01_TODO_0%_ia-bot-config-regras.md
    │   ├── G18-T02_TODO_0%_ia-bot-documentos-contexto.md
    │   ├── G18-T03_TODO_0%_ia-bot-tool-calls.md
    │   └── G18-T04_TODO_0%_ia-bot-playground-logs.md
    │
    └── mudancas/                    → Feature Requests (FR-001, FR-002...)
```

### DAG de dependências

```
G01-T01 (setup: Vite + React + TS + Tailwind + shadcn/ui)
    ├──> G01-T02 (design-system: tokens CSS)          ─┐ paralelos
    └──> G01-T03 (supabase: schema + migrations + RLS) ─┘
              └──> G01-T04 (autenticação: Supabase Auth + ProtectedRoute)
                        ├──> G02-T01 (produtos e entregáveis) ─┐
                        ├──> G02-T02 (clientes e atribuições)  │ paralelos
                        └──> G02-T03 (gestão de usuários)     ─┘
                                  └──> G03-T01 (geração automática de entregas)
                                            ├──> G03-T02 (upload conteúdo rico) ─┐
                                            └──> G03-T03 (histórico de versões) ─┘ paralelos
                                                      └──> G03-T04 (fluxo de aprovação)
                                                                └──> G04-T01 (dashboard cliente)
                                                                └──> G04-T02 (lista de entregas)
                                                                └──> G04-T03 (detalhe de entrega)
                                                                          ├──> G04-T04 (kanban)
                                                                          └──> G04-T05 (calendário)
                                                                                    └──> G05, G06, G07, G08, G09
                                                                                              │
                                                                                              │  [EmpireChat — pode desenvolver em paralelo após G01-T04]
                                                                                              ├──> G10-T01 (UAZAPI webhook + instâncias)
                                                                                              │       ├──> G10-T02 (contatos e conversas)
                                                                                              │       └──> G10-T03 (inbox Realtime)
                                                                                              │               ├──> G10-T04 (departamentos e atribuição)
                                                                                              │               └──> G10-T05 (envio/recebimento de mídias)
                                                                                              │                       ├──> G11 (IA/OpenRouter) ─┐
                                                                                              │                       └──> G12 (métricas/CSAT)  │ paralelos
                                                                                              │                                 └──> G13 (automações)
                                                                                              │                                       └──> G14 (API/webhooks)
                                                                                              │                                             └──> G15 (campanhas + grupos)
```

---

## 15. Regras de comportamento da IA (`claude.md`)

Criar o arquivo `docs/claude.md` com o seguinte conteúdo:

```markdown
# Regras de comportamento da IA — EmpireDesk

## Stack (inegociável)
Este projeto usa EXCLUSIVAMENTE: React 18+ · TypeScript strict · Vite · Tailwind CSS ·
shadcn/ui · Lucide React · Supabase · React Router v6 · TanStack Query v5 · Zustand
NUNCA usar Next.js, Angular, Vue, Bootstrap, MUI, jQuery ou qualquer tecnologia
fora desta lista sem instrução explícita.

## Antes de qualquer tarefa
1. SEMPRE ler docs/roadmap/_index.md para entender o estado global
2. SEMPRE ler o arquivo da story específica antes de implementar
3. SEMPRE ler docs/seguranca.md antes de qualquer feature com dados, autenticação ou comunicação externa
4. SEMPRE ler docs/banco-de-dados.md antes de qualquer operação no Supabase
5. NUNCA iniciar tarefa com status BLOCKED sem resolver o bloqueio primeiro

## Durante a implementação
6. NUNCA editar feature existente sem abrir um FR em docs/roadmap/mudancas/
7. NUNCA usar cores hardcoded — apenas tokens do design system via Tailwind CSS
8. SEMPRE criar <Skeleton /> do shadcn/ui para componentes com dados assíncronos
9. NUNCA criar Edge Functions ou integrações sem documentação oficial confirmada
10. NUNCA hardcodar chaves, senhas ou tokens — sempre variáveis de ambiente
11. NUNCA expor chaves de API de terceiros no cliente — sempre via Edge Functions
12. SEMPRE usar React Hook Form + Zod em formulários
13. SEMPRE criar RLS policies no Supabase para toda nova tabela com dados de usuário
14. SEMPRE versionar mudanças de schema via migrations em supabase/migrations/
15. SEMPRE regenerar src/integrations/supabase/types.ts após mudanças no schema
16. NUNCA usar `any` em TypeScript — tipar tudo corretamente
17. NUNCA deixar um estrategista acessar dados de clientes que não são seus — nem por URL, nem por API

## Quando o usuário pedir qualquer mudança
18. SEMPRE criar o registro FR em docs/roadmap/mudancas/ antes de tocar em qualquer arquivo
19. SEMPRE mapear o impacto completo: stories, épicos, DAG, schema do banco
20. SEMPRE apresentar o impacto ao usuário em linguagem simples
21. SEMPRE aguardar confirmação explícita antes de implementar
22. NUNCA apagar arquivos de story ou épico — apenas marcar como SKIP
23. SEMPRE registrar histórico de status em cada story alterada
24. SEMPRE recalcular o DAG após qualquer mudança que afete dependências

## Ao terminar uma tarefa
25. Verificar TODOS os critérios de aceitação antes de marcar como DONE
26. Aplicar checklist de qualidade mínima — nenhum item pode ser pulado
27. Aplicar checklist de segurança — marcar os itens relevantes
28. Atualizar status e % de progresso no arquivo da story
29. Atualizar progresso do épico no _index.md
30. Atualizar arquitetura.md se algo estrutural mudou
31. Atualizar banco-de-dados.md se o schema do Supabase mudou
32. Registrar decisões e problemas no arquivo da story

## Nunca, em hipótese alguma
33. NUNCA editar docs/prd.md — somente leitura
34. NUNCA expor dados sensíveis em logs ou no console
35. NUNCA marcar tarefa como DONE sem passar pelos três checklists:
    critérios de aceitação + qualidade mínima + segurança
36. NUNCA apagar arquivos do roadmap — o histórico é permanente
37. NUNCA editar o banco de dados diretamente — sempre via migration versionada
38. NUNCA colocar chaves de API de terceiros no código do cliente

## Regras específicas do módulo EmpireChat
39. NUNCA armazenar tokens UAZAPI no banco de dados — usar Supabase Secrets exclusivamente
40. NUNCA chamar a UAZAPI diretamente do cliente — SEMPRE via Edge Function
41. NUNCA expor a chave do OpenRouter no cliente — SEMPRE via Edge Function
42. SEMPRE pesquisar documentação da UAZAPI via Playwright antes de implementar qualquer endpoint
43. SEMPRE pesquisar documentação do OpenRouter via Playwright antes de implementar qualquer chamada de IA
44. NUNCA processar eventos UAZAPI sem validar o token da instância nos Supabase Secrets
45. SEMPRE usar Supabase Realtime para atualizar a inbox sem refresh
46. NUNCA disparar campanhas em massa sem verificar o intervalo mínimo entre envios
47. SEMPRE assinar webhooks externos com HMAC-SHA256 usando o secret configurado
48. SEMPRE registrar log de disparos de webhook com status HTTP da resposta

## Regras específicas do módulo EmpireCobrança
49. NUNCA armazenar tokens UAZAPI de cobrança no banco — usar Supabase Secrets com prefixo COBRANCA_TOKEN_{instance_id}
50. NUNCA misturar instâncias do EmpireChat com instâncias do EmpireCobrança
51. NUNCA permitir que agente_cobranca ou admin_cobranca acesse tabelas fora do escopo cobranca_*
52. SEMPRE respeitar o teto de 60 mensagens/hora por instância — CHECK constraint no banco E validação na Edge Function
53. SEMPRE sortear o intervalo entre intervalo_min_segundos e intervalo_max_segundos — nunca usar intervalo fixo
54. SEMPRE salvar a mensagem final enviada em cobranca_sends.mensagem_enviada para auditoria
55. NUNCA enviar mensagens de cobrança fora da janela horária configurada na instância

## Regras específicas do módulo Empire IA Bot
56. NUNCA ativar um bot por padrão — ativo = false em todas as inserções em ia_bots
57. SEMPRE verificar ia_bot_conversation_overrides antes de processar mensagem com bot
58. SEMPRE verificar ia_bot_activation_rules antes de ativar o bot em qualquer conversa
59. NUNCA expor a chave OpenRouter na ia-bot-respond — usar Supabase Secrets
60. SEMPRE salvar log em ia_bot_execution_logs para cada execução (tokens, tools, escalada)
61. SEMPRE implementar limite de 5 iterações de tool calls por rodada para evitar loops infinitos
62. NUNCA enviar mensagem como bot se pausado = true em ia_bot_conversation_overrides
63. SEMPRE usar o modelo configurado em ia_bots.modelo_openrouter — nunca hardcodar modelo
64. SEMPRE marcar mensagens geradas pelo bot com enviado_por_ia = true
```

---

## 16. Como pedir mudanças

Use sempre este formato:

```
Quero fazer uma mudança no sistema.

O que quero mudar:
[descreva aqui]

Por quê:
[motivo, mesmo que simples]
```

A IA vai:
1. Criar o registro da mudança em `docs/roadmap/mudancas/`
2. Mapear tudo que essa mudança afeta (stories, épicos, DAG, banco de dados)
3. Mostrar o impacto em linguagem simples e pedir confirmação
4. Só então executar — atualizando toda a documentação junto

**Nunca:**
- Pedir para a IA "só mudar rapidinho" sem seguir o protocolo
- Editar manualmente `docs/prd.md`
- Pular a etapa de confirmação de impacto
- Hardcodar qualquer cor, chave ou credencial no código

---

## 17. Dicas técnicas para o desenvolvedor

**Controle de acesso:** implemente na Fase 1. Cada query no banco deve filtrar pelo usuário logado. Trate isso como requisito zero-falha.

**Status da entrega:** calcule dinamicamente — não salve como campo fixo. "Aguardando aprovação" é inferido quando existe `delivery_version` sem `delivery_approval` associado.

**Kanban e drag-and-drop:** use `dnd-kit` (React). O drag é uma forma visual de executar ações já existentes. Não crie estado de Kanban separado — use `kanban_overrides` apenas para overrides manuais.

**Upload de arquivos:** armazene em serviço externo (Supabase Storage, S3 ou Cloudflare R2). Nunca no servidor da aplicação. Salve apenas a URL no banco.

**Links externos:** faça scraping do Open Graph na hora do cadastro via Edge Function para exibir preview (título, thumbnail). Para YouTube/Vimeo, extraia o ID e use iframe embed.

**NPS:** não exiba no primeiro login nem logo após evento negativo. Configure delay mínimo. Registre quando o cliente fechou sem responder para não exibir novamente no mesmo dia.

**E-mails:** use fila. Agrupe notificações do mesmo tipo em sequência rápida (5 aprovações em 2 minutos = 1 e-mail, não 5).

**Calendário vs prazo:** `data_publicacao` é quando o conteúdo vai ao ar. `prazo` é quando o estrategista deve entregar. O calendário do cliente usa `data_publicacao`. O painel interno usa `prazo`.

**Tipos TypeScript:** regenerar `src/integrations/supabase/types.ts` sempre que o schema mudar via `supabase gen types typescript`. Nunca editar manualmente.

**UAZAPI — tokens de instância:** nunca armazenar em colunas do banco. Usar Supabase Secrets com a chave `UAZAPI_TOKEN_{instance_id}`. A Edge Function `uazapi-send-message` busca o token pelo `instance_id` nos Secrets antes de cada chamada.

**OpenRouter — seleção de modelo:** o modelo não deve ser hardcoded. Armazene na tabela `chat_ia_config` e leia a cada chamada de IA. Isso permite que o admin troque o modelo sem redeploy.

**Webhook UAZAPI — performance:** a Edge Function `uazapi-webhook` deve responder com HTTP 200 imediatamente após receber o evento e processar o conteúdo de forma assíncrona. Se a UAZAPI não receber resposta rápida, pode retentar e gerar duplicatas. Use Supabase `message_id_wpp` como chave de idempotência (upsert) para evitar mensagens duplicadas.

**Realtime no EmpireChat:** usar Supabase Realtime em tabelas `conversations` e `chat_messages`. O frontend deve se inscrever no canal da conversa ativa e nos canais do departamento do agente logado. Não fazer polling — usar apenas Realtime.

**EmpireCobrança — separação de tokens:** os tokens UAZAPI das instâncias de cobrança ficam em Supabase Secrets com prefixo `COBRANCA_TOKEN_{instance_id}`, separados dos tokens do EmpireChat (`UAZAPI_TOKEN_{instance_id}`). Nunca misturar.

**EmpireCobrança — scheduler de régua:** a Edge Function `cobranca-scheduler` roda como cron a cada 5 minutos. Para cada devedor com `proximo_envio_em <= now()` e status `ativa`, ela: (1) verifica se está dentro da janela de horário, (2) verifica se o limite de 60 envios/hora da instância não foi atingido, (3) sorteia o intervalo aleatório, (4) chama `cobranca-ia-variacao` se `usar_ia_variacao = true`, (5) chama `cobranca-send-message`, (6) atualiza `passo_atual` e `proximo_envio_em` para o próximo passo da régua.

**EmpireCobrança — acesso isolado:** o perfil `agente_cobranca` e `admin_cobranca` só devem enxergar as tabelas `cobranca_*`. As RLS policies devem bloquear qualquer acesso a tabelas do EmpireDesk ou EmpireChat para esses perfis.

**CSAT via WhatsApp:** a mensagem de CSAT é enviada como mensagem normal via UAZAPI. O sistema interpreta a resposta do cliente: se for um número de 1–5, registra automaticamente. Usar a Edge Function `chat-csat-dispatcher` com delay configurável após encerramento.

**SLA monitor:** a Edge Function `chat-sla-monitor` deve rodar como cron job a cada 5 minutos. Ela verifica conversas em atendimento que estão próximas ou que violaram o SLA, atualiza os flags e dispara notificações. Não calcular SLA no frontend.

---

---

## 18. Sprint 10 — Contratos & Comissões (Migração Notion)

**Objetivo:** Migrar 100% do controle de contratos e comissões do Notion para o EmpireDesk, tornando-o o sistema único de verdade.

**Data do planejamento:** 2026-03-31

---

### 18.1 Diagnóstico

**Já existe no EmpireDesk:**
- Tabela `client_contracts` com 30+ campos (produto, status, valores, parcelas, datas, vendedor, especialista, treinador, funil, ClickSign, métricas de performance, flags internas)
- CRUD completo integrado ao `ClienteDetailPage`
- 5 status: ATIVO, INADIMPLENTE, FASE DE RENOVAÇÃO, CANCELADO, PAUSADO

**Falta implementar:**
- Comissões: zero estrutura — sem tabela, sem UI, apenas notas em texto livre
- Página dedicada de contratos com visão cross-client, filtros e busca
- Dashboard financeiro (MRR, inadimplência, renovações)
- Módulo completo de comissões com regras, cálculo automático, aprovação e pagamento

---

### 18.2 Regras de Negócio de Comissões (extraídas do Notion)

**Regra de elegibilidade:**
```
Venda elegível para comissão quando:
  ✅ Pagamento realizado no mês (data_pg_entrada)
  +
  ✅ Contrato assinado (data_assinatura) até o 5º dia corrido do mês seguinte

  Dias corridos = incluem fins de semana e feriados
  Prazo = até o dia 5, qualquer horário
```

**Regra de postergação:**
- Se a assinatura não ocorrer até o 5º dia: comissão passa automaticamente para o mês seguinte
- Sem limite de postergações
- Financeiro/Admin pode liberar excepcionalmente com justificativa obrigatória e escolha do mês de referência

**Controle de acesso:**
| Perfil | Permissões |
|---|---|
| Vendedor | Vê apenas suas próprias comissões e vendas |
| Financeiro/Admin | Vê tudo, aprova/rejeita, libera excepcionalmente, ajusta valor, escolhe mês de referência |

**Status de comissões:**
| Status | Cor | Significado |
|---|---|---|
| AGUARDANDO_ASSINATURA | Amarelo | Pagamento feito, dentro do prazo |
| ATENCAO_PRAZO | Laranja | Faltam X dias para vencer |
| APROVADA | Verde | Dentro do prazo ou aprovada pelo financeiro |
| POSTERGADA | Vermelho | Passou do prazo, moveu para mês seguinte |
| PAGA | Cinza | Paga e confirmada |
| LIBERACAO_EXCEPCIONAL | Roxo | Liberada manualmente com justificativa |
| CANCELADA | — | Rejeitada |

**Tipos de comissão:**
- Percentual (ex: 10% do valor da venda)
- Valor fixo (ex: R$ 500,00)
- Base de cálculo configurável: `entrada` | `parcela` | `faturamento_bruto`

---

### 18.3 Fases de Implementação

#### Fase 1 — Mapeamento Notion (1–2 dias) [BLOQUEANTE]
- Exportar tabela de contratos do Notion como CSV
- Mapear cada coluna para campo equivalente em `client_contracts`
- Campos candidatos a adicionar: `origem_lead TEXT`, `gestor_conta UUID`, `data_onboarding DATE`, `motivo_cancelamento TEXT`, `score_saude INT`, `proximo_contato DATE`
- Documentar regras de transformação (formatos de data, valores monetários)

#### Fase 2 — Página Dedicada de Contratos `/contratos` (3–4 dias)
- Filtros: status, produto, vendedor/especialista, período, busca por cliente
- Cards resumo: total ativos, MRR, vencendo em 30 dias, inadimplentes
- Tabela paginada cross-client com export CSV
- Novo hook: `useContratos(filters)` + `useContratosStats()`

#### Fase 3 — Módulo de Comissões (5–7 dias)

**Novas tabelas:**
```sql
-- Regras de comissão por produto e papel
commission_rules (id, produto, papel, tipo, valor, base_calculo, parcela_minima, ativo)

-- Comissões calculadas por contrato
commissions (id, contract_id, client_id, user_id, papel, rule_id, parcela_ref,
             valor_base, percentual, valor_comissao, status, data_prevista,
             data_pagamento, comprovante_url, observacoes, aprovado_por)

-- Ajustes manuais (multas, bônus, estornos)
commission_adjustments (id, commission_id, user_id, tipo, valor, motivo, criado_por)
```

**Edge Function `commission-calculator`:**
- Trigger: criar/atualizar `client_contract`
- Calcula comissão para vendedor, especialista e treinador
- Aplica regra de elegibilidade (pagamento + assinatura + prazo 5 dias corridos)
- Lida com postergação automática por mês
- Insere em `commissions` com status PENDENTE (sem duplicar)

**Páginas UI:**
- `/comissoes` — Dashboard admin: cards + tabela + filtros + ações (Aprovar | Pagar | Rejeitar | Liberar Excepcionalmente | Ajuste Manual)
- `/comissoes/regras` — Gestão de regras (CRUD, por produto e papel)
- `/comissoes/minha` — Visão do vendedor (suas comissões, timeline, status)

**Fluxo de liberação excepcional:**
1. Financeiro clica em "Liberar Excepcionalmente"
2. Escolhe o mês de referência (qualquer mês)
3. Preenche justificativa obrigatória
4. Sistema registra como `LIBERACAO_EXCEPCIONAL` com log completo

#### Fase 4 — Relatórios (2–3 dias)
| Relatório | Formato |
|---|---|
| Contratos por status (período, produto, vendedor) | CSV + PDF |
| MRR/ARR por mês/produto | Gráfico + CSV |
| Churn e cancelamentos (motivo) | CSV |
| Comissões por usuário (mês, papel) | CSV + PDF |
| Ranking vendedores | Dashboard |
| Inadimplência | CSV |

#### Fase 5 — Migração dos Dados do Notion (1–2 dias)
- Script `scripts/migrate-notion-contracts.ts`
- Upsert por cliente + produto + data_assinatura
- Resolve client_id por nome/email/telefone
- Resolve user_id para vendedor/especialista/treinador por nome
- Relatório de migração: X inseridos, Y atualizados, Z erros

#### Fase 6 — Go-live (1 dia)
- Período paralelo de 2 semanas (Notion como backup somente leitura)
- Validação: contagem de registros + soma de faturamento_bruto bate com Notion
- Desativar edição no Notion após validação
- Adicionar `/contratos` e `/comissoes` na sidebar

**Estimativa total: ~15–20 dias dev**

---

*EmpireDesk — PRD Técnico v2.2 — Empire Zap*
*Este documento é somente leitura. Qualquer mudança deve seguir o Protocolo de Mudança de Feature (PCF) descrito na seção 16.*