// Monitor de saúde da sincronização de vendas EmpireDesk → GHL.
// Roda por cron (1x/dia). Checa três sintomas e, se achar algo, manda e-mail ao Bruno
// via send-email (Resend). Silêncio = saúde. Trava anti-spam: só reavisa quando o
// conjunto de problemas muda (compara assinatura guardada em sync_monitor_estado).
//
// Checagens:
//  1. Erro na ponte        — vendas_pendentes.sincronizacao_erro preenchido.
//  2. Pendência esquecida  — venda 'concluida' sem ghl_oportunidade_id há > N dias.
//  3. Divergência de contagem — nº de oportunidades sincronizadas (Desk) ≠ nº de
//     vendas com origem 'empiredesk' no GHL (lido pela janela crm-sync-stats).
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BRIDGE_SECRET = Deno.env.get('EMPIREDESK_BRIDGE_SECRET') ?? ''
const GHL_FUNCTIONS_URL =
  Deno.env.get('GHL_FUNCTIONS_URL') ?? 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1'
// Sem destinatário configurado, o monitor registra o problema e não envia e-mail.
const DEST_EMAIL = Deno.env.get('NOTIFICA_CONTRATO_EMAIL')?.trim() ?? ''

// Dias que uma venda concluída pode ficar sem vínculo no CRM antes de virar alerta.
const PENDENCIA_DIAS = 3

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const problemas: string[] = []
  const detalhes: Record<string, unknown> = {}

  // ── 1. Erros de sincronização ────────────────────────────────────────────────
  const { data: erros } = await supabase
    .from('vendas_pendentes')
    .select('id, cliente_nome, sincronizacao_erro')
    .not('sincronizacao_erro', 'is', null)
  if (erros && erros.length > 0) {
    problemas.push(`${erros.length} venda(s) com erro de sincronização`)
    detalhes.erros = erros
  }

  // ── 2. Pendências esquecidas (concluída sem vínculo há > N dias) ─────────────
  const corte = new Date(Date.now() - PENDENCIA_DIAS * 86_400_000).toISOString()
  const { data: pendencias } = await supabase
    .from('vendas_pendentes')
    .select('id, cliente_nome, atendido_em')
    .eq('status', 'concluida')
    .is('ghl_oportunidade_id', null)
    .lt('atendido_em', corte)
  if (pendencias && pendencias.length > 0) {
    problemas.push(`${pendencias.length} venda(s) concluída(s) há mais de ${PENDENCIA_DIAS} dias sem vínculo no CRM`)
    detalhes.pendencias = pendencias
  }

  // ── 3. Divergência de contagem (Desk vs GHL) ─────────────────────────────────
  const { data: vinculadas } = await supabase
    .from('vendas_pendentes')
    .select('ghl_oportunidade_id')
    .not('ghl_oportunidade_id', 'is', null)
  const deskOpps = new Set((vinculadas ?? []).map((v) => v.ghl_oportunidade_id as string)).size

  let ghlCount: number | null = null
  let bridgeOk = false
  if (BRIDGE_SECRET) {
    try {
      const res = await fetch(`${GHL_FUNCTIONS_URL}/crm-sync-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empiredesk-secret': BRIDGE_SECRET },
        body: '{}',
      })
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { origem_empiredesk?: number }
        ghlCount = typeof data.origem_empiredesk === 'number' ? data.origem_empiredesk : null
        bridgeOk = ghlCount !== null
      } else {
        problemas.push(`Ponte respondeu HTTP ${res.status} ao consultar o GHL`)
        detalhes.bridge_http = res.status
      }
    } catch (e) {
      problemas.push('Ponte com o GHL inacessível (crm-sync-stats não respondeu)')
      detalhes.bridge_error = (e as Error).message
    }
  } else {
    problemas.push('EMPIREDESK_BRIDGE_SECRET ausente — impossível consultar o GHL')
  }

  detalhes.contagem = { desk_oportunidades_sincronizadas: deskOpps, ghl_origem_empiredesk: ghlCount }
  if (bridgeOk && ghlCount !== deskOpps) {
    problemas.push(`Divergência de contagem: Desk diz ${deskOpps} oportunidade(s) sincronizada(s), GHL tem ${ghlCount}`)
  }

  // ── Assinatura + trava anti-spam ─────────────────────────────────────────────
  const assinatura = problemas.length ? JSON.stringify([...problemas].sort()) : ''

  const { data: estado } = await supabase
    .from('sync_monitor_estado')
    .select('assinatura')
    .eq('id', 1)
    .maybeSingle()
  const assinaturaAnterior = (estado as { assinatura?: string } | null)?.assinatura ?? ''

  let emailEnviado = false

  if (DEST_EMAIL && problemas.length > 0 && assinatura !== assinaturaAnterior) {
    const html = montarHtml(problemas, detalhes)
    const envio = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        to: DEST_EMAIL,
        subject: `⚠️ Sincronização de vendas com problema (${problemas.length})`,
        html,
        type: 'monitor_sync',
        ref_type: 'vendas_sync',
      }),
    })
    emailEnviado = envio.ok
  }

  // Atualiza o estado (cria a linha 1 se não existir).
  await supabase
    .from('sync_monitor_estado')
    .upsert({ id: 1, assinatura, atualizado_em: new Date().toISOString() }, { onConflict: 'id' })

  return json({
    ok: true,
    problemas_encontrados: problemas.length,
    problemas,
    detalhes,
    email_enviado: emailEnviado,
    mudou_desde_ultima_checagem: assinatura !== assinaturaAnterior,
  })
})

function montarHtml(problemas: string[], detalhes: Record<string, unknown>): string {
  const itens = problemas.map((p) => `<li style="margin:6px 0;font-size:14px;color:#111827">${esc(p)}</li>`).join('')
  const c = detalhes.contagem as { desk_oportunidades_sincronizadas?: number; ghl_origem_empiredesk?: number } | undefined
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
    <div style="background:#7f1d1d;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">OMNX Desk · Monitor</p>
      <h1 style="margin:4px 0 0;font-size:20px">⚠️ Sincronização de vendas com problema</h1>
    </div>
    <div style="border:1px solid #eef0f3;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p style="margin:0 0 12px;font-size:14px;color:#374151">O monitor automático encontrou os seguintes pontos na integração EmpireDesk → GHL:</p>
      <ul style="margin:0 0 16px;padding-left:20px">${itens}</ul>
      ${
        c
          ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">Contagem atual — Desk: <strong>${c.desk_oportunidades_sincronizadas ?? '—'}</strong> · GHL: <strong>${c.ghl_origem_empiredesk ?? '—'}</strong></p>`
          : ''
      }
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Você só recebe este e-mail quando o quadro de problemas muda. Verifique em /comissoes/vendas-pendentes.</p>
    </div>
  </div>`
}
