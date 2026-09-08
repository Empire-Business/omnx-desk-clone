# Roadmap — App de Disparos (mensagens em massa)

> **Estado:** implementação em andamento. Parte do Desk está pronta; falta a
> correspondente no projeto Empire (`crm-aplicar-tag`).
> Atualizado em: 28/07/2026 às 21h10 BRT
>
> ⚠️ **Leia primeiro a seção "Revisão de rota".** O desenho original (motor de
> disparo nativo no Desk) foi trocado pelo desenho por **tag no GHL**. As seções
> seguintes ficam como registro do que foi auditado, mas as Fases 1–3 originais
> não são mais o caminho recomendado.

---

## 🎯 O problema que originou isto

Necessidade real trazida pelo Bruno (27/07/2026): disparar uma mensagem para um
recorte da base — **só clientes ativos**, **só de determinados produtos**. Hoje isso
é feito exportando CSV na mão e importando numa ferramenta externa.

A restrição que ele colocou é a parte mais importante do pedido:

> *"Lembra que as pessoas vão usar o nosso sistema multi-tenant também. Então não
> pode ter um negócio ali que é só nosso."*

Ou seja: **nada de GHL acoplado à tela**. A funcionalidade tem que fazer sentido para
qualquer empresa que use o Desk, não só para a Aliança.

---

## 🔁 Revisão de rota (28/07/2026, tarde) — o Desk etiqueta, o GHL dispara

O desenho abaixo substitui as Fases 1–4 originais. Motivo: o disparo **não precisa
acontecer no Desk**. O que o Bruno descreveu é mais simples e usa ferramenta que a
Aliança já domina.

### Fluxo acordado

```
Lista de Contratos
  → filtra o recorte (status, produto, tags — filtros que já existem)
  → botão "Enviar pro GHL"
  → informa o nome da tag da campanha (ex.: campanha-julho-gold)
  → tela de confirmação: X já existem · Y serão criados · Z ambíguos
  → edge function manda o lote pela ponte Empire
  → no GHL o contato ganha a tag
  → workflow do GHL com gatilho "Contact Tag Added = <tag>" manda a mensagem
```

O Desk **não envia mensagem nenhuma** neste desenho. Ele entrega público etiquetado.

### Decisões (respondidas pelo Bruno)

| Questão | Decisão |
|---|---|
| Contato que não existe no GHL | **Criar, mas avisar antes** — a tela mostra quantos serão criados e exige confirmação explícita |
| A tag fica registrada no Desk? | **Não.** A tag é só do GHL; o Desk apenas transporta o nome |
| Onde fica o botão | **Na lista de Contratos**, reaproveitando os filtros existentes |

### Regra de mesclagem (o ponto crítico)

O GHL já tem contatos que podem ser os mesmos do Desk. A regra segue o princípio já
adotado em `empire-contrato-assinado-ghl`: **só age com match único.**

| Contatos encontrados no GHL | Ação |
|---|---|
| **1** | Usa esse. Aplica só a tag — não cria, não sobrescreve nome/e-mail |
| **0** | Vai para a fila de "serão criados", exibida na confirmação |
| **>1** (telefone acha um, e-mail acha outro) | **Não cria e não mescla.** Marca como *ambíguo* e lista na tela para resolução manual no GHL |

- Chave primária de match: **telefone em E.164** (`src/lib/telefone.ts` já normaliza)
- Chave secundária: e-mail em minúsculas
- **O Desk nunca mescla contatos no GHL.** Mesclagem é destrutiva e irreversível —
  ele apenas evita duplicar e reporta o que ficou ambíguo

### Formato de telefone — os dois lados são diferentes (medido em 28/07/2026)

Levantado pelo Bruno: *"a formatação de número que temos pode ser diferente da do GHL."*
É, e o desencontro é grande.

| | Desk — `contratos.whatsapp` | GHL — `contatos.telefone` (projeto `qzesffnkqgelmtfblzkr`) |
|---|---|---|
| Formato dominante | **máscara**: `(11) 99999-8888` — 198 | **E.164**: `+5511999998888` — 8.945 |
| Sem código do país | 47 | 6 |
| Já em E.164 | **4** | 9.305 |
| Máscara / atípico | 215 | 33 |
| Vazio | 46 | 1.819 |

