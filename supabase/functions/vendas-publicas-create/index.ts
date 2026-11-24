// Edge function pública: recebe formulário de venda preenchido por closers sem login.
// Insere em vendas_pendentes, sobe comprovantes pro bucket vendas-comprovantes,
// e notifica todos os usuários com perfil 'atendimento'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { autoVincularVendaEmpire } from '../_shared/empire-auto-vinculo.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Recusa registrada no log. Sem isso um 400 não deixa rastro nenhum e a investigação
// depende de conseguir reproduzir o que o closer fez.
function fail(code: string, detail?: string, status = 400) {
  console.warn(`recusado ${status} ${code}${detail ? ` — ${detail}` : ''}`)
  return json({ error: code, detail }, status)
}

// Rate limit simples em memória: 8 envios/IP/minuto
const rl = new Map<string, { count: number; resetAt: number }>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const slot = rl.get(ip)
  if (!slot || slot.resetAt < now) {
    rl.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  slot.count += 1
  return slot.count > 8
}

interface Pagamento {
  data: string
  valor: number
  forma: string
  plataforma: string
  sinal: string
}

interface Payload {
  closer_nome: string
  closer_email: string
  cliente_nome: string
  cliente_razao_social?: string | null
  cliente_cpf_cnpj?: string | null
  cliente_email?: string | null
  cliente_whatsapp: string
  cliente_instagram?: string | null
  cliente_endereco?: string | null
  cliente_cep?: string | null
  cliente_logradouro?: string | null
  cliente_numero?: string | null
  cliente_complemento?: string | null
  cliente_bairro?: string | null
  cliente_municipio?: string | null
  cliente_uf?: string | null
  produto_id?: string | null
  produto_nome?: string | null
  valor_total_venda?: number | null
  pagamentos: Pagamento[]
  observacoes?: string
  // Nome do titular como aparece no extrato bancário (lido do comprovante por OCR
  // no navegador do closer, e corrigível à mão lá e no onboarding).
  identificador_pagamento?: string | null
  // Pagamento feito por terceiro (contrato no nome de um, pago por outro)
  pagador_diferente?: boolean
  pagador_nome?: string | null
  pagador_cpf_cnpj?: string | null
  pagador_relacao?: string | null
  pagador_observacao?: string | null
}

const MAX_FILES = 60
// 20MB por arquivo — mesmo teto do bucket vendas-comprovantes. Se mudar um, mudar o outro.
const MAX_FILE_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = /^(image\/(jpe?g|png|webp|heic|heif|gif)|application\/pdf)$/i
const ALLOWED_EXT = /\.(jpe?g|png|webp|heic|heif|gif|pdf)$/i

// Foto de iPhone (HEIC) e alguns prints chegam com type vazio ou octet-stream.
// Recusar por isso rejeitava comprovante legítimo — então cai pra extensão do nome.
function mimeDoArquivo(file: File): string | null {
  if (file.type && ALLOWED_MIME.test(file.type)) return file.type
  if (!file.type || file.type === 'application/octet-stream') {
    const ext = file.name.match(ALLOWED_EXT)?.[1]?.toLowerCase()
    if (!ext) return null
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'pdf') return 'application/pdf'
    return `image/${ext}`
  }
  return null
}

/**
 * Texto opcional vindo de um endpoint público: aceita só string, apara e corta
 * no limite. Sem a checagem de tipo, um payload com `campo: 123` viraria
 * TypeError e o closer receberia um 500 genérico no lugar do motivo real.
 */
function textoCurto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null
  return valor.trim().slice(0, max) || null
}

