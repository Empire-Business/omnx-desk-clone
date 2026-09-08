# Auditoria de UX — Chat e Contratos (§8–9 do brief)

> Atualizado em: 06/08/2026 às 12h00 BRT
> Escopo: os dois apps que motivaram o pedido de reestruturação ("têm informação
> demais e confundem"). O Atendimento não entra aqui porque já nasceu sob os 10
> princípios.

---

## Como esta auditoria foi feita

Três lentes, nesta ordem:

1. **Medida de densidade** — linhas, número de botões e de estados por tela. Não
   diz se a tela é boa, mas diz onde procurar: tela com 68 botões não tem uma
   finalidade principal.
2. **Alcançabilidade** — para cada rota, existe caminho pelo menu? Rota que só se
   alcança digitando a URL é, na prática, uma tela que não existe.
3. **Os 10 princípios do §9**, um a um, contra o que está no código.

---

## 1. Densidade medida (06/08/2026)

| Tela | Linhas | Botões | `useState` |
|---|---:|---:|---:|
| `ConversationView` (Chat) | 3.217 | 68 | 37 |
| `ContratoDetailPage` | 1.462 | 20 | 4 |
| `ChatInboxPage` | 1.320 | 23 | 12 |
| `ChatContatosPage` | 1.203 | 28 | 13 |
| `ContratosPage` (lista) | 1.177 | 21 | 15 |

**Leitura:** `ConversationView` é o problema isolado mais grave do sistema — três
mil linhas e 68 botões num componente só. Não é só estética: 37 estados no mesmo
componente é onde nascem os bugs de "abri o menu e a tela pulou".

> Esta auditoria **não** reescreve a `ConversationView`. Fatiar um componente
> que é o coração da operação em produção é uma entrega própria, com testes
> antes — está registrada como pendência abaixo, não escondida.

---

## 2. Alcançabilidade — o achado mais grave

O menu do Chat tinha 5 itens. As rotas do Chat eram 20. As diferenças eram telas
inteiras que **só abriam digitando a URL**: Relatórios (métricas, CSAT),
Conteúdo (respostas rápidas, templates), Automação (bots, automações) e
Campanhas.

**Decisão do dono do produto (06/08/2026): essas áreas não deveriam existir.**
Foram removidas — tela e rota — em vez de ganharem entrada no menu:

| Removido | Rotas | Arquivos |
|---|---|---|
| Relatórios | `/chat/relatorios`, `/chat/metricas`, `/chat/csat` | `ChatRelatoriosPage`, `ChatMetricasPage`, `ChatCsatPage` |
| Conteúdo | `/chat/conteudo`, `/chat/respostas-rapidas`, `/chat/templates` | `ChatConteudoPage`, `ChatRespostasRapidasPage`, `ChatTemplatesPage` |
| Automação | `/chat/automacao`, `/chat/bots`, `/chat/bots/:id`, `/chat/automacoes` | `ChatAutomacaoPage`, `BotsPage`, `BotDetailPage`, `ChatAutomacoesPage` |
| Campanhas | `/chat/campanhas` | `ChatCampanhasPage` |

Também saíram os hooks que ficaram sem nenhum consumidor: `useCampaigns`,
`useIaBot`, `useAutomations`.

**Preservado de propósito:**

- `ChatRelatorioSemanalPage` (análise sentimental) — **não** era órfã: virou a
  aba Sentimental do Atendimento e segue no Dashboard legado.
- `useQuickReplies` e `useTemplates` — os dados continuam sendo **lidos** dentro
  da conversa e no diálogo de nova conversa. Só a tela de gestão saiu.
- **Nenhuma tabela foi apagada.** A remoção é de interface; os dados de bots,
  automações, campanhas, templates e respostas rápidas continuam no banco.

### Consequências assumidas (não são efeitos colaterais esquecidos)

1. **Respostas rápidas e templates viraram somente-leitura na prática.** Aparecem
   na conversa, mas não há mais tela para cadastrar ou editar. Se for preciso
   mudar uma, hoje só por banco.
2. **Bot ativo continua respondendo.** A automação vive na edge function
   `ia-bot-respond` + webhook, não na tela. Sem `BotDetailPage`, não há como
   desligar um bot pela interface. **Antes do deploy, é preciso conferir se algum
   bot está ativo em produção** — e desativar por migration se estiver.

---

## 3. Os 10 princípios, um a um

| § | Princípio | Chat | Contratos |
|---|---|---|---|
| 9.1 | Uma finalidade por tela | 🔴 `ConversationView` acumula conversa, atribuição, transferência, instância, notas, mídia e IA | 🟡 `ContratoDetailPage` mistura dados, pagamentos, anexos e histórico numa rolagem só |
| 9.2 | Hierarquia clara | 🟡 melhora com a remoção das áreas paralelas | 🟢 **corrigido nesta entrega** — abas de trabalho separadas das de configuração |
| 9.3 | Divulgação progressiva | 🟡 filtros já ficam atrás de "Filtros" | 🟡 lista mostra todas as colunas de uma vez |
| 9.4 | Menos ações simultâneas | 🔴 68 botões na conversa | 🟡 21 na lista |
| 9.5 | Linguagem clara | 🟢 | 🟡 "Recebíveis" x "Fluxo futuro" x "Parcelas" para a mesma ideia |
| 9.6 | Botões descritivos | 🟢 nenhum "Continuar/Confirmar/Executar" genérico encontrado | 🟢 idem |
| 9.7 | Prevenção de erros | 🟢 confirmação em ação destrutiva | 🟢 etapa com registro não pode ser excluída |
| 9.8 | Feedback imediato | 🟢 | 🟢 |
| 9.9 | Estados vazios orientados | 🟢 13 de 13 `EmptyState` têm explicação | 🟢 |
| 9.10 | Navegação previsível | 🟢 **corrigido** — não há mais tela alcançável só por URL no Chat | 🟢 |

---

## 4. O que foi corrigido nesta entrega

1. **Chat:** removidas as 4 áreas inalcançáveis pelo menu (acima).
2. **Contratos:** as 7 abas viraram dois grupos separados por divisória —
   trabalho (Dashboard, Onboarding, Contratos, Kanban, Recebíveis) e configuração
   (Produtos, Tags). Nada mudou de lugar; mudou o peso visual.
3. **Ramo da empresa** saiu da configuração do Atendimento e foi para
   Configurações → Ramo da empresa: é dado da conta, não preferência de um app.

## 5. O que fica pendente (registrado, não esquecido)

| Pendência | Por que não entrou agora |
|---|---|
| Fatiar `ConversationView` (3.217 linhas / 68 botões) | É o coração da operação em produção. Exige teste de regressão antes, não durante |
| Vocabulário de Contratos (Recebíveis x Fluxo futuro x Parcelas) | Renomear afeta rota, doc e o que a equipe já chama pelo nome antigo — decisão de produto |
| Colunas da lista de contratos sob demanda (§9.3) | Precisa saber quais colunas a equipe realmente usa; é pergunta de uso, não de código |
| Conferir bots ativos antes do deploy | Depende de consulta ao banco de produção |
