import { supabase } from '@/lib/supabase'

/** Converte o .docx preenchido em PDF pela edge function (CloudConvert). */

async function blobParaBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ParaBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function converterDocxParaPdf(docx: Blob, filename: string): Promise<Blob> {
  const docx_base64 = await blobParaBase64(docx)
  const { data, error } = await supabase.functions.invoke('contrato-pdf', {
    body: { docx_base64, filename },
  })
  if (error) throw new Error(error.message)
  if (!data?.pdf_base64) throw new Error(data?.error || 'Falha na conversão para PDF.')
  return base64ParaBlob(data.pdf_base64, 'application/pdf')
}