O GHL está praticamente limpo; o Desk é que está bagunçado (herança de Notion,
formulário e digitação manual). Isso já era esperado — o `normalizaTelefoneBR`
existe justamente por causa disso e **normalizou os 263 telefones sem nenhum inválido**.

#### Cruzamento real (263 telefones do Desk × 11.522 do GHL)

Comparando por **chave canônica = DDD + últimos 8 dígitos**:

| Resultado | Quantidade |
|---|---|
| Chaves distintas no Desk | 258 |
| **Já existem no GHL** (só levam a tag) | **186** (72%) |
| Seriam criados de verdade | 72 |
| Estão no GHL **sem o nono dígito** | 16 |
| **Chaves ambíguas** (já duplicadas dentro do próprio GHL) | 27 |

#### Por que não dá para usar match exato de E.164

Aqueles **16 casos** têm o número gravado sem o nono dígito no GHL — ex.: Desk tem
`+5521989358444`, GHL tem `+552189358444`. O Brasil acrescentou o `9` aos celulares
e bases antigas ficaram sem ele. Com match exato, esses 16 **virariam contatos
duplicados novos no GHL**, e o erro só apareceria depois do disparo, com gente
recebendo a mensagem duas vezes.

#### Regra de normalização definida

1. Normalizar **os dois lados** para E.164 antes de comparar — `src/lib/telefone.ts`
   no Desk; a mesma lógica replicada no lado Empire
2. Comparar pela **chave canônica DDD + últimos 8 dígitos**, nunca pela string cheia
3. Ao **criar** contato novo, gravar no formato do GHL: E.164 completo **com** o nono
   dígito (`+55` + DDD + 9 dígitos)
4. Ao **encontrar** contato existente, **não corrigir** o telefone dele — só aplicar a
   tag. Corrigir número alheio é escrita destrutiva no CRM e não é o objetivo do disparo
5. As **27 chaves ambíguas** nunca são tocadas: vão para a lista de revisão manual,
   porque são duplicatas que já existem no GHL e escolher uma delas seria chute

> Os 46 contratos sem telefone simplesmente não entram no lote — aparecem na tela de
> confirmação como "sem telefone".

### Estado atual

| Onde | O quê | Situação |
|---|---|---|
| Desk (front) | Tela `/disparo` com filtros, preview e confirmação | ✅ feito — rota oculta, gate de admin (UI a melhorar) |
| Desk (edge) | `disparo-enviar-ghl` — recebe lote + tag, chama a ponte Empire | ✅ **deployado** (28/07, v1) |
| Ponte com secret por tenant | `_shared/empire-bridge.ts` + `tenant_integracoes` | ✅ **ativada** — secret no Vault dos dois lados |
| Empire (`qzesffnkqgelmtfblzkr`) | `crm-aplicar-tag` — resolve match, cria se preciso, aplica tag | ✅ **deployado e testado** (v2) |
| Workflow do gatilho por tag | GHL, configuração manual | ⏳ com o Bruno |

> **Multi-tenant:** continua valendo a restrição original. O destino GHL vem da
> integração já cadastrada por tenant no Vault. Tenant sem integração não vê a tela.

### Próximos passos (ordem)

1. ~~Implementar `crm-aplicar-tag` no Empire~~ ✅ feito e testado em 28/07/2026.
2. ~~Deploy de `disparo-enviar-ghl` no Desk~~ ✅ feito em 28/07/2026.
3. Criar o workflow no GHL com gatilho **Contact Tag Added = `<tag da campanha>`** — sem ele
   a tag é aplicada e nada acontece. **Esta é a única peça que falta para disparar de verdade.**
4. Melhorar a UI da tela `/disparo` (pedido do Bruno em 28/07: "está muito feia").

### Ponte por tenant — ativada em 28/07/2026

Até aqui a ponte funcionava pelo **secret global** (env `EMPIREDESK_BRIDGE_SECRET` dos dois
lados). O caminho multi-tenant existia no código mas nunca tinha sido ligado, porque faltava
cadastrar a credencial. Agora está assim:

