/**
 * Cifra do corpo de uma notificação Web Push (RFC 8291, "Message Encryption for
 * Web Push"), no formato `Content-Encoding: aes128gcm` (RFC 8188), um registro só.
 *
 * Módulo PURO: só Web Crypto (globalThis.crypto.subtle), sem Deno.* e sem import
 * remoto. Roda nas Edge Functions e no Vitest. O teste confere o exemplo do
 * Apêndice A da RFC 8291 byte a byte.
 *
 * Passos (RFC 8291 §3.3 e §3.4; RFC 8188 §2):
 *   ecdh_secret = ECDH(as_private, ua_public)
 *   PRK_key     = HMAC-SHA-256(auth_secret, ecdh_secret)
 *   key_info    = "WebPush: info" || 0x00 || ua_public || as_public
 *   IKM         = HMAC-SHA-256(PRK_key, key_info || 0x01)
 *   PRK         = HMAC-SHA-256(salt, IKM)
 *   CEK         = HMAC-SHA-256(PRK, "Content-Encoding: aes128gcm" || 0x00 || 0x01)[0..16]
 *   NONCE       = HMAC-SHA-256(PRK, "Content-Encoding: nonce" || 0x00 || 0x01)[0..12]
 *   cabeçalho   = salt(16) || rs(4, big-endian) || idlen(1) = 65 || as_public(65)
 *   corpo       = cabeçalho || AES-128-GCM(CEK, NONCE, texto || 0x02)
 */

/** Tamanho do registro (rs) anunciado no cabeçalho. */
export const WEB_PUSH_RS = 4096
/** Cabeçalho aes128gcm com chave P-256 não comprimida: 16 + 4 + 1 + 65. */
export const WEB_PUSH_CABECALHO = 86
/**
 * Maior texto que cabe num registro de 4096 e num corpo de até 4096 bytes
 * (limite dos serviços de push): 4096 - 86 (cabeçalho) - 16 (tag) - 1 (delimitador).
 */
export const WEB_PUSH_MAX_TEXTO = 4096 - WEB_PUSH_CABECALHO - 16 - 1

const encoder = new TextEncoder()

/* ── base64url ────────────────────────────────────────────────────────────── */

export function base64UrlParaBytes(valor: string): Uint8Array<ArrayBuffer> {
  const limpo = valor.replace(/\s+/g, '').replace(/=+$/, '')
  const padding = '='.repeat((4 - (limpo.length % 4)) % 4)
  const raw = atob((limpo + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function bytesParaBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of partes) {
    out.set(p, i)
    i += p.length
  }
  return out
}

function copia(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', copia(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, copia(dados)))
}

/* ── Chaves ───────────────────────────────────────────────────────────────── */

function pontoP256(publica: Uint8Array): void {
  if (publica.length !== 65 || publica[0] !== 0x04) throw new Error('chave pública P-256 inválida')
}

/**
 * Importa um par P-256 (privada em base64url de 32 bytes + pública não comprimida
 * de 65 bytes) para ECDH. Web Crypto não importa privada EC "raw": monta o JWK.
 */
export async function importarParEcdh(privadaB64Url: string, publicaB64Url: string): Promise<{ privateKey: CryptoKey; publicRaw: Uint8Array<ArrayBuffer> }> {
  const publicRaw = base64UrlParaBytes(publicaB64Url)
  pontoP256(publicRaw)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: privadaB64Url.replace(/\s+/g, '').replace(/=+$/, ''),
    x: bytesParaBase64Url(publicRaw.slice(1, 33)),
    y: bytesParaBase64Url(publicRaw.slice(33, 65)),
    ext: false,
  }
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  return { privateKey, publicRaw }
}

async function importarPublicaEcdh(publica: Uint8Array): Promise<CryptoKey> {
  pontoP256(publica)
  return crypto.subtle.importKey('raw', copia(publica), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

async function parEfemero(): Promise<{ privateKey: CryptoKey; publicRaw: Uint8Array<ArrayBuffer> }> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  return { privateKey: par.privateKey, publicRaw }
}

/* ── Derivação comum (lado do servidor e do navegador) ────────────────────── */

export interface ChavesDerivadas {
  ecdhSecret: Uint8Array
  prkKey: Uint8Array
  ikm: Uint8Array
  prk: Uint8Array
  cek: Uint8Array
  nonce: Uint8Array
}

async function derivar(ecdhSecret: Uint8Array, authSecret: Uint8Array, uaPublic: Uint8Array, asPublic: Uint8Array, salt: Uint8Array): Promise<ChavesDerivadas> {
  const prkKey = await hmac(authSecret, ecdhSecret)
  const keyInfo = concat(encoder.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic)
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0, 1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0, 1])))).slice(0, 12)
  return { ecdhSecret, prkKey, ikm, prk, cek, nonce }
}

