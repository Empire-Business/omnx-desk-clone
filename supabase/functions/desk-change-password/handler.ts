import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PURPOSE = 'omnx-desk:password-completion:v1'
const TTL = 600
const MAX_BODY = 16_384
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const encoder = new TextEncoder()
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-actor-id, x-session-id',
}
function json(body: unknown, status=200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type':'application/json' } }) }
function base64url(data: Uint8Array) { return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'') }
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid')
  return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0))
}
interface Proof {
  v: 1; purpose: typeof PURPOSE; user_id: string; session_id: string; requirement_id: string; iat: number; exp: number
}
interface Requirement { user_id: string; requirement_id: string; completed_at: string | null }
interface Dependencies {
  userClient: (authorization: string)=>SupabaseClient
  admin: SupabaseClient
  url: string
  anonKey: string
  serviceKey: string
  fetch: typeof globalThis.fetch
  now?: ()=>number
}
async function signingKey(secret: string) {
  const source = await crypto.subtle.importKey('raw',encoder.encode(secret),'HKDF',false,['deriveKey'])
  return crypto.subtle.deriveKey({ name:'HKDF',hash:'SHA-256',salt:encoder.encode('omnx-desk'),info:encoder.encode(PURPOSE) },source,
    { name:'HMAC',hash:'SHA-256',length:256 },false,['sign','verify'])
}
async function signProof(proof: Proof, secret: string) {
  const payload=base64url(encoder.encode(JSON.stringify(proof)))
  const content=`pc1.${payload}`
  const signature=await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(content))
  return `${content}.${base64url(new Uint8Array(signature))}`
}
async function verifyProof(value: string, secret: string, now: number): Promise<Proof | null> {
  try {
    if (value.length>2048) return null
    const parts=value.split('.')
    if (parts.length!==3 || parts[0]!=='pc1') return null
    const signature=decode(parts[2])
    if (signature.length!==32 || !await crypto.subtle.verify('HMAC',await signingKey(secret),signature,encoder.encode(`${parts[0]}.${parts[1]}`))) return null
    const p=JSON.parse(new TextDecoder().decode(decode(parts[1])))
    const keys=['v','purpose','user_id','session_id','requirement_id','iat','exp']
    if (!p || typeof p!=='object' || Object.keys(p).length!==keys.length || Object.keys(p).some(k=>!keys.includes(k))) return null
    if (p.v!==1 || p.purpose!==PURPOSE || ![p.user_id,p.session_id,p.requirement_id].every(id=>typeof id==='string'&&UUID.test(id))
      || !Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.exp) || p.exp<=p.iat || p.exp-p.iat>TTL || p.iat>now+30 || p.exp<=now) return null
    return p as Proof
  } catch { return null }
}
const AUTH_ERRORS = new Set(['same_password','weak_password','reauthentication_needed','current_password_required','current_password_mismatch'])