| Lado | Onde ficou |
|---|---|
| Desk (`wuzmckatbmlpkdxtfhqr`) | `tenant_integracoes` provider `empire`, secret no Vault, `base_url` do Empire |
| Empire (`qzesffnkqgelmtfblzkr`) | `workspace_integration_credentials` provider `omnx_desk`, `metadata.secret_sha256` = digest do mesmo secret |

O Empire resolve o workspace pelo digest SHA-256 do secret recebido. `crm-aplicar-tag` **não
tem fallback global**: sem workspace resolvido não há credencial GHL para usar, então é 401.
As funções antigas (`crm-registrar-venda`, `crm-marcar-assinada`) continuam aceitando os dois
caminhos, então nada quebrou na virada.

> ⚠️ O secret foi gerado durante a sessão de desenvolvimento e apareceu no terminal.
> Rotacionar quando for conveniente: gerar novo, gravar no Vault dos dois lados e atualizar o
> digest — a troca é atômica se feita na mesma ordem (Empire primeiro, Desk depois).

### O que os testes de 28/07 mostraram

Testado direto contra o CRM de produção, com contato de teste criado e apagado no fim:

| Caminho | Resultado |
|---|---|
| Contato existente recebe só a tag | ✅ `marcados: 1`, nome/telefone/e-mail intactos |
| Contato inexistente com `criar_novos` | ✅ criado em E.164 e já com a tag |
| `dry_run` | ✅ conta certo e **não escreve nada** (confirmado relendo as tags no GHL) |
| Telefone com máscara (`11 99999-9901`) | ✅ normalizado |
| Tag com maiúscula e espaço (`Campanha Julho GOLD`) | ✅ vira `campanha-julho-gold` |
| Telefone com 2 cadastros no CRM | ✅ marcado como ambíguo, **não tocado** |
| Telefone inválido | ✅ descartado, não vai para o CRM |

**Bug encontrado e corrigido no teste:** o espelho local (`contatos`) guarda contatos que já
foram **apagados no GHL**. A primeira versão confiava no espelho, contava essas pessoas como
"já existem" e a aplicação da tag falhava calada — elas nunca receberiam a mensagem. A versão
final confere cada candidato na API antes de decidir: quem sumiu de lá volta para a fila de
criação. O espelho continua sendo usado para o que só ele sabe — detectar quem tem **mais de
um** cadastro (ambíguo), que a busca da API esconde.

Cópia do código da função do Empire (que vive em outro repositório) fica em
`docs/integracoes/empire/crm-aplicar-tag.ts`, só para referência.

---

## 🔌 Contrato da ponte — `crm-aplicar-tag` (Empire)

A edge function do Desk chama essa função do Empire. Ela é a única peça que realmente
escreve no GHL.

### Requisição

```http
POST {EMPIRE_BASE_URL}/crm-aplicar-tag
x-omnx-desk-secret: {secret_da_ponte}
Content-Type: application/json
```

```json
{
  "tag": "campanha-julho-gold",
  "dry_run": true,
  "criar_novos": false,
  "contatos": [
    {
      "chave": "2199358444",
      "telefone": "+552199358444",
      "nome": "Maria Silva",
      "email": "maria@exemplo.com"
    }
  ]
}
```

| Campo | Significado |
|---|---|
| `tag` | Tag já normalizada (minúsculas, sem acento, hífen) |
| `dry_run` | `true` = só diagnostica, não escreve no GHL. `false` = aplica de verdade |
| `criar_novos` | `true` = cria contato quando não encontrar. `false` = só aplica tag nos existentes |
| `contatos[].chave` | DDD + últimos 8 dígitos — chave canônica de match |
| `contatos[].telefone` | E.164 completo, usado ao criar contato novo |
| `contatos[].nome` | Nome do contato |
| `contatos[].email` | E-mail opcional |

### Resposta esperada

```json
{
  "existentes": 186,
  "novos": 72,
  "criados": 0,
  "marcados": 186,
  "falhas": 0,
  "ambiguos": [
    { "telefone": "+552199358444", "nome": "Maria Silva" }
  ]
}
```

