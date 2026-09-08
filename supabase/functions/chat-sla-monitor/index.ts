import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SLA Monitor — runs as a cron job every 5 minutes
// Checks conversations for SLA violations and updates flags

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  let updated1stResponse = 0
  let updatedResolution = 0

  try {
    // ── 1. Check first response SLA ────────────────────────────────────────
    // Find open conversations without first response that have a department with SLA configured
    const { data: convs1st } = await supabase
      .from('chat_conversations')
      .select('id, criado_em, department_id, chat_departments(sla_primeira_resposta_minutos)')
      .in('status', ['aberta', 'em_atendimento', 'aguardando'])
      .eq('sla_primeira_resposta_violado', false)
      .is('primeira_resposta_em', null)

    if (convs1st) {
      const idsToFlag: string[] = []

      for (const conv of convs1st) {
        const dept = conv.chat_departments as { sla_primeira_resposta_minutos: number } | null
        const slaMinutes = dept?.sla_primeira_resposta_minutos
        if (!slaMinutes || slaMinutes <= 0) continue

        const createdAt = new Date(conv.criado_em)
        const elapsedMinutes = (now.getTime() - createdAt.getTime()) / 60000

        if (elapsedMinutes > slaMinutes) {
          idsToFlag.push(conv.id)
        }
      }

      if (idsToFlag.length > 0) {
        const { count } = await supabase
          .from('chat_conversations')
          .update({ sla_primeira_resposta_violado: true })
          .in('id', idsToFlag)
        updated1stResponse = count ?? idsToFlag.length
      }
    }

    // ── 2. Check resolution SLA ────────────────────────────────────────────
    // Find non-closed conversations that have exceeded resolution SLA
    const { data: convsRes } = await supabase
      .from('chat_conversations')
      .select('id, criado_em, department_id, chat_departments(sla_resolucao_horas)')
      .in('status', ['aberta', 'em_atendimento', 'aguardando'])
      .eq('sla_resolucao_violado', false)

    if (convsRes) {
      const idsToFlag: string[] = []

      for (const conv of convsRes) {
        const dept = conv.chat_departments as { sla_resolucao_horas: number } | null
        const slaHours = dept?.sla_resolucao_horas
        if (!slaHours || slaHours <= 0) continue

        const createdAt = new Date(conv.criado_em)
        const elapsedHours = (now.getTime() - createdAt.getTime()) / 3600000

        if (elapsedHours > slaHours) {
          idsToFlag.push(conv.id)
        }
      }

      if (idsToFlag.length > 0) {
        const { count } = await supabase
          .from('chat_conversations')
          .update({ sla_resolucao_violado: true })
          .in('id', idsToFlag)
        updatedResolution = count ?? idsToFlag.length
      }
    }

    console.log(`SLA Monitor: ${updated1stResponse} first-response violations, ${updatedResolution} resolution violations flagged`)

    return new Response(
      JSON.stringify({
        ok: true,
        first_response_violations: updated1stResponse,
        resolution_violations: updatedResolution,
        checked_at: now.toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('SLA Monitor error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
