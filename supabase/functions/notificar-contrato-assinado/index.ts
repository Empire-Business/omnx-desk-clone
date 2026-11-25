import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')

// Para quem vai a notificação de contrato assinado: só a lista da variável
// NOTIFICA_CONTRATO_EMAILS (separada por vírgula). Sem ela, não envia nada —
// cada instalação define os próprios destinatários.
const MASTER_CONTRACT_RECIPIENTS = (Deno.env.get('NOTIFICA_CONTRATO_EMAILS') ?? '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean)

// Buckets onde ficam os comprovantes (venda) e anexos (contrato).
const BUCKET_VENDAS = 'vendas-comprovantes'
const BUCKET_CONTRATOS = 'contratos-anexos'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-notify-secret',
}

interface Pagamento {
  data?: string
  valor?: number
  forma?: string
  plataforma?: string
  sinal?: string
}
interface Comprovante {
  storage_path: string
  nome_original?: string
  mime_type?: string
  sinal?: string
}

// ─── Helpers de formatação ───────────────────────────────────────────────────

function fmtBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Espera "YYYY-MM-DD"; evita problema de fuso montando manualmente.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return iso
}

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function soDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

function montarEndereco(v: Record<string, unknown>, fallback: string | null): string {
  const partes = [
    [v.cliente_logradouro, v.cliente_numero].filter(Boolean).join(', '),
    v.cliente_complemento,
    v.cliente_bairro,
    [v.cliente_municipio, v.cliente_uf].filter(Boolean).join('/'),
    v.cliente_cep,
  ].filter((p) => p && String(p).trim())
  if (partes.length) return partes.join(' · ')
  return fallback ?? '—'
}

