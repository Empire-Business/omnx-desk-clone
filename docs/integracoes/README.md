# Integrações externas — índice

> Ponto de entrada das integrações do omnx-desk com serviços e sistemas externos.
> Cada linha aponta para o documento detalhado. Atualizado em: 27/10/2026 às 09h26 BRT

| Integração | Doc | O que faz | Direção |
|---|---|---|---|
| **UAZAPI** | [`uazapi.md`](./uazapi.md) | WhatsApp: instâncias, webhook de mensagens (protegido por token no caminho), envio, grupos, autoria das mensagens. Base do App Chat, da Cobrança, das Automações WhatsApp e da Íris. | ↔ bidirecional |
| **Empire / CRM (GHL)** | [`empire.md`](./empire.md) | Ponte com o CRM Empire (projeto `qzesffnkqgelmtfblzkr`): envio de venda por tenant (Vault + `x-omnx-desk-secret`), e contrato assinado move card para "Assinada". | ↔ bidirecional |
| **Zernio** | [`zernio.md`](./zernio.md) | WhatsApp **oficial** (Cloud API) do app Automações WhatsApp: envio por modelo aprovado (aviso diário ao gestor, resumo semanal ao cliente). Chave no Vault; sem grupos por enquanto. | → saída |
| **Cami (cami-plataforma-lb)** | [`cami.md`](./cami.md) | Puxada read-only de `content_cards` do Cami para as entregas do omnx (edge function). | → entrada |

---

## Serviços de infraestrutura usados (sem doc dedicado ainda)

| Serviço | Uso | Segredo |
|---|---|---|
| **Resend** | E-mail transacional (`send-email`), domínio `omnx.pro` | `RESEND_API_KEY` |
| **CloudConvert** | Geração de contrato em PDF a partir de `.docx` | `CLOUDCONVERT_API_KEY` |
| **OpenRouter** | IA do chat e bots; Automações WhatsApp: Íris e análise de relacionamento por cliente (Claude Opus 5.5), mensagens da UAZAPI reescritas (Claude Sonnet 5.5), resumo semanal (Claude Opus 5.5), transcrição de áudio (Gemini 2.5 Flash) e descrição de imagem (Gemini 2.5 Flash-Lite). Sempre com `data_collection: 'deny'`. Detalhes em `../ARQUITETURA.md` §8 | `OPENROUTER_API_KEY` (secret no Supabase) |
| **LiveKit** | Salas de reunião (`livekit-*`) | (secret no Supabase) |
| **Vercel** | Deploy do frontend (branch `main` → produção) | — |

---

## Regras de ouro (ver CLAUDE.md)

- **Nenhum** `SUPABASE_SERVICE_ROLE_KEY` no `.env` ou versionado.
- Segredos por tenant vivem no **Vault** (padrão do conector Empire), nunca no código.
- Toda integração nova exige rodar a skill **`/security-auditor`** antes do deploy.
- Ao adicionar uma integração, criar o doc em `docs/integracoes/<nome>.md` e
  **registrar aqui neste índice**.
