# MUDANÇAS — Changelog do omnx-desk

> Registro cronológico (mais recente no topo) das entregas relevantes.
> Atualizado em: 19/08/2026 às 19h30 BRT

---

## 2026-08-19 — Incidente: a segunda empresa derrubou o chat (e mais 14 tabelas)

**O que o usuário viu.** "Falha ao enviar: null value in column tenant_id of
relation chat_messages violates not-null constraint". A mensagem *chegava* no
WhatsApp do cliente, mas não aparecia na tela — a função envia primeiro e grava
depois, e era a gravação que morria. Pior e invisível: o webhook parou de gravar
as mensagens **recebidas**, sem erro em tela nenhuma.

**A causa.** O carimbo automático de empresa (`set_tenant_id` ->
`resolve_tenant_default()`) resolve assim: empresa do usuário logado; sem sessão
(service_role / edge function), cai no tenant único do banco. Esse fallback só
vale enquanto existe **exatamente um** tenant. O provisionamento criou a segunda
empresa em **19/08 às 16:18:44 UTC** — e a última mensagem que o sistema
conseguiu salvar foi **16:18:14 UTC**, trinta segundos antes. A partir dali,
toda escrita sem sessão recebia NULL numa coluna NOT NULL.

O bug estava plantado desde a Fase A do multi-tenant; a segunda empresa só puxou
o gatilho.

**A correção, em duas camadas.**

*No banco* (`20260819190000_chat_herda_tenant_do_pai.sql`): a linha herda a
empresa do registro pai — a mensagem da conversa, a conversa da instância de
WhatsApp. Determinístico, não depende de sessão, vale para qualquer caminho de
escrita. Cobre 15 tabelas, porque o problema nunca foi só do chat: notificações,
cobrança, logs de webhook, aquecimento, extração de PDF e outras iam quebrar
igual assim que fossem exercitadas.

*Fila de e-mail e venda pública* (`20260819200000_email_queue_e_vendas_publicas_tenant.sql`):
essas duas não têm pai único. A fila resolve pela referência (contrato/venda),
depois pelo destinatário; a venda pública pelo produto, depois pelo closer. Cada
uma com fallback ao tenant mais antigo — adivinhação, sim, mas melhor que perder
uma venda já preenchida ou travar e-mail transacional. A correção definitiva da
venda pública é o formulário informar de qual empresa ele é.

*No código* das edge functions do chat (`uazapi-send-message`, `uazapi-webhook`,
`ia-bot-respond`): passam a informar a empresa explicitamente em vez de contar
com a dedução do banco. **Ainda não deployado** — `uazapi-send-message` exige
`--no-verify-jwt`, e um deploy errado derruba o chat com 401.

**Estrago.** 772 eventos de webhook (≈488 mensagens distintas) de clientes
perdidos entre 13:18 e 18:59 BRT — recuperáveis a partir de `_webhook_debug`,
que guardou o payload bruto. **Atenção ao reprocessar:** reenviar os webhooks
faria o bot de IA responder todos os clientes com mensagens de horas atrás e
dispararia centenas de push. O resgate tem que ser gravação direta no banco.
Nenhum e-mail de contrato assinado e nenhuma venda pública se perderam na janela.

**Lição.** Todo fallback do tipo "se só existe um X, use esse" é uma bomba com
temporizador: funciona até o dia em que existirem dois. Fallback assim precisa
de alarme, não de silêncio.

---

## 2026-08-06 — Fecha as pendências da reestruturação (§5, §6, §8–9, §14, §15, §19)

**O pedido.** Executar de uma vez as frentes que o roadmap listava como abertas,
mais uma adição: a análise sentimental, que só existia numa aba do Dashboard
legado, precisava aparecer no Atendimento.

**Aba Sentimental no Atendimento** (`/atendimento/sentimento`). É a **mesma**
tela do relatório semanal, não uma cópia — duplicar significaria duas versões
divergindo. Só aparece se o app de Chat estiver ligado e a pessoa puder vê-lo: é
dele que vêm as conversas analisadas.

**Ramo da empresa saiu do Atendimento e foi para Configurações.** É dado da conta,
como marca e logo — não preferência de um app. Quem procurava "onde mudo o ramo?"
ia primeiro em Configurações, como manda a intuição. Ficou um ponteiro na
configuração do Atendimento para quem já conhecia o caminho antigo.

**Ficha do cliente virou visão 360 (§6).** Três abas novas — **Financeiro**
(parcelas vencidas e a vencer, calculadas pela mesma função da tela de
Recebíveis), **Conversas** e **Demandas**. Cada aba é um índice que leva ao app
dono do dado; reimplementar a operação de cada módulo ali criaria uma segunda
versão de cada tela.

**Reporte de erro agora avisa a equipe (§14).** Trigger em `reportes_erro` chama
a `send-email`, um e-mail por admin do **mesmo tenant**. Só categoria `bug` —
dúvida e sugestão não acordam ninguém, senão o alerta vira ruído e ninguém lê. O
print, o console e a rede **não** vão no e-mail: ficam no painel, atrás da RLS.

**Os gates `admin || gerente` viraram permissão editável (§15).** Três recursos
novos: `clientes.carteira` (ver todos os clientes), `chat.carteira` (ver todas as
conversas) e `clientes.atribuir` (definir responsável). Semeados exatamente para
quem já tinha — **ninguém ganhou nem perdeu acesso**. `atendimento` entrou só na
primeira, porque já via todos os clientes mas não todas as conversas: um recurso
único para os dois casos teria ampliado o acesso dele sem ninguém pedir. O ganho:
delegar deixou de exigir promover alguém a administrador.

**Observabilidade (§19).** Tabela `app_logs` por app, captura global de exceção,
promessa rejeitada e falha de query/mutação, e painel **`/saude`** com erros por
app em 24h/7d/30d. Antiflood de 30s por evento — sem ele, um erro dentro de um
render em loop escreveria milhares de linhas em segundos.

**UX de Chat e Contratos (§8–9).** Auditoria em
`docs/reestruturacao/AUDITORIA-UX-CHAT-CONTRATOS.md`. Achado principal: quatro
áreas do Chat não tinham entrada no menu — só abriam digitando a URL. Por decisão
do dono, foram **removidas** (Relatórios, Conteúdo, Automação, Campanhas), com os
hooks que ficaram órfãos. Nenhuma tabela foi apagada e o relatório Sentimental
foi preservado. Em Contratos, as 7 abas viraram dois grupos separados por
divisória: trabalho e configuração.

⚠️ **Consequências assumidas da remoção:** respostas rápidas e templates
continuam aparecendo na conversa, mas não há mais tela para cadastrá-los; e um
bot ativo continua respondendo pela edge function, sem tela para desligar —
conferir antes do deploy.

**Documentação (§5) fechada.** Entraram `MANUAL-DO-USUARIO`,
`MANUAL-DE-ADMINISTRACAO`, `GUIA-DE-SUPORTE`, `ESTRATEGIA-DE-ROLLBACK` e
`PLANO-DE-HOMOLOGACAO`.

