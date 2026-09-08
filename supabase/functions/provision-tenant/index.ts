import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-platform-key, idempotency-key',
}

// URL pública do app — é pra cá que o link de primeiro acesso devolve o dono.
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://desk.omnx.pro').replace(/\/+$/, '')

// Validade do link mágico do Supabase (padrão do GoTrue: 1 hora).
const LINK_TTL_MS = 60 * 60 * 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Erro no formato único do contrato: { ok:false, error, message? } */
function fail(code: string, status: number, message?: string) {
  console.warn(`recusado ${status} ${code}${message ? ` — ${message}` : ''}`)
  return json({ ok: false, error: code, ...(message ? { message } : {}) }, status)
}

function slugify(s: string): string {
  // NFD + filtro a-z0-9 já descarta acentos/diacríticos (viram '-').
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
  return base || 'empresa'
}

async function sha256(value: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(buf)
}

/**
 * Comparação em tempo constante. Compara os DIGESTS (sempre 32 bytes), não as
 * strings cruas — assim nem o tamanho da chave vaza pelo tempo de resposta.
 */
async function secretEquals(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i]
  return diff === 0
}

/** Senha aleatória forte que ninguém vê: só existe pra o usuário nascer válido. */
function senhaAleatoria(len = 32): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*-_=+'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alfabeto[b % alfabeto.length]
  return out
}

// ─── Rate limit em memória (mesmo padrão de vendas-publicas-create) ──────────
// 20 provisionamentos por minuto por chave de plataforma.
const RL_MAX = 20
const RL_WINDOW_MS = 60_000
const rl = new Map<string, { count: number; resetAt: number }>()
function rateLimited(bucket: string): boolean {
  const now = Date.now()
  const slot = rl.get(bucket)
  if (!slot || slot.resetAt < now) {
    rl.set(bucket, { count: 1, resetAt: now + RL_WINDOW_MS })
    return false
  }
  slot.count += 1
  return slot.count > RL_MAX
}

type AdminClient = ReturnType<typeof createClient>

/**
 * Link de entrada do dono. Tenta magiclink; se falhar (ex.: provider desligado),
 * cai pra recovery, que também autentica e leva pra definição de senha.
 */
async function gerarLoginUrl(admin: AdminClient, email: string): Promise<string | null> {
  for (const type of ['magiclink', 'recovery'] as const) {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo: APP_URL },
    })
    if (!error && data?.properties?.action_link) return data.properties.action_link
    console.warn(`generateLink(${type}) falhou: ${error?.message ?? 'sem action_link'}`)
  }
  return null
}

/** Auditoria — nunca pode derrubar o provisionamento. */
async function auditar(
  admin: AdminClient,
  entry: {
    origem: string
    externalId: string | null
    resultado: string
    tenantId?: string | null
    detalhes?: Record<string, unknown>
  },
) {
  try {
    await admin.from('audit_logs').insert({
      acao: 'provision_tenant',
      entidade: 'tenant',
      entidade_id: entry.tenantId ?? null,
      ...(entry.tenantId ? { tenant_id: entry.tenantId } : {}),
      detalhes: {
        origem: entry.origem,
        external_id: entry.externalId,
        resultado: entry.resultado,
        ...(entry.detalhes ?? {}),
      },
    })
  } catch (e) {
    console.error('audit_logs falhou (ignorado):', (e as Error).message)
  }
}

