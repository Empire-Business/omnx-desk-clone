# Integrações externas — índice

> Ponto de entrada das integrações do omnx-desk com serviços e sistemas externos.
> Cada linha aponta para o documento detalhado. Atualizado em: 24/07/2026 BRT

| Integração | Doc | O que faz | Direção |
|---|---|---|---|
| **UAZAPI** | [`uazapi.md`](./uazapi.md) | WhatsApp: instâncias, webhook de mensagens, envio, grupos. Base do App Chat e da Cobrança. | ↔ bidirecional |
| **Empire / CRM (GHL)** | [`empire.md`](./empire.md) | Ponte com o CRM Empire (projeto `qzesffnkqgelmtfblzkr`): envio de venda por tenant (Vault + `x-omnx-desk-secret`), e contrato assinado move card para "Assinada". | ↔ bidirecional |
| **Cami (cami-plataforma-lb)** | [`cami.md`](./cami.md) | Puxada read-only de `content_cards` do Cami para as entregas do omnx (edge function). | → entrada |

---

## Serviços de infraestrutura usados (sem doc dedicado ainda)

| Serviço | Uso | Segredo |
|---|---|---|
| **Resend** | E-mail transacional (`send-email`), domínio `omnx.pro` | `RESEND_API_KEY` |
| **CloudConvert** | Geração de contrato em PDF a partir de `.docx` | `CLOUDCONVERT_API_KEY` |
| **OpenRouter** | Respostas/análises de IA do chat e bots | (secret no Supabase) |
| **LiveKit** | Salas de reunião (`livekit-*`) | (secret no Supabase) |
| **Vercel** | Deploy do frontend (branch `main` → produção) | — |

---

## Regras de ouro (ver CLAUDE.md)

- **Nenhum** `SUPABASE_SERVICE_ROLE_KEY` no `.env` ou versionado.
- Segredos por tenant vivem no **Vault** (padrão do conector Empire), nunca no código.
- Toda integração nova exige rodar a skill **`/security-auditor`** antes do deploy.
- Ao adicionar uma integração, criar o doc em `docs/integracoes/<nome>.md` e
  **registrar aqui neste índice**.
