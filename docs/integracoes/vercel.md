# Vercel — deploy, domínio e segurança

> Configuração de publicação do frontend do omnx-desk. Atualizado em: 24/07/2026 BRT

---

## 1. Como funciona o deploy

```
git push → GitHub (Empire-Business/omnx-desk) → Vercel detecta → build → publica
```

- Branch **`main`** → **produção** (`desk.omnx.pro`)
- Outras branches → **preview** (URL temporária por push)
- Build: `npm run build` (Vite) → saída em `dist/`

## 2. `vercel.json` atual

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

O `rewrites` faz o fallback de SPA (todas as rotas caem no `index.html` para o
React Router assumir).

---

## 3. 🔴 Gap de segurança — faltam os headers

O CLAUDE.md exige que o `vercel.json` tenha **headers de segurança** (checklist de
deploy). Hoje **não tem nenhum**. Este é o principal débito de deploy em aberto.

> ⚠️ **Não aplicado ainda de propósito:** uma `Content-Security-Policy` mal
> calibrada quebra o app (chamadas ao Supabase, Realtime/WebSocket, Cloudflare,
> fontes, imagens de avatar). Aplicar em **preview primeiro**, testar o app inteiro
> (login, chat realtime, upload, PDF), e só então promover para produção.

### Headers recomendados (ponto de partida — validar em preview)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(self), microphone=(self), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

> A **CSP** foi deixada de fora deste bloco de propósito — ela precisa listar os
> hosts do Supabase (REST + Realtime `wss:`), Cloudflare, LiveKit e do storage de
> imagens. Montar e testar isolada, em preview, antes de ligar em produção. A skill
> `/security-auditor` ajuda a derivar a CSP a partir das origens reais usadas.

---

## 4. Cloudflare na frente (ver CLAUDE.md)

O domínio fica atrás do Cloudflare (proxy laranja), com:
- SSL/TLS **Full (Strict)**, HTTPS Always, HSTS, Min TLS 1.2
- WAF + Bot Fight Mode + Rate Limiting
- Turnstile (captcha) nas telas de login/signup

---

## 5. Variáveis de ambiente

- Ficam **no painel da Vercel** (Settings → Environment Variables), nunca no código.
- Front usa apenas chaves **públicas** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- **Nunca** `SUPABASE_SERVICE_ROLE_KEY` no front/`.env` — só nos secrets das Edge
  Functions no Supabase.

---

## 6. Checklist antes de um deploy de produção

- [x] Skill `/security-auditor` executada — **27/07/2026**, gate `PASS`
      (relatório em `security-report/`, fora do versionamento)
- [x] `vercel.json` com headers de segurança — **feito em 27/07/2026**
- [ ] Variáveis de ambiente conferidas no painel
- [ ] HTTPS/cadeado verde e Cloudflare ativo
- [ ] Teste dos fluxos críticos (login, chat realtime, contratos, cobrança)

### Headers aplicados (27/07/2026)

`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Strict-Transport-Security` e `Cross-Origin-Opener-Policy`. Em `/reset-password` e
`/update-password`, `Referrer-Policy: no-referrer`, para o token de redefinição não
vazar pelo header `Referer`.

Duas escolhas deliberadas:

- **CSP ficou de fora** desta rodada. O app carrega mídia do Supabase Storage e do
  WhatsApp; uma CSP mal calibrada quebraria o Chat em produção. O caminho é entrar
  primeiro como `Content-Security-Policy-Report-Only`, medir, e só depois impor.
- **`Permissions-Policy` não bloqueia câmera nem microfone** — `/meet` e o áudio do
  Chat dependem deles. Bloqueia apenas `geolocation`, `payment` e `usb`.
