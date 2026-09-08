// Edge function: contratos-alerts
//
// Executada em cron (1x/dia). Cria notificações em `notifications` para:
//
//   1. Contratos que entraram em INADIMPLENTE (status_secundario mudou pra
//      INADIMPLENTE nas últimas 24h).
//   2. Contratos com última parcela vencendo nos próximos 30 dias
//      (oportunidade de renovação).
//
// Cada notificação é enviada para:
//   - Estrategista do contrato
//   - Todos os admin/gerente
//
// Idempotência: usa metadata.contrato_id + tipo + dia pra evitar duplicar.
//
// Cron sugerido: 0 9 * * * (toda manhã às 9h)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const corsJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

interface ContratoAlerta {
  id: string
  cliente_nome: string
  estrategista_id: string | null
  status_secundario: string | null
  vencimento: string | null
  num_parcelas: number
  ultimo_vencimento: string | null
  atualizado_em: string
}

async function notify(
  admin: ReturnType<typeof createClient>,
  userIds: string[],
  tipo: string,
  titulo: string,
  mensagem: string,
  link: string,
  contratoId: string,
  hoje: string,
) {
  for (const userId of userIds) {
    if (!userId) continue
    const { count } = await admin.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('tipo', tipo)
      .filter('metadata->>contrato_id', 'eq', contratoId)
      .gte('criado_em', `${hoje}T00:00:00Z`)
    if ((count ?? 0) > 0) continue
    await admin.from('notifications').insert({
      user_id: userId, tipo, titulo, mensagem, link,
      metadata: { contrato_id: contratoId, dia: hoje },
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const hoje = new Date().toISOString().slice(0, 10)
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Admins/gerentes
  const { data: admins } = await admin.from('users').select('id').in('perfil', ['admin', 'gerente'])
  const adminIds = (admins ?? []).map((u) => (u as { id: string }).id)

  let alertaInadimplencia = 0
  let alertaRenovacao = 0

  // 1) Contratos que entraram em INADIMPLENTE nas últimas 24h
  const { data: inad } = await admin.from('v_contratos_alertas')
    .select('*')
    .eq('status_secundario', 'INADIMPLENTE')
    .gte('atualizado_em', ontem)
  for (const c of (inad ?? []) as ContratoAlerta[]) {
    const targets = [...new Set([c.estrategista_id, ...adminIds].filter(Boolean) as string[])]
    await notify(admin, targets, 'contrato_inadimplente',
      `Inadimplente: ${c.cliente_nome}`,
      `O contrato passou a INADIMPLENTE. Verifique a régua de cobrança.`,
      `/comissoes/contratos/${c.id}`,
      c.id, hoje,
    )
    alertaInadimplencia += targets.length
  }

  // 2) Última parcela vencendo nos próximos 30 dias (renovação)
  const { data: ren } = await admin.from('v_contratos_alertas')
    .select('*')
    .gte('ultimo_vencimento', hoje)
    .lte('ultimo_vencimento', em30dias)
    .not('status_secundario', 'in', '("CANCELADO","CONCLUÍDO","INATIVO")')
  for (const c of (ren ?? []) as ContratoAlerta[]) {
    const targets = [...new Set([c.estrategista_id, ...adminIds].filter(Boolean) as string[])]
    await notify(admin, targets, 'contrato_renovacao',
      `Renovação próxima: ${c.cliente_nome}`,
      `Última parcela em ${c.ultimo_vencimento}. Combine renovação com o cliente.`,
      `/comissoes/contratos/${c.id}`,
      c.id, hoje,
    )
    alertaRenovacao += targets.length
  }

  return corsJson({
    ok: true,
    hoje,
    alerta_inadimplencia: alertaInadimplencia,
    alerta_renovacao: alertaRenovacao,
  })
})
