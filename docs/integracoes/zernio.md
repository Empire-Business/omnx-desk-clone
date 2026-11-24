# Integração Zernio — WhatsApp oficial (App Automações WhatsApp)

> Atualizado em: 26/10/2026 às 17h18 BRT
> Contrato lido em docs.zernio.com (handoff da Fase 9) e conferido no código
> `supabase/functions/_shared/wa-provider.ts`. Itens marcados **[a validar]**
> ainda não foram confirmados com envio real.

---

## O que é e por que existe

A Zernio é um intermediário da **API oficial do WhatsApp** (Cloud API da Meta).
No app Automações WhatsApp, cada empresa escolhe por onde as mensagens saem:

| Provedor | Tipo | Quando usar |
|---|---|---|
| UAZAPI | Não oficial (`uazapi.md`) | Texto livre, envia em **grupos**; risco de bloqueio do número |
| **Zernio** | Oficial | Número protegido pela Meta; mas fora de uma conversa recente **só envia modelo aprovado** e não abre conversa de grupo |

Analogia: a UAZAPI é como mandar mensagem pelo seu próprio celular; a oficial é
como mandar carta registrada pelo correio — mais segura, mas só em formulários
(modelos) que o correio aprovou antes.

---

## Contrato da API (o que o código usa)

| Item | Valor |
|---|---|
| Endereço base | `https://zernio.com/api/v1` (padrão; só `https://*.zernio.com` é aceito) |
| Autenticação | `Authorization: Bearer <chave da API>` |
| Idempotência | `Idempotency-Key` — a Zernio **não** deduplica sozinha. Enviamos `<tenant_id>:<chave_idempotencia>` (até 255 caracteres) |
| Conta | Todo corpo leva `accountId` (a conta WhatsApp conectada no painel da Zernio) |

### Enviar modelo (abre ou usa a conversa com um telefone)

```
POST /inbox/conversations
{
  "accountId": "<account_id>",
  "participantId": "5511999998888",      // só dígitos, sem +
  "templateName": "aviso_diario_gestor",
  "templateLanguage": "pt_BR",
  "templateParams": ["valor {{1}}", "valor {{2}}", "..."]   // array plano, na ordem
}
```

Resposta lida: `data.messageId` e `data.conversationId`; `success: false` é
tratado como erro.

### Responder texto livre (só dentro de conversa aberta)

```
POST /inbox/conversations/{conversationId}/messages
{ "accountId": "<account_id>", "message": "texto" }
```

Só funciona dentro da **janela de 24 h** (o contato escreveu nas últimas 24 h) ou
em grupo já aberto pelo participante. Sem `conversationId`, o adaptador recusa
antes de chamar (`oficial_exige_template`).

### Rede, repetição e segurança

- Timeout de 12 s; no máximo **1** nova tentativa, com espera de ~0,8–1,2 s, só
  em falha de conexão, 429/503, ou timeout **com** `Idempotency-Key`.
- `redirect: 'error'` — um redirecionamento poderia levar a chave para fora da
  lista de domínios permitidos.
- A chave nunca vai para log, mensagem de erro ou resposta ao navegador.

---

## Erros conhecidos e como aparecem

| Código da Zernio/Meta | Significa | Mensagem que o usuário vê |
|---|---|---|
| HTTP 401/403 | Chave errada ou revogada | "Chave da Zernio recusada…" |
| `TEMPLATE_REQUIRED` | Precisa de modelo para iniciar conversa | "A API oficial exige um modelo aprovado…" |
| `131047` | Janela de 24 h fechada | "A janela de 24h está fechada…" |
| `131056` | Limite por destinatário (~10 mensagens/min para o mesmo número) | "Muitas mensagens para o mesmo número…" |
| `132001` | Modelo inexistente (nome ou idioma) | "Modelo não encontrado na Zernio…" |
| Outros | — | "A Zernio recusou o envio (<status>)." |

**[a validar]** o formato exato do código de erro no corpo (o código procura em
`error.code`, `code` e no texto bruto).

---

## Grupos

- A Zernio **não tem endpoint para abrir a conversa de um grupo** pelo nosso
  lado. A conversa do grupo só existe depois que um participante manda a 1ª
  mensagem (o webhook `message.received` traz o `conversationId`).
- Só número **Cloud-API-only** (sem coexistência com o app do WhatsApp) e com
  status **OBA** (conta oficial verificada) participa de grupos.
- **Hoje no código:** o webhook da Zernio **não** está implementado e nenhum
  `conversationId` de grupo é guardado. Por isso:
  - resumo semanal no **grupo** com Zernio → empresa pulada (`oficial_sem_grupo`);
  - link da reunião (agendamento Etapa 2) → sai **sempre pela UAZAPI**, mesmo com
    a empresa na Zernio (exige token UAZAPI salvo ou número já conectado no Chat).

