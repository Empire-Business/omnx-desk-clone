# Zernio — gestão de modelos (templates) do WhatsApp oficial

> Pesquisa + **implementação** (§4) da gestão de modelos no app **Automações WhatsApp**: o sistema
> cria e acompanha os 3 modelos sozinho, pela aba Conexão. Código pronto, **ainda não publicado**;
> nada foi criado na Zernio/Meta e nenhuma chave foi usada. Fonte: docs.zernio.com (lido em
> 26/10/2026) e documentação de templates da Meta.
> Atualizado em: 26/10/2026 às 17h43 BRT

## 0. Em uma frase

Na API oficial (Zernio), mensagem que **inicia** conversa só sai por **modelo aprovado pela Meta**.
A Zernio permite **criar, listar, consultar status e apagar** esses modelos pela própria API — então
dá para fazer tudo de dentro do OMNX Desk, sem o Bruno entrar no painel da Meta.

> Analogia: o modelo é como um "formulário pré-impresso" que a Meta carimba. Depois de carimbado,
> a gente só preenche as lacunas ({{1}}, {{2}}…) a cada envio. Mudar o texto impresso = novo carimbo.

---

## 1. Endpoints da Zernio (contrato lido em docs.zernio.com)

Base `https://zernio.com/api/v1` · cabeçalho `Authorization: Bearer <chave>` · toda chamada leva o
`accountId` da conta WhatsApp (o mesmo já guardado em `tenant_integracoes.metadata.account_id`).

| Ação | Método e caminho | Observações |
|---|---|---|
| **Listar** | `GET /v1/whatsapp/templates?accountId=…[&name=…][&language=…][&status=…]` | Lido **ao vivo da Meta**. Um item por **nome + idioma** (mesmo nome em 3 idiomas = 3 itens, cada um com seu `id` da Meta). |
| **Ver um (status)** | `GET /v1/whatsapp/templates/{nome}?accountId=…&language=pt_BR` | Devolve `status`, `rejected_reason` (só se REJECTED), `quality_score` (GREEN/YELLOW/RED), `components`. Sem `language` e com vários idiomas → `409 ambiguous_template`. |
| **Ver um por id** | `GET /v1/whatsapp/templates/id/{templateId}?accountId=…` | `templateId` = id numérico da Meta (é o que vem no webhook). |
| **Criar** | `POST /v1/whatsapp/templates` | Corpo abaixo. Modelo próprio volta `PENDING`; modelo da biblioteca da Meta volta `APPROVED` na hora. |
| **Editar** | `PATCH /v1/whatsapp/templates/{nome}` (corpo com `accountId`, `language`, `components` e/ou `message_send_ttl_seconds`) ou `PATCH …/id/{templateId}` | Mudar `components` volta para `PENDING` (nova análise). Só a partir de APPROVED/REJECTED/PAUSED; **no máximo 1 edição a cada 24h e 10 a cada 30 dias**. `language` na query = 400. |
| **Apagar** | `DELETE /v1/whatsapp/templates/{nome}?accountId=…[&language=pt_BR]` | **Sem `language` apaga TODOS os idiomas do nome.** Fica `PENDING_DELETION` ~24h e **o nome não pode ser reutilizado por 30 dias**. |
| **Apagar por id** | `DELETE /v1/whatsapp/templates/id/{templateId}?accountId=…` | Apaga só aquele idioma. |
| **Biblioteca Meta** | `GET /v1/whatsapp/template-library?accountId=…&name=…&language=…` | Modelos prontos pré-aprovados (não servem para nós: texto fixo da Meta, sem o nome do cliente). |
| **Descobrir o accountId** | `GET /v1/accounts?platform=whatsapp` | O `_id` da conta WhatsApp listada. |

### 1.1 Criar — exemplo de corpo

