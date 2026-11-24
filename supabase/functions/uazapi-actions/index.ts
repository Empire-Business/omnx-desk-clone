import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chatEhRestrito, podeVerRestritoOuPerfil } from '../_shared/chat-restrito.ts'
import {
  ACOES_COM_MENSAGEM,
  ACOES_COM_NUMERO,
  acaoConhecida,
  filtrarMensagensDoChat,
  perfilPodeAcao,
  validarParametrosAcao,
  variantesDoNumero,
  webhookUrlPermitida,
} from '../_shared/uazapi-acoes.ts'
import { mascararUrlWebhook } from '../_shared/wa-webhook-token.ts'
import { tokenUazapi, urlUazapi } from '../_shared/uazapi-credenciais.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Conexão com a UAZAPI de um número: endereço da empresa + token do número. */
interface ConexaoUazapi {
  base: string
  token: string
}

type Action =
  | 'react' | 'edit_message' | 'delete_message' | 'mark_read'
  | 'send_menu' | 'send_contact' | 'send_location'
  | 'manage_labels' | 'list_labels'
  | 'archive_chat' | 'pin_chat' | 'mute_chat' | 'block_contact'
  | 'check_numbers' | 'chat_details'
  | 'find_messages' | 'find_chats' | 'update_profile_image'
  | 'get_webhook' | 'set_webhook' | 'get_status'

// ── UAZAPI call helper ──────────────────────────────────────────────────────