/**
 * Provisiona uma EMPRESA nova (tenant + 1º admin) e devolve o link de entrada.
 *
 * Dois caminhos de autenticação:
 *   (a) JWT de humano + is_master_admin()  → tela /empresas
 *   (b) header X-Platform-Key == PLATFORM_PROVISION_KEY → máquina-a-máquina
 *
 * verify_jwt está DESLIGADO no config.toml — a autorização é feita aqui dentro.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return fail('method_not_allowed', 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let origem = 'desconhecida'
  let externalRef: string | null = null

  try {
    // ── 1. Autorização ──────────────────────────────────────────────────────
    const platformKey = req.headers.get('x-platform-key') ?? ''
    const expectedKey = Deno.env.get('PLATFORM_PROVISION_KEY') ?? ''
    let autorizado = false

    if (platformKey && expectedKey && (await secretEquals(platformKey, expectedKey))) {
      autorizado = true
      origem = 'platform_key'
      // Rate limit só no caminho máquina — a tela humana já é rara e tem JWT.
      const bucket = (await sha256(platformKey))
        .slice(0, 8)
        .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
      if (rateLimited(bucket)) {
        await auditar(admin, { origem, externalId: null, resultado: 'rate_limited' })
        return fail('rate_limited', 429)
      }
    }

    if (!autorizado) {
      const auth = req.headers.get('authorization') ?? ''
      if (auth) {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: auth } },
        })
        const { data: u } = await userClient.auth.getUser()
        if (u.user) {
          const { data: isMaster } = await userClient.rpc('is_master_admin')
          if (isMaster === true) {
            autorizado = true
            origem = `master_admin:${u.user.id}`
          }
        }
      }
    }

    if (!autorizado) return fail('invalid_platform_key', 401)

    // ── 2. Payload ──────────────────────────────────────────────────────────
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return fail('invalid_payload', 422, 'corpo não é JSON válido')
    }

    const txt = (v: unknown, max = 200): string =>
      typeof v === 'string' ? v.trim().slice(0, max) : ''

    // Dois formatos de payload, de propósito:
    //  • `org_name` + `owner: { name, email }` — contrato de provisionamento usado
    //    pela plataforma (Empire OS) e pelos outros sistemas da linha OMNX;
    //  • `empresa_nome` / `admin_nome` / `admin_email` — formato histórico da tela
    //    /empresas, que continua chamando esta mesma função.
    // O contrato novo ganha quando os dois vêm.
    const owner = (body.owner ?? {}) as { name?: unknown; email?: unknown }
    const empresaNome = txt(body.org_name) || txt(body.empresa_nome)
    const adminNome = txt(owner.name) || txt(body.admin_nome)
    const adminEmail = (txt(owner.email) || txt(body.admin_email)).toLowerCase()
    const cor = txt(body.cor, 20) || '#0B57D0'
    const atendimentoSegmento = txt(body.atendimento_segmento, 120) || null
    const customDomain = txt(body.custom_domain, 253).toLowerCase() || null

    // external_id do corpo tem prioridade; o header Idempotency-Key é o plano B.
    externalRef = txt(body.external_id, 200) || txt(req.headers.get('idempotency-key'), 200) || null

    if (!empresaNome) return fail('invalid_payload', 422, 'org_name (ou empresa_nome) é obrigatório')
    if (!adminNome) return fail('invalid_payload', 422, 'owner.name (ou admin_nome) é obrigatório')
    if (!adminEmail || !adminEmail.includes('@')) {
      return fail('invalid_payload', 422, 'owner.email (ou admin_email) inválido')
    }

    // ── 3. Idempotência: já provisionamos esse external_ref? ────────────────
    if (externalRef) {
      const { data: existente } = await admin
        .from('tenants')
        .select('id, slug')
        .eq('external_ref', externalRef)
        .maybeSingle()

      if (existente) {
        // Reconciliação: devolve o mesmo tenant com um link de entrada NOVO.
        const { data: dono } = await admin
          .from('users')
          .select('email')
          .eq('tenant_id', existente.id)
          .eq('perfil', 'admin')
          .order('criado_em', { ascending: true })
          .limit(1)
          .maybeSingle()

        const emailDono = (dono?.email as string | undefined) ?? adminEmail
        const loginUrl = await gerarLoginUrl(admin, emailDono)

        await auditar(admin, {
          origem,
          externalId: externalRef,
          resultado: 'already_provisioned',
          tenantId: existente.id as string,
        })

        return json({
          ok: true,
          already_provisioned: true,
          tenant_id: existente.id,
          slug: existente.slug,
          app_url: APP_URL,
          login_url: loginUrl,
        })
      }
    }

    // ── 4. Cria o tenant ────────────────────────────────────────────────────
    const slug = `${slugify(empresaNome)}-${crypto.randomUUID().slice(0, 6)}`
    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      // Campos opcionais entram só quando vieram preenchidos. Mandar `null`
      // explícito NÃO é o mesmo que omitir: o null atropela o DEFAULT da coluna,
      // e `atendimento_segmento` é NOT NULL com default 'social_media' — foi
      // exatamente o que derrubou o provisionamento vindo da plataforma, que não
      // tem como saber o segmento de atendimento do cliente.
      .insert({
        name: empresaNome,
        slug,
        primary_color: cor,
        external_ref: externalRef,
        ...(atendimentoSegmento ? { atendimento_segmento: atendimentoSegmento } : {}),
        ...(customDomain ? { custom_domain: customDomain } : {}),
      })
      .select('id')
      .single()

    if (tenantErr || !tenant) {
      const msg = tenantErr?.message ?? 'unknown'
      const duplicado = /duplicate key|unique constraint/i.test(msg)

      // Corrida: outra chamada com o MESMO external_ref ganhou entre a busca e o
      // insert. Não é erro do cliente — devolve o tenant que existe agora.
      if (duplicado && externalRef && /external_ref/i.test(msg)) {
        const { data: existente } = await admin
          .from('tenants')
          .select('id, slug')
          .eq('external_ref', externalRef)
          .maybeSingle()
        if (existente) {
          const loginUrl = await gerarLoginUrl(admin, adminEmail)
          await auditar(admin, {
            origem,
            externalId: externalRef,
            resultado: 'already_provisioned_race',
            tenantId: existente.id as string,
          })
          return json({
            ok: true,
            already_provisioned: true,
            tenant_id: existente.id,
            slug: existente.slug,
            app_url: APP_URL,
            login_url: loginUrl,
          })
        }
      }

      await auditar(admin, {
        origem,
        externalId: externalRef,
        resultado: duplicado ? 'slug_taken' : 'provision_failed',
        detalhes: { etapa: 'tenant_insert', erro: msg },
      })
      return duplicado ? fail('slug_taken', 409, msg) : fail('provision_failed', 500, msg)
    }

    const tenantId = tenant.id as string

    // ── 5. Cria o dono da empresa ───────────────────────────────────────────
    // Senha aleatória descartável: nunca sai na resposta nem no log. O acesso
    // real acontece pelo login_url (magic link) devolvido abaixo.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: senhaAleatoria(32),
      email_confirm: true,
      user_metadata: { nome: adminNome, perfil: 'admin', tenant_id: tenantId },
    })

    if (createErr || !created.user) {
      // desfaz o tenant pra não deixar empresa órfã sem admin
      await admin.from('tenants').delete().eq('id', tenantId)
      const msg = createErr?.message ?? 'unknown'
      const jaExiste = /already been registered|already exists|duplicate/i.test(msg)
      await auditar(admin, {
        origem,
        externalId: externalRef,
        resultado: jaExiste ? 'email_ja_cadastrado' : 'provision_failed',
        detalhes: { etapa: 'owner_create', erro: msg },
      })
      // 409 também aqui: é conflito de recurso já existente, não falha interna.
      return jaExiste
        ? fail('email_ja_cadastrado', 409, 'e-mail do admin já cadastrado no sistema')
        : fail('provision_failed', 500, msg)
    }

    // ── 6. Consistência do perfil + seed inicial ────────────────────────────
    await admin
      .from('users')
      .update({ nome: adminNome, perfil: 'admin', tenant_id: tenantId })
      .eq('id', created.user.id)

    const { error: seedErr } = await admin.rpc('seed_tenant', { p_tenant_id: tenantId })
    if (seedErr) console.error('seed_tenant falhou:', seedErr.message)

    // ── 7. Link de entrada ──────────────────────────────────────────────────
    const loginUrl = await gerarLoginUrl(admin, adminEmail)
    if (!loginUrl) {
      await auditar(admin, {
        origem,
        externalId: externalRef,
        resultado: 'provision_failed',
        tenantId,
        detalhes: { etapa: 'generate_link' },
      })
      return fail('provision_failed', 500, 'não foi possível gerar o link de acesso')
    }

    await auditar(admin, {
      origem,
      externalId: externalRef,
      resultado: 'created',
      tenantId,
      detalhes: { slug, seed_ok: !seedErr },
    })

    return json(
      {
        ok: true,
        tenant_id: tenantId,
        slug,
        app_url: APP_URL,
        login_url: loginUrl,
        expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
      },
      201,
    )
  } catch (e) {
    const msg = (e as Error).message
    await auditar(admin, {
      origem,
      externalId: externalRef,
      resultado: 'provision_failed',
      detalhes: { erro: msg },
    })
    return fail('provision_failed', 500, msg)
  }
})