```json
POST https://zernio.com/api/v1/whatsapp/templates
{
  "accountId": "<ACCOUNT_ID_DA_CONTA_WHATSAPP>",
  "name": "omnx_aviso_diario_v1",
  "category": "UTILITY",
  "language": "pt_BR",
  "parameter_format": "POSITIONAL",
  "message_send_ttl_seconds": 10800,
  "components": [{
    "type": "body",
    "text": "Bom dia, {{1}}! Aviso diário de {{2}}. Alertas: {{3}}. Reuniões de hoje: {{4}}. Detalhes no OMNX Desk.",
    "example": { "body_text": [["Ana", "26/10/2026", "Sem resposta: Padaria Pão Quente (esperando há 5h); Insatisfeitos: Clínica Sorriso (conversa com tom negativo)", "09:30 Padaria Pão Quente, 14:00 Clínica Sorriso"]] }
  }]
}
```

Resposta `200`:
```json
{ "success": true, "template": { "id": "1234567890123456", "name": "omnx_aviso_diario_v1", "status": "PENDING", "category": "UTILITY", "language": "pt_BR", "message_send_ttl_seconds": 10800 } }
```

Campos:
- `name` — minúsculas, números e `_`, começando por letra (o nosso código aceita `^[a-z0-9_]{1,512}$`).
- `category` — `UTILITY` | `MARKETING` | `AUTHENTICATION` (define o preço e o prazo de entrega).
- `language` — código exato (`pt_BR`). **`pt_BR` e `pt` são modelos diferentes**; o envio precisa usar o mesmo código.
- `parameter_format` — `POSITIONAL` (padrão, `{{1}}`) ou `NAMED` (`{{nome}}`). **Usar POSITIONAL**: o nosso adaptador manda `templateParams` como lista plana na ordem.
- `components[].example.body_text` — exemplo de cada variável (**obrigatório**, a Meta usa na análise; precisa ter a mesma quantidade de valores que variáveis).
- `message_send_ttl_seconds` — por quanto tempo a Meta tenta entregar. UTILITY aceita 30 a 43200 (12h); se não mandar, o padrão é 30 dias.

### 1.2 Status e aprovação

| `status` | O que significa | Pode enviar? |
|---|---|---|
| `PENDING` | Em análise na Meta | Não |
| `APPROVED` | Aprovado | **Sim** |
| `REJECTED` | Recusado (motivo em `rejected_reason`) | Não — corrigir e criar de novo, ou recorrer |
| `IN_APPEAL` | Recurso em análise | Não |
| `PAUSED` | Pausado pela Meta (reclamações de quem recebe) | Não |
| `DISABLED` | Desativado pela Meta | Não |
| `PENDING_DELETION` | Exclusão pedida (24h de carência) | Não |

- **Tempo de aprovação:** até **24 horas** (Meta e Zernio dizem o mesmo); costuma sair em minutos.
- **Aviso automático:** webhook `whatsapp.template.status_updated` (traz `templateId`, `name`, `language`, `status`, `reason` — `"NONE"` quando aprova). Também existe `whatsapp.template.category_updated` (Meta reclassificou a categoria; avisa 24h antes e de novo quando aplica).
- **Reclassificação:** se a Meta achar que um UTILITY é propaganda, muda para MARKETING; o status continua APPROVED (continua enviando), mas o preço muda e o prazo de entrega personalizado é apagado.

### 1.3 Erros

Envelope padrão da Zernio: `{ error, type, code, param, platform, platformError, details }`.
Criar: `400` (nome fora do formato, campo faltando, categoria inválida), `401` (chave), `404` (conta),
`502` (Meta recusou/fora do ar; erros 4xx da Meta repassados). Ver um: `409 ambiguous_template`.
Limite de chamadas da Zernio: 60/min (até 2 contas conectadas) ou 600/min (3+); respeitar `Retry-After` no `429`.

Erros da Meta **no envio** ligados a modelo que vale mapear em `ZernioProvider.erro()` (hoje só 132001 está mapeado):
`132000` quantidade de variáveis diferente do modelo · `132005` texto final longo demais ·
`132012` formato de variável errado · `132015` modelo pausado · `132016` modelo desativado ·
`132018` variável com quebra de linha, tab ou 4+ espaços (o `limparParametroOficial` já evita).

---

## 2. Regras da Meta que reprovam modelo (checklist)

