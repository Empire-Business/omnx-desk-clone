# Integração UAZAPI — EmpireDesk

> Documentação técnica da integração WhatsApp via UAZAPI
> Atualizado em: 27/10/2026 às 10h40 BRT — recuperação de mensagens perdidas (UAZAPI /message/find).

---

## Visão Geral

O EmpireDesk se conecta ao WhatsApp através do [UAZAPI](https://empirebusiness.uazapi.com), uma API de WhatsApp que permite enviar e receber mensagens.

### Fluxo de dados

```
WhatsApp → UAZAPI → Webhook (Edge Function) → Supabase DB → Frontend (Realtime)
Frontend → Edge Function → UAZAPI API → WhatsApp
```

---

## Configuração

### 1. Instância UAZAPI

Cada instância UAZAPI representa um número de WhatsApp conectado.

| Campo | Descrição |
|-------|-----------|
| **Instance Name** | Identificador da instância (ex: `Cami`, `DESK`) |
| **Instance Token** | Token de autenticação da API |
| **Server URL** | `https://empirebusiness.uazapi.com` |

### 2. Supabase Secrets

Para cada instância, criar um secret no Supabase:

```
Nome:  UAZAPI_TOKEN_{InstanceName}
Valor: {Instance Token}
```

**Exemplos:** `UAZAPI_TOKEN_Cami`, `UAZAPI_TOKEN_DESK` (o valor fica **só** no
painel de secrets do Supabase — nunca em documento ou código).

> ⚠️ **Pendente (27/10/2026):** os tokens reais das instâncias Cami e DESK estavam
> escritos neste documento e foram removidos, mas continuam no histórico do Git.
> **Trocar os dois tokens no painel da UAZAPI** e atualizar os secrets
> `UAZAPI_TOKEN_*` no Supabase.

> O nome do secret deve corresponder EXATAMENTE ao `instance_id` cadastrado na tabela `whatsapp_instances`.

### 3. Cadastro no EmpireDesk

Em **Chat → Instâncias WhatsApp → Nova instância**:
- **Nome:** nome amigável
- **Instance ID:** mesmo valor do nome da instância no UAZAPI (ex: `Cami`)
- **Número WhatsApp:** número conectado (ex: `5521967119236`)

### 4. Webhook no UAZAPI

Na instância UAZAPI, configurar webhook com:
- **URL:** `https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/uazapi-webhook`
  — ou, com o número **protegido**, `…/uazapi-webhook/k/<token>` (ver abaixo)
- **Eventos:** `messages`
- **Excluir:** `wasSentByApi` (os grupos precisam chegar: a Íris e a análise de
  clientes dependem deles — não exclua `isGroupYes` nos números usados por elas)

#### Webhook protegido por token (27/10/2026)

Pense numa **senha na campainha**: só quem sabe a senha toca e é atendido. Cada
número ganha um token secreto no **caminho** do endereço do webhook
(`/uazapi-webhook/k/<token>`).

- Quem coloca: o botão **"Proteger conexão"** na aba Assistente de
  `/automacoes-wa` (função `wa-agente-admin`, ação `proteger_webhook`). Ela gera
  um token de 32 bytes, troca **só a URL** do webhook na UAZAPI (mantém eventos e
  filtros), confere e grava no banco **apenas o sha256** (`wa_webhook_tokens`).
  Rodar de novo = trocar a chave; a antiga vale mais 10 minutos.
- O que muda no `uazapi-webhook`: token válido → a instância e a empresa vêm do
  **token** (não do corpo). Sem token, token inválido ou instância divergente →
  a mensagem é gravada no Chat como sempre, **mas a Íris não é acionada** e a
  autoria por telefone/LID não vale (só `fromMe` conta como equipe).
- O token **nunca** vai para log (o caminho é registrado como `/k/***`) nem
  para a tela.
- Fase final do plano: depois de todos os números protegidos, recusar webhook
  sem token. Até lá, aceitar sem token evita perder mensagens do Chat.

---

## Edge Functions

### `uazapi-webhook` (recebimento)

- **Path:** `supabase/functions/uazapi-webhook/index.ts`
- **URL:** `https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/uazapi-webhook`
- **verify_jwt:** `false` (webhook externo; autenticação pelo token no caminho, ver acima)
- **Método:** `POST`

#### Payload recebido do UAZAPI

```json
{
  "EventType": "messages",
  "instanceName": "Cami",
  "owner": "5521967119236",
  "message": {
    "fromMe": false,
    "chatid": "5521975218427@s.whatsapp.net",
    "sender_pn": "5521975218427@s.whatsapp.net",
    "senderName": "Nome do Contato",
    "messageid": "ACCE77BD80A54A3E9161740C09F62629",
    "messageType": "Conversation",
    "content": "Texto da mensagem",
    "text": "Texto da mensagem"
  }
}
```

> **IMPORTANTE:** O UAZAPI usa `EventType` (não `event`), `instanceName` (não `instance`) e o conteúdo fica em `message.content`.

#### Detecção de tipo de mídia

O campo `message.content` pode ser:
- **String:** mensagem de texto simples
- **Objeto JSON:** metadados de mídia (áudio, imagem, vídeo, documento)

Para mídia, o conteúdo contém:
```json
{
  "URL": "https://mmg.whatsapp.net/...",
  "mimetype": "audio/ogg; codecs=opus",
  "PTT": true,
  "seconds": 4,
  "fileLength": 9491
}
```

A detecção é feita pela função `detectMedia()`:
- `PTT: true` ou `mimetype` contém `audio/ogg` → `tipo: 'audio'`
- `mimetype` contém `image` → `tipo: 'imagem'`
- `mimetype` contém `video` → `tipo: 'video'`
- URL presente mas sem tipo reconhecido → `tipo: 'documento'`
- Texto simples → `tipo: 'texto'`

> **Nota:** URLs de mídia do WhatsApp recebidas no webhook são criptografadas (`.enc`). O webhook usa `POST /message/download` do UAZAPI para obter uma URL pública reproduzível.

#### Download de mídia (áudio, imagem, vídeo)

Quando uma mensagem de mídia é detectada, o webhook chama automaticamente a API do UAZAPI para descriptografar e obter uma URL pública:

```
POST https://empirebusiness.uazapi.com/message/download
Header: token: {instance_token}
Body: { "id": "{messageid}", "generate_mp3": true, "return_link": true }
```

Resposta:
```json
{
  "fileURL": "https://api.exemplo.com/files/arquivo.mp3",
  "mimetype": "audio/mpeg"
}
```

- A URL pública fica disponível por **2 dias** no storage do UAZAPI
- Após 2 dias, seria necessário refazer o download
- O token da instância é obtido via `Deno.env.get('UAZAPI_TOKEN_{instanceName}')`
- Funciona para áudio, imagem, vídeo e documentos

#### Fluxo do webhook

1. Confere o token do caminho (`/k/<token>`), se houver
2. Valida `EventType` (`messages`, `messages.upsert`, etc.)
3. Extrai número do remetente de `sender_pn`
4. Detecta tipo de mídia via `detectMedia()` (suporta `content` como objeto ou string JSON)
5. **Se mídia:** chama `POST /message/download` no UAZAPI e guarda o arquivo no bucket `chat-media`
6. Busca instância no DB (pelo token, quando protegido; senão por `instanceName`)
7. Faz upsert do contato (`chat_contacts`); contato novo **herda o vínculo** confirmado do mesmo grupo/telefone (`cliente_canais`)
8. Busca ou cria conversa aberta (`chat_conversations`)
9. Insere mensagem (`chat_messages`) com dedup por `message_id_wpp` e com a **autoria** (ver abaixo)
10. Atualiza `atualizado_em` da conversa
11. Se a mensagem chama a Íris num grupo liberado (e o número está protegido), põe o pedido na fila `wa_agente_pedidos`.
    **Áudio** no grupo também entra: citando a Íris → gatilho `quote`; de membro da equipe sem menção/citação →
    gatilho `audio` (o `wa-agente-responder` transcreve e só responde se o nome dela aparecer na fala)

#### Autoria: quem escreveu cada mensagem (27/10/2026)

Antes, só o que saía do próprio número da instância (`fromMe`) contava como
equipe. Nos grupos dos clientes a equipe escreve do **celular pessoal**, então
tudo virava "Cliente". Agora cada mensagem grava:

| Coluna | Conteúdo |
|---|---|
| `autor_tipo` | `cliente`, `equipe`, `ia`, `sistema` ou `desconhecido` |
| `autor_user_id` | Pessoa da equipe, quando reconhecida |
| `autor_chave` | LID ou telefone do remetente no grupo |
| `autor_nome` | Nome de exibição |
| `autor_origem` | `webhook`, `backfill`, `heuristica_backfill`… |

Equipe = número da empresa, membro da Íris ou **WhatsApp pessoal cadastrado** na
aba Assistente (`equipe_identidades`). O LID (identificador de privacidade que o
WhatsApp usa nos grupos) é aprendido pelo webhook e fica na linha do telefone.
Reconhecimento por telefone/LID só com webhook protegido. Quem só foi reconhecido
pelo nome **não** apaga "aguardando resposta" (nome é fácil de imitar). O gatilho
`update_aguardando_resposta` passou a usar `autor_tipo`. Migration
`20261027120000` (com backfill de 90 dias).

#### Recuperar mensagens perdidas (27/10/2026)

Se um número ficar sem mandar webhook (o Chat para de receber, mesmo "conectado"),
a função `uazapi-recuperar-mensagens` busca na UAZAPI (`POST /chat/find` +
`POST /message/find`, retenção de até 7 dias) as mensagens do período que não
estão em `chat_messages` e as reenvia ao `uazapi-webhook` em **modo recuperação**
(header `x-recuperacao`): grava com o horário original e não dispara push, Íris,
robô nem CSAT. Chamada só pelo servidor (segredo `wa_auto_cron_secret`), primeiro
com `dry_run` (padrão) para ver as contagens:

```sql
SELECT net.http_post(
  url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/uazapi-recuperar-mensagens',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', s.decrypted_secret),
  body := '{"instance_uuid":"<uuid>","desde":"2026-10-26T02:00:00Z","dry_run":true}'::jsonb,
  timeout_milliseconds := 150000)
FROM vault.decrypted_secrets s WHERE s.name = 'wa_auto_cron_secret';
-- resposta: SELECT content FROM net._http_response WHERE id = <id devolvido>;
```

Mensagens mais antigas que a retenção da UAZAPI só voltam com
`POST /message/history-sync` (pede ao celular; não implementado).

#### Transcrição de áudio e descrição de imagem (27/10/2026)

O "Problema conhecido 4" (transcrição) foi resolvido **sem** a transcrição da
UAZAPI/Whisper: cada áudio (e imagem sem legenda ou com legenda curta) que está
no Storage entra na fila `chat_midia_texto`; a função `wa-midia-processar`
(a cada 5 min) transcreve com **Gemini 2.5 Flash** e descreve imagens com
**Gemini 2.5 Flash-Lite**, via OpenRouter (mesma chave já usada, com
`data_collection: 'deny'`). Limites: 15 MB, 15 min de áudio, 300 por
empresa/dia. Grupo interno nunca entra. No Chat, o áudio ganha **"Ver
transcrição"**. Migration `20261027130000`.

**Áudio para a Íris (grupo interno):** a fila acima não pega grupo interno, então
o `wa-agente-responder` transcreve **na hora** o áudio que virou pedido (mesmo
pedido ao OpenRouter, `_shared/wa-midia-transcrever.ts`; até 5 min de áudio) e
grava o resultado como `ok` em `chat_midia_texto`. Se a mídia ainda não estiver
no Storage, o pedido volta à fila até 3 vezes; depois a Íris responde que não
conseguiu ouvir e pede para escrever. Migration `20261027160000`.

---

### `uazapi-send-message` (envio)

- **Path:** `supabase/functions/uazapi-send-message/index.ts`
- **URL:** `https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/uazapi-send-message`
- **verify_jwt:** `false` (auth interna via `auth.getUser()`)
- **Método:** `POST`

#### Request (do frontend)

```json
{
  "conversation_id": "uuid",
  "conteudo": "Texto da mensagem",
  "tipo": "texto"
}
```

Header: `Authorization: Bearer {access_token}`

#### API UAZAPI — Envio de texto

```
POST https://empirebusiness.uazapi.com/send/text
Header: token: {instance_token}
Body: { "number": "5521975218427", "text": "Mensagem" }
```

#### API UAZAPI — Envio de mídia

```
POST https://empirebusiness.uazapi.com/send/media
Header: token: {instance_token}
Body: {
  "number": "5521975218427",
  "type": "image|video|document|audio|ptt",
  "file": "URL ou base64",
  "text": "Legenda (opcional)"
}
```

#### Tipos de mídia suportados para envio

| Tipo | Descrição |
|------|-----------|
| `image` | Imagens (JPG preferencialmente) |
| `video` | Vídeos (apenas MP4) |
| `document` | Documentos (PDF, DOCX, etc.) |
| `audio` | Áudio comum (aparece como arquivo — MP3 ou OGG) |
| `ptt` | Mensagem de voz / Push-to-Talk (bolinha azul — OGG) |
| `myaudio` | Mensagem de voz alternativa ao PTT (MP3/OGG) |
| `sticker` | Figurinha |

#### API UAZAPI — Indicador de presença

Simula "Digitando..." ou "Gravando áudio..." antes do envio:

```
POST https://empirebusiness.uazapi.com/message/presence
Header: token: {instance_token}
Body: { "number": "5521975218427", "presence": "composing|recording|paused", "delay": 3000 }
```

| Valor | Efeito |
|-------|--------|
| `composing` | Mostra "Digitando..." |
| `recording` | Mostra "Gravando áudio..." |
| `paused` | Cancela o indicador |

- Duração máxima: 5 minutos (300.000ms)
- Reenvia automaticamente a cada 10 segundos
- Cancelado automaticamente quando uma mensagem é enviada ao mesmo chat
- Pode ser usado ANTES do envio para simular interação humana

#### Resumo — 3 endpoints para áudio

| Endpoint | Uso |
|----------|-----|
| `POST /send/media` | Enviar áudio (`audio`, `ptt`, `myaudio`) |
| `POST /message/download` | Baixar/reproduzir áudio recebido (MP3/OGG) + transcrição |
| `POST /message/presence` | Simular "Gravando áudio..." ou "Digitando..." |

#### Fluxo do envio

1. Valida auth via `supabase.auth.getUser()`
2. Busca conversa com contato e instância
3. Obtém token da instância via `UAZAPI_TOKEN_{instanceId}`
4. Faz `POST /send/text` no UAZAPI
5. Registra mensagem no DB com `enviado_por_agente: true`
6. Atualiza timestamp da conversa

---

## Banco de Dados

### Tabelas relacionadas

| Tabela | Descrição |
|--------|-----------|
| `whatsapp_instances` | Instâncias UAZAPI cadastradas |
| `chat_contacts` | Contatos (número + nome) por instância |
| `chat_conversations` | Conversas (aberta, em_atendimento, aguardando, encerrada) |
| `chat_messages` | Mensagens (texto, audio, imagem, video, documento) |
| `chat_departments` | Departamentos de atendimento |
| `cliente_canais` | Vínculo grupo/telefone → cliente, válido em todos os números (27/10/2026) |
| `equipe_identidades` | WhatsApp da equipe (números da empresa, membros da Íris, celular pessoal) |
| `chat_midia_texto` | Transcrição de áudio / descrição de imagem |
| `wa_webhook_tokens` | sha256 do token do webhook de cada número |

### Campos de `chat_messages`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tipo` | text | `texto`, `audio`, `imagem`, `video`, `documento` |
| `conteudo` | text | Texto da mensagem ou duração do áudio (ex: `3s`) |
| `media_url` | text | URL da mídia (criptografada para recebidos) |
| `enviado_por_agente` | bool | Se enviado por agente humano |
| `enviado_por_ia` | bool | Se enviado por IA bot |
| `message_id_wpp` | text | ID da mensagem no WhatsApp (deduplicação) |
| `autor_tipo` / `autor_user_id` / `autor_chave` / `autor_nome` / `autor_origem` | text/uuid | Quem escreveu (27/10/2026) |

### Realtime

- Tabelas `chat_messages` e `chat_conversations` estão na publicação `supabase_realtime`
- Ambas com `REPLICA IDENTITY FULL` para filtros funcionarem
- Frontend usa `postgres_changes` com filtro `conversation_id=eq.{id}`

---

## Instâncias Ativas

> Atualizado em 08/05/2026 às 12h00 BRT — instâncias antigas caíram e foram recriadas no UAZAPI. `instance_id` técnico é mantido para preservar secrets `UAZAPI_TOKEN_*` e webhooks; apenas o `nome` exibido no app foi padronizado.

| Nome (app)     | Instance ID    | Número            | Uso         |
|----------------|----------------|-------------------|-------------|
| Suporte 1      | `Suporte1`     | +55 21 97286-9214 | Suporte EB (recriada 08/05/2026) |
| Suporte 2      | `Cami`         | +55 11 94285-6707 | Suporte     |
| Suporte 3      | `empire3`      | +55 11 5195-1461  | Suporte     |
| Suporte 4      | `Suporte4`     | +55 11 5197-9967  | Suporte (nova 08/05/2026) |
| Financeiro 1   | `Financeiro1`  | +55 11 94526-6344 | Financeiro  |

---

## API UAZAPI — Endpoints úteis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/send/text` | Enviar texto |
| POST | `/send/media` | Enviar mídia (imagem, vídeo, áudio, documento) |
| POST | `/send/contact` | Enviar cartão de contato (vCard) |
| POST | `/send/location` | Enviar localização |
| POST | `/send/menu` | Enviar botões/lista/enquete/carrossel |
| POST | `/send/carousel` | Enviar carrossel (formato alternativo) |
| POST | `/message/presence` | Simular "digitando..." ou "gravando..." |
| POST | `/message/download` | Baixar mídia recebida (MP3/OGG/imagem) + transcrição |
| POST | `/send/pix-button` | Enviar botão PIX nativo |
| POST | `/send/request-payment` | Solicitar pagamento |

### Campos opcionais comuns (todos os endpoints de envio)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `delay` | integer | Atraso em ms (mostra "Digitando...") |
| `readchat` | boolean | Marca chat como lido |
| `readmessages` | boolean | Marca últimas msgs como lidas |
| `replyid` | string | ID da mensagem para responder |
| `forward` | boolean | Marca como encaminhada |
| `track_source` | string | Origem do rastreamento |
| `track_id` | string | ID para rastreamento |
| `async` | boolean | Envio assíncrono via fila |

### Placeholders (substituição automática)

| Placeholder | Descrição |
|-------------|-----------|
| `{{name}}` | Nome consolidado do chat |
| `{{first_name}}` | Primeiro nome |
| `{{wa_name}}` | Nome do perfil WhatsApp |
| `{{lead_email}}` | Email do lead |
| `{{lead_field01}}` a `{{lead_field20}}` | Campos personalizados |

---

## Problemas conhecidos

1. **URLs de mídia expiram em 2 dias** — O UAZAPI armazena mídias descriptografadas por 2 dias. Após isso, o link quebra. Solução futura: salvar mídias no Supabase Storage.

2. **Status da instância** — O EmpireDesk não sincroniza o status de conexão (`conectado`/`desconectado`) com o UAZAPI automaticamente. O status exibido é sempre "desconectado" mesmo que a instância esteja online.

3. **Envio de mídia pelo agente** — Atualmente só texto é suportado no envio. Para enviar áudio/imagem/documento pelo chat, seria necessário usar o endpoint `/send/media`.

4. ~~**Transcrição de áudio**~~ — resolvido em 27/10/2026 por `wa-midia-processar` (ver acima). A opção `transcribe: true` da UAZAPI (Whisper) não é usada.

5. **Mesmo grupo em vários números** — `message_id_wpp` é único no banco: quando 2 números da empresa estão no mesmo grupo, a mensagem fica gravada só na conversa do número que recebeu primeiro. A linha do tempo por cliente (`cliente_timeline`) junta todas as cópias do grupo para a análise e para a Íris.

---

## Histórico de alterações

| Data | Alteração |
|------|-----------|
| 2026-03-10 | Deploy inicial das Edge Functions |
| 2026-03-10 | Correção do payload UAZAPI (`EventType`, `instanceName`, `message.content`) |
| 2026-03-10 | Correção do endpoint de envio (`/send/text` em vez de `/message/sendText/{id}`) |
| 2026-03-10 | Desativação de `verify_jwt` no send-message (auth interna) |
| 2026-03-10 | Ativação do Realtime (`supabase_realtime` + `REPLICA IDENTITY FULL`) |
| 2026-03-10 | Detecção de mídia no webhook (áudio, imagem, vídeo, documento) |
| 2026-03-10 | Tratamento de `content` como objeto ou string JSON |
| 2026-03-10 | Download de mídia via `POST /message/download` (URL pública MP3) |
| 2026-03-10 | Player de áudio funcional na UI do chat |
| 2026-10-27 | Webhook protegido por token no caminho (`/uazapi-webhook/k/<token>`), botão "Proteger conexão" |
| 2026-10-27 | Autoria das mensagens (`autor_*`, `equipe_identidades`) e "aguardando resposta" corrigido nos grupos |
| 2026-10-27 | Transcrição de áudio e descrição de imagem (`wa-midia-processar`) |
| 2026-10-27 | Íris entende áudio da equipe no grupo interno (gatilho `audio`, transcrição na hora) |
| 2026-10-27 | Tokens reais removidos deste documento (trocar na UAZAPI: pendente) |
