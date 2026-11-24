// Rede da transcrição/descrição de mídia do WhatsApp (F4) — compartilhada por:
//   * wa-midia-processar (fila em lote a cada 5 min): chamarIaMidia;
//   * wa-agente-responder (áudio mandado para a Íris, transcrito NA HORA):
//     transcreverDoStorage.
//
// As regras puras (pedido ao OpenRouter, leitura da resposta, custo, erro HTTP,
// caminho no Storage, formato e duração do áudio) continuam em wa-midia.ts —
// aqui fica só o que fala com a rede/Storage, para não duplicar a transcrição.
//
// Sem Deno.env e sem import remoto (só tipos): roda na edge function e no Vitest
// (wa-midia-transcrever.test.ts, com fetch e Storage falsos).
//
// Segurança:
//   * só baixa do bucket chat-media DESTE projeto, na pasta da própria conversa
//     (caminhoDaMidia); confere tamanho ANTES de baixar (metadados do Storage) e
//     de novo depois; duração pelo cabeçalho antes de gastar com a IA;
//   * OpenRouter com provider.data_collection 'deny' (pedidoTranscricao);
//   * a saída já vem limpa (interpretarTranscricao) e continua sendo DADO não
//     confiável para quem usa;
//   * logs só com status/código — nunca conteúdo, nome, telefone ou URL.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type ErroMidia, type Interpretacao, caminhoDaMidia, custoDaResposta, duracaoAudioS, erroHttp, formatoAudio,
  interpretarTranscricao, pedidoTranscricao,
} from './wa-midia.ts'

export const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
const BUCKET = 'chat-media'

export interface ChamadaIaMidia {
  /** OPENROUTER_API_KEY (já sem espaço/quebra de linha). */
  chave: string
  corpo: Record<string, unknown>
  /** Prazo final da chamada (quem chama já descontou o próprio orçamento). */
  timeoutMs: number
  interpretar: (corpo: unknown) => Interpretacao
  /** Prefixo dos logs (ex.: 'wa-midia-processar'). */
  origem: string
  /** X-Title do OpenRouter. */
  titulo: string
  /** Só para teste. */
  fetchFn?: typeof fetch
}

/** chat/completions do OpenRouter → interpretação + custo (usage.cost). Nunca lança. */
export async function chamarIaMidia(c: ChamadaIaMidia): Promise<{ r: Interpretacao; custo: number | null }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1_000, c.timeoutMs))
  try {
    const r = await (c.fetchFn ?? fetch)(URL_OPENROUTER, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${c.chave}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnxdesk.com.br',
        'X-Title': c.titulo,
      },
      body: JSON.stringify(c.corpo),
    })
    if (!r.ok) {
      await r.body?.cancel().catch(() => {})
      console.error(`${c.origem}: IA respondeu`, r.status)
      return { r: { ok: false, erro: erroHttp(r.status) }, custo: null }
    }
    const dados = await r.json().catch(() => null)
    return { r: c.interpretar(dados), custo: custoDaResposta(dados) }
  } catch (e) {
    const nome = (e as Error)?.name
    console.error(`${c.origem}: falha na IA`, nome)
    return { r: { ok: false, erro: nome === 'AbortError' ? 'ia_timeout' : 'ia_http_5xx' }, custo: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Base64 sem dependência remota (btoa em pedaços; Deno e Node 16+). */
export function paraBase64(bytes: Uint8Array): string {
  let s = ''
  const PASSO = 0x8000
  for (let i = 0; i < bytes.length; i += PASSO) s += String.fromCharCode(...bytes.subarray(i, i + PASSO))
  return btoa(s)
}

export interface TranscricaoAgora {
  chave: string
  modelo: string
  /** SUPABASE_URL deste projeto (a mídia tem de estar no Storage dele). */
  supabaseUrl: string
  mediaUrl: string | null | undefined
  conversationId: string | null | undefined
  maxBytes: number
  maxDuracaoS: number
  timeoutMs: number
  origem: string
  titulo: string
  fetchFn?: typeof fetch
}

export type ResultadoTranscricao =
  | { ok: true; texto: string; idioma: string | null; duracaoS: number | null; modelo: string; custo: number | null }
  | { ok: false; erro: ErroMidia; duracaoS?: number | null }

interface ObjetoStorage { name?: string; metadata?: { size?: unknown; mimetype?: unknown } | null }

/**
 * Transcreve AGORA um áudio que está no bucket chat-media. Não grava nada (quem
 * chama decide). Erros:
 *   * 'midia_ausente'  — sem URL ou o arquivo ainda não está no Storage (pode ser
 *                         que esteja subindo: quem chama pode tentar de novo);
 *   * 'fora_do_storage' — URL que não é do Storage deste projeto/pasta da conversa;
 *   * 'grande_demais' / 'formato_nao_suportado' / 'longo_demais' / 'sem_fala';
 *   * 'download_falhou' e os da IA (ia_timeout, ia_http_5xx, ia_limite…).
 */
export async function transcreverDoStorage(admin: SupabaseClient, o: TranscricaoAgora): Promise<ResultadoTranscricao> {
  if (!o.mediaUrl) return { ok: false, erro: 'midia_ausente' }
  const caminho = caminhoDaMidia(o.mediaUrl, o.supabaseUrl, o.conversationId)
  if (!caminho) return { ok: false, erro: 'fora_do_storage' }
  const [pasta, arquivo] = caminho.split('/')

  // Metadados antes de baixar: existe? tamanho? tipo?
  const { data: lista, error: eLista } = await admin.storage.from(BUCKET).list(pasta, { limit: 10, search: arquivo })
  if (eLista) return { ok: false, erro: 'download_falhou' }
  const obj = ((lista ?? []) as ObjetoStorage[]).find((x) => x?.name === arquivo)
  if (!obj) return { ok: false, erro: 'midia_ausente' }
  const tamanho = Number(obj.metadata?.size)
  if (Number.isFinite(tamanho) && tamanho > o.maxBytes) return { ok: false, erro: 'grande_demais' }
  const mime = typeof obj.metadata?.mimetype === 'string' ? obj.metadata.mimetype : null
  const formato = formatoAudio(mime, caminho)
  if (!formato) return { ok: false, erro: 'formato_nao_suportado' }

  const { data: blob, error } = await admin.storage.from(BUCKET).download(caminho)
  if (error || !blob) return { ok: false, erro: 'download_falhou' }
  if (blob.size > o.maxBytes) return { ok: false, erro: 'grande_demais' }
  const bytes = new Uint8Array(await blob.arrayBuffer())

  const dur = duracaoAudioS(bytes, formato)
  const duracaoS = dur === null ? null : Math.round(dur)
  if (duracaoS !== null && duracaoS > o.maxDuracaoS) return { ok: false, erro: 'longo_demais', duracaoS }

  const { r, custo } = await chamarIaMidia({
    chave: o.chave,
    corpo: pedidoTranscricao(o.modelo, paraBase64(bytes), formato),
    timeoutMs: o.timeoutMs,
    interpretar: interpretarTranscricao,
    origem: o.origem,
    titulo: o.titulo,
    fetchFn: o.fetchFn,
  })
  return r.ok
    ? { ok: true, texto: r.texto, idioma: r.idioma, duracaoS, modelo: o.modelo, custo }
    : { ok: false, erro: r.erro, duracaoS }
}