| Campo | Significado |
|---|---|
| `existentes` | Quantos contatos o GHL já tinha (receberam ou receberiam a tag) |
| `novos` | Quantos não existiam e seriam criados se `criar_novos=true` |
| `criados` | Quantos foram de fato criados (só conta quando `dry_run=false` e `criar_novos=true`) |
| `marcados` | Quantos contatos receberam a tag com sucesso |
| `falhas` | Quantos deram erro ao criar ou aplicar tag |
| `ambiguos` | Lista de contatos que o GHL tem duplicado — não são tocados |

### Regras de match no Empire

1. Normalizar o telefone recebido e os telefones do GHL para E.164.
2. Comparar pela **chave canônica = DDD + últimos 8 dígitos**. Isso faz
   `+552199358444` casar com `+552189358444` (sem o nono dígito).
3. Se achar **1 contato** no GHL → aplica só a tag. **Não altera nome, e-mail ou telefone.**
4. Se achar **0 contatos** e `criar_novos=true` → cria contato novo com telefone em E.164
   completo (sempre com o nono dígito para celulares brasileiros).
5. Se achar **mais de 1 contato** → marca como `ambíguo` e não toca. Escolher um seria chute.
6. E-mail é chave secundária de desempate, nunca substitui o telefone como chave principal.

### O que fica de fora deste caminho

As Fases 1, 2 e 5 originais (tabelas de campanha, motor nativo UAZAPI, opt-out,
acompanhamento) **não são necessárias** para atender o pedido. A tela fantasma
`/chat/campanhas` continua quebrada em produção e deve ser **escondida**, não
consertada. O motor `chat-broadcast-scheduler` fica onde está, sem uso.

A Fase 6 (token UAZAPI no Vault) segue válida — é dívida do Chat, não do disparo.

---

## 🔍 Diagnóstico — o que já existe (auditado em 28/07/2026)

Existe um motor de campanhas **inteiro já escrito e deployado** que ninguém usa,
porque as tabelas nunca foram criadas.

| Peça | Onde | Situação |
|---|---|---|
| Tela de campanhas | `src/pages/chat/ChatCampanhasPage.tsx` | ✅ existe, roteada em `/chat/campanhas` |
| Hooks | `src/hooks/useCampaigns.ts` | ✅ criar / importar contatos / lançar / cancelar |
| Motor de envio | `supabase/functions/chat-broadcast-scheduler` | ✅ **deployado, status ACTIVE** |
| Tabela `chat_campaigns` | — | ❌ **não existe no banco** |
| Tabela `chat_campaign_contatos` | — | ❌ **não existe no banco** |
| Migration dessas tabelas | — | ❌ **não existe no repo** |
| Link no menu | `AppSidebar` | ❌ não tem |
| App no catálogo `app_modules` | — | ❌ não tem |

**Consequência hoje:** quem abrir `/chat/campanhas` em produção toma erro — a tela
consulta uma tabela que não existe. É uma feature fantasma.

### O que o motor já faz (e é bom)

Lendo `chat-broadcast-scheduler/index.ts`:

- **Limite de 60 envios/hora**, com espera automática ao atingir o teto
- **Delay aleatório** entre mensagens (`randomDelay`)
- **Simula "digitando…"** antes de cada envio (presence via UAZAPI)
- **Variação de texto por IA** (opcional, OpenRouter) — cada pessoa recebe uma
  redação levemente diferente, que é o principal antídoto contra marcação de spam
- **Cancelamento no meio** do disparo (relê o status a cada contato)
- Template com `{nome}`
- Contadores de enviados/falhas

Isso é justamente a parte difícil e chata de escrever. Está pronta.

---

## 🧭 Decisões de arquitetura

### D1 — Aproveitar o motor existente, não reescrever

A função está deployada e referencia `chat_campaigns` / `chat_campaign_contatos`.
Criar as tabelas **com os nomes que o código já espera** significa zero alteração na
edge function — menos superfície de erro e entrega em horas, não em dias.

> **Trade-off assumido:** os nomes carregam o prefixo `chat_`, embora o público possa
> vir de Contratos. É dívida de nomenclatura consciente. Renomear depois custa uma
> migration + um redeploy da função; renomear agora custa isso **mais** o risco de
> quebrar o que já funciona. Fica para a Fase 5, se incomodar.

