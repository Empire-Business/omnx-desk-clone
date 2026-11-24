// Converte um .docx (já preenchido no front) em PDF via CloudConvert.
// Fluxo: import/base64 -> convert (docx->pdf) -> export/url. Depois busca o PDF
// e devolve em base64. A API key fica no secret CLOUDCONVERT_API_KEY.
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca(cors)
  if (licencaNegada) return licencaNegada
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const KEY = Deno.env.get('CLOUDCONVERT_API_KEY')
  if (!KEY) return json({ error: 'CLOUDCONVERT_API_KEY não configurada no Supabase.' }, 500)

  let body: { docx_base64?: string; filename?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido (esperado JSON com docx_base64).' }, 400)
  }
  const { docx_base64, filename } = body
  if (!docx_base64) return json({ error: 'docx_base64 é obrigatório.' }, 400)

  const auth = { Authorization: `Bearer ${KEY}` }

  // 1) cria o job
  const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        'import-1': { operation: 'import/base64', file: docx_base64, filename: filename ?? 'contrato.docx' },
        'convert-1': { operation: 'convert', input: 'import-1', input_format: 'docx', output_format: 'pdf' },
        'export-1': { operation: 'export/url', input: 'convert-1' },
      },
    }),
  })
  const job = await jobRes.json()
  if (!jobRes.ok) return json({ error: 'Falha ao criar job no CloudConvert', detail: job }, 502)
  const jobId = job?.data?.id
  if (!jobId) return json({ error: 'Resposta inesperada do CloudConvert', detail: job }, 502)

  // 2) aguarda finalizar (poll)
  let exportUrl: string | null = null
  for (let i = 0; i < 40; i++) {
    await sleep(1500)
    const st = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, { headers: auth })
    const sj = await st.json()
    const status = sj?.data?.status
    if (status === 'finished') {
      const exp = (sj.data.tasks ?? []).find((t: { name: string }) => t.name === 'export-1')
      exportUrl = exp?.result?.files?.[0]?.url ?? null
      break
    }
    if (status === 'error') return json({ error: 'Conversão falhou', detail: sj?.data }, 502)
  }
  if (!exportUrl) return json({ error: 'Tempo esgotado na conversão.' }, 504)

  // 3) baixa o PDF e devolve em base64
  const pdfRes = await fetch(exportUrl)
  if (!pdfRes.ok) return json({ error: 'Falha ao baixar o PDF gerado.' }, 502)
  const bytes = new Uint8Array(await pdfRes.arrayBuffer())
  return json({ pdf_base64: encodeBase64(bytes) })
})