async function uazapi(
  conn: ConexaoUazapi,
  path: string,
  body: Record<string, unknown>,
  method = 'POST',
): Promise<Record<string, unknown>> {
  const res = await fetch(`${conn.base}${path}`, {
    method,
    headers: { token: conn.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// ── Menu builder helpers ────────────────────────────────────────────────────

function buildButtonRows(choices: string[]) {
  return choices.slice(0, 3).map((c) => {
    const [text, action] = c.split('|')
    if (action?.startsWith('https://') || action?.startsWith('http://')) {
      return { type: 'url', text: text.trim(), url: action.trim() }
    }
    if (action?.startsWith('call:')) {
      return { type: 'call', text: text.trim(), phoneNumber: action.replace('call:', '').trim() }
    }
    if (action?.startsWith('copy:')) {
      return { type: 'copy', text: text.trim(), copyCode: action.replace('copy:', '').trim() }
    }
    return { type: 'reply', text: text.trim(), id: action?.trim() || text.trim().toLowerCase().replace(/\s+/g, '_') }
  })
}

function buildListSections(choices: string[]) {
  const sections: { title: string; rows: { title: string; rowId: string; description?: string }[] }[] = []
  let current: { title: string; rows: { title: string; rowId: string; description?: string }[] } = { title: 'Opções', rows: [] }

  for (const c of choices) {
    const sectionMatch = c.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      if (current.rows.length > 0) sections.push(current)
      current = { title: sectionMatch[1], rows: [] }
    } else {
      const parts = c.split('|')
      current.rows.push({
        title: parts[0].trim(),
        rowId: parts[1]?.trim() || parts[0].trim().toLowerCase().replace(/\s+/g, '_'),
        description: parts[2]?.trim(),
      })
    }
  }
  if (current.rows.length > 0) sections.push(current)
  return sections
}

// ── Action router ───────────────────────────────────────────────────────────

async function handleAction(
  conn: ConexaoUazapi,
  action: Action,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (action) {
    // ── High priority ─────────────────────────────────────────────────────

    case 'react':
      return uazapi(conn, '/message/react', {
        number: params.number,
        text: params.emoji,
        id: params.message_id,
      })

    case 'edit_message':
      return uazapi(conn, '/message/edit', {
        id: params.message_id,
        text: params.text,
      })

    case 'delete_message':
      return uazapi(conn, '/message/delete', {
        id: params.message_id,
        onlyMe: params.only_me ?? false,
      })

    case 'mark_read':
      return uazapi(conn, '/chat/read', {
        number: params.number,
        read: true,
      })

    case 'send_menu': {
      const menuType = params.type as string
      const choices = params.choices as string[]
      const number = params.number as string
      const text = params.text as string
      const footerText = params.footerText as string | undefined

      if (menuType === 'button') {
        return uazapi(conn, '/send/buttons', {
          number,
          text,
          footer: footerText || '',
          buttons: buildButtonRows(choices),
        })
      }

      if (menuType === 'list') {
        return uazapi(conn, '/send/list', {
          number,
          text,
          footer: footerText || '',
          buttonText: (params.listButton as string) || 'Ver opções',
          sections: buildListSections(choices),
        })
      }

      if (menuType === 'poll') {
        return uazapi(conn, '/send/poll', {
          number,
          name: text,
          values: choices,
          selectableCount: (params.selectableCount as number) || 1,
        })
      }

      return { error: `Unknown menu type: ${menuType}` }
    }

    case 'send_contact':
      return uazapi(conn, '/send/contact', {
        number: params.number,
        contact: {
          fullName: params.fullName,
          phoneNumber: params.phoneNumber,
          organization: params.organization || undefined,
          email: params.email || undefined,
          url: params.url || undefined,
        },
      })

    case 'send_location':
      return uazapi(conn, '/send/location', {
        number: params.number,
        lat: params.latitude,
        lng: params.longitude,
        name: params.name || '',
        address: params.address || '',
      })

    // ── Medium priority ───────────────────────────────────────────────────

    case 'manage_labels': {
      const body: Record<string, unknown> = { number: params.number }
      if (params.label_action === 'add') {
        body.add_labelid = String(params.label_id)
      } else {
        body.remove_labelid = String(params.label_id)
      }
      return uazapi(conn, '/chat/labels', body)
    }

    case 'list_labels':
      // Use chat/find to get labels from chats (no dedicated list endpoint)
      return uazapi(conn, '/chat/find', { limit: 1, fields: ['labels'] })

    case 'archive_chat':
      return uazapi(conn, '/chat/archive', {
        number: params.number,
        archive: params.archive ?? true,
      })

    case 'pin_chat':
      return uazapi(conn, '/chat/pin', {
        number: params.number,
        pin: params.pin ?? true,
      })

    case 'mute_chat':
      return uazapi(conn, '/chat/mute', {
        number: params.number,
        hours: params.hours ?? 8,
      })

    case 'block_contact':
      return uazapi(conn, '/chat/block', {
        number: params.number,
        block: params.block ?? true,
      })

    case 'check_numbers':
      return uazapi(conn, '/chat/check', {
        numbers: params.numbers,
      })

    case 'chat_details':
      return uazapi(conn, '/chat/details', {
        number: params.number,
      })

    // ── Additional ────────────────────────────────────────────────────────

    case 'find_messages':
      return uazapi(conn, '/message/find', {
        number: params.number,
        limit: params.limit ?? 50,
        offset: params.offset,
        sort: params.sort,
        search: params.search,
      })

    case 'find_chats':
      return uazapi(conn, '/chat/find', {
        limit: params.limit ?? 50,
        offset: params.offset,
        unread: params.unread,
        archived: params.archived,
      })

    case 'update_profile_image':
      return uazapi(conn, '/profile/image', {
        image: params.image,
      })

    case 'get_status': {
      const res = await fetch(`${conn.base}/instance/status`, {
        method: 'GET',
        headers: { token: conn.token },
      })
      return res.json()
    }

    case 'get_webhook': {
      const res = await fetch(`${conn.base}/webhook`, {
        method: 'GET',
        headers: { token: conn.token },
      })
      // A url do webhook protegido carrega o token (/k/<token>): nunca sai daqui.
      const dados = await res.json()
      // Recursivo: cobre lista, objeto e formatos aninhados ({ webhooks: [...] }).
      const mascarar = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(mascarar)
        if (v && typeof v === 'object') {
          const out: Record<string, unknown> = {}
          for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
            out[k] = k === 'url' ? mascararUrlWebhook(x) : mascarar(x)
          }
          return out
        }
        return v
      }
      return mascarar(dados) as Record<string, unknown>
    }

    case 'set_webhook':
      return uazapi(conn, '/webhook', {
        enabled: params.enabled ?? true,
        url: params.url,
        events: params.events ?? ['messages', 'messages_update'],
      })

    default:
      return { error: `Unknown action: ${action}` }
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mesma resposta para "não existe" e "não é seu": não revela o que existe.
const NAO_ENCONTRADO = { error: 'Conversa não encontrada.' }

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    const jwt = authHeader.replace('Bearer ', '')
    const ehUsuario = jwt !== serviceKey

    const corpo = await req.json().catch(() => null) as Record<string, unknown> | null
    const { action, instance_id, ...params } = corpo ?? {}
    if (!acaoConhecida(action) || typeof instance_id !== 'string' || !instance_id.trim()) {
      return resposta({ error: 'action e instance_id são obrigatórios (ação conhecida).' }, 400)
    }

    // service_role (uso interno) vê tudo; usuário passa pelas conferências abaixo.
    let veRestrito = true
    let tenantDaInstancia: string | null = null

    if (ehUsuario) {
      const { data: { user } } = await supabase.auth.getUser(jwt)
      if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

      // 1) Perfil e empresa do usuário (users.tenant_id tem de bater com profiles).
      const [{ data: u }, { data: prof }] = await Promise.all([
        supabase.from('users').select('perfil, ativo, tenant_id').eq('id', user.id).maybeSingle(),
        supabase.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle(),
      ])
      if (!u || u.ativo === false || !u.tenant_id || !prof?.tenant_id || u.tenant_id !== prof.tenant_id) {
        return resposta({ error: 'Acesso negado.' }, 403)
      }

      // 2) Ação permitida para o perfil (nega por padrão; 'cliente' nunca passa).
      if (!perfilPodeAcao(u.perfil, action)) {
        return resposta({ error: 'Ação não permitida para o seu perfil.' }, 403)
      }

      // 3) Instância da empresa do usuário E com acesso dele. Lida COMO o usuário:
      //    a RLS aplica tenant_isolation + user_can_access_instance(id).
      const usuario = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      })
      const { data: insts } = await usuario
        .from('whatsapp_instances')
        .select('id, tenant_id')
        .eq('instance_id', instance_id)
        .eq('tenant_id', u.tenant_id)
        .limit(1)
      const inst = (insts ?? [])[0] as { id: string; tenant_id: string } | undefined
      if (!inst || inst.tenant_id !== u.tenant_id) {
        return resposta({ error: 'Número de WhatsApp não encontrado.' }, 404)
      }
      tenantDaInstancia = inst.tenant_id

      // 4) Grupos internos: só admin/gerente.
      veRestrito = await podeVerRestritoOuPerfil(usuario, u.perfil)
      const validacao = validarParametrosAcao(action, params, veRestrito)
      if (!validacao.ok) return resposta({ error: validacao.erro }, validacao.status)

      if (!veRestrito) {
        if (ACOES_COM_NUMERO.includes(action)) {
          // Grupo interno (marca no contato OU registro da empresa) ⇒ não existe.
          if (await chatEhRestrito(supabase, params.number, u.tenant_id)) return resposta(NAO_ENCONTRADO, 404)
          // E o chat tem de ser um contato que ele enxerga pela RLS (empresa,
          // carteira do estrategista, grupos internos).
          const { data: vis } = await usuario
            .from('chat_contacts')
            .select('id')
            .in('numero_whatsapp', variantesDoNumero(params.number))
            .limit(1)
          if (!vis || vis.length === 0) return resposta(NAO_ENCONTRADO, 404)
        }
        if (ACOES_COM_MENSAGEM.includes(action)) {
          // Mensagem precisa ser de uma conversa que ele enxerga (RLS de chat_messages).
          const { data: msg } = await usuario
            .from('chat_messages')
            .select('id')
            .eq('message_id_wpp', params.message_id as string)
            .limit(1)
          if (!msg || msg.length === 0) return resposta(NAO_ENCONTRADO, 404)
        }
      }
    } else {
      const validacao = validarParametrosAcao(action, params, true)
      if (!validacao.ok) return resposta({ error: validacao.erro }, validacao.status)
      const { data: insts } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id')
        .eq('instance_id', instance_id)
        .limit(1)
      if (!insts || insts.length === 0) return resposta({ error: 'Número de WhatsApp não encontrado.' }, 404)
      tenantDaInstancia = (insts[0] as { tenant_id?: string | null }).tenant_id ?? null
    }

    // Webhook só aponta para as funções deste projeto (senão desvia as mensagens).
    if (action === 'set_webhook' && !webhookUrlPermitida(params.url, supabaseUrl)) {
      return resposta({ error: 'URL de webhook não permitida.' }, 400)
    }

    // Get UAZAPI token for the instance
    const token = await tokenUazapi(supabase, instance_id, tenantDaInstancia)
    if (!token) return resposta({ error: 'Número de WhatsApp sem token configurado.' }, 500)
    const base = await urlUazapi(supabase, tenantDaInstancia)

    let result: unknown = await handleAction({ base, token }, action as Action, params)

    // A UAZAPI pode devolver mensagens de vários chats: fica só o chat pedido.
    if (action === 'find_messages' && !veRestrito) {
      result = filtrarMensagensDoChat(result, params.number)
    }

    return resposta(result)
  } catch (err) {
    console.error('[uazapi-actions]', err)
    return resposta({ error: 'Erro interno.' }, 500)
  }
})