// ─── Função principal ────────────────────────────────────────────────────────

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Apenas a chamada interna do banco (trigger), autenticada pelo segredo.
    const notifySecret = req.headers.get('x-notify-secret')
    if (!notifySecret) return json({ error: 'Unauthorized' }, 401)
    const { data: notifySecretOk } = await supabase.rpc('notify_secret_matches', { candidate: notifySecret })
    if (notifySecretOk !== true) return json({ error: 'Unauthorized' }, 401)

    const { contrato_id } = await req.json()
    if (!contrato_id) return json({ error: 'contrato_id é obrigatório' }, 400)

    // Idempotência: se este contrato já tem e-mail de assinatura na fila, não reenvia.
    const { data: jaEnviado } = await supabase
      .from('email_queue')
      .select('id')
      .eq('referencia_id', contrato_id)
      .eq('tipo', 'contrato_assinado')
      .limit(1)
      .maybeSingle()
    if (jaEnviado?.id) {
      return json({ success: true, skipped: true, motivo: 'já notificado', queued_id: jaEnviado.id })
    }

    // 1) Contrato
    const { data: contrato, error: cErr } = await supabase
      .from('contratos')
      .select('*')
      .eq('id', contrato_id)
      .single()
    if (cErr || !contrato) return json({ error: `Contrato não encontrado: ${cErr?.message}` }, 404)

    // Esses destinatários pertencem somente à operação principal. Outros
    // tenants não podem ter seus contratos encaminhados para essa lista.
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('is_master')
      .eq('id', contrato.tenant_id)
      .maybeSingle()
    if (tenantErr) return json({ error: `Empresa não encontrada: ${tenantErr.message}` }, 500)
    if (!tenant?.is_master) {
      return json({ success: true, skipped: true, motivo: 'tenant não configurado para esta notificação' })
    }
    if (MASTER_CONTRACT_RECIPIENTS.length === 0) {
      return json({ success: true, skipped: true, motivo: 'NOTIFICA_CONTRATO_EMAILS não configurada' })
    }

    // 2) Venda ligada pelo WhatsApp (dados ricos: pagamentos, endereço, comprovantes)
    let venda: Record<string, unknown> | null = null
    const whatsDigitos = soDigitos(contrato.whatsapp as string)
    if (whatsDigitos) {
      // Filtra no banco pelos últimos 8 dígitos (só números — sem risco de injeção),
      // depois confirma o match exato de dígitos no JS (formatos +55.. vs 55.. divergem).
      const ultimos = whatsDigitos.slice(-8)
      const { data: vendas } = await supabase
        .from('vendas_pendentes')
        .select('*')
        .ilike('cliente_whatsapp', `%${ultimos}%`)
        .order('criado_em', { ascending: false })
      venda =
        (vendas ?? []).find(
          (v: Record<string, unknown>) => soDigitos(v.cliente_whatsapp as string) === whatsDigitos,
        ) ?? null
    }

    // 3) Monta os campos (prioriza dados da venda quando existirem)
    const nome = (contrato.cliente_nome as string) ?? (venda?.cliente_nome as string) ?? '—'
    const whatsapp = (contrato.whatsapp as string) ?? (venda?.cliente_whatsapp as string) ?? null
    const email = (contrato.email as string) ?? (venda?.cliente_email as string) ?? null
    const cpfCnpj = (venda?.cliente_cpf_cnpj as string) ?? (contrato.cpf_cnpj as string) ?? null
    const razaoSocial = (venda?.cliente_razao_social as string) ?? null
    const instagram = (venda?.cliente_instagram as string) ?? (contrato.instagram as string) ?? null
    const endereco = venda
      ? montarEndereco(venda, (contrato.endereco as string) ?? null)
      : ((contrato.endereco as string) ?? '—')
    const produto = (contrato.produto_nome as string) ?? (venda?.produto_nome as string) ?? '—'
    const valorTotal =
      (venda?.valor_total_venda as number) ?? (contrato.valor_total as number) ?? null
    const closerNome = (venda?.closer_nome as string) ?? (contrato.vendedor as string) ?? null
    const closerEmail = (venda?.closer_email as string) ?? null
    const observacoes = (venda?.observacoes as string) ?? (contrato.observacoes as string) ?? null
    const linkClicksign = (contrato.link_clicksign as string) ?? null
    const pagamentos: Pagamento[] = Array.isArray(venda?.pagamentos)
      ? (venda!.pagamentos as Pagamento[])
      : []

    // 4) Baixa comprovantes (da venda; fallback p/ anexos do contrato) e converte p/ base64
    const attachments: { filename: string; content: string; content_type?: string }[] = []
    const comprovantesVenda: Comprovante[] = Array.isArray(venda?.comprovantes)
      ? (venda!.comprovantes as Comprovante[])
      : []

    for (const comp of comprovantesVenda) {
      const att = await baixarBase64(supabase, BUCKET_VENDAS, comp.storage_path, comp.nome_original, comp.mime_type)
      if (att) attachments.push(att)
    }

    // Se a venda não tinha comprovantes, tenta os anexos do contrato (categoria comprovante%)
    if (attachments.length === 0) {
      const { data: anexos } = await supabase
        .from('contrato_anexos')
        .select('storage_path, nome_original, mime_type, categoria')
        .eq('contrato_id', contrato_id)
        .like('categoria', 'comprovante%')
      for (const an of anexos ?? []) {
        const att = await baixarBase64(supabase, BUCKET_CONTRATOS, an.storage_path, an.nome_original, an.mime_type)
        if (att) attachments.push(att)
      }
    }

    // 5) Monta o HTML
    const html = montarHtml({
      nome, whatsapp, email, cpfCnpj, razaoSocial, instagram, endereco,
      produto, valorTotal, closerNome, closerEmail, observacoes, linkClicksign,
      pagamentos, comprovantesCount: attachments.length, contratoId: contrato_id,
    })

    // 6) Registra na fila e envia direto via Resend (com anexos)
    const assunto = `Contrato assinado: ${nome}`
    const destinatarios = [...new Set(MASTER_CONTRACT_RECIPIENTS.map((email) => email.toLowerCase()))]
    const { data: queued, error: queueErr } = await supabase
      .from('email_queue')
      .insert(destinatarios.map((destinatario_email) => ({
        destinatario_email,
        assunto,
        corpo_html: html,
        tipo: 'contrato_assinado',
        referencia_tipo: 'contrato',
        referencia_id: contrato_id,
        status: 'pendente',
      })))
      .select('id, destinatario_email')
    if (queueErr) return json({ error: 'Falha ao registrar os e-mails na fila', detail: queueErr.message }, 500)

    const queuedByRecipient = new Map((queued ?? []).map((item) => [item.destinatario_email, item.id]))
    const envios = await Promise.all(destinatarios.map(async (to) => {
      const envio = await enviarResend({ to, subject: assunto, html, attachments })
      const queuedId = queuedByRecipient.get(to)
      if (queuedId) {
        await supabase
          .from('email_queue')
          .update(
            envio.success
              ? { status: 'enviado', enviado_em: new Date().toISOString(), tentativas: 1 }
              : { status: 'erro', erro: envio.error, tentativas: 1 },
          )
          .eq('id', queuedId)
      }
      return envio
    }))

    const falhas = envios.filter((envio) => !envio.success)
    if (falhas.length > 0) {
      return json({ error: 'Falha no envio para um ou mais destinatários', falhas: falhas.length }, 502)
    }

    return json({ success: true, cliente: nome, anexos: attachments.length, destinatarios: destinatarios.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return json({ error: message }, 500)
  }
})

// ─── Envio via Resend ────────────────────────────────────────────────────────