### D2 — Disparo nativo (UAZAPI) primeiro; webhook externo depois

O Desk já tem instâncias de WhatsApp conectadas e o motor de envio. Mandar a lista
para uma ferramenta externa só para ela reenviar é dar uma volta desnecessária.

O webhook externo (GHL, n8n, Make, o que o tenant usar) entra na **Fase 4** como
*mais um destino de disparo*, configurável por tenant — nunca hardcoded. Assim
atende o pedido do Bruno sem virar "coisa nossa" na tela de ninguém.

### D3 — App próprio no catálogo, ligável por tenant

Vira o app `disparos` em `app_modules` (categoria `app`, ordem 60). Quem não quiser,
desliga e some do menu. Segue o modelo já em uso pelos 5 apps existentes
(`dashboard`, `chat`, `contratos`, `cobranca`, `portal`).

### D4 — Público vem de "fontes", não de uma consulta fixa

O disparo precisa saber *para quem* mandar. Em vez de amarrar em Contratos, o app
recebe **fontes de público**:

| Fonte | O que traz | Fase |
|---|---|---|
| CSV colado / arquivo | qualquer lista | 1 (já existe na tela) |
| Contratos filtrados | recorte de status, produto, valor, tags | 3 |
| Conversas do Chat | quem falou / não falou em X dias | futuro |

Assim Contratos vira *uma* fonte, não *a* fonte — e um tenant que só usa o Chat
continua tendo um app de disparos útil.

### D5 — Token da UAZAPI precisa sair da variável de ambiente

**Este é o furo multi-tenant do desenho atual.** Hoje o token é lido assim:

```ts
const token = Deno.env.get(`UAZAPI_TOKEN_${instance.instance_id}`)
```

Uma variável de ambiente por instância. Isso não escala para N tenants — cada
empresa nova exigiria alguém cadastrar um secret à mão no painel do Supabase.

O padrão correto já existe neste projeto: a integração Empire guarda **secret por
tenant no Vault**. O disparo deve seguir o mesmo caminho. Como isso afeta também o
Chat inteiro (que usa a mesma variável), fica em fase própria (Fase 6) e **não
bloqueia** o uso interno.

---

## 🗃️ Modelo de dados

Duas tabelas, ambas com `tenant_id` + trigger de preenchimento + RLS
`tenant_isolation` RESTRICTIVE — conforme a regra do projeto de que nenhuma tabela
nova nasce global.

### `chat_campaigns`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | isolamento |
| `nome` | text NOT NULL | |
| `instance_id` | uuid NOT NULL | FK → `whatsapp_instances` |
| `mensagem_template` | text NOT NULL | aceita `{nome}` |
| `usar_ia_variacao` | boolean default false | |
| `status` | text CHECK | `rascunho` · `agendada` · `enviando` · `concluida` · `cancelada` |
| `total_contatos` / `enviados` / `falhas` | int default 0 | |
| `agendada_para` | timestamptz null | |
| `criado_em` / `concluida_em` | timestamptz | |
| `criado_por` | uuid | auditoria |

### `chat_campaign_contatos`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `campaign_id` | uuid NOT NULL | FK → `chat_campaigns` ON DELETE CASCADE |
| `numero_whatsapp` | text NOT NULL | **gravado já em E.164** |
| `nome` | text null | |
| `status_envio` | text CHECK | `pendente` · `enviado` · `falha` |
| `enviado_em` | timestamptz null | |
| `erro` | text null | motivo da falha, para reprocessar |

Índices: `(campaign_id, status_envio)` — é a consulta quente do scheduler.

---

## 🚦 Fases

### Fase 1 — Ligar o que já existe · Esforço: **Baixo** (~2–3h)

Objetivo: `/chat/campanhas` parar de dar erro e conseguir disparar de verdade.

- [ ] Migration criando as duas tabelas com `tenant_id`, trigger, RLS RESTRICTIVE
- [ ] Índices e constraints (CHECK de status, FK com CASCADE)
- [ ] Regenerar `src/integrations/supabase/types.ts`
- [ ] Cadastrar o app `disparos` em `app_modules` + entrada no `AppSidebar`
- [ ] Gate de permissão (`permissoes_app`) — quem pode criar e quem pode disparar
- [ ] Normalizar telefone no import usando `src/lib/telefone.ts` (já existe e testado)
- [ ] Teste manual: campanha com **3 contatos internos** antes de qualquer coisa real