---

## Modelos (templates) — ainda não cadastrados na Meta

> Criar, listar, consultar status e apagar modelos pela API da Zernio, regras de
> aprovação da Meta e exemplos: ver [`zernio-templates.md`](./zernio-templates.md).

Configurados por empresa em `wa_auto_config` (aba Conexão): `template_relatorio`,
`template_resumo`, `template_link`, `template_idioma` (padrão `pt_BR`). Nome só
com minúsculas, números e `_`. Categoria sugerida: **Utilidade**.

| Campo | Usado por | Situação |
|---|---|---|
| `template_relatorio` | Aviso diário ao **gestor** e o botão "Enviar teste" | Em uso |
| `template_resumo` | Resumo semanal ao **cliente** no privado | Backend do semanal em refação — conferir variáveis quando a nova versão subir |
| `template_link` | — | **Não usado**: o link vai pela UAZAPI |

### Rascunho — aviso diário ao gestor (pronto no código)

Texto exato de `MODELO_RELATORIO_OFICIAL` (`_shared/wa-relatorio.ts`), já
numerado como a Meta pede:

```
Bom dia, {{1}}! Aviso diário de {{2}}. Alertas: {{3}}. Reuniões de hoje: {{4}}. Detalhes no OMNX Desk.
```

`{{1}}` nome do gestor · `{{2}}` data (dd/mm/aaaa) · `{{3}}` alertas numa linha só
(até ~600 caracteres; o resto vira "e mais N") · `{{4}}` reuniões do dia (até ~220).
A prévia (`wa-auto-backtest`) devolve `oficial.modelo_para_cadastrar` com este
texto, para copiar e colar no cadastro.

### Rascunho — resumo semanal ao cliente (a confirmar)

Mesmo conteúdo do resumo no grupo, que é para o cliente (assuntos e próximos
passos, sem risco/clima):

```
Resumo da semana — {{1}} ({{2}}). Assuntos tratados: {{3}}. Próximos passos: {{4}}. Se algo não estiver certo, é só responder esta mensagem.
```

`{{1}}` nome do cliente · `{{2}}` período (dd/mm a dd/mm) · `{{3}}` assuntos ·
`{{4}}` próximos passos. **Confirmar a ordem das variáveis com a nova versão de
`wa-auto-resumo-semanal` antes de submeter à Meta.**

> Variável de modelo da Meta não aceita quebra de linha — por isso tudo vai numa
> linha só.

---

## Como configurar (admin da empresa)

1. No painel da Zernio: conectar o número e copiar a **chave da API** e o código
   da conta (`accountId`). **[a validar]** formato do `accountId` (o banco aceita
   `^[A-Za-z0-9_-]{1,128}$`).
2. No Desk: `/automacoes-wa/conexao` → "Oficial (Zernio)" → colar chave e código
   da conta → salvar. A chave vai para o Vault; a tela nunca a mostra de novo.
3. Preencher os nomes dos modelos aprovados e o idioma.
4. "Enviar teste" para o próprio celular (usa `template_relatorio`; os valores das
   variáveis podem ser digitados, separados por `;`).

O Bruno cola a chave **ele mesmo** na aba Conexão — nunca em chat, e-mail ou
arquivo.

---

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Chave da API | Vault, via `tenant_integracoes` (`provider = 'zernio'`) e RPC `save_omnx_integracao_secret` (só perfil `admin`) |
| `account_id` | `tenant_integracoes.metadata.account_id` |
| Endereço da API | `tenant_integracoes.base_url` (opcional; CHECK `wa_base_url_permitida`) |
| Leitura do segredo | Só `service_role`, RPC `get_omnx_bridge_credential_tenant` |
| Adaptador | `supabase/functions/_shared/wa-provider.ts` (`ZernioProvider`) |
| Histórico de envios | `wa_auto_envios` (`provider = 'zernio'`), sem chave e sem texto |

---

## Pendências

- [ ] Validar com envio real: formato dos códigos de erro, escopo da
      `Idempotency-Key`, formato do `accountId`.
- [ ] Cadastrar e aprovar os modelos na Meta (aviso diário; resumo semanal depois
      da refação).
- [ ] Webhook `message.received` para guardar `conversationId` de grupo — só então
      grupos pela oficial.
- [ ] Confirmar se os números conectados são Cloud-API-only (sem coexistência).

---

## Relacionados

- Arquitetura do app: [`../ARQUITETURA.md`](../ARQUITETURA.md) §8
- Não oficial: [`uazapi.md`](./uazapi.md)
- Gestão de modelos: [`zernio-templates.md`](./zernio-templates.md)
- Triagem de falhas: [`../GUIA-DE-SUPORTE.md`](../GUIA-DE-SUPORTE.md)