**Migrations:** `20260806120000` (e-mail de reporte), `20260806130000`
(permissões de carteira), `20260806140000` (app_logs + `resumo_saude_apps`).

**Fica aberto:** testes (§16–17) — 63 testes, todos unitários, sem E2E e sem
teste de isolamento entre empresas — e fatiar a `ConversationView` (3.217 linhas,
68 botões).

---

## 2026-08-06 — Recebíveis: agenda de recebimentos do dia

**O pedido.** A aba Recebíveis respondia "quanto entra em agosto", mas não "quanto entra **no dia 8**". Para saber quem paga numa data específica era preciso abrir mês a mês e ler a lista inteira.

**A entrega — painel "Recebimentos do dia"** em `/contratos/recebiveis`, entre os KPIs e o gráfico:

- Data escolhida por campo de data, setas `‹ ›` para andar dia a dia e botão "Hoje". Abre no dia de hoje.
- **Atalhos dos próximos dias com entrada** (10 primeiros), cada um com valor e número de parcelas — dá para pular direto para o próximo dia em que cai dinheiro.
- Lista de quem vence naquele dia (cliente, produto, valor); o clique abre o contrato. Navegável por teclado.
- **Total do dia** em faixa própria, com contagem de parcelas e de clientes.
- Estado vazio com atalho para o próximo dia que tem recebimento.

**Duas regras que diferem do resto da tela:**

1. A agenda diária **também enxerga datas passadas** — serve para conferir "o que era para cair ontem?". O restante da tela continua só olhando para frente (`>= hoje`).
2. O filtro de **Período (mês) não se aplica** à agenda, já que o dia escolhido é o próprio recorte; caso contrário, escolher um dia fora do período mostraria vazio sem motivo aparente. Os filtros de cliente, tag, estrategista e produto continuam valendo.

**Código.** `parcelasFuturasDoContrato` passou a ser um filtro sobre `parcelasDoContrato` (nova), que devolve o cronograma inteiro sem corte de data — mesma regra de sempre: entrada/sinal fora, só contrato ativo. Novos utilitários `somaDias`, `rotuloDia` e `rotuloDiaExtenso`. `fluxoFuturo.test.ts` foi de 5 para 9 testes.

## 2026-08-04 (noite) — Contrato do Desk chega ao CRM + faxina em Contratos

**Ponte de contrato.** O dashboard do CRM listava como "sem contrato assinado" vendas cujo contrato estava **ativo** aqui. O CRM não recebia nada sobre contratos — só via a etapa do card no funil, que não muda quando o contrato é fechado fora do Clicksign (eram 17 contratos ativos sem link).

- `_shared/sincronizar-venda.ts` busca o contrato da venda (`contratos.venda_pendente_id`) e envia `{ status, link_assinatura, data_assinatura }` no payload.
- `trg_contrato_ressincronizar_venda_crm` (migration `contrato_ressincroniza_venda_crm`): mudou status/link/data de assinatura → reenvia a venda ao CRM. Mesmo disjuntor `app.skip_venda_resync`.
- **Backfill do vínculo:** só 8 de 25 contratos tinham `venda_pendente_id` (o gatilho que preenche é recente). Religados **15**, casando por CPF/CNPJ e nome — todos com match único de ambos os lados, conferido antes de escrever. Depois disso, 20 vendas do Desk passaram a chegar ao CRM com contrato ativo.

**Duplicatas mescladas.** Varredura em 331 contratos encontrou **duas** duplicatas — Daniela Espinoza e Erick Oliveira —, ambas do mesmo padrão: um rascunho vazio criado pelo gatilho da venda + o contrato real, ativo e assinado. Mantido o ativo, que herdou o `venda_pendente_id`; o rascunho foi apagado. **As duas datas ficaram preservadas** (pagamento era idêntico nos dois; assinatura só existia no ativo) e nenhuma comissão estava atrelada.

**Data de pagamento em Contratos.**
- Campo editável no detalhe, ao lado do status e da data de assinatura.
- `tg_set_data_pagamento` **parou de desfazer edição manual** (migration `data_pagamento_respeita_edicao_manual`): antes recalculava a partir do cronograma em toda gravação, então o campo novo seria inútil. Agora só age quando a data está vazia ou quando o próprio cronograma mudou.
- Coluna na listagem e **ordenação padrão da lista** por ela; contrato sem data vai para o fim nos dois sentidos.
- **Tabela sem scroll lateral:** `table-fixed` com larguras percentuais, truncamento, colunas que somem por breakpoint (produto, assinatura, parcelas), coluna **%** removida a pedido do dono, e rodapé tirado do `tfoot` — com colunas ocultas, o `colSpan` desalinhava do valor.

**Migrations resgatadas para o repositório.** As três mudanças de banco desta noite tinham sido aplicadas direto pela Management API e só existiam no servidor — o histórico do repo não reproduzia mais o banco, e o campo novo de data de pagamento dependia justamente de uma delas. Foram extraídas do banco (`pg_get_functiondef`) e versionadas em `supabase/migrations/`: `..214000_venda_ressincronizar_crm_trigger`, `..215000_data_pagamento_respeita_edicao_manual` e `..216000_contrato_ressincroniza_venda_crm`. Todas idempotentes (`create or replace` + `drop trigger if exists`), então reaplicar é inofensivo.

**Correções de tipo.** `sincronizacao_erro` existia na tabela `vendas_pendentes` mas faltava na interface `VendaPendente` — a tela que passou a exibir o erro do último envio não compilava. Removida também a função `dataBR`, que ficou órfã quando as datas viraram campos editáveis.

## 2026-08-04 (noite) — Venda editada no Desk agora atualiza o CRM na hora

**O sintoma.** O faturamento de julho no dashboard do CRM não batia com a planilha de vendas.
Investigando o caso do **Thiago Muniz**: o CRM mostrava R$ 84.000 e o Desk, R$ 24.000.