1. **Variável não pode abrir nem fechar o texto** (nada de `{{1}}, tudo bem?` ou `…: {{3}}`).
2. **Muitas variáveis para pouco texto** é recusado. A Meta não publica a proporção; a regra prática do mercado é **≥ 3 palavras fixas por variável**.
3. Variáveis **em sequência** (`{{1}}`, `{{2}}`, `{{3}}`…), sem pular número, chaves fechadas certinho, sem `#`, `$`, `%` dentro das chaves.
4. **Exemplo obrigatório** para cada variável.
5. Corpo do modelo até **1024 caracteres**; cabeçalho e rodapé até 60. Na prática, o **texto final já preenchido** também precisa caber em 1024 (senão o envio falha com 132005).
6. **Valor da variável em uma linha só**: sem quebra de linha, sem tab, sem 4+ espaços seguidos (erro 132018 no envio).
7. **Não duplicar** um modelo já existente (mesmo texto de corpo/rodapé).
8. **UTILITY** precisa ser **sem propaganda** e **ligado a algo do usuário** (conta, serviço, agenda, alerta). Misturar aviso com oferta → vira MARKETING.
9. Nada de pedir dado sensível (cartão completo, CPF, conta bancária), tom de ameaça, cara de golpe ou link encurtado (bit.ly etc.).
10. Nome apagado fica **bloqueado 30 dias** → usar sufixo de versão (`_v1`, `_v2`).

---

## 3. Os 3 modelos prontos (pt_BR, categoria UTILITY)

Conferidos contra o código: quantidade e **ordem** das variáveis batem com o que as funções mandam
em `templateParams`. Nenhum começa ou termina com variável; todas as variáveis já chegam em uma linha
só (`limparParametroOficial`).

### 3.1 Aviso diário ao gestor — `omnx_aviso_diario_v1`

Fonte no código: `MODELO_RELATORIO_OFICIAL` em `supabase/functions/_shared/wa-relatorio.ts`
(o texto abaixo é **exatamente** o `modeloNumerado` que o código gera — assim a prévia do backtest
mostra o mesmo que o gestor recebe).

```
Bom dia, {{1}}! Aviso diário de {{2}}. Alertas: {{3}}. Reuniões de hoje: {{4}}. Detalhes no OMNX Desk.
```

| Var | Conteúdo (código) | Exemplo para a Meta |
|---|---|---|
| {{1}} | nome do gestor (`nomeSeguro`, até 40) | `Ana` |
| {{2}} | data `dd/mm/aaaa` | `26/10/2026` |
| {{3}} | alertas em uma linha, até ~600 (ou `nenhum`) | `Sem resposta: Padaria Pão Quente (esperando há 5h); Insatisfeitos: Clínica Sorriso (conversa com tom negativo)` |
| {{4}} | reuniões em uma linha, até ~220 (ou `nenhuma`) | `09:30 Padaria Pão Quente, 14:00 Clínica Sorriso` |

- 102 caracteres no modelo; 13 palavras fixas para 4 variáveis (passa na regra 3:1).
- Pior caso medido com o próprio código (nomes de 40 caracteres, 40 alertas por tipo, 30 reuniões): **914 caracteres** preenchido (< 1024).
- Prazo de entrega sugerido: `message_send_ttl_seconds: 10800` (3h — igual à tolerância de `relatorioDevido`; se não chegou até lá, não adianta chegar à noite).
- Ponto de atenção: o texto diz "Bom dia". Se algum gestor configurar o aviso à tarde, fica estranho. Se quiser neutro, trocar por "Olá, {{1}}!" **nos dois lugares** (constante + modelo) antes de criar.
- Também é o modelo usado pelo "Enviar teste" na Zernio: o teste precisa mandar **exatamente 4 variáveis**.

### 3.2 Resumo semanal ao CLIENTE — `omnx_resumo_semanal_cliente_v1`

> Mudança de 26/10/2026: o resumo semanal agora vai para o **cliente** (o gestor recebe só o
> aviso diário). O modelo antigo `omnx_resumo_semanal_v1` (2 variáveis, para o gestor) foi
> **descartado** e nunca foi criado.

Fonte no código: `MODELO_PRIVADO` em `supabase/functions/wa-auto-resumo-semanal/regras.ts`, convertido
por `converterMensagem('zernio', …)` em `wa-auto-resumo-semanal/index.ts` →
`{{1}}` = cliente, `{{2}}` = período, `{{3}}` = assuntos, `{{4}}` = próximos passos (o teste
`wa-modelos-oficiais.test.ts` trava essa ordem). Texto = o sugerido no cabeçalho daquele `index.ts`:

```
Olá, {{1}}! Segue o resumo da semana ({{2}}).
Assuntos tratados: {{3}}
Próximos passos: {{4}}
Resumo automático das nossas conversas no WhatsApp. Se algo não estiver certo, é só nos avisar.
```

| Var | Conteúdo (código) | Exemplo para a Meta |
|---|---|---|
| {{1}} | nome do cliente (`nomeClienteSeguro`, até 60) | `Padaria Pão Quente` |
| {{2}} | período `dd/mm a dd/mm` | `19/10 a 26/10` |
| {{3}} | até 3 assuntos (`listaSegura`, ≤ 91 cada) unidos por `; ` | `cardápio de Natal; aprovação das fotos novas` |
| {{4}} | até 3 próximos passos confirmados pela equipe (sem promessa comercial: preço, prazo de pagamento, desconto…), ou, sem nenhum, o texto fixo `Seguimos acompanhando por aqui.` (`SEM_PROXIMOS`) | `Equipe vai enviar o material da apresentação; Cliente vai revisar o cronograma de conteúdo` |

- 4 variáveis, ~27 palavras fixas (passa na regra 3:1); nenhuma variável nas pontas.
- Pior caso preenchido (nome 60 + 3×91 + 3×91): **≈ 800 caracteres** (< 1024) — o risco de tamanho
  do modelo antigo (lista de 900 caracteres) deixou de existir.
- Prazo de entrega: `43200` (12h).
- Linguagem para o **cliente**: sem risco, sentimento, clima ou avaliação interna (isso fica só no
  aviso diário do gestor). O nome do cliente vai sempre na mensagem.
- Só vale para o **privado** do cliente; resumo no grupo pela oficial continua fora.

### 3.3 Link da reunião — `omnx_link_reuniao_v1`

Fonte no código: `MODELO_LINK` em `supabase/functions/wa-auto-agendar/index.ts`
(`cliente`, `data`, `hora`, `link`). **Atenção:** o texto atual **termina com `{{link}}`** — a Meta
recusaria. Por isso o modelo oficial precisa de uma constante própria (ex.: `MODELO_LINK_OFICIAL`),
com as variáveis na mesma ordem:

```
Olá, {{1}}! Sua reunião com a nossa equipe está marcada para {{2}} às {{3}}. Link para entrar: {{4}} — se precisar remarcar, é só responder esta mensagem.
```

| Var | Conteúdo (código) | Exemplo para a Meta |
|---|---|---|
| {{1}} | nome do cliente | `Padaria Pão Quente` |
| {{2}} | data `dd/mm/aaaa` (`dataHoraBR`) | `28/10/2026` |
| {{3}} | hora `HH:MM` | `14:30` |
| {{4}} | link da reunião (completo, nunca encurtado) | `https://meet.google.com/abc-defg-hij` |

- 154 caracteres; 22 palavras fixas para 4 variáveis.
- O espaço depois de `{{4}}` garante que o WhatsApp não "cole" o texto seguinte no link.
- Prazo de entrega sugerido: `7200` (2h).
- **Hoje este modelo não é usado por nenhum envio:** a etapa 2 do agendamento manda o link no **grupo**
  pela UAZAPI, mesmo com a empresa na Zernio. Ele passa a valer quando (a) o link for mandado no privado
  do cliente pela oficial, ou (b) dentro de uma conversa de grupo já aberta (`conversationId`) via
  `POST /inbox/conversations/{id}/messages`. Vale criar já, porque a aprovação leva até 24h.
- Alternativa descartada: botão de URL dinâmico. Ele só aceita um sufixo variável sobre um domínio fixo;
  como os links vêm de Meet/Zoom/sala interna (domínios diferentes), não serve.

---

## 4. O que foi implementado (26/10/2026)

> Nada foi publicado nem aplicado: a migration e a função nova esperam deploy (ver §4.6).

### 4.1 Catálogo fixo — `supabase/functions/_shared/wa-modelos-oficiais.ts`

