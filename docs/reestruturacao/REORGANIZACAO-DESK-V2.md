# Reorganização do Desk — versão 2 (tickeria de WhatsApp)

Atualizado em 07/11/2026 às 17h56 BRT · Publicado na `main` · Método: Morfo (design) + Agenor (agentes de IA)

> A versão 1 (PR #29, 06/11/2026) trocou rótulos e acrescentou funções, mas não mudou a estrutura. Esta versão reorganiza a estrutura, o visual e a responsividade. Histórico da v1: [REORGANIZACAO-DESK.md](REORGANIZACAO-DESK.md).

## 1. Como foi avaliado

| Avaliação | Modelo | Relatório |
|---|---|---|
| Arquitetura de telas e rotas | Opus | `.morfo/auditoria/01-arquitetura.md` |
| Fluxo de tickets do WhatsApp | Opus | `.morfo/auditoria/02-tickets.md` |
| Responsividade de todas as telas | Sonnet | `.morfo/auditoria/03-responsividade.md` |
| Inventário de marketing | Haiku | `.morfo/auditoria/04-marketing.md` |
| Agentes de IA (ajuda e resolução automática) — Agenor | Opus | `.morfo/auditoria/05-agentes-ia.md` e `-casos.md` |
| Referências de design (Attio, Linear, Plain) | Sonnet | `.morfo/referencias/INDEX.md` |
| 3 design systems candidatos + crítico visual | Opus | `.morfo/design-system/`, `.morfo/qa/2026-11-07-escolha-ds.md` |
| Auditoria de segurança (delta) | — | registrada em `.morfo/estado.md` |

## 2. Nova organização

Uma estrutura só, organizada pelo trabalho do dia: **o que precisa de mim → conversa → ticket → cliente/contrato → IA**.

- **Barra lateral (computador):** Início · Conversas · Tickets · Clientes · Contratos · Íris. Rodapé: Ajustes e Ajuda.
- **Barra inferior (celular):** Início · Conversas · Tickets · Contratos · Mais (Clientes, Íris, Ajustes, Notificações, Meus pedidos de suporte, Ajuda, Sair).
- **Ajustes:** toda a administração em cartões (Minha conta, Empresa, Equipe, WhatsApp, Tickets e contratos, Permissões e módulos, Suporte técnico), cada cartão visível só para quem tem permissão.
- **Fonte única:** `src/config/navegacao.ts` alimenta menus, abas, Ajustes, atalhos da ajuda e o teste que confere rotas × manual.
- **Endereços antigos** continuam funcionando e redirecionam preservando `?` e `#` (`src/config/rotasAntigas.ts`). Mapa completo: [../MAPA-DE-NAVEGACAO.md](../MAPA-DE-NAVEGACAO.md).

## 3. Tickeria de WhatsApp

**Fluxo:** mensagem do cliente → ticket criado pela análise a cada 15 min → atendimento → resolução automática (Íris) ou manual → reabertura manual se preciso.

**Status que o usuário vê** (calculado, sem mudança de banco — `src/lib/ticketStatus.ts`):

| Status | Quando |
|---|---|
| Aguardando equipe | a última mensagem da conversa é do cliente |
| Aguardando cliente | a equipe respondeu por último |
| Resolvido | etapa final — pela Íris (com motivo) ou por uma pessoa |
| Reaberto | reaberto depois de resolvido |

**Sincronização:**
- Automática: a Íris só resolve com **confirmação do cliente** posterior ao pedido, e uma mesma mensagem só resolve **um** ticket. Negações ("não deu certo", "continua com erro"), promessas e agradecimentos isolados não contam.
- Manual: "Marcar como resolvido" e "Reabrir" na ficha (e "Não resolveu" na faixa da Íris).
- Ligação conversa ↔ ticket: a ficha mostra a mensagem de origem e a conversa; "Abrir no Chat"; na conversa, selo "N tickets abertos" e lista "Tickets deste cliente".

**Depende de banco (etapa seguinte):** status oficial gravado; vínculo permanente ticket ↔ conversa; histórico com eventos da Íris; modo observação por empresa; resposta citada e áudio como prova; registro de por que um pedido não virou ticket.

## 4. Ajuda interna com IA

Botão **Ajuda** (canto inferior; em Conversas, no topo; no celular, Mais → Ajuda) → "Perguntar à Íris" ou "Reportar um problema". A Íris de ajuda responde a partir do manual (`supabase/functions/_shared/manual-plataforma.ts`), com atalhos derivados da fonte única de navegação e filtrados pela permissão de quem pergunta. Não tem ferramentas nem acesso a dados de clientes. Sem IA, mostra o trecho do manual. A busca entende "onde fica X?" por palavra inteira.

## 5. Marketing fora

Saíram da interface: reels, carrossel, stories, post/post único/feed, "campanha" como tipo de pedido, ramo "Social Media" (exibido como "Serviços"), contadores e histórico de Instagram no cliente, notificações de entregas/aprovações, aba de entregas do painel legado, prompts de IA com "agência de marketing". Mantidos: dados históricos, campo Instagram do cadastro, campanha de disparo de WhatsApp.

## 6. Design system

Fonte da verdade: `.morfo/design-system/omnx-desk/design-system.html`. Archivo (interface) + JetBrains Mono (números). Azul OMNX `#0B5BD3` como primária; verde-água exclusivo da Íris; diagonal do X como assinatura; bordas finas no lugar de sombras; 7 status com cor **e** forma; contraste AA conferido em 49 pares, claro e escuro.

## 7. Plano de documentação e tutoriais

| Documento | Para quem | Onde |
|---|---|---|
| Manual público (`/manual`) | todos | gerado de `manual-plataforma.ts` |
| Ajuda com IA | todos | botão Ajuda |
| Mapa de navegação | quem mantém | `docs/MAPA-DE-NAVEGACAO.md` |
| Este documento | gestão e quem mantém | aqui |

**Tutoriais** (gravados só depois da aprovação do link de pré-visualização e da publicação; tela real, com dados fictícios em ambiente de teste ou dados próprios autorizados; edição com o Cortez — pasta `edicao-por-ia`):

| # | Tutorial | Duração | Roteiro (passos na tela) |
|---|---|---|---|
| 1 | Primeiro acesso | 2 min | Entrar → conhecer a barra lateral (Início, Conversas, Tickets, Clientes, Contratos, Íris) → no celular, a barra inferior e "Mais" → onde ficam Ajustes e Ajuda |
| 2 | Atender pelo WhatsApp | 3 min | Conversas → abrir conversa → responder → ver o selo "tickets abertos" → abrir o ticket do cliente |
| 3 | Trabalhar a fila de tickets | 3 min | Tickets → filtros Aguardando equipe / Atrasados → "N pedem ação" → abrir ticket → "Assumir" → responder no Chat |
| 4 | Resolver e reabrir | 2 min | Ficha → "Marcar como resolvido" → ver "Resolvido" → "Reabrir"; faixa "Resolvido pela Íris" e botão "Não resolveu" |
| 5 | Contratos do cliente | 3 min | Contratos → Visão geral → abrir contrato → situação e vigência; Clientes → ficha do cliente → contratos e conversas |
| 6 | Perguntar à Íris | 1 min | Ajuda → "Onde fica A receber?" → atalho leva à tela |
| 7 | Reportar um problema | 1 min | Ajuda → Reportar um problema → descrever tela, passos e resultado esperado → Meus pedidos de suporte |

**Produzidos (07/11/2026):** os 7 tutoriais foram feitos do zero no Cortez como vídeos animados (formato F07 Motion Institucional, identidade ID06 Azul Claro), com narração em voz realista (ElevenLabs via OpenRouter), em 16:9 e 9:16 — 14 arquivos. Publicados no Vimeo (EmpireOS → OMNX Desk — Tutoriais, não listados, embed só em desk.omnx.pro) e exibidos no `/manual` e na Ajuda → Vídeos tutoriais (`src/config/tutoriais.ts`). Originais: `edicao-por-ia/02 - Ver vídeos/Motions institucionais/08 - OMNX Desk tutoriais/` (arquivos `E82`–`E88`, sufixo `_V2`; a versão `V1` sem voz foi mantida). Roteiros da narração em `99 - Sistema/jobs/desk-tutorial-0N-…/edit/narracao.md`.

Responsáveis: pessoa da operação valida o vocabulário de cada roteiro; dono do produto aprova as gravações; quem mantém atualiza o roteiro a cada mudança de tela (o teste `navegacao.manual.test.ts` acusa quando menu e manual divergem).

## 8. Estabilidade (o que garante que nada quebrou)

- Nenhuma migration e nenhuma mudança de permissão; rotas antigas redirecionam (41 casos testados).
- Mesmas travas de app/permissão nas rotas novas; travas de página adicionadas em telas de administração.
- Testes, `npm run typecheck` e build a cada etapa. Final (07/11/2026): 169 arquivos de teste, 3.247 testes passando (1 ignorado), typecheck e build sem erro.
- QA visual no login real (celular ~600 px e computador 1440 px; tablet 768 px não conferido a olho): 35 telas sem rolagem lateral e sem erro no console; títulos das telas alinhados aos nomes do menu; status de contrato no selo do design system.
- Observação: o grupo de telas "Demais" foi feito com Haiku (o rodapé do commit diz Opus por engano).

## 9. Publicação

Tudo publicado em 07/11/2026, com autorização do dono ("autorizo tudo", "pode testar quanto quiser").

- **Site:** `main` (PRs #33 a #37). A versão em `desk.omnx.pro` é a mesma gerada localmente.
- **Banco:** migration `20261107203759_atendimento_sugestao_resolucao_ia` (fila "Para confirmar"), aplicada via `supabase db query` + `migration repair`. **Nunca usar `db push`**: duas migrations antigas têm versão remota diferente e seriam reaplicadas.
- **Funções:**

  | Função | Versão | `verify_jwt` |
  |---|---|---|
  | `wa-relacionamento-analisar` | v12 | false |
  | `iris-ajuda` | v5 | true |
  | `uazapi-webhook` | v91 | false |

  Antes de publicar, conferi que o código no ar era o da `main` anterior; as diferenças eram só as revisadas.
- **Teste com o modelo real** (`.agenor/testes/eval-*-modelo-real.ts`):
  - resolução: 54/54 casos certos, nenhum fechamento indevido;
  - Ajuda: Sonnet 5.5 com esforço baixo, mesma qualidade, ~US$ 0,010 por pergunta.
- **Para desfazer:**
  - funções: publicar a partir de `0aa7cec`;
  - fila: recusar as sugestões (o banco limpa sozinho ao mudar a etapa);
  - colunas: são aditivas e podem ficar.

  Ver `docs/ESTRATEGIA-DE-ROLLBACK.md`.
- **Não verificado a olho:**
  - a barra inferior escondida no celular e o tablet de 768 px;
  - a faixa "A Íris acha que…" com uma sugestão real, porque ainda não há tickets do WhatsApp em produção.
