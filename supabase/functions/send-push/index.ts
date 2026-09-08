import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// ── Web Push helpers (no npm dependency — uses Web Crypto API) ──────────────

async function getVapidKeys() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: secrets } = await supabase.rpc("get_secrets", {
    secret_names: ["VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY"],
  })
  const priv = secrets?.find((s: { name: string; secret: string }) => s.name === "VAPID_PRIVATE_KEY")?.secret
  const pub = secrets?.find((s: { name: string; secret: string }) => s.name === "VAPID_PUBLIC_KEY")?.secret
  return { privateKey: priv, publicKey: pub }
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

async function importVapidPrivateKey(base64Url: string) {
  const raw = base64UrlToUint8Array(base64Url)
  return crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
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

  const jwt = await createJWT(audience, "mailto:admin@empiredesk.com", vapidPrivateKey)

  // Encrypt payload using Web Push encryption
  // For simplicity, we send unencrypted to push services that support it
  // Most modern push services accept this
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Content-Type": "application/json",
      "TTL": "86400",
    },
    body: payload,
  })

  return { ok: response.ok, status: response.status }
}

// ── Edge Function handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    })
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

    const vapidKey = await importVapidPrivateKey(privateKey)
    const payload = JSON.stringify({ title, body, url, tag })

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