Os 3 modelos da §3 (nome, categoria UTILITY, `pt_BR`, POSITIONAL, prazo de entrega, coluna de
`wa_auto_config`, texto numerado, ordem das variáveis e exemplos). Também traz as regras puras:
`problemasDoModelo` (checklist da §2), `previaModelo`, `corpoCriacaoZernio`, `normalizarStatus` e
`traduzirMotivoRecusa` (motivos da Meta → frase em pt-BR). **O texto nunca vem do navegador.**

### 4.2 Edge Function `wa-auto-templates`

`POST { acao, tipo? }` — mesma autenticação de `wa-auto-testar-envio` (JWT validado no código,
`verify_jwt` padrão, só `users.perfil = 'admin'`, app ligado, `tenant_id` de `get_tenant_do_usuario`).

| Ação | O que faz | Chama a Zernio? |
|---|---|---|
| `catalogo` | Os 3 modelos + último status salvo (`wa_auto_modelos`) + nome em uso | Não |
| `listar` | `GET /whatsapp/templates?accountId&language=pt_BR` (um pedido) e atualiza os 3 status | Sim (conta no limite de consultas) |
| `status` | `GET /whatsapp/templates/{nome}?accountId&language=pt_BR` de um `tipo` ou dos 3: status, motivo traduzido, qualidade e se o texto bate com o catálogo | Sim |
| `criar` | Só aceita `tipo` = `relatorio` \| `resumo` \| `link`. Confere antes se já existe (se sim, só atualiza o status); senão `POST /whatsapp/templates` com o item do catálogo | Sim (limite próprio) |

- **Sem apagar** (irreversível; trava o nome por 30 dias) — só pelo painel da Zernio.
- **Limite por empresa, em tabela:** `criar` 3/hora; `listar` + `status` 30/hora.
- **Gravação em `wa_auto_config`** (`template_relatorio`, `template_resumo`, `template_link`,
  `template_idioma`): modelo do catálogo **aprovado e com o mesmo texto** passa a ser o usado;
  modelo existente (ex.: em análise) é gravado se o campo estava vazio; texto diferente do catálogo
  (nome igual criado à mão) **nunca** é gravado. O idioma só muda para `pt_BR` se nenhum outro campo
  usa modelo próprio.
- Chave e `accountId` saem do Vault do tenant via `resolveZernioCliente` — funciona **mesmo com a
  UAZAPI como provedor ativo** (o admin prepara os modelos antes de trocar).

### 4.3 Adaptador — `_shared/wa-provider.ts`

- `requisicaoJson('GET' | 'POST', …)`: GET pode repetir em timeout; criação **não** repete.
- `ZernioProvider.listarModelos / consultarModelo / criarModelo` e `resolveZernioCliente`.
- `ZernioProvider.erro()` traduz em pt-BR simples: `132000` (quantidade de informações diferente do
  modelo), `132001` (modelo não existe/não aprovado), `132005` (mensagem longa demais), `132012`
  (formato de informação errado), `132015` (pausado), `132016` (desativado), `132018` (quebra de
  linha/espaços). Código numérico só casa "inteiro" (não dentro de outro número).
- Erros de gestão de modelos (chave, conta, limite 429, "já existe", Meta fora do ar) viram frase
  curta — nunca o corpo cru da Zernio/Meta.

### 4.4 Banco — `supabase/migrations/20261026200000_automacoes_wa_modelos.sql` (NÃO aplicada)

- `wa_auto_modelos` — último status de cada modelo por empresa (`UNIQUE (tenant_id, tipo)`), RLS
  RESTRICTIVE + leitura com `has_permissao('automacoes-wa','admin')`; escrita só service_role.
- `wa_auto_modelos_chamadas` — contagem para o limite; nenhum usuário logado lê ou escreve.
- Sem a migration, `catalogo` funciona (status "não consultado"), e as ações que chamam a Zernio
  respondem "a gestão de modelos ainda não foi ativada no banco".

### 4.5 Tela — aba **Conexão**, seção "Modelos aprovados"

