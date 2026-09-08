import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UAZAPI_URL = 'https://empirebusiness.uazapi.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Download image from URL and upload to Supabase Storage, returning the public URL
async function persistPicToStorage(
  supabase: ReturnType<typeof createClient>,
  picUrl: string,
  contactId: string
): Promise<string | null> {
  try {
    const res = await fetch(picUrl)
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const path = `profile-pics/${contactId}.${ext}`

    const bytes = await res.arrayBuffer()
    const { error } = await supabase.storage
      .from('chat-media')
      .upload(path, bytes, { contentType, upsert: true })

    if (error) {
      console.error('[fetch-profile-pic] storage upload error:', error.message)
      return null
    }

    const { data } = supabase.storage.from('chat-media').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error('[fetch-profile-pic] persistPicToStorage error:', err)
    return null
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth: requires valid JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const { contact_id, contact_ids } = await req.json().catch(() => ({}))

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Support single contact or batch
  const ids: string[] = contact_ids ?? (contact_id ? [contact_id] : [])
  if (ids.length === 0) {
    return new Response(JSON.stringify({ error: 'contact_id or contact_ids required' }), { status: 400, headers: corsHeaders })
  }

  // Limit batch size
  const batch = ids.slice(0, 50)

  // Fetch contacts with their instance info
  const { data: contacts, error } = await supabase
    .from('chat_contacts')
    .select('id, numero_whatsapp, instance_id, foto_url, nome, whatsapp_instances(instance_id)')
    .in('id', batch)

  if (error || !contacts) {
    return new Response(JSON.stringify({ error: 'Failed to fetch contacts' }), { status: 500, headers: corsHeaders })
  }

  const results: { id: string; foto_url: string | null; nome: string | null; updated: boolean }[] = []

  for (const contact of contacts) {
    const inst = contact.whatsapp_instances as { instance_id: string } | null
    if (!inst) {
      results.push({ id: contact.id, foto_url: contact.foto_url, nome: contact.nome, updated: false })
      continue
    }

    const instanceToken = Deno.env.get(`UAZAPI_TOKEN_${inst.instance_id}`)
    if (!instanceToken) {
      results.push({ id: contact.id, foto_url: contact.foto_url, nome: contact.nome, updated: false })
      continue
    }

    try {
      // Detect if this is a group (numero_whatsapp is the group ID)
      const isGroup = contact.numero_whatsapp.length > 15 // Group IDs are longer

      // Also check if there's a group conversation for this contact
      const { data: groupConv } = await supabase
        .from('chat_conversations')
        .select('is_group')
        .eq('contact_id', contact.id)
        .eq('is_group', true)
        .limit(1)
        .maybeSingle()

      const isGroupContact = isGroup || !!groupConv

      let rawPicUrl: string | null = null
      let groupName: string | null = null

      if (isGroupContact) {
        // Use /group/info for groups
        const groupjid = `${contact.numero_whatsapp}@g.us`
        const res = await fetch(`${UAZAPI_URL}/group/info`, {
          method: 'POST',
          headers: { 'token': instanceToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupjid }),
        })
        if (res.ok) {
          const data = await res.json()
          rawPicUrl = data.profilePicUrl ?? data.pictureUrl ?? data.picture ?? data.image ?? null
          groupName = data.Name ?? data.subject ?? data.name ?? null
          const rawParticipants = data.Participants ?? data.participants ?? data.members ?? null
          if (Array.isArray(rawParticipants) && rawParticipants.length > 0) {
            await supabase.from('chat_contacts').update({ group_size: rawParticipants.length }).eq('id', contact.id)

            const memberRows = (rawParticipants as Record<string, unknown>[])
              .map((p) => {
                const jid = (p.JID as string) ?? (p.jid as string) ?? ''
                const numero = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
                return {
                  contact_id: contact.id,
                  numero_whatsapp: numero,
                  nome: (p.Name as string) ?? (p.name as string) ?? (p.pushName as string) ?? null,
                  is_admin: (p.IsAdmin as boolean) ?? false,
                  is_super_admin: (p.IsSuperAdmin as boolean) ?? false,
                }
              })
              .filter((r) => r.numero_whatsapp.length > 5)

            if (memberRows.length > 0) {
              const memberNumbers = memberRows.map((r) => r.numero_whatsapp)
              const { data: existingContacts } = await supabase
                .from('chat_contacts')
                .select('numero_whatsapp, nome')
                .in('numero_whatsapp', memberNumbers)
                .not('nome', 'is', null)

              const nameMap = new Map(
                (existingContacts ?? []).map((c) => [c.numero_whatsapp, c.nome as string])
              )

              let enrichedRows = memberRows.map((r) => ({
                ...r,
                nome: r.nome ?? nameMap.get(r.numero_whatsapp) ?? null,
              }))

              const stillNoName = enrichedRows.filter((r) => !r.nome).slice(0, 15)
              if (stillNoName.length > 0) {
                const detailResults = await Promise.allSettled(
                  stillNoName.map(async (r) => {
                    const res = await fetch(`${UAZAPI_URL}/chat/details`, {
                      method: 'POST',
                      headers: { 'token': instanceToken, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ number: r.numero_whatsapp }),
                    })
                    if (!res.ok) return { numero: r.numero_whatsapp, nome: null }
                    const d = await res.json()
                    const nome = (d.wa_name as string) ?? (d.name as string) ?? (d.pushname as string) ?? (d.notify as string) ?? null
                    return { numero: r.numero_whatsapp, nome }
                  })
                )
                const detailMap = new Map<string, string>()
                for (const result of detailResults) {
                  if (result.status === 'fulfilled' && result.value.nome) {
                    detailMap.set(result.value.numero, result.value.nome)
                  }
                }
                if (detailMap.size > 0) {
                  enrichedRows = enrichedRows.map((r) => ({
                    ...r,
                    nome: r.nome ?? detailMap.get(r.numero_whatsapp) ?? null,
                  }))
                }
              }

              await supabase
                .from('chat_group_members')
                .upsert(enrichedRows, { onConflict: 'contact_id,numero_whatsapp' })
            }
          } else if (rawParticipants != null) {
            const count = Number(rawParticipants)
            if (!isNaN(count) && count > 0) {
              await supabase.from('chat_contacts').update({ group_size: count }).eq('id', contact.id)
            }
          }
        } else {
          console.log(`[fetch-profile-pic] group/info failed for ${groupjid}: ${res.status}`)
        }
      } else {
        // Use /chat/details for direct contacts
        const res = await fetch(`${UAZAPI_URL}/chat/details`, {
          method: 'POST',
          headers: { 'token': instanceToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: contact.numero_whatsapp }),
        })
        if (res.ok) {
          const data = await res.json()
          rawPicUrl = data.image ?? data.profilePicUrl ?? data.wa_profilePicUrl ?? data.pictureUrl ?? data.picture ?? null
        }
      }

      // Persist image to Supabase Storage to avoid expiring WhatsApp CDN URLs
      let picUrl: string | null = null
      if (rawPicUrl) {
        const storedUrl = await persistPicToStorage(supabase, rawPicUrl, contact.id)
        // If storage fails (WhatsApp CDN blocks server-side download), set null to clear
        // the broken URL from DB and stop the 403 retry loop on the frontend
        picUrl = storedUrl ?? null
      }

      // Always update foto_url when rawPicUrl was fetched: either new Storage URL or null to clear broken CDN URL
      const updatePayload: Record<string, string | null> = {}
      if (rawPicUrl !== undefined) updatePayload.foto_url = picUrl
      if (groupName && !contact.nome) updatePayload.nome = groupName

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('chat_contacts')
          .update(updatePayload)
          .eq('id', contact.id)

        results.push({
          id: contact.id,
          foto_url: picUrl,
          nome: groupName ?? contact.nome,
          updated: true,
        })
      } else {
        results.push({ id: contact.id, foto_url: contact.foto_url, nome: contact.nome, updated: false })
      }
    } catch (err) {
      console.error(`Failed to fetch pic for ${contact.id}:`, err)
      results.push({ id: contact.id, foto_url: contact.foto_url, nome: contact.nome, updated: false })
    }
  }

  return new Response(JSON.stringify({ results, total: results.length, updated: results.filter(r => r.updated).length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
