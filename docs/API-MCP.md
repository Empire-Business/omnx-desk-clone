# API REST e MCP do Desk

> Atualizado em: 18/11/2026 BRT. Estado: pronto localmente; **nada publicado** (ver "Para publicar").

## O que existe

| Peça | Onde | Observação |
|---|---|---|
| API REST original `chat-api` | `supabase/functions/chat-api/index.ts` | **Intacta (idêntica ao HEAD)**. Nada mudou: CORS `*`, `/send-message`, colunas, sem limite. Teste de caracterização por SHA-256 |
| API REST v2 `chat-api-v2` | `supabase/functions/chat-api-v2/index.ts` | Endurecida; `X-API-Key` ou `Authorization: Bearer edk_...`; mesmas chaves; é a documentada em `/docs/api` |
| MCP remoto `desk-mcp` | `supabase/functions/desk-mcp/index.ts` | JSON-RPC por HTTP, sem sessão, **só leitura** (4 ferramentas) |
| Núcleo compartilhado | `supabase/functions/_shared/chat-api-nucleo.ts`, `chat-api-regras.ts`, `desk-mcp-protocolo.ts` | filtro por empresa, grupos internos, limite, auditoria |
| OpenAPI 3.1 | `public/docs/api/openapi.yaml` | Swagger UI vendorizado em `public/docs/api/vendor` |
| Páginas públicas (sem login) | `/docs/api` e `/docs/mcp` | estáticas; `vercel.json` com rewrites e CSP; link na tela `/api-webhooks` |
| Migration (só arquivo) | `supabase/migrations/20261118120000_api_externa_rate_limit_auditoria.sql` | tabela/RPC de limite e `api_request_log` |

## Regras

Valem para a **v2 e o MCP**. A `chat-api` original não foi alterada (decisão do dono: nada existente quebra).

- **Envio desligado na v2.** `POST /send-message` da v2 responde `501` (na original continua enviando como sempre). Motivo: `uazapi-send-message` envia o texto **cru** pela UAZAPI (não oficial), sem a humanização por LLM exigida pela regra do dono. `ENVIO_PELA_API = false` em `chat-api-v2-regras.ts` (com teste). Só reativar com caminho humanizado + teste. O MCP não tem ferramenta de escrita. Zernio (oficial) é só leitura e não é tocada.
- **Empresa:** a chave carrega `tenant_id`; toda consulta usa `.eq('tenant_id', ...)` (teste com cliente falso confere cada tabela). Grupos internos (`restrito_admin` / `chat_grupos_restritos`) ficam ocultos; falha ao checar = erro (fecha).
- **Respostas enxutas:** colunas em lista fechada (`COLUNAS_*`); sem `notas`, `tags`, `resumo_ia`, ids de usuário/WhatsApp.
- **Limite por chave:** padrão 60/min, RPC `api_rate_limit_hit`. Ajuste: secret `CHAT_API_RATE_LIMIT` (`120` ou `120/60`). Se a RPC não existir ainda, libera com aviso no log; qualquer outro erro nega.
- **Auditoria:** `api_request_log` (chave, canal rest/mcp, método, rota normalizada, status, duração). Sem corpo, sem query string, sem texto de mensagem. Retenção: função `api_externa_limpar_antigos()` (na migration) apaga `api_request_log` > 90 dias e `api_rate_limit` > 7 dias; **não está agendada** (ver "Agendar a limpeza").
- **Expiração:** `api_keys.expira_em` já existia e já era validada; a tela oferece 30/90/180/365 dias ou sem expiração (padrão 90).
- **CORS:** sem `*`. Só origens https listadas em `CHAT_API_ALLOWED_ORIGINS` (vírgula); vazio = nenhuma (servidor-a-servidor funciona). MCP não usa CORS.
- **Notas internas** (`tipo = nota_interna`) nunca saem pela v2/MCP. O MCP recusa pedidos com `Origin` (403) e lê o corpo em stream com teto de 64 KB (413).
- **Bug que continua na `chat-api` original (de propósito, não mexida):** `chat_conversations` não tem `atribuido_a` nem `ultima_mensagem_em` (a coluna é `agente_id`; ordenação agora por `atualizado_em`). Na original, listar conversas, atribuir e transferir falham com 500; a v2 usa as colunas certas.

## Chaves

Criadas em **Desk → Chaves de acesso**. Mostrada uma vez; a lista nunca traz `key_hash`; a mutação usa `gcTime: 0` e `reset()` após copiar. A tela mantém todas as permissões (inclusive `send_message`); só acrescenta aviso de que a v2/MCP não enviam mensagens. As mesmas chaves `edk_` valem na original, na v2 e no MCP. A criação usa `.select()` de colunas explícitas (sem `key_hash`).

## Para publicar (depende de decisão do dono)

1. Aplicar a migration **antes** das funções, via `db query` + `migration repair` (nunca `db push`).
2. Publicar `chat-api-v2` e `desk-mcp` (entradas novas em `supabase/config.toml`, `verify_jwt=false`). **Não republicar `chat-api`** (não mudou); depois o frontend (Vercel).
3. Secrets opcionais: `CHAT_API_ALLOWED_ORIGINS`, `CHAT_API_RATE_LIMIT`.
4. Conferir em produção: `/docs/api`, `/docs/mcp`, `curl` do `tools/list` com uma chave de teste, 429 ao exceder, linha em `api_request_log`.
5. Revisar o endereço do projeto Supabase usado nas páginas (`wuzmckatbmlpkdxtfhqr`, o mesmo de `docs/integracoes/uazapi.md`).

## Agendar a limpeza (decisão do dono: sem db push)

Depois de aplicar a migration, rodar via `supabase db query` (ou SQL editor), com a extensão `pg_cron` habilitada no projeto:

```sql
select cron.schedule('api-externa-limpeza', '17 3 * * *', $$select public.api_externa_limpar_antigos()$$);
-- conferir: select * from cron.job where jobname = 'api-externa-limpeza';
-- remover:  select cron.unschedule('api-externa-limpeza');
```

Teste manual antes de agendar: `select public.api_externa_limpar_antigos();` (devolve as contagens apagadas).

## Riscos registrados

- **`webhooks.secret` em texto puro** (tabela `webhooks`, criado em `useCreateWebhook`). Decisão do dono: não alterar agora; risco aceito e registrado.

## Pendências conhecidas

- Sem rate limit antes da autenticação (chave inválida só é limitada pela borda/Cloudflare).
- Instalação por cliente (Claude Desktop/Code, Cursor, Codex) escrita pela documentação dos clientes, **não testada** com os clientes reais.
- Ferramenta de escrita no MCP depende do caminho humanizado + confirmação, que ainda não existe.
