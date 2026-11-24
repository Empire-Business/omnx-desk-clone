// Edge function: contrato-extract-pdf
//
// Lê o último anexo da categoria 'contrato' de um contrato_id e usa Claude
// (via OpenRouter, formato nativo de PDF como document base64) pra extrair
// os campos relevantes.
//
// Não sobrescreve direto os campos do contrato — grava em
// `contrato_pdf_extractions.dados_extraidos`. O front mostra pra revisão
// e a Roberta clica "Aplicar" pra copiar pros campos reais.
//
// Body: { contrato_id: string, anexo_id?: string }

import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const corsJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SYSTEM_PROMPT = `Você é um assistente jurídico que lê contratos de prestação de serviço da Exos Consultoria Digital (Acelerador de Audiência, Content Club, Cortes etc.) e extrai os dados em JSON.

Retorne APENAS um JSON válido (sem markdown, sem explicação) com este formato:

{
  "cliente_nome": "nome completo do contratante",
  "empresa": "razão social",
  "cpf_cnpj": "apenas dígitos",
  "endereco": "endereço completo com CEP",
  "email": "",
  "produto_nome": "ex: ACELERADOR GOLD",
  "valor_total": 0.0,
  "valor_parcela": 0.0,
  "num_parcelas": 0,
  "entrada": 0.0,
  "data_fechamento": "YYYY-MM-DD",
  "vencimento": "YYYY-MM-DD",
  "plano_dias": 0,
  "forma_pagamento": "boleto / cartão / PIX",
  "observacoes": "",
  "_confidence": {
    "cliente_nome": "alta|media|baixa",
    "cpf_cnpj": "alta|media|baixa",
    "valor_total": "alta|media|baixa",
    "num_parcelas": "alta|media|baixa",
    "vencimento": "alta|media|baixa"
  }
}

Regras:
- Use null em campos que não conseguir extrair com confiança razoável (não invente).
- valor_total = valor cheio do contrato (parcela × número de parcelas + entrada).
- vencimento = data da 1ª parcela mensal (não a entrada).
- data_fechamento = data de assinatura do contrato.
- _confidence: avalie sua confiança em cada campo crítico.`

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return corsJson({ error: 'method_not_allowed' }, 405)

  try {
    const auth = req.headers.get('authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
    if (!openrouterKey) return corsJson({ error: 'missing_openrouter_key' }, 500)

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: u } = await userClient.auth.getUser()
    if (!u.user) return corsJson({ error: 'unauthorized' }, 401)

    // Permissão: admin/gerente OU acesso_contratos
    const { data: profile } = await userClient.from('users')
      .select('perfil, acesso_contratos').eq('id', u.user.id).single()
    if (!profile || (!['admin', 'gerente'].includes(profile.perfil as string)
        && !(profile as { acesso_contratos?: boolean }).acesso_contratos)) {
      return corsJson({ error: 'forbidden' }, 403)
    }

    const body = await req.json() as { contrato_id?: string; anexo_id?: string }
    if (!body.contrato_id) return corsJson({ error: 'contrato_id_required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    // Acha o anexo: se passou anexo_id usa; senão pega o último da categoria 'contrato'
    let anexoQuery = admin.from('contrato_anexos').select('*').eq('contrato_id', body.contrato_id)
    if (body.anexo_id) anexoQuery = anexoQuery.eq('id', body.anexo_id)
    else anexoQuery = anexoQuery.eq('categoria', 'contrato').order('enviado_em', { ascending: false }).limit(1)
    const { data: anexos } = await anexoQuery
    const anexo = anexos?.[0] as { id: string; storage_path: string; mime_type: string | null; nome_original: string } | undefined
    if (!anexo) return corsJson({ error: 'anexo_nao_encontrado' }, 404)
    if (anexo.mime_type && !anexo.mime_type.includes('pdf')) {
      return corsJson({ error: 'apenas_pdf', mime_type: anexo.mime_type }, 400)
    }

    // Baixa o PDF como base64
    const { data: blob, error: dlErr } = await admin.storage.from('contratos-anexos').download(anexo.storage_path)
    if (dlErr || !blob) return corsJson({ error: 'download_falhou', detail: dlErr?.message }, 500)
    const arrayBuf = await blob.arrayBuffer()
    // base64 in Deno
    const bytes = new Uint8Array(arrayBuf)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const base64 = btoa(bin)

    const model = 'anthropic/claude-sonnet-4-6'
    const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: { filename: anexo.nome_original, file_data: `data:application/pdf;base64,${base64}` },
              },
              { type: 'text', text: 'Extraia os campos do contrato anexado. Responda apenas JSON.' },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    })

    if (!openrouterRes.ok) {
      const text = await openrouterRes.text()
      return corsJson({ error: 'openrouter_error', status: openrouterRes.status, detail: text }, 502)
    }

    const completion = await openrouterRes.json()
    const responseText: string = completion.choices?.[0]?.message?.content ?? ''

    let dados: Record<string, unknown>
    try {
      const cleaned = responseText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
      dados = JSON.parse(cleaned)
    } catch {
      return corsJson({ error: 'parse_falhou', raw: responseText }, 500)
    }

    const { data: ext, error: insErr } = await admin.from('contrato_pdf_extractions').insert({
      contrato_id: body.contrato_id,
      anexo_id: anexo.id,
      modelo: model,
      dados_extraidos: dados,
      tokens_input: completion.usage?.prompt_tokens ?? null,
      tokens_output: completion.usage?.completion_tokens ?? null,
      criado_por: u.user.id,
    }).select().single()

    if (insErr) return corsJson({ error: 'insert_falhou', detail: insErr.message }, 500)

    return corsJson({
      ok: true,
      extraction_id: ext.id,
      modelo: model,
      dados_extraidos: dados,
      tokens: { input: completion.usage?.prompt_tokens, output: completion.usage?.completion_tokens },
    })
  } catch (err) {
    return corsJson({ error: 'internal', detail: String(err) }, 500)
  }
})