function validate(p: Payload): string | null {
  if (!p.closer_nome?.trim()) return 'closer_nome obrigatório'
  if (!p.closer_email?.includes('@')) return 'closer_email inválido'
  if (!p.cliente_nome?.trim()) return 'cliente_nome obrigatório'
  if (!p.cliente_whatsapp?.trim()) return 'cliente_whatsapp obrigatório'
  if (!Array.isArray(p.pagamentos) || p.pagamentos.length === 0) return 'pagamentos obrigatórios'
  for (const [i, pg] of p.pagamentos.entries()) {
    if (!pg.data) return `pagamentos[${i}].data obrigatória`
    if (!(pg.valor > 0)) return `pagamentos[${i}].valor inválido`
    if (!pg.forma?.trim()) return `pagamentos[${i}].forma obrigatória`
    if (!pg.plataforma?.trim()) return `pagamentos[${i}].plataforma obrigatória`
    if (pg.forma.length > 60 || pg.plataforma.length > 60) return `pagamentos[${i}].forma/plataforma muito longa`
    if (!pg.sinal?.trim()) return `pagamentos[${i}].sinal obrigatório`
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca(corsHeaders)
  if (licencaNegada) return licencaNegada

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // GET: lista de produtos ativos do catálogo (para popular o dropdown do form público)
  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('products')
      .select('id, nome')
      .is('client_id', null)
      .eq('ativo', true)
      .order('nome')
    if (error) return json({ error: 'fetch_failed', detail: error.message }, 500)
    return json({ produtos: data ?? [] })
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? 'unknown'
  if (rateLimited(ip)) return json({ error: 'rate_limited' }, 429)

  try {

    const ct = req.headers.get('content-type') ?? ''
    if (!ct.startsWith('multipart/form-data')) {
      return fail('expected_multipart', ct)
    }

    const fd = await req.formData()
    const payloadStr = fd.get('payload')
    if (typeof payloadStr !== 'string') return fail('payload_missing')

    let payload: Payload
    try { payload = JSON.parse(payloadStr) }
    catch { return fail('payload_invalid_json') }

    const err = validate(payload)
    if (err) return fail('validation', err)

    // Coleta arquivos comprovante_{pIdx}_{fIdx} — cada arquivo pertence a um pagamento (parcela)
    const arquivos: Array<{ pIdx: number; file: File; mime: string }> = []
    for (const [key, value] of fd.entries()) {
      const m = key.match(/^comprovante_(\d+)_(\d+)$/)
      if (m && value instanceof File) {
        if (arquivos.length >= MAX_FILES) return fail('too_many_files', String(MAX_FILES))
        if (value.size > MAX_FILE_BYTES) return fail('file_too_large', value.name)
        const mime = mimeDoArquivo(value)
        if (!mime) return fail('invalid_mime', value.type || value.name)
        arquivos.push({ pIdx: Number(m[1]), file: value, mime })
      }
    }

    // Insere registro
    const { data: venda, error: insErr } = await admin
      .from('vendas_pendentes')
      .insert({
        closer_nome: payload.closer_nome.trim(),
        closer_email: payload.closer_email.trim().toLowerCase(),
        cliente_nome: payload.cliente_nome.trim(),
        cliente_razao_social: payload.cliente_razao_social?.trim() || null,
        cliente_cpf_cnpj: payload.cliente_cpf_cnpj?.trim() || null,
        cliente_email: payload.cliente_email?.trim() || null,
        cliente_whatsapp: payload.cliente_whatsapp.trim(),
        cliente_instagram: payload.cliente_instagram?.trim() || null,
        cliente_endereco: payload.cliente_endereco?.trim() || null,
        cliente_cep: payload.cliente_cep?.trim() || null,
        cliente_logradouro: payload.cliente_logradouro?.trim() || null,
        cliente_numero: payload.cliente_numero?.trim() || null,
        cliente_complemento: payload.cliente_complemento?.trim() || null,
        cliente_bairro: payload.cliente_bairro?.trim() || null,
        cliente_municipio: payload.cliente_municipio?.trim() || null,
        cliente_uf: payload.cliente_uf?.trim().toUpperCase() || null,
        produto_id: payload.produto_id || null,
        produto_nome: payload.produto_nome?.trim() || null,
        valor_total_venda: payload.valor_total_venda ?? null,
        pagamentos: payload.pagamentos,
        observacoes: payload.observacoes?.trim() || null,
        identificador_pagamento: textoCurto(payload.identificador_pagamento, 120),
        pagador_diferente: payload.pagador_diferente === true,
        pagador_nome: payload.pagador_diferente ? (payload.pagador_nome?.trim() || null) : null,
        pagador_cpf_cnpj: payload.pagador_diferente ? (payload.pagador_cpf_cnpj?.trim() || null) : null,
        pagador_relacao: payload.pagador_diferente ? (payload.pagador_relacao?.trim() || null) : null,
        pagador_observacao: payload.pagador_diferente ? (payload.pagador_observacao?.trim() || null) : null,
        ip_origem: ip,
        user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
      })
      // tenant_id volta junto (carimbado pelo trigger) porque é ele que resolve
      // qual credencial da ponte Empire usar mais abaixo.
      .select('id, tenant_id')
      .single()

    if (insErr || !venda) {
      return fail('db_insert_failed', insErr?.message, 500)
    }

    // Upload comprovantes — cada um recebe o sinal (label) do pagamento a que pertence
    const comprovantes: Array<{ storage_path: string; nome_original: string; mime_type: string; tamanho_bytes: number; sinal: string | null }> = []
    for (const [i, { pIdx, file, mime }] of arquivos.entries()) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `vendas/${venda.id}/${i}-${crypto.randomUUID()}.${ext}`
      const buf = new Uint8Array(await file.arrayBuffer())
      const { error: upErr } = await admin.storage
        .from('vendas-comprovantes')
        // mime resolvido (nunca vazio) — o bucket recusa upload sem content-type conhecido
        .upload(path, buf, { contentType: mime, upsert: false })
      if (upErr) {
        return fail('upload_failed', upErr.message, 500)
      }
      comprovantes.push({
        storage_path: path,
        nome_original: file.name,
        mime_type: mime,
        tamanho_bytes: file.size,
        sinal: payload.pagamentos[pIdx]?.sinal?.trim() || null,
      })
    }

    if (comprovantes.length > 0) {
      await admin
        .from('vendas_pendentes')
        .update({ comprovantes })
        .eq('id', venda.id)
    }

    // Auto-vínculo: se o lead no CRM for inequívoco (exatamente 1 oportunidade candidata),
    // sincroniza a venda direto com a vendas_fechamento do GHL, sem validação manual.
    // Casos ambíguos (0 ou >1 oportunidade) ficam na fila de pendência para resolução manual.
    // Falha aqui nunca quebra a criação da venda (o helper captura e registra no log).
    await autoVincularVendaEmpire(admin, {
      vendaId: venda.id,
      tenantId: venda.tenant_id ?? null,
      dados: payload,
      comprovantes,
    })

    // Notifica todos os usuários com perfil 'atendimento' (+ admin/gerente, pra não perder ninguém)
    const { data: alvos } = await admin
      .from('users')
      .select('id')
      .in('perfil', ['atendimento', 'admin', 'gerente'])

    if (alvos && alvos.length > 0) {
      const titulo = `Nova venda pendente: ${payload.cliente_nome}`
      const mensagem = `Closer ${payload.closer_nome} enviou uma venda — abra para validar e iniciar atendimento.`
      const notifs = alvos.map((u) => ({
        user_id: u.id,
        tipo: 'venda_pendente',
        titulo,
        mensagem,
        link: '/contratos/onboarding',
        metadata: { venda_id: venda.id, closer_nome: payload.closer_nome, cliente_nome: payload.cliente_nome },
      }))
      await admin.from('notifications').insert(notifs)
    }

    return json({ ok: true, id: venda.id })
  } catch (e) {
    return json({ error: 'internal_error', detail: (e as Error).message }, 500)
  }
})