/* ── Cifrar (servidor de aplicação) ───────────────────────────────────────── */

export interface CifrarWebPushEntrada {
  /** Texto da notificação (normalmente JSON). */
  texto: Uint8Array | string
  /** Chave `p256dh` da inscrição (base64url ou bytes, 65 bytes). */
  uaPublic: Uint8Array | string
  /** Segredo `auth` da inscrição (base64url ou bytes, 16 bytes). */
  authSecret: Uint8Array | string
  /** Só para teste: sal fixo (16 bytes). Padrão: aleatório. */
  salt?: Uint8Array
  /** Só para teste: par efêmero fixo. Padrão: um par novo por mensagem. */
  parServidor?: { privateKey: CryptoKey; publicRaw: Uint8Array }
}

export interface CifrarWebPushSaida {
  corpo: Uint8Array<ArrayBuffer>
  /** Valores intermediários (para teste; nunca registrar em log). */
  derivadas: ChavesDerivadas
}

const bytes = (v: Uint8Array | string) => (typeof v === 'string' ? base64UrlParaBytes(v) : copia(v))

export async function cifrarWebPush(entrada: CifrarWebPushEntrada): Promise<CifrarWebPushSaida> {
  const texto = typeof entrada.texto === 'string' ? encoder.encode(entrada.texto) : copia(entrada.texto)
  if (texto.length > WEB_PUSH_MAX_TEXTO) throw new Error('notificação grande demais para um registro')
  const uaPublic = bytes(entrada.uaPublic)
  const authSecret = bytes(entrada.authSecret)
  pontoP256(uaPublic)
  if (authSecret.length !== 16) throw new Error('segredo auth da inscrição inválido')
  const salt = entrada.salt ? copia(entrada.salt) : crypto.getRandomValues(new Uint8Array(16))
  if (salt.length !== 16) throw new Error('sal inválido')
  const par = entrada.parServidor ?? (await parEfemero())
  const asPublic = copia(par.publicRaw)
  pontoP256(asPublic)

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: await importarPublicaEcdh(uaPublic) }, par.privateKey, 256),
  )
  const d = await derivar(ecdhSecret, authSecret, uaPublic, asPublic, salt)
  const chave = await crypto.subtle.importKey('raw', copia(d.cek), { name: 'AES-GCM' }, false, ['encrypt'])
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: copia(d.nonce), tagLength: 128 }, chave, concat(texto, new Uint8Array([2]))),
  )
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, WEB_PUSH_RS, false)
  return { corpo: concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrado), derivadas: d }
}

/* ── Decifrar (lado do navegador; usado nos testes de ida e volta) ────────── */

export async function decifrarWebPush(entrada: {
  corpo: Uint8Array
  parNavegador: { privateKey: CryptoKey; publicRaw: Uint8Array }
  authSecret: Uint8Array | string
}): Promise<Uint8Array<ArrayBuffer>> {
  const corpo = copia(entrada.corpo)
  if (corpo.length < 21) throw new Error('corpo curto demais')
  const salt = corpo.slice(0, 16)
  const rs = new DataView(corpo.buffer, corpo.byteOffset + 16, 4).getUint32(0, false)
  const idlen = corpo[20]
  const asPublic = corpo.slice(21, 21 + idlen)
  const cifrado = corpo.slice(21 + idlen)
  if (cifrado.length > rs) throw new Error('mais de um registro não é suportado')
  const uaPublic = copia(entrada.parNavegador.publicRaw)
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: await importarPublicaEcdh(asPublic) }, entrada.parNavegador.privateKey, 256),
  )
  const d = await derivar(ecdhSecret, bytes(entrada.authSecret), uaPublic, asPublic, salt)
  const chave = await crypto.subtle.importKey('raw', copia(d.cek), { name: 'AES-GCM' }, false, ['decrypt'])
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: copia(d.nonce), tagLength: 128 }, chave, cifrado))
  let fim = claro.length - 1
  while (fim >= 0 && claro[fim] === 0) fim--
  if (fim < 0 || claro[fim] !== 2) throw new Error('delimitador de preenchimento inválido')
  return claro.slice(0, fim)
}