**Critério de conclusão:** uma campanha de 3 contatos sai, os contadores batem, e o
cancelamento no meio funciona.
**Reversível:** sim — desligar o app no catálogo esconde tudo.
**Depende de:** nada.

### Fase 2 — Segurança do disparo · Esforço: **Médio** (~3–4h)

O motor tem proteções, mas faltam travas de gente.

- [ ] **Opt-out**: tabela de descadastro por tenant + filtro automático no envio
- [ ] Rodapé de saída no template ("responda SAIR para não receber mais")
- [ ] **Teto por campanha** configurável, com confirmação explícita acima de N
- [ ] **Envio de teste** para 1 número antes de liberar o lote
- [ ] Bloqueio de duplicata: mesmo número já contactado nos últimos X dias
- [ ] Registro em auditoria: quem disparou, para quantos, quando

**Critério:** disparar para alguém que pediu saída é impossível pela interface.
**Depende de:** Fase 1.

### Fase 3 — Público vindo de Contratos · Esforço: **Médio** (~4h)

- [ ] Botão "Criar campanha com esta seleção" na lista de contratos
- [ ] Reaproveitar os recortes do `ExportContratosDialog` (sem valor / sem WhatsApp /
      um por cliente) — mesma lógica, outro destino
- [ ] Guardar a origem do público na campanha (para saber depois de onde veio)
- [ ] Preview da lista antes de confirmar

**Critério:** filtrar "ativos + ACELERADOR GOLD" e chegar numa campanha pronta sem
passar por CSV.
**Depende de:** Fase 1.

### Fase 4 — Destino externo (webhook) · Esforço: **Médio** (~3h)

O pedido original do Bruno, feito de forma genérica.

- [ ] Cadastro de destinos por tenant (nome + URL + secret), nunca hardcoded
- [ ] Envio do público em lote assinado — reaproveitar o HMAC-SHA256 que a
      `webhook-dispatch` já implementa
- [ ] Escolha do destino na criação da campanha: *WhatsApp do Desk* ou *webhook X*
- [ ] Log de resposta do destino (status HTTP + corpo), para depurar

**Critério:** o mesmo público sai tanto pelo WhatsApp nativo quanto pelo GHL, e a
troca é uma escolha na tela.
**Depende de:** Fase 1.

### Fase 5 — Acompanhamento · Esforço: **Baixo** (~2h)

- [ ] Progresso ao vivo (enviados / falhas / restantes)
- [ ] Reprocessar só as falhas
- [ ] Histórico por contato (quem recebeu o quê e quando)
- [ ] *(opcional)* Renomear `chat_campaigns` → `disparo_campanhas`, se a nomenclatura
      incomodar — migration + redeploy da função

**Depende de:** Fase 1.

### Fase 6 — Token da UAZAPI no Vault · Esforço: **Alto** (~1 dia)

Dívida de multi-tenant que **não é exclusiva do disparo** — afeta o Chat inteiro.

- [ ] Guardar token por instância no Vault, chaveado por tenant
- [ ] Adaptar `chat-broadcast-scheduler`, `uazapi-send-message`, `uazapi-actions`
- [ ] Migrar as instâncias atuais das env vars para o Vault
- [ ] Remover as variáveis `UAZAPI_TOKEN_*` só depois de confirmar que tudo passou

**Critério:** criar um tenant novo com WhatsApp não exige ninguém mexer em secret
no painel do Supabase.
**Depende de:** nada (pode correr em paralelo), mas mexe em produção — branch
dedicada e OK explícito.

---

## ⚠️ Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| **Banimento do número** no WhatsApp | 🔴 Alta | Motor já tem 60/h + delay + variação por IA. Começar com lotes de 20–30. Usar instância que **não** seja a de atendimento principal. |
| **LGPD** — disparo sem saída | 🟡 Média | Base legal existe (relação contratual), mas opt-out é obrigatório na prática. Fase 2. |
| **Token global (env var)** | 🟡 Média | Não bloqueia uso interno; resolve na Fase 6. |
| **Tela fantasma em produção hoje** | 🟡 Média | `/chat/campanhas` dá erro. Fase 1 resolve; se demorar, esconder a rota. |
| **Disparo acidental para base inteira** | 🔴 Alta | Teto por campanha + confirmação + envio de teste. Fase 2. |

