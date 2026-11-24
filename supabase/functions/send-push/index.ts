import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cifrarWebPush, WEB_PUSH_MAX_TEXTO } from "../_shared/web-push-cifra.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
// Contato exigido pelo VAPID (mailto: ou https:). Endereço do app quando configurado.
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")?.trim() || Deno.env.get("APP_URL")?.trim() || "mailto:admin@empiredesk.com"

// ── Web Push helpers (no npm dependency — uses Web Crypto API) ──────────────

// Chaves VAPID: segredos das funções VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (o instalador
// gera um par por instalação). Fallback legado: RPC get_secrets, que existe só em
// bancos antigos; se ela não existir, o erro é ignorado e o push fica sem chave.
async function getVapidKeys(): Promise<{ privateKey?: string; publicKey?: string }> {
  const privEnv = Deno.env.get("VAPID_PRIVATE_KEY")?.trim()
  const pubEnv = Deno.env.get("VAPID_PUBLIC_KEY")?.trim()
  if (privEnv && pubEnv) return { privateKey: privEnv, publicKey: pubEnv }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: secrets, error } = await supabase.rpc("get_secrets", {
      secret_names: ["VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY"],
    })
    if (error || !Array.isArray(secrets)) return {}
    const lista = secrets as { name: string; secret: string }[]
    return {
      privateKey: lista.find((s) => s.name === "VAPID_PRIVATE_KEY")?.secret,
      publicKey: lista.find((s) => s.name === "VAPID_PUBLIC_KEY")?.secret,
    }
  } catch {
    return {}
  }
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = ""
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

// Web Crypto não importa chave privada EC em formato "raw": monta o JWK com o
// escalar privado (d) e o ponto público (x, y) tirado da chave pública não comprimida
// (0x04 || x || y, 65 bytes, como gerada pelo instalador e pelo web-push).
async function importVapidPrivateKey(privateB64Url: string, publicB64Url: string) {
  const ponto = base64UrlToUint8Array(publicB64Url)
  if (ponto.length !== 65 || ponto[0] !== 4) throw new Error("VAPID_PUBLIC_KEY inválida")
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateB64Url.replace(/=+$/, ""),
    x: uint8ArrayToBase64Url(ponto.slice(1, 33)),
    y: uint8ArrayToBase64Url(ponto.slice(33, 65)),
    ext: false,
  }
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
}

async function createJWT(audience: string, subject: string, vapidPrivateKey: CryptoKey) {
  const header = { alg: "ES256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = { aud: audience, exp: now + 60 * 60 * 12, sub: subject }

  const enc = new TextEncoder()
  const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(header)))
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapidPrivateKey,
    enc.encode(unsignedToken)
  )

  // Convert DER signature to raw r||s format
  const sigArr = new Uint8Array(signature)
  let r: Uint8Array, s: Uint8Array

  if (sigArr.length === 64) {
    r = sigArr.slice(0, 32)
    s = sigArr.slice(32)
  } else {
    // DER encoded
    const rLen = sigArr[3]
    const rStart = 4 + (rLen > 32 ? 1 : 0)
    r = sigArr.slice(rStart, rStart + 32)
    const sOffset = 4 + rLen
    const sLen = sigArr[sOffset + 1]
    const sStart = sOffset + 2 + (sLen > 32 ? 1 : 0)
    s = sigArr.slice(sStart, sStart + 32)
  }

  const rawSig = new Uint8Array(64)
  rawSig.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32))
  rawSig.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32))

  return `${unsignedToken}.${uint8ArrayToBase64Url(rawSig)}`
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: CryptoKey
) {
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`

  const jwt = await createJWT(audience, VAPID_SUBJECT, vapidPrivateKey)

  // Corpo cifrado conforme RFC 8291 (aes128gcm): os serviços de push recusam
  // corpo em texto puro. Chave efêmera e sal novos a cada envio.
  const { corpo } = await cifrarWebPush({
    texto: payload,
    uaPublic: subscription.p256dh,
    authSecret: subscription.auth,
  })

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
    },
    body: corpo,
  })
  await response.body?.cancel()

  return { ok: response.ok, status: response.status }
}

/** Monta o JSON da notificação cortando o texto para caber num registro (4 KB). */
function montarPayload(dados: { title: unknown; body: unknown; url: unknown; tag: unknown }): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length
  let corpo = typeof dados.body === "string" ? dados.body : dados.body == null ? undefined : String(dados.body)
  let json = JSON.stringify({ title: dados.title, body: corpo, url: dados.url, tag: dados.tag })
  while (corpo && bytes(json) > WEB_PUSH_MAX_TEXTO) {
    corpo = corpo.slice(0, Math.max(0, Math.floor(corpo.length * 0.8) - 1)) + "…"
    json = JSON.stringify({ title: dados.title, body: corpo, url: dados.url, tag: dados.tag })
    if (corpo.length <= 1) break
  }
  return json
}

// Só o servidor chama esta função (uazapi-webhook, com a service_role). Sem isto,
// com verify_jwt = false, qualquer pessoa mandaria notificação para qualquer usuário.
function iguaisTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

function chamadaDoServidor(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? ""
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return Boolean(SERVICE_ROLE_KEY) && m !== null && iguaisTempoConstante(m[1].trim(), SERVICE_ROLE_KEY)
}

// ── Edge Function handler ───────────────────────────────────────────────────

servirComLicenca(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 })
  }
  if (!chamadaDoServidor(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
  }

  try {
    const { user_ids, title, body, url, tag } = await req.json()

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids required" }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Get subscriptions for these users
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", user_ids)

    if (error) throw error
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }))
    }

    // Get VAPID keys
    const { privateKey, publicKey } = await getVapidKeys()
    if (!privateKey || !publicKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500 })
    }

    const vapidKey = await importVapidPrivateKey(privateKey, publicKey)
    const payload = montarPayload({ title, body, url, tag })

    // Send to all subscriptions
    let sent = 0
    let failed = 0
    const staleEndpoints: string[] = []

    for (const sub of subscriptions) {
      try {
        const result = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          publicKey,
          vapidKey
        )
        if (result.ok) {
          sent++
        } else if (result.status === 410 || result.status === 404) {
          // Subscription expired — clean up
          staleEndpoints.push(sub.endpoint)
          failed++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", staleEndpoints)
    }

    return new Response(JSON.stringify({ sent, failed, total: subscriptions.length }))
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
