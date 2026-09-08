import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UAZAPI_URL = 'https://empirebusiness.uazapi.com'

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
  token: string,
  path: string,
  body: Record<string, unknown>,
  method = 'POST',
): Promise<Record<string, unknown>> {
  const res = await fetch(`${UAZAPI_URL}${path}`, {
    method,
    headers: { token, 'Content-Type': 'application/json' },
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
  token: string,
  action: Action,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (action) {
    // ── High priority ─────────────────────────────────────────────────────

    case 'react':
      return uazapi(token, '/message/react', {
        number: params.number,
        text: params.emoji,
        id: params.message_id,
      })

    case 'edit_message':
      return uazapi(token, '/message/edit', {
        id: params.message_id,
        text: params.text,
      })

    case 'delete_message':
      return uazapi(token, '/message/delete', {
        id: params.message_id,
        onlyMe: params.only_me ?? false,
      })

    case 'mark_read':
      return uazapi(token, '/chat/read', {
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
        return uazapi(token, '/send/buttons', {
          number,
          text,
          footer: footerText || '',
          buttons: buildButtonRows(choices),
        })
      }

      if (menuType === 'list') {
        return uazapi(token, '/send/list', {
          number,
          text,
          footer: footerText || '',
          buttonText: (params.listButton as string) || 'Ver opções',
          sections: buildListSections(choices),
        })
      }

      if (menuType === 'poll') {
        return uazapi(token, '/send/poll', {
          number,
          name: text,
          values: choices,
          selectableCount: (params.selectableCount as number) || 1,
        })
      }

      return { error: `Unknown menu type: ${menuType}` }
    }

    case 'send_contact':
      return uazapi(token, '/send/contact', {
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
      return uazapi(token, '/send/location', {
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
      return uazapi(token, '/chat/labels', body)
    }

    case 'list_labels':
      // Use chat/find to get labels from chats (no dedicated list endpoint)
      return uazapi(token, '/chat/find', { limit: 1, fields: ['labels'] })

    case 'archive_chat':
      return uazapi(token, '/chat/archive', {
        number: params.number,
        archive: params.archive ?? true,
      })

    case 'pin_chat':
      return uazapi(token, '/chat/pin', {
        number: params.number,
        pin: params.pin ?? true,
      })

    case 'mute_chat':
      return uazapi(token, '/chat/mute', {
        number: params.number,
        hours: params.hours ?? 8,
      })

    case 'block_contact':
      return uazapi(token, '/chat/block', {
        number: params.number,
        block: params.block ?? true,
      })

    case 'check_numbers':
      return uazapi(token, '/chat/check', {
        numbers: params.numbers,
      })

    case 'chat_details':
      return uazapi(token, '/chat/details', {
        number: params.number,
      })

    // ── Additional ────────────────────────────────────────────────────────

    case 'find_messages':
      return uazapi(token, '/message/find', {
        number: params.number,
        limit: params.limit ?? 50,
        offset: params.offset,
        sort: params.sort,
        search: params.search,
      })

    case 'find_chats':
      return uazapi(token, '/chat/find', {
        limit: params.limit ?? 50,
        offset: params.offset,
        unread: params.unread,
        archived: params.archived,
      })

    case 'update_profile_image':
      return uazapi(token, '/profile/image', {
        image: params.image,
      })

    case 'get_status': {
      const res = await fetch(`${UAZAPI_URL}/instance/status`, {
        method: 'GET',
        headers: { token },
      })
      return res.json()
    }

    case 'get_webhook': {
      const res = await fetch(`${UAZAPI_URL}/webhook`, {
        method: 'GET',
        headers: { token },
      })
      return res.json()
    }

    case 'set_webhook':
      return uazapi(token, '/webhook', {
        enabled: params.enabled ?? true,
        url: params.url,
        events: params.events ?? ['messages', 'messages_update'],
      })

    default:
      return { error: `Unknown action: ${action}` }
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const jwt = authHeader.replace('Bearer ', '')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (jwt !== serviceKey) {
      const { data: { user } } = await supabase.auth.getUser(jwt)
      if (!user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { action, instance_id, ...params } = await req.json()

    if (!action || !instance_id) {
      return new Response(
        JSON.stringify({ error: 'action and instance_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get UAZAPI token for the instance
    const token = Deno.env.get(`UAZAPI_TOKEN_${instance_id}`)
    if (!token) {
      return new Response(
        JSON.stringify({ error: `Token not configured for instance: ${instance_id}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await handleAction(token, action as Action, params)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