`ConexaoTab.tsx` + hooks `useWaModelos` / `useAcaoModelosWa` (`useAutomacoesWa.ts`) + rótulos em
`infoStatusModelo` (`src/lib/automacoesWa.ts`). Para cada modelo: selo (Aprovado / Em análise /
Reprovado + motivo / Pausado / Desativado / Não criado / Ainda não consultado), explicação simples,
prévia com dados de exemplo, nome em uso, botão **"Criar na Zernio"** (com confirmação: "a Meta
analisa em até 24h") e botão **"Atualizar status"**. Nada atualiza sozinho em loop. Os campos de nome
manual ficaram em "Configuração avançada". A seção aparece com o provedor oficial, ou com a UAZAPI
quando a chave da Zernio já foi salva.

### 4.6 Testes e pendências

- `supabase/functions/_shared/wa-modelos-oficiais.test.ts` (Vitest, sem rede): cada modelo ≤ 1024,
  sem variável nas pontas, sequência, exemplos = variáveis, ≥ 3 palavras por variável, texto do aviso
  diário == `MODELO_RELATORIO_OFICIAL` numerado, ordem do resumo == a que `wa-auto-resumo-semanal`
  envia, variáveis do link == `MODELO_LINK` do `wa-auto-agendar`, pior caso preenchido ≤ 1024.
- **Para ir ao ar:** rodar `/security-auditor` modo delta; aplicar a migration `20261026200000`;
  `supabase functions deploy wa-auto-templates` (sem `--no-verify-jwt`); republicar as funções que
  importam `_shared/wa-provider.ts` (mudou o tratamento de erros).
- Validar com a Zernio real: formato do envelope da listagem (o código aceita `templates`, `data` ou
  lista direta), a resposta 404 do "ver um" e o erro de nome já existente.
- Webhook `whatsapp.template.status_updated` (atualizar status sozinho) continua para depois.

## 5. O que depende do Bruno

1. **Chave de API da Zernio** colada por ele na aba Conexão (nunca no chat). Ideal: uma **chave restrita**
   ao perfil do WhatsApp (`POST /v1/api-keys` com `scope: "profiles"`), com permissão de escrita (precisa
   criar modelos e enviar).
2. **`accountId`** da conta WhatsApp que vai enviar ("sdrai - omnx" +55 11 5107-0286 ou "Acelerador de
   Audiência" +55 11 5196-1461) — aparece no painel da Zernio ou em `GET /v1/accounts`.
3. Confirmar que esse número é **Cloud API** ativo na Meta (sem pendência de verificação da empresa), senão
   a criação de modelos falha.
4. **Aprovar os 3 textos** (ou pedir ajustes — ex.: trocar "Bom dia" por "Olá") e os nomes `omnx_*_v1`.
5. ~~`MAX_CHARS_LISTA_OFICIAL` 900 → 800~~ — não é mais necessário (o resumo agora vai ao cliente
   com outro modelo; ver §3.2). A constante `MODELO_LINK_OFICIAL` só será necessária quando o link pela
   oficial for ligado (o catálogo já tem o texto).
6. ~~Decidir se a v1 cria pela tela~~ — decidido: o sistema cria pela tela (§4).

## Fontes

- Zernio: [Templates (guia)](https://docs.zernio.com/platforms/whatsapp/templates.mdx) ·
  [Criar/listar](https://docs.zernio.com/whatsapp/create-whatsapp-template.mdx) ·
  [Ver por nome](https://docs.zernio.com/whatsapp/get-whatsapp-template.mdx) ·
  [Apagar](https://docs.zernio.com/whatsapp/delete-whatsapp-template.mdx) ·
  [Webhooks WhatsApp](https://docs.zernio.com/webhooks/whatsapp.mdx) ·
  [Limites](https://docs.zernio.com/guides/rate-limits.mdx) ·
  [Chaves restritas](https://docs.zernio.com/multi-tenant.mdx)
- Meta: [Template review](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/) ·
  [Categorias](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization/) ·
  [Componentes e limites](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components)
- Proporção palavras/variáveis (regra prática, não oficial): [Spur](https://help.spurnow.com/en/articles/11999432-whatsapp-template-rejected-common-reasons-and-how-to-fix),
  [ChakraHQ](https://chakrahq.com/article/whatsapp-api-template-rejections-issues-guidelines-coexistence/amp/)