---

## 🚫 Fora de escopo (por ora)

- Mensagens com mídia (imagem, áudio, PDF)
- Fluxos de resposta automática ao disparo (isso é o bot, outro assunto)
- Segmentação por comportamento no Chat (fonte futura, D4)
- Disparo por e-mail (o `send-email`/Resend existe, mas é outro produto)
- Métricas de conversão do disparo

---

## 📌 Recomendação de execução

**Fase 1 → Fase 2 → Fase 3.** A Fase 1 sozinha já resolve a necessidade que originou
tudo isto, aproveitando trabalho que já estava pago. A Fase 2 vem logo atrás porque
disparo em massa sem opt-out e sem teto é risco operacional, não detalhe.

Fase 4 (webhook/GHL) só se o pessoal preferir centralizar lá — não é pré-requisito
de nada.

---

## 🕓 Histórico

| Data/hora BRT | O que |
|---|---|
| 28/07/2026 às 21h10 | **Bug da tag duplicada corrigido.** As 6 escritas em paralelo criavam a tag cada uma por si quando ela era inédita (3 contatos → 3 tags iguais no GHL), o que quebraria o workflow. Agora a primeira escrita do lote roda isolada (`aquecer`) e as demais reaproveitam. `crm-aplicar-tag` v3 no Empire, agora versionada em `GHL-SUPABASE/supabase/functions/crm-aplicar-tag/`. Tela `/disparo` ganhou seleção **pessoa a pessoa** (busca + caixa por contato). Aplicada a tag `demo-disparo-omnx-28jul` em 3 clientes reais ativos que já existiam no CRM (Alexandre de Almeida, Alison Machado, André Luis Rodrigues): `marcados: 3`, `criados: 0`, `falhas: 0` — só a tag, cadastro intocado. |
| 28/07/2026 às 20h05 | **Contatos de teste deixados no CRM** com a tag `teste-disparo-omnx-28jul`, para configurar e testar o workflow do GHL: `Teste Disparo OMNX 1/2/3`, telefones `+5511999999901/02/03`, e-mails `teste.disparo1..3@omnx.pro`. Foram **criados pela ponte** (dry_run antes: 3 novos; aplicação: `criados: 3`, `marcados: 3`, `falhas: 0`). Nenhuma pessoa real foi etiquetada. **Apagar no GHL depois do teste.** |
| 28/07/2026 às 18h20 | `crm-aplicar-tag` implementada e deployada no Empire; `disparo-enviar-ghl` deployada no Desk; ponte por tenant ativada (Vault dos dois lados). Testado contra o CRM de produção: tag em existente, criação, dry_run, ambíguo e normalização. Corrigido bug do espelho desatualizado (contato apagado no GHL contava como existente e a tag falhava calada). Falta só o workflow do GHL. |
| 28/07/2026 às 09h50 | Documento criado. Auditoria do que existe + desenho das 6 fases. Nenhuma alteração feita no sistema. |
| 28/07/2026 às 16h35 | Medição dos formatos de telefone nos dois bancos e cruzamento real (186 de 258 já existem no GHL, 16 sem nono dígito, 27 ambíguos). Regra de normalização por chave canônica definida. Nenhuma alteração feita no sistema. |
| 28/07/2026 às 16h20 | **Revisão de rota:** disparo passa a ser por tag no GHL (Desk etiqueta, GHL dispara). Decisões de criação de contato, tag só no GHL, botão na lista de Contratos e regra de mesclagem por match único registradas. Fases 1–5 originais descartadas. Nenhuma alteração feita no sistema. |
| 28/07/2026 às 14h25 | Implementação da rota `/disparo`, tela, hook e edge function `disparo-enviar-ghl`. Build passou. Resta implementar `crm-aplicar-tag` no lado Empire e fazer o deploy. Handoff salvo em `docs/handoffs/latest.md`. |