async function enviarResend(params: {
  to: string
  subject: string
  html: string
  attachments: { filename: string; content: string; content_type?: string }[]
}): Promise<{ success: boolean; error?: string }> {
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY não configurada' }
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OMNX Desk <noreply@omnx.pro>',
        to: params.to,
        subject: params.subject,
        html: params.html,
        attachments: params.attachments.length
          ? params.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              content_type: a.content_type ?? undefined,
            }))
          : undefined,
      }),
    })
    if (!response.ok) {
      const errorBody = await response.text()
      return { success: false, error: `Resend ${response.status}: ${errorBody}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Resend fetch failed' }
  }
}

// ─── Download + base64 ───────────────────────────────────────────────────────

async function baixarBase64(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  nome?: string,
  mime?: string,
): Promise<{ filename: string; content: string; content_type?: string } | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error || !data) return null
    const buf = new Uint8Array(await data.arrayBuffer())
    // Converte para base64 em blocos (evita estourar a pilha em arquivos grandes)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk))
    }
    const content = btoa(binary)
    const filename = nome ?? path.split('/').pop() ?? 'comprovante'
    return { filename, content, content_type: mime }
  } catch {
    return null
  }
}

// ─── HTML do e-mail ──────────────────────────────────────────────────────────

function montarHtml(d: {
  nome: string; whatsapp: string | null; email: string | null; cpfCnpj: string | null
  razaoSocial: string | null; instagram: string | null; endereco: string
  produto: string; valorTotal: number | null; closerNome: string | null; closerEmail: string | null
  observacoes: string | null; linkClicksign: string | null; pagamentos: Pagamento[]
  comprovantesCount: number; contratoId: string
}): string {
  const linha = (label: string, valor: string | null) =>
    valor && valor !== '—'
      ? `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 12px;color:#111827;font-size:14px;font-weight:500">${valor}</td></tr>`
      : ''

  const closer = d.closerNome
    ? `${esc(d.closerNome)}${d.closerEmail ? ` (${esc(d.closerEmail)})` : ''}`
    : null

  const igDisplay = d.instagram
    ? d.instagram.startsWith('http')
      ? esc(d.instagram)
      : '@' + esc(d.instagram.replace(/^@/, ''))
    : null

  const totalPagos = d.pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const pagamentosRows = d.pagamentos
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 12px;border-top:1px solid #eef0f3;font-size:13px;color:#111827">${esc(p.sinal) || '—'}</td>
        <td style="padding:8px 12px;border-top:1px solid #eef0f3;font-size:13px;color:#111827;font-weight:600">${fmtBRL(p.valor)}</td>
        <td style="padding:8px 12px;border-top:1px solid #eef0f3;font-size:13px;color:#374151">${esc(p.forma) || '—'}${p.plataforma ? ` · ${esc(p.plataforma)}` : ''}</td>
        <td style="padding:8px 12px;border-top:1px solid #eef0f3;font-size:13px;color:#374151">${fmtData(p.data)}</td>
      </tr>`,
    )
    .join('')

  const pagamentosBloco = d.pagamentos.length
    ? `
    <h3 style="margin:24px 0 8px;font-size:14px;color:#111827">Pagamentos</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eef0f3;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Parcela</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Valor</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Forma</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Data</th>
        </tr>
      </thead>
      <tbody>${pagamentosRows}</tbody>
      <tfoot>
        <tr style="background:#f9fafb">
          <td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:600">Total</td>
          <td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:700" colspan="3">${fmtBRL(totalPagos)}</td>
        </tr>
      </tfoot>
    </table>`
    : ''

  const obsBloco = d.observacoes
    ? `<h3 style="margin:24px 0 8px;font-size:14px;color:#111827">Observações</h3>
       <div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #eef0f3;border-radius:8px;padding:12px;font-size:13px;color:#374151;line-height:1.5">${esc(d.observacoes)}</div>`
    : ''

  const comprovantesBloco = d.comprovantesCount
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280">📎 ${d.comprovantesCount} comprovante(s) anexado(s) a este e-mail.</p>`
    : ''

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
    <div style="background:#111827;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">OMNX Desk</p>
      <h1 style="margin:4px 0 0;font-size:20px">✅ Contrato assinado</h1>
    </div>
    <div style="border:1px solid #eef0f3;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="margin:0 0 4px;font-size:18px">${esc(d.nome)}</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280">${esc(d.produto)} · ${fmtBRL(d.valorTotal)}</p>

      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eef0f3;border-radius:8px;overflow:hidden">
        ${linha('WhatsApp', esc(d.whatsapp))}
        ${linha('E-mail', esc(d.email))}
        ${linha('CPF / CNPJ', esc(d.cpfCnpj))}
        ${linha('Razão social', esc(d.razaoSocial))}
        ${linha('Instagram', igDisplay)}
        ${linha('Endereço', esc(d.endereco))}
        ${linha('Produto', esc(d.produto))}
        ${linha('Valor total negociado', fmtBRL(d.valorTotal))}
        ${linha('Closer', closer)}
      </table>

      ${pagamentosBloco}
      ${obsBloco}
      ${comprovantesBloco}

      ${
        d.linkClicksign
          ? `<p style="margin:24px 0 0"><a href="${esc(d.linkClicksign)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Ver contrato no Clicksign</a></p>`
          : ''
      }
    </div>
  </div>`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