**A causa.** O envio ao CRM só acontecia no clique do botão ("Concluir + CRM" / "Enviar ao CRM
agora"). Depois disso, **nenhuma edição era propagada** — e a tela ainda escondia o bloco de
sincronização de quem já tinha sido enviado, então não havia nem caminho manual de correção.
No histórico da venda do Thiago: sincronizada em 03/07 às 12h30 com 12 pagamentos (R$ 84.000)
e editada às 12h54 para 2 pagamentos (R$ 24.000). O dashboard exibiu o número velho por mais
de um mês, inflando julho em R$ 60.000.

**A entrega — sincronização automática, sem botão** (decisão do dono: "mudei qualquer número lá,
já muda também"):

- **`_shared/sincronizar-venda.ts`** — a montagem do payload, os links assinados dos comprovantes,
  o POST na ponte e a gravação do resultado saíram da edge function e viraram helper. As duas
  portas usam o mesmo código: duplicar era garantia de divergir de novo.
- **`vendas-ressincronizar-crm`** (function nova) — autenticada só por `x-notify-secret` do Vault,
  como a `empire-contrato-assinado-ghl`. Não recebe oportunidade: usa o `ghl_oportunidade_id` já
  gravado, então um reenvio **nunca** escolhe um card diferente do que uma pessoa vinculou.
- **`trg_venda_ressincronizar_crm`** (migration `20260804190000`) — AFTER UPDATE em
  `vendas_pendentes`. Só dispara quando a venda **já está vinculada** e quando muda algum dos 16
  campos que vão ao CRM. Esse recorte é o que evita laço infinito: o próprio UPDATE de controle da
  função (`sincronizado_em`, `ghl_venda_id`, `sincronizacao_erro`) não redispara o trigger.
  Disjuntor para lotes: `SET LOCAL app.skip_venda_resync = 'on'`.
- **Tela** — a venda sincronizada agora avisa "Qualquer alteração feita aqui é enviada ao CRM na
  hora" e mostra o erro do último envio automático quando houver. Sem botão de reenvio.

**Idempotência:** do lado do CRM, `crm-registrar-venda` faz UPSERT por `oportunidade_id` — reenviar
atualiza a venda existente, não duplica.

**Validado em produção (04/08/2026):** reenvio disparado nas vendas da Daniela Espinoza e do Erick
Oliveira → HTTP 200 nas duas, valores preservados e **os comprovantes que faltavam (1 e 3) subiram
para o CRM**. Depois, uma edição real numa venda vinculada disparou o trigger sozinha (request
`24460`, HTTP 200), sem erro registrado.

---

## 2026-08-04 (noite) — Telas em branco: 3 variáveis inexistentes e o type-check que não checava

**O sintoma.** Configurações, Dashboard de Contratos e Colaboradores abriam em branco,
com `Uncaught ReferenceError: can is not defined` no console.

**A causa.** O refactor de permissões (`8d5d5cc`) trocou `user?.perfil === 'admin'` por
`can('recurso', 'admin')` em 15 telas. Em três arquivos o `can` foi usado num
componente que não o criava: ou o `usePermissoes()` estava em **outro componente do
mesmo arquivo** (Configurações, Dashboard de Contratos), ou o hook nunca foi importado
(Colaboradores). Como `can` não existe naquele escopo, a tela morre no primeiro render.

**A causa da causa — e a correção mais importante desta entrega.** O `CLAUDE.md`
mandava validar com `npx tsc --noEmit` antes de commitar. Só que o `tsconfig.json` da
raiz é um índice (`"files": []` + `references`): esse comando **compila zero arquivo e
sai com sucesso sempre**. O bug passou por um type-check "verde" que não olhou nada. O
`npx vite build` também não pega: o Vite transpila sem checar tipos.

O comando correto — `npm run typecheck` (`tsc -b`), que já existia no `package.json` —
apontou os três erros na hora, incluindo **um quarto ponto que ninguém tinha visto**:
`onCobrar` era usado no `SocialCard` da tela de Clientes sem estar na desestruturação
dos props (existia na interface e o pai passava). Mesmo destino: `ReferenceError` ao
clicar em cobrar.

**Corrigido:** os quatro pontos (`ConfiguracoesPage`, `ContratosDashboardPage`,
`ColaboradoresPage`, `ClientesPage`) e o `CLAUDE.md`, que agora manda `npm run
typecheck` e explica por que o comando antigo enganava.

**O que ficou exposto e NÃO foi corrigido.** Com o type-check funcionando de verdade,
apareceram 222 erros de tipo; corrigidos os 4 desta entrega, sobram **218
pré-existentes** — a maioria em `useChat.ts`,
`useComissoes.ts` e `useCobranca.ts`, e boa parte é a mesma família: depois que a Fase
A.2 tornou `tenant_id` NOT NULL, os tipos gerados passaram a exigir o campo em todo
`insert`, mas o código conta com o gatilho do banco para carimbá-lo. Nenhum desses é
erro de execução (o Vite ignora tipos e o gatilho preenche), mas enquanto existirem o
type-check não serve de portão. Fica registrado como dívida.

---

## 2026-08-04 (noite) — Faxina de permissões: trava do Atendimento e RPCs fechadas

Auditoria de acompanhamento depois que a Fase C subiu. As migrations da Fase C
estavam todas aplicadas em produção (conferidas policy por policy, não só pelo
registro na tabela de migrations). Três correções entraram.

**1. O app de Atendimento ganhou o cinto de segurança que faltava**
(`20260804210000`). As 5 tabelas do app (`atendimento_demandas`, `_tipos`,
`_etapas`, `_comentarios`, `_historico`) nasceram com o filtro de empresa dentro de
cada policy PERMISSIVE. Isolava — mas policies PERMISSIVE se somam com **OU**:
bastava alguém criar amanhã mais uma policy sem o filtro para o isolamento cair
sozinho. Agora as 5 têm a policy RESTRICTIVE `tenant_isolation`, que entra em **E**
com todas as outras. São **105 tabelas** com a trava. Nada mudou para quem usa hoje:
a condição já era exigida.

**2. Funções internas deixaram de ser endpoint público** (`20260804212000`). Toda
função no schema `public` vira automaticamente uma rota `/rest/v1/rpc/<nome>`. Como
`SECURITY DEFINER` roda com os privilégios do dono e ignora RLS, havia 110 funções
alcançáveis de fora — incluindo `aprovar_extrato_mes`, `calcular_comissoes_contrato`
e dezenas de funções de gatilho, que nem fazem sentido como rota. Foram separadas em
três grupos: as de gatilho perderam o acesso de todo mundo; as RPCs de negócio
perderam o acesso anônimo (seguem disponíveis para quem está logado e para as edge
functions); e as funções usadas **dentro das próprias policies** (`is_admin`,
`has_permissao`, `get_user_tenant_id`, `get_tenant_by_domain`...) foram deixadas
como estavam de propósito — revogar ali faria o acesso anônimo estourar com erro em
vez de simplesmente não devolver linha, e derrubaria a marca por domínio na tela de
login.

Antes de aplicar, a dúvida que decidia o desenho foi testada em laboratório
(tabela + gatilho descartáveis): **revogar `EXECUTE` de uma função de gatilho não
impede o gatilho de disparar** — o Postgres cobra esse privilégio ao criar o
gatilho, não a cada disparo.

**3. `search_path` fixo em 8 funções** (`20260804211000`). Sem isso, quem chama a
função pode colocar um schema próprio na frente do `public` e fazer a função
resolver uma tabela falsa. Usamos `public, pg_temp` em vez de vazio porque duas
delas referenciam objetos sem qualificar o schema.

**Resultado.** Os alertas de segurança do Supabase caíram de **129 para 71**, sem
nenhum ERROR antes ou depois. O que restou é o grupo mantido de propósito, duas
extensões no schema `public` e a proteção contra senha vazada, que se liga no painel
do Auth (Authentication → Policies) e não depende de código.

**Verificação.** Com sessão de admin real: leitura (331 contratos), escrita com
gatilho carimbando data, e criação de demanda no Atendimento com a empresa certa —
tudo dentro de transação revertida, sem tocar em dado de produção.

---

## 2026-08-04 (fim de tarde) — Fase C do multi-tenant: teste com empresa real e 6 furos fechados

**O que foi feito.** Criamos uma segunda empresa de verdade no banco, com admin
próprio, logamos com ela pela API real e perguntamos tabela por tabela (todas as 103)
"o que essa pessoa consegue ver?". Depois testamos escrita, arquivos e o caminho
inverso. A empresa de teste foi apagada no fim; as contagens da Aliança foram
conferidas antes e depois (333 contratos, 339 clientes, 1030 comissões, 35 usuários).

**O que já estava certo.** 91 tabelas seguraram — contratos, comissões, chat,
clientes, vendas, entregas. A empresa nova viu **zero** linha da Aliança nelas, e o
que ela criou nasceu carimbado com a empresa certa sem precisar informar nada.

**Os 6 furos encontrados e fechados.** Todos pela mesma causa: essas tabelas nunca
receberam a trava `tenant_isolation` que as outras 91 têm.

| Onde | O que dava para fazer |
|---|---|
| `employees` | Ler os 32 colaboradores da Aliança (e-mail corporativo, cargo) **e editá-los** |
| `company_areas` | Ler **e editar** a estrutura de áreas |
| `positions`, `subareas` | Ler cargos e subáreas |
| `profiles` | Ler nome e e-mail de todo mundo |
| `tenant_integracoes` | Ler a configuração da ponte com o CRM |
| `tenants` | Listar todas as empresas; e qualquer admin podia reescrever a marca (nome, cores, logo, domínio) de **qualquer** empresa |

**Arquivos.** Um comprovante de venda "órfão" — o arquivo ficou no bucket depois que
o registro sumiu — foi **baixado** por outra empresa. A regra antiga dizia "se eu não
descobrir de quem é o arquivo, libera"; agora só libera para quem subiu. Os buckets
`deliveries` e `pj-notas` não tinham trava nenhuma e passaram a ter.

**Dois bugs que só apareciam com 2 empresas.** Ficavam invisíveis enquanto existia
uma empresa só:

1. O resolvedor automático de empresa tinha um atalho — "se só existe uma, usa ela".
   Com a segunda criada, toda gravação sem usuário logado (edge function, automação,
   gatilho em cascata) passou a falhar. Bateu na hora ao promover alguém a admin.
   Agora as 11 funções internas carimbam a empresa explicitamente, a partir da própria
   linha de origem.
2. Criar usuário sem informar a empresa jogava a pessoa **dentro da Aliança**. Agora
   isso só é aceito se a instância tiver uma empresa só; com duas ou mais, o cadastro
   falha com mensagem clara em vez de acertar a empresa errada.

**De quebra.** As funções que montam os grupos internos de departamento liam usuários
de **todas** as empresas — com duas ativas, admins de uma entrariam nos grupos da
outra. Corrigido junto.

**Empresa nova nasce completa.** Como o organograma deixou de ser compartilhado, o
seed passou a clonar áreas, subáreas e cargos do mestre para a empresa nova (cópia
própria, editável sem afetar ninguém).

Migrations: `20260804120000` a `20260804125500`. Detalhes em `docs/multi-tenant-roadmap.md`.

---

## 2026-08-04 (noite) — Atendimento vira a tela inicial e se adapta ao ramo da empresa

**A tela inicial mudou.** Ao entrar no sistema, você cai no **painel de Atendimento**,
não mais no Dashboard. O item no menu ocupa a posição de antes e usa o **mesmo ícone** —
quem já usa procura aquele desenho no topo, e mudar o símbolo de lugar custa mais do que
ganha.

**O Dashboard não foi apagado.** Continua vivo em `/dashboard-legado`, fora do menu. Ele
concentra métricas de contratos, entregas e Instagram que ainda não têm outro lugar, então
apagar seria perder informação sem ter para onde levá-la.

*Rede de segurança:* se o Atendimento estiver desligado nesta empresa, ou se o perfil da
pessoa não tiver permissão nele (um agente de cobrança, por exemplo), a tela inicial cai
no Dashboard legado automaticamente. Sem isso, desligar o app deixaria a empresa sem tela
inicial, e um perfil sem permissão veria um painel eternamente vazio — concluindo que o
sistema quebrou.

**Cada empresa tem o seu ramo.** Agora a empresa escolhe o **segmento** na aba
Configuração, e a interface inteira se adapta:

| | Social Media | Clínica | Escritório |
|---|---|---|---|
| Chama de | demandas | atendimentos | demandas |
| Quem é atendido | cliente | paciente | cliente |
| Abas | Painel, Demandas, Kanban | Painel, Atendimentos | Painel, Demandas, Kanban |
| Métricas de aprovação | sim | não | não |
| Etapas semeadas | Solicitado → … → Publicado | Agendado → … → Concluído | Recebida → … → Concluída |

A clínica não tem kanban de propósito: o fluxo é curto e a lista com filtro dá conta —
aba a mais é aba que ninguém abre. E não tem "aguardando aprovação do cliente", porque
paciente não aprova peça.

Trocar o ramo é **aditivo**: as etapas e tipos do ramo novo são acrescentados, nada do que
já existe é apagado. Se houvesse remoção automática, uma demanda parada numa etapa antiga
viraria trabalho órfão. O admin apaga à mão o que não usa — e o banco recusa apagar etapa
que ainda tem demanda dentro.

*Onde isso mora:* `tenants.atendimento_segmento` (não numa tabela de config do app), porque
é característica da empresa — se outro módulo precisar saber o ramo do cliente, já está lá.
O catálogo de ramos vive em `src/lib/atendimentoSegmentos.ts`; acrescentar um novo é uma
entrada no arquivo e um valor no CHECK da coluna, sem `if` espalhado pelas telas.

**A seção "Apps arquivados" saiu da tela.** Cobrança e Portal continuam desligados no
banco (rotas bloqueadas, dados intactos), mas não aparecem mais em `/apps`. Religar um
deles hoje exige mexer no banco de propósito — não é operação de rotina.

Migrations: `20260804180000` (segmento + seed por ramo), `20260804190000` (ícone e
Dashboard legado).

---

## 2026-08-04 (tarde) — App Atendimento (Social Media) e catálogo de apps enxuto

**O que mudou para quem usa.** A tela `/apps` deixou de listar 5 aplicativos e passa
a listar **3**: OMNXChat, Atendimento e Contratos. O Dashboard saiu da lista porque
virou parte do núcleo — é a tela inicial, desligá-la deixaria a pessoa sem para onde
ir ao entrar. Cobrança e Portal do Cliente foram **arquivados**: somem do menu e das
URLs, mas ficam recolhidos numa seção "Apps arquivados" na própria tela, prontos para
religar. Nenhum dado foi apagado.

*Por que o Portal saiu:* checamos no banco antes de mexer. Os únicos 2 usuários com
perfil `cliente` — quem entraria na área externa — são contas de teste do projeto
OMNX-Comissões, e uma delas nunca logou. Não há cliente final usando o Portal hoje.

**App novo: Atendimento.** Primeira versão voltada a **Social Media**, entregando o
que faltava: um lugar para o pedido do cliente existir. Hoje "preciso de 4 reels essa
semana" vive no WhatsApp e some no meio da conversa — sem dono, sem prazo, sem saber
se o cliente aprovou.

| Tela | Para quê |
|---|---|
| **Painel** (`/atendimento`) | O que precisa de atenção agora: atrasadas, vencendo hoje, esperando o cliente, com ajuste pedido, entregues no mês |
| **Demandas** | Lista com busca (título, código `DEM-00012`, descrição) e filtros por etapa, cliente, responsável, prioridade e situação |
| **Kanban** | Arrastar a demanda pela etapa — mesmo padrão do kanban de Contratos |
| **Detalhe** | Responsável, prazo, prioridade, aprovação do cliente, comentários da equipe e histórico |
| **Configuração** (admin) | Etapas do fluxo e tipos de solicitação |

**A decisão que faz o app crescer.** Tipos e etapas são **dados por tenant**, não
código. Trocando esses dois conjuntos, o mesmo app atende uma clínica ou um escritório
sem migration nova — Social Media é só o primeiro conjunto semeado (Reels, Carrossel,
Story, Post único, Campanha, Outro / Solicitado → Em produção → Em revisão interna →
Aguardando aprovação → Aprovado → Publicado).

**Duas coisas que o histórico registra sozinho.** Mudança de etapa, responsável, prazo,
prioridade e aprovação são gravadas por **trigger no banco**, não pela tela. Assim a
trilha vale venha a mudança do detalhe, do kanban ou de uma correção manual. E entrar
numa etapa marcada como *final* carimba a conclusão — voltar para uma etapa de trabalho
limpa o carimbo.

**Dois defeitos encontrados e corrigidos no caminho:**

1. **`has_permissao()` no banco não tinha a escada de ações que o front tem.** A função
   comparava a ação exata, então quem tinha `editar` não passava numa checagem de `ver`
   — enquanto `usePermissoes.can` sempre tratou `editar` como suficiente. Passou
   despercebido porque, até agora, **nenhuma policy chamava a função**: o gate vivia só
   no front. Como o Atendimento é o primeiro app com gate na RLS, isso viraria bug real
   — a matriz de `/admin` grava uma linha por par (perfil, recurso), então marcar
   "editar" apagaria a linha "ver" e derrubaria o acesso de quem acabou de ganhar
   permissão. Alinhado nos dois lados (`20260804160000`).
2. **FKs de usuário apontavam para `auth.users`**, fora do padrão do projeto. O
   PostgREST só monta o join `responsavel:users(nome)` com FK para o schema exposto —
   sem a correção, a tela não teria como mostrar o nome do responsável. Corrigido antes
   de existir qualquer dado.

**Segurança.** As 5 tabelas novas nascem com RLS por tenant; as demandas exigem
permissão no recurso `atendimento` para leitura e escrita — esconder o menu não protege,
a trava está na RLS. O bucket `atendimento-anexos` é privado e isolado por tenant, e a
função nova recebeu `REVOKE ... FROM PUBLIC` explícito (a lição do P0 de 27/07: função
nova no Postgres nasce executável por PUBLIC, e revogar de `authenticated` não tira
esse grant).

**Migrations:** `20260804130000_catalogo_apps_reorganizado`,
`20260804140000_app_atendimento_social_media`,
`20260804160000_has_permissao_escada_de_acoes`, mais o ajuste das FKs. Aplicadas via
Management API e conferidas no banco (catálogo por tenant, RLS ativa nas 5 tabelas,
12 tipos e 12 etapas semeados nos 2 tenants).

**Ainda não entrou:** upload de anexo pela tela (bucket e coluna já existem), criar
demanda a partir de uma conversa do Chat, métricas do Instagram no painel e reordenar
etapas por arraste.

---

## 2026-08-04 — Identificador de pagamento lido do comprovante (OCR no navegador)

**O problema.** Quando o financeiro abria o extrato bancário, não dava pra saber de qual
venda era cada crédito: o nome que aparece no extrato é o do **titular que pagou**, que
muitas vezes não é o nome do cliente cadastrado (cônjuge, sócio, a empresa dele).

**O que foi feito.** Novo campo **`identificador_pagamento`** em `vendas_pendentes`, exibido
em linha própria na lista de Onboarding (em destaque quando falta) e editável no modal, com
histórico de edição como os demais campos.

O preenchimento é automático: o comprovante é lido por **OCR rodando no próprio navegador**
(`tesseract.js`, `src/lib/ocrComprovante.ts`). Não há chave de API, serviço externo nem custo
por leitura — a imagem nunca sai da máquina de quem está usando o sistema.

Três pontos de leitura:

1. **Formulário público** (`/vendas/nova`) — ao anexar o comprovante, o campo já vem preenchido para
   o closer conferir antes de enviar.
2. **Modal do onboarding** — botão "Ler comprovante" relê os arquivos já salvos quando o
   palpite saiu errado ou veio vazio.
3. **Backfill na lista** — botão que varre de uma vez todas as vendas antigas sem identificador.

**Como a leitura decide o nome.** O comprovante é dividido em blocos ("quem pagou" x "quem
recebeu") e só nomes do bloco do pagador são aceitos — senão a leitura devolveria a própria
Aliança, que é quem recebe. A heurística tem teste cobrindo os layouts de Nubank, Itaú, Banco
do Brasil, Inter e Mercado Pago (`src/lib/ocrComprovante.test.ts`).

**Limites conhecidos.** O tesseract só lê **imagem** — comprovante em PDF ou HEIC precisa ser
digitado à mão (o botão fica desabilitado nesses casos, com o motivo no tooltip). E o
resultado é sempre um palpite: o campo permanece editável em todos os pontos, por isso o texto
na tela pede conferência em vez de afirmar que está certo.

---

## 2026-07-31 (noite) — Formulário público de venda: erro genérico e comprovante recusado

**Sintoma.** A Roberta Marques não conseguia enviar uma venda em `/venda`: o formulário
mostrava apenas **"Edge Function returned a non-2xx status code"**. Os logs confirmaram
`POST | 400` em `vendas-publicas-create`.

**Três problemas encadeados, todos corrigidos:**

1. **O motivo real do erro era engolido.** A function responde 400 com um JSON explicativo
   (`{error, detail}`), mas o `supabase.functions.invoke` lança `FunctionsHttpError` e o front
   usava só `err.message` — a mensagem genérica do supabase-js. O corpo da resposta fica em
   `err.context`; agora ele é lido e traduzido para português (`mensagemDoErro`), então o closer
   vê "O comprovante X passa de 20 MB" em vez de jargão.

2. **Comprovante legítimo era recusado.** A validação exigia `image/*`, e (a) **PDF** — extrato
   de banco, o comprovante mais comum — era barrado mesmo com o bucket já configurado para
   aceitá-lo; (b) foto de iPhone (**HEIC**) e alguns prints chegam com `type` vazio ou
   `application/octet-stream`, caindo no mesmo 400. Agora o MIME é resolvido pela extensão
   quando o navegador não informa (`mimeDoArquivo`), e PDF é aceito de ponta a ponta.

3. **Nada validava o arquivo no anexo.** Tamanho e formato só eram checados no servidor, depois
   do formulário todo preenchido. Agora a recusa acontece no momento do anexo, nomeando o
   arquivo e o motivo.

**Limites elevados e alinhados** (eram inconsistentes entre bucket e function):

| | Antes | Agora |
|---|---|---|
| Tamanho por arquivo (function) | 5 MB | **20 MB** |
| Tamanho por arquivo (bucket) | 10 MB | **20 MB** |
| Arquivos por venda | 30 | **60** |
| Formatos | imagens (bucket recusava `heif`/`gif`) | JPG, PNG, WEBP, HEIC, HEIF, GIF, **PDF** |

**Observabilidade.** Toda recusa agora passa por `fail()`, que registra código e detalhe no log
da function — antes um 400 não deixava rastro e o diagnóstico dependia de reproduzir o que o
closer fez.

**Verificado em produção** (`vendas-publicas-create` v24): envio com PDF → 200; envio de HEIC
como `application/octet-stream` → 200 (ambos davam 400 antes); payload inválido → 400 com
`detail` legível. As duas vendas de teste foram removidas do banco.

---

## 2026-07-28 (noite) — Disparo: tag duplicada corrigida e escolha pessoa a pessoa

**Bug corrigido — o CRM ficava com N tags de mesmo nome.** Encontrado pelo Bruno ao abrir
o painel do GHL: uma única aplicação de tag em 3 contatos criou **3 tags idênticas**, todas
no mesmo minuto. Causa: `crm-aplicar-tag` escreve com 6 requisições em paralelo e o GHL cria
a tag no momento em que ela é usada — como a tag era inédita, as chamadas simultâneas não
enxergaram umas às outras e cada uma criou a sua.

Isso não é cosmético: o workflow do GHL amarra o gatilho a **uma** tag, então parte do
público receberia a tag "errada" e nunca seria disparada — falha silenciosa, do mesmo
tipo que o bug do espelho desatualizado.

Correção: a **primeira escrita do lote roda isolada** (parâmetro `aquecer` em `comLimite`),
criando a tag uma vez só; as demais seguem em paralelo e reaproveitam. Deployado no Empire
(`crm-aplicar-tag` v3, `verify_jwt=false`) e agora **versionado** em
`GHL-SUPABASE/supabase/functions/crm-aplicar-tag/` — antes só existia deployado.

**Escolha pessoa a pessoa na tela `/disparo`.** Antes o público saía em bloco: o que os
filtros de status/produto/tag devolvessem, ia inteiro. Agora há um passo 2 com busca por
nome ou telefone e uma caixa por pessoa. Todos entram marcados; desmarcar tira do envio.
Guardamos os **excluídos** (não os incluídos), então quem entra depois no recorte nasce
marcado em vez de sumir calado. O resumo mostra "N selecionados" e quantos foram
desmarcados, com atalho para restaurar.

**Contatos etiquetados nesta rodada** (para configurar o workflow no GHL):

| Tag | Quem |
|---|---|
| `teste-disparo-omnx-28jul` | 3 contatos fictícios criados pela ponte (`Teste Disparo OMNX 1/2/3`) — apagar depois |
| `demo-disparo-omnx-28jul` | 3 clientes reais **ativos** que já existiam no CRM: Alexandre de Almeida, Alison Machado, André Luis Rodrigues — receberam só a tag, cadastro intocado |

---

## 2026-07-28 — Disparo por tag no CRM: ponte concluída e testada

O Desk agora consegue pegar um recorte da base de contratos e entregá-lo etiquetado no
CRM. **O Desk não envia mensagem nenhuma** — quem dispara é o workflow do GHL que escuta
a tag. A tela `/disparo` (rota não listada no menu, só admin) já existia; faltava o outro
lado da ponte, que foi escrito e deployado agora.

**O que entrou**

- `crm-aplicar-tag` no projeto Empire (`qzesffnkqgelmtfblzkr`) — a única peça que escreve
  no GHL. Cópia de referência em `docs/integracoes/empire/crm-aplicar-tag.ts`.
- Deploy de `disparo-enviar-ghl` no Desk (estava só no repositório, sem estar no ar — era
  o erro de CORS que a tela dava).
- Funções `chave_telefone_br` e `crm_match_contatos_por_chave` no banco do Empire, com
  índice — o match em lote roda numa consulta só.
- Ponte por tenant **ativada**: secret no Vault dos dois lados (`tenant_integracoes` no
  Desk, `workspace_integration_credentials` no Empire). Antes rodava por secret global.

**A regra que evita estrago.** O match é pela chave canônica *DDD + últimos 8 dígitos*,
nunca pela string cheia: o mesmo celular está gravado com e sem o nono dígito entre as
bases, e comparar a string inteira criaria contatos duplicados. Quem tem **mais de um**
cadastro no CRM é marcado como ambíguo e **não é tocado** — escolher um seria chute.

**Bug pego no teste.** A primeira versão confiava no espelho local de contatos. Só que o
espelho guarda gente que já foi **apagada do GHL**: essas pessoas contavam como "já
existe", a tag falhava em silêncio e elas nunca receberiam a mensagem. A versão final
confere cada candidato na API do CRM antes de decidir. O espelho segue sendo usado para o
que só ele sabe: detectar cadastro duplicado.

**Testado contra o CRM de produção** (contato de teste criado e apagado ao final): tag em
contato existente, criação de contato novo, `dry_run` sem escrever nada, telefone com
máscara, tag com maiúscula/espaço, telefone ambíguo e telefone inválido.

**Falta:** o workflow no GHL com gatilho *Contact Tag Added*. Sem ele a tag é aplicada e
nada acontece. E a UI da tela `/disparo` precisa de uma passada de design.

---

## 2026-07-27 — Exportação de contratos com recorte próprio

O botão "Exportar" da lista de contratos baixava direto um CSV fixo com todas as
colunas. Agora abre um diálogo (`ExportContratosDialog`) onde se afina o recorte do
arquivo antes de gerar, com contador ao vivo de quantas linhas vão sair.

**Recortes:** todos os filtrados ou só os marcados na tabela; ignorar contratos sem
valor; só quem tem WhatsApp; só quem tem e-mail; um contato por cliente (dedupe por
telefone, com fallback no nome — evita mandar a mesma mensagem duas vezes para quem
tem mais de um contrato).

**Colunas:** presets "Disparo / contatos", "Financeiro" e "Completo", com ajuste
individual por coluna.

**Telefone.** Os números no banco vêm de origens diferentes e estão em formatos
variados ("21 98935-8444", "5511999998888", "(11) 99999-8888"). `src/lib/telefone.ts`
normaliza para E.164 (+55…), que é o formato aceito pelas ferramentas de disparo.
Quando o número não bate com nenhum tamanho conhecido, a linha sai marcada na coluna
"Aviso" em vez de ser descartada — melhor conferir do que perder o contato em
silêncio. Cobertura em `telefone.test.ts` (8 casos). Suíte 38/38.

**Contexto.** Nasceu da necessidade de disparar mensagens para clientes ativos de
produtos específicos via GHL. A exportação é genérica de propósito — nada de GHL
acoplado à tela, para não sujar o Desk multi-tenant.

---

## 2026-07-27 — Zeragem das pendências dos roadmaps (5 ondas)

Varredura das pendências acumuladas em `multi-tenant-roadmap.md`,
`ROADMAP-MODULARIZACAO.md`, `plano-datas-contratos.md` e `integracoes/vercel.md`.
O levantamento mostrou que parte já estava feita e nunca fora marcada.

**Onda 1 — segurança e higiene.** `vercel.json` ganhou os headers que faltavam (CSP
ficou de fora de propósito: quebraria a mídia do Chat; entra depois em Report-Only).
Buckets `avatars`, `contratos-anexos` e `vendas-comprovantes` ganharam limite de
tamanho e MIME. `contrato_modelos` ganhou CHECK de 7 MB no base64. `app_modules`
passou a `tenant_isolation` RESTRICTIVE. `types.ts` regenerado, `as any` removidos.

**Onda 2 — duas datas de contrato.** `data_assinatura` (gatilho do Clicksign) e
`data_pagamento` (derivada da entrada em `pagamentos`). Backfill de 300/300 e 23.
`data_fechamento` intocada de propósito — alterá-la dispararia recálculo de comissão
em massa. Faturamento conferido antes/depois: idêntico. Guarda da sentinela no
cálculo de comissão. O teste `fluxoFuturo` que falhava desde antes desta sessão
ancorava em `vencimento`, abandonado pelo código há tempos — o teste estava
desatualizado, não o código. Suíte 25/25.

**Onda 3 — permissões por app (Fase 2).** Tabela `permissoes_app`
(perfil × recurso × ação) + `has_permissao()` + hook `can()`. O seed reproduz o gate
anterior: 12/12 asserções iguais, ninguém ganhou nem perdeu acesso. Matriz editável
em `/admin`. 4 telas migradas; o resto segue no gate legado (aditivo por construção).

**Onda 4 — Fase C do multi-tenant.** A ponte com o Empire dependia de uma função com
`IF v_count <> 1 THEN RETURN` — quebraria para todos no dia da 2ª empresa. Agora
resolve por tenant, e as 5 edge functions usam o tenant do objeto sobre o qual agem.
Storage isolado por tenant sem mudar nenhum caminho de arquivo.

**Onda 5 — pendências menores.** Reporte de erros ganhou anexos (§14.2), tela
`/meus-reportes` com resposta ao usuário separada da nota interna (§14.5) e
`link_externo` (§14.6). `UserForm` passou a editar a liberação individual de
Contratos, completando o cadastro central de usuário.

**Fora de escopo por decisão:** Fase 4 (App Atendimento) adiada para PRD próprio;
Fases 7 e 8 são contínuas.

### Auditoria de segurança antes do merge (mesmo dia)

- **P0 — regressão introduzida pela própria Onda 4.** `REVOKE ... FROM anon, authenticated`
  não remove o grant implícito de `PUBLIC`. A função nova que devolve o secret da ponte
  Empire ficou executável por qualquer usuário logado. Provado explorando e provado
  corrigido. Não vazou: `tenant_integracoes` está vazia. A auditoria de 21/07 já havia
  **aprovado** que "a única função que decifra é service_role only" — ao clonar a função,
  o controle de acesso não veio junto.
- **P1 — pré-existente.** A policy de `users` consultava `users` dentro dela mesma →
  recursão infinita em todo UPDATE, inclusive de admin: a **edição de colaboradores estava
  quebrada em produção**. A mesma policy permitia editar a própria linha sem restringir
  colunas, então consertar só a recursão abriria auto-promoção a admin. Corrigidos juntos,
  com 4 testes sob o motor de RLS real.

### Correção da busca de contratos (reportada pelo usuário)

A busca por nome não funcionava, por duas causas somadas:

1. **Sem normalização de acento** — "jose" não achava "José". Não havia `normalize()` em
   lugar nenhum do projeto.
2. **Filtro de status padrão** — a lista abre em `ATIVO` + `Não iniciado`, deixando ~105
   dos 326 contratos invisíveis. Em vez de mudar o padrão silenciosamente, a lista passou
   a avisar quantos contratos casam com a busca mas estão fora do filtro, com botão para
   mostrar todos.

## 2026-07-27 — Aba Produtos em Contratos (catálogo + modelos juntos)

- **Nova tela `/contratos/produtos`** (só admin), entre Recebíveis e Tags. Até
  aqui o catálogo de produtos (`products` com `client_id IS NULL`) só existia no
  banco: alimentava os seletores de contrato/venda/modelo, mas **não havia nenhuma
  tela para cadastrar, renomear ou desativar** — os 15 produtos foram inseridos
  por SQL.
- Cada produto é uma **linha expansível**: ao abrir, mostra nome/descrição
  editáveis (salvam no blur), os **modelos .docx daquele produto** (baixar,
  substituir, excluir, adicionar por variante) e o botão de ativar/desativar.
  Bloco fixo no fim para o **modelo padrão** (`produto_id NULL`).
- **Sem exclusão de produto por design** — contratos existentes apontam para ele;
  desativar tira dos seletores e preserva o histórico. O contador de contratos por
  produto soma `produto_id` **e** `produto_nome` (contratos legados do Notion não
  têm o id).
- **Aba "Modelos" absorvida:** `ContratoModelosPage` removida e
  `/contratos/modelos` passa a redirecionar para `/contratos/produtos`.
- Arquivos: `src/hooks/useProdutosCatalogo.ts` (novo),
  `src/pages/contratos/ProdutosCatalogoPage.tsx` (novo), `ContratosTabs`, `App.tsx`.
  Sem migration — `products` já tinha `tenant_id` (trigger `set_tenant_id`) e RLS
  `tenant_isolation`.

## 2026-07-24 — Fase 6 (conclusão): Interações/NPS/Entregas/Trilhas internos

- **Interações** removida por completo: tela `/interacoes`, hook exclusivo
  `useInteractions` e tabela `client_interactions` (0 linhas, 0 FK externa).
- **NPS/Entregas/Trilhas internos:** removidas só as **telas internas** de gestão
  (fora do menu) — `NpsPage`, `EntregasPage`, `EntregaDetailPage`, `EntregaForm`,
  `TrilhasPage`, `TrilhaDetailPage`. **Tabelas e hooks compartilhados preservados**
  (`useNps`, `useEntregas`, `useCamiDeliveries`, `useTrilhas`, `nps_*`, `deliveries`,
  `learning_*`) porque o **Portal do cliente e os Relatórios os consomem**.
- Precedida de auditoria de dependências (subagente) que evitou quebrar o Dashboard:
  `EntregasCamiPage` parecia morta mas é usada na aba Entregas do Dashboard — mantida.

## 2026-07-24 — Fase 6 (parcial): remoção de legado morto

- **7 páginas órfãs de Comissão** removidas (`AprovacoesPage`,
  `ComissoesDashboardPage`, `ConsultoresPage`, `ExtratosPage`, `ExtratoDetailPage`,
  `ExtratoPrintPage`, `ProdutosComissaoPage`) — sem rota nem import; versão viva é o
  projeto OMNX-Comissões separado. Pasta `src/pages/comissoes/` deixou de existir.
- **Pipelines / Oportunidades removido por completo** (decisão do usuário):
  tela `/pipelines` + painel `ClienteOportunidades` no detalhe do cliente + hook
  `useSalesPipelines`, e **drop das 6 tabelas `sales_*`** (168 oportunidades).
  Auditoria antes: 0 FKs externas, 0 funções dependentes; dump dos dados salvo fora
  do banco antes do drop. Migration `20260724140000_drop_pipelines_sales.sql`.
- Auditoria E6.1 registrada: Interações/NPS/Entregas/Trilhas internos estão ~vazios
  (candidatos), mas não removidos ainda (rota viva; Portal usa parte disso).

## 2026-07-24 — Fase 3: desenredar Contratos × Comissões (higiene)

- `ContratosPage`, `ContratoDetailPage`, `ContratosKanbanPage` + `recorrencia.ts`
  saíram de `src/pages/comissoes/` para `src/pages/contratos/` (via `git mv`,
  comportamento idêntico). `ComissoesLayout` (órfão) removido.
- Fronteira confirmada: as páginas de comissão puras deste repo estão órfãs — a
  versão viva é o projeto **OMNX-Comissões** separado. Removê-las fica pra Fase 6.

## 2026-07-24 — Documentação (changelog, arquitetura, UML, acesso, integrações)

- Criados: `MUDANCAS.md` (este changelog), `ARQUITETURA.md` (doc canônico, já
  refletindo o modelo multi-tenant vigente), `UML.md` (ER + fluxo dos apps por
  engenharia reversa do schema), `reestruturacao/NIVEIS-DE-ACESSO.md` (as 4 camadas
  de acesso atuais — pré-requisito da Fase 2), `integracoes/README.md` (índice) e
  `integracoes/vercel.md` (deploy + gap dos headers de segurança).
- **Fase 0 da reestruturação concluída** (faltavam UML e níveis de acesso).

## 2026-07-24 — Provisionamento de empresas + fecho do multi-tenant

- **Fase A.2 (NOT NULL)** aplicada em produção: `tenant_id` agora é `NOT NULL` em
  **106 tabelas** (0 nullable). Defesa extra contra insert via `service_role` sem
  tenant. Lock curto (maior tabela `chat_messages` ~43k linhas).
- **Fase 1 (modularização) — Cobrança e Portal** entram no catálogo `app_modules`
  (5 apps: dashboard/chat/contratos/**cobranca/portal**), todos ligados (fail-open).
  Rotas `/cobranca` e `/portal` passam a respeitar o liga/desliga (`RequireApp`).
- **E1.7:** o toggle de apps (`useToggleAppModule`) grava `updated_by` — auditoria
  de quem ligou/desligou.
- **Provisionamento** (WIP → produção): tela `/empresas` (só admin do tenant MESTRE
  via `is_master_admin()`) cria empresa nova = tenant + 1º admin (senha `Desk@2026`)
  + `seed_tenant` (kanban + departamentos). Edge function `provision-tenant`.
- **Fix crítico (achado em teste E2E):** `handle_new_user` passou a carimbar
  `user_roles.tenant_id` explicitamente. Antes omitia, e com >1 tenant + Fase A.2 a
  criação de qualquer usuário quebraria assim que a 2ª empresa fosse criada.
- **Teste end-to-end validado** (transação com rollback, motor RLS real): empresa
  nova nasce com 5 apps + 6 colunas de kanban + 2 departamentos; o admin novo é
  carimbado no tenant certo, não herda cargo de outro tenant, e **vê 0 dados de
  negócio** (contratos/clients/comissões/vendas) — só os próprios 5 apps.
- UX: URL base do Empire (Integrações) escondida num `<details>` avançado.

## 2026-07-23 — Multi-tenant: isolamento de dados por tenant (Fases A + B)

- **Fase A:** `tenant_id` + trigger de carimbo (`tg_set_tenant_id` /
  `resolve_tenant_default`) + backfill + índice em **98 tabelas de negócio**.
- **Fase B:** policy **RESTRICTIVE** `tenant_isolation` por tabela
  (`tenant_id = get_user_tenant_id()`), combinando em AND com as regras de perfil.
- **Hardening:** RLS deny-all + revoke em 6 tabelas de backup/dedup; revoke de
  `EXECUTE` de PUBLIC nas funções de trigger. Teste cross-tenant: empresa fictícia
  lê 0 em 100/100 tabelas; injeção cross-tenant bloqueada (42501).
- **Modularização (Fase 1 inicial):** tabela `app_modules` por tenant, hook
  `useAppModules`, menu dinâmico, guard `RequireApp`, tela `/apps` (admin).
- **Reporte de erros (Fase 5):** botão flutuante + painel de triagem `/reportes`
  (multi-tenant, protocolo `ERR-0000X`).

## 2026-07-21 — Ponte GHL: contrato assinado move card

- Trigger `link_clicksign` → `empire-contrato-assinado-ghl` → `crm-marcar-assinada`
  move o card para Vendas SQL/Assinada no CRM Empire.

## 2026-07-07 — Gerador de contrato em PDF + Kanban configurável

- Botão "Gerar contrato" no onboarding: modelos `.docx` por produto + preview
  editável + PDF via CloudConvert.
- Kanban de contratos com colunas editáveis por admin + coluna Onboarding.

## 2026-07-02 — Módulo Contratos no menu principal

- Contratos vira módulo próprio (`/contratos`) com abas Dashboard/Lista/Kanban/
  Onboarding. Comissões por "valor total". Status vira ATIVO ao anexar Clicksign.

## 2026-05-07 — Módulo Comissões

- Entrega inicial de `/comissoes`: schema, cálculo (regra do dia 15), fechamento
  mensal, import do Notion. Doc em `docs/comissoes.md`.

---

> Entregas mais antigas (Fases 1–27 do core/chat/cobrança/IA) estão consolidadas
> em `docs/PROGRESS.md`.