/** Own-session password change. Never logs, stores or returns a password or Auth token. */
export function createPasswordChangeHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method==='OPTIONS') return new Response(null,{headers:corsHeaders})
    if (req.method!=='POST') return json({ok:false,error:'method_not_allowed',password_updated:false},405)
    let passwordUpdated=false
    try {
      const authorization=req.headers.get('authorization')??''
      if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ok:false,error:'sessao_invalida',password_updated:false},401)
      const client=deps.userClient(authorization)
      const {data: auth,error: authError}=await client.auth.getUser()
      if (authError || !auth.user || auth.user.is_anonymous || auth.user.id!==req.headers.get('x-actor-id')) return json({ok:false,error:'sessao_invalida',password_updated:false},401)
      const userId=auth.user.id
      const {data: status,error: statusError}=await client.rpc('desk_password_change_status')
      if (statusError || !status || !['ok','password_change_required'].includes(status.state)
        || typeof status.session_id!=='string' || !UUID.test(status.session_id) || status.session_id!==req.headers.get('x-session-id')) {
        return json({ok:false,error:'sessao_invalida',password_updated:false},401)
      }
      const sessionId=status.session_id as string
      const raw=await req.text()
      if (raw.length>MAX_BODY) return json({ok:false,error:'pedido_invalido',password_updated:false},400)
      let body: unknown
      try { body=JSON.parse(raw) } catch { return json({ok:false,error:'pedido_invalido',password_updated:false},400) }
      if (!body || typeof body!=='object' || Array.isArray(body)) return json({ok:false,error:'pedido_invalido',password_updated:false},400)
      const input=body as Record<string,unknown>
      const keys=Object.keys(input)
      const confirm=Object.hasOwn(input,'completion_proof')
      const reauthenticate=Object.hasOwn(input,'reauthenticate')
      const allowed=confirm?['completion_proof']:reauthenticate?['reauthenticate']:['password','current_password','nonce']
      const invalid=keys.some(k=>!allowed.includes(k)) || (confirm
        ? typeof input.completion_proof!=='string'
        : reauthenticate ? input.reauthenticate!==true
        : typeof input.password!=='string' || input.password.length<8 || input.password.length>4096
          || (Object.hasOwn(input,'current_password') && (typeof input.current_password!=='string' || input.current_password.length===0 || input.current_password.length>4096))
          || (Object.hasOwn(input,'nonce') && (typeof input.nonce!=='string' || !/^\d{6,12}$/.test(input.nonce))))
      if (invalid) return json({ok:false,error:'pedido_invalido',password_updated:false},400)
      if (reauthenticate) {
        // Only an explicit own-session action requests the Auth code; no destination/email is accepted.
        try {
          const sent=await deps.fetch(`${deps.url.replace(/\/$/,'')}/auth/v1/reauthenticate`, {
            method:'GET',headers:{Authorization:authorization,apikey:deps.anonKey},signal:AbortSignal.timeout(20_000),
          })
          if (!sent.ok) return json({ok:false,error:sent.status>=500?'reauthentication_uncertain':'reauthentication_failed',password_updated:false},502)
          return json({ok:true,reauthentication_sent:true,password_updated:false})
        } catch { return json({ok:false,error:'reauthentication_uncertain',password_updated:false},502) }
      }
      const {data: requirement,error: readError}=await deps.admin.from('desk_password_requirements')
        .select('user_id,requirement_id,completed_at').eq('user_id',userId).maybeSingle()
      if (readError) return json({ok:false,error:'requirement_unavailable',password_updated:false},503)
      const row=requirement as Requirement | null
      const now=()=>Math.floor((deps.now?.()??Date.now())/1000)
      let proof: Proof | null=null
      if (confirm) {
        proof=await verifyProof(input.completion_proof as string,deps.serviceKey,now())
        if (!proof || proof.user_id!==userId || proof.session_id!==sessionId || proof.requirement_id!==row?.requirement_id) {
          return json({ok:false,error:'confirmation_invalid',password_updated:false},409)
        }
        passwordUpdated=true
      } else {
        // NATIVE self-update: original user's Bearer, public anon key, no admin password update or refresh token.
        let changed: Response
        try {
          changed=await deps.fetch(`${deps.url.replace(/\/$/,'')}/auth/v1/user`, {
            method:'PUT',headers:{Authorization:authorization,apikey:deps.anonKey,'Content-Type':'application/json'},
            body:JSON.stringify({password:input.password,
              ...(typeof input.current_password==='string'?{current_password:input.current_password}:{}),
              ...(typeof input.nonce==='string'?{nonce:input.nonce}:{})}),signal:AbortSignal.timeout(20_000),
          })
        } catch { return json({ok:false,error:'password_update_uncertain',password_updated:false},502) }
        let updated: Record<string,unknown> | null=null
        try { updated=await changed.json() } catch { /* Non-JSON success is indeterminate, never clears a marker. */ }
        if (!changed.ok) {
          const code=typeof updated?.error_code==='string'?updated.error_code:typeof updated?.code==='string'?updated.code:''
          return json({ok:false,error:AUTH_ERRORS.has(code)?code:changed.status>=500?'password_update_uncertain':'password_update_failed',password_updated:false},AUTH_ERRORS.has(code)?422:502)
        }
        if (updated?.id!==userId) return json({ok:false,error:'password_update_uncertain',password_updated:false},502)
        passwordUpdated=true
        const issuedAt=now()
        // Capture generation BEFORE PUT. A concurrent new requirement cannot be completed by this request.
        if (row && !row.completed_at) proof={v:1,purpose:PURPOSE,user_id:userId,session_id:sessionId,requirement_id:row.requirement_id,iat:issuedAt,exp:issuedAt+TTL}
      }
      if (!proof) return json({ok:true,state:'ok',password_updated:true})
      let completed=false
      try {
        const {data: cleared,error: clearError}=await deps.admin.from('desk_password_requirements')
          .update({completed_at:new Date(deps.now?.()??Date.now()).toISOString()})
          .eq('user_id',userId).eq('requirement_id',proof.requirement_id).is('completed_at',null).select('requirement_id').maybeSingle()
        completed=!clearError && cleared?.requirement_id===proof.requirement_id
        if (!completed && !clearError) {
          const {data: latest,error: latestError}=await deps.admin.from('desk_password_requirements').select('requirement_id,completed_at').eq('user_id',userId).maybeSingle()
          completed=!latestError && latest?.requirement_id===proof.requirement_id && Boolean(latest.completed_at)
          if (!latestError && latest?.requirement_id!==proof.requirement_id) return json({ok:false,error:'requirement_changed',password_updated:true},409)
        }
      } catch { /* Preserve verified Auth success; proof permits confirmation without another password change. */ }
      if (completed) return json({ok:true,state:'ok',password_updated:true})
      return json({ok:false,error:'completion_pending',password_updated:true,completion_proof:confirm?input.completion_proof:await signProof(proof,deps.serviceKey)},202)
    } catch {
      return json({ok:false,error:'request_failed',password_updated:passwordUpdated},503)
    }
  }
}
