import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { montarDadosDocx, type DadosContrato } from './contratoTemplate'

/**
 * Gera o contrato preenchendo o próprio arquivo .docx do modelo (fidelidade
 * total ao Word). Preenche os campos {cliente_nome}, {cpf_cnpj}, etc. e devolve
 * um .docx pronto pra baixar/anexar. Os valores negociados (campos em amarelo)
 * continuam pra completar no Word.
 */

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Bytes do modelo: usa o arquivo enviado pelo admin (base64) ou o modelo-base do public/. */
async function carregarTemplate(arquivoB64: string | null, arquivoNome: string | null): Promise<ArrayBuffer> {
  if (arquivoB64) {
    const bin = atob(arquivoB64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }
  if (arquivoNome) {
    const res = await fetch(`/modelos-contrato/${arquivoNome}`)
    if (!res.ok) throw new Error('Modelo-base não encontrado no servidor.')
    return await res.arrayBuffer()
  }
  throw new Error('Este modelo ainda não tem arquivo. Suba um .docx na tela de Modelos.')
}

export async function gerarContratoDocx(
  modelo: { arquivo_b64: string | null; arquivo_nome: string | null },
  dados: DadosContrato,
): Promise<Blob> {
  const buffer = await carregarTemplate(modelo.arquivo_b64, modelo.arquivo_nome)
  const zip = new PizZip(buffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '', // campo sem valor vira vazio (não quebra a geração)
  })
  doc.render(montarDadosDocx(dados))
  return doc.getZip().generate({ type: 'blob', mimeType: MIME_DOCX }) as Blob
}

/** Lê um File .docx (upload do admin) e devolve o conteúdo em base64 pra salvar no banco. */
export function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      // data:...;base64,XXXX → pega só o XXXX
      resolve(res.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
