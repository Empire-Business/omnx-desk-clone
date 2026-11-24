// Transcrição de áudios e descrição de imagens do WhatsApp (F4).
//
// PARA QUÊ: áudio e imagem sem legenda viravam "(enviou um áudio)" /
// "(enviou uma imagem)" para a análise de satisfação e para a Íris. Um gatilho
// no banco (migration 20261027130000) põe cada mídia nova na fila
// chat_midia_texto; esta função transcreve/descreve e grava o texto lá.
//
// Quem chama: SÓ o agendador (pg_cron 'wa-midia-processar-5min', a cada 5 min,
// e só quando há pendente), autenticado pelo segredo do Vault
// `wa_auto_cron_secret` (header `x-cron-secret`, conferido pela RPC
// `wa_auto_cron_secret_confere`) — o mesmo esquema de wa-auto-satisfacao.
// Precisa de verify_jwt = false (config.toml).
//
// Fluxo: RPC chat_midia_reivindicar (lote ≤ 20, FOR UPDATE SKIP LOCKED, limite
// por empresa/dia) → para cada item: confere caminho/tamanho/formato → baixa do
// Storage (service_role) → OpenRouter → grava 'ok' / tenta de novo / desiste.
// A chamada ao OpenRouter é a mesma do wa-agente-responder (que transcreve na
// hora o áudio mandado para a Íris e grava 'ok' aqui): _shared/wa-midia-transcrever.ts.
// Falha desta fila nunca sobrescreve um 'ok' já gravado.
//
// Segurança:
//   * F2: client service_role; toda leitura/gravação por empresa leva
//     `.eq('tenant_id', T)`. Só baixa arquivo do bucket chat-media DESTE
//     projeto, na pasta da própria conversa (caminhoDaMidia).
//   * F4: áudio/imagem são DADO não confiável — os prompts mandam só
//     transcrever/descrever, a saída é texto puro, limpo e cortado
//     (_shared/wa-midia.ts). OpenRouter com provider.data_collection 'deny'.
//   * F5: logs só com contagens e códigos — nunca conteúdo, nome, telefone ou URL.
//   * Limites: arquivo (WA_MIDIA_MAX_MB, padrão 15 MB; imagem 8 MB), duração
//     (WA_MIDIA_MAX_DURACAO_S, padrão 900 s), por empresa/dia
//     (WA_MIDIA_LIMITE_DIA, padrão 300), lote, concorrência e tempo.
//
// Modelos (trocáveis por env, formato "fornecedor/modelo"):
//   OPENROUTER_MODELO_AUDIO  (padrão google/gemini-2.5-flash)
//   OPENROUTER_MODELO_IMAGEM (padrão google/gemini-2.5-flash-lite)
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'
import {
  type ErroMidia, type Interpretacao, LIMITE_DIA_PADRAO, MAX_DURACAO_S_PADRAO, MAX_MB_AUDIO_PADRAO, MAX_MB_IMAGEM,
  MODELO_AUDIO_PADRAO, MODELO_IMAGEM_PADRAO, caminhoDaMidia, duracaoAudioS, formatoAudio,
  inteiroDaEnv, interpretarDescricao, interpretarTranscricao, mimeImagem, modeloDaEnv, pedidoDescricao,
  pedidoTranscricao, proximoEstado,
} from '../_shared/wa-midia.ts'
import { chamarIaMidia } from '../_shared/wa-midia-transcrever.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MODELO_AUDIO = modeloDaEnv(Deno.env.get('OPENROUTER_MODELO_AUDIO'), MODELO_AUDIO_PADRAO)
const MODELO_IMAGEM = modeloDaEnv(Deno.env.get('OPENROUTER_MODELO_IMAGEM'), MODELO_IMAGEM_PADRAO)
const LIMITE_DIA = inteiroDaEnv(Deno.env.get('WA_MIDIA_LIMITE_DIA'), LIMITE_DIA_PADRAO, 0, 5_000)
const MAX_BYTES_AUDIO = inteiroDaEnv(Deno.env.get('WA_MIDIA_MAX_MB'), MAX_MB_AUDIO_PADRAO, 1, 20) * 1024 * 1024
const MAX_BYTES_IMAGEM = MAX_MB_IMAGEM * 1024 * 1024
const MAX_DURACAO_S = inteiroDaEnv(Deno.env.get('WA_MIDIA_MAX_DURACAO_S'), MAX_DURACAO_S_PADRAO, 10, 3_600)

// ---- Limites por execução ----
const TAMANHO_LOTE = 20
const CONCORRENCIA = 2                // arquivos em memória ao mesmo tempo (base64 ≈ 1,33×)
const ORCAMENTO_MS = 110_000          // não começa item novo depois disso
const TIMEOUT_AUDIO_MS = 60_000
const TIMEOUT_IMAGEM_MS = 30_000
const FOLGA_MS = 65_000               // tempo mínimo restante para começar um item

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function cronAutorizado(admin: SupabaseClient, req: Request): Promise<boolean> {
  const segredo = req.headers.get('x-cron-secret') ?? ''
  if (segredo.length < 32 || segredo.length > 256) return false
  const { data, error } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  return !error && data === true
}

/** Linha devolvida pela RPC chat_midia_reivindicar. */
interface ItemFila {
  message_id: string
  tenant_id: string
  tipo: string
  tentativas: number
  conversation_id: string | null
  media_url: string | null
  caminho: string | null
  tamanho: number | string | null
  mimetype: string | null
}

type Resultado =
  | { ok: true; texto: string; idioma: string | null; duracaoS: number | null; modelo: string; custo: number | null }
  | { ok: false; erro: ErroMidia; duracaoS?: number | null }

interface Execucao {
  admin: SupabaseClient
  chave: string
  prazo: number
  parar: boolean
  contagem: Record<string, number>
}

const restante = (ex: Execucao) => ex.prazo - Date.now()
const conta = (ex: Execucao, k: string) => { ex.contagem[k] = (ex.contagem[k] ?? 0) + 1 }

function chamarIa(ex: Execucao, corpo: Record<string, unknown>, timeoutMs: number, interpretar: (c: unknown) => Interpretacao):
  Promise<{ r: Interpretacao; custo: number | null }> {
  return chamarIaMidia({
    chave: ex.chave, corpo, interpretar,
    timeoutMs: Math.max(5_000, Math.min(timeoutMs, restante(ex) - 5_000)),
    origem: 'wa-midia-processar', titulo: 'OMNX Desk Midia WhatsApp',
  })
}

async function processar(ex: Execucao, it: ItemFila): Promise<Resultado> {
  if (it.tipo !== 'transcricao' && it.tipo !== 'descricao') return { ok: false, erro: 'tipo_invalido' }
  // O caminho calculado aqui (URL do Storage DESTE projeto, pasta da conversa)
  // tem de bater com o que o banco calculou.
  const caminho = caminhoDaMidia(it.media_url, SUPABASE_URL, it.conversation_id)
  if (!caminho || caminho !== it.caminho) return { ok: false, erro: 'fora_do_storage' }
  const tamanho = it.tamanho === null ? NaN : Number(it.tamanho)
  if (!Number.isFinite(tamanho)) return { ok: false, erro: 'midia_ausente' }

  const audio = it.tipo === 'transcricao'
  const maxBytes = audio ? MAX_BYTES_AUDIO : MAX_BYTES_IMAGEM
  if (tamanho > maxBytes) return { ok: false, erro: 'grande_demais' }
  const formato = audio ? formatoAudio(it.mimetype, caminho) : null
  const mime = audio ? null : mimeImagem(it.mimetype, caminho)
  if (audio ? !formato : !mime) return { ok: false, erro: 'formato_nao_suportado' }

  const { data: blob, error } = await ex.admin.storage.from('chat-media').download(caminho)
  if (error || !blob) return { ok: false, erro: 'download_falhou' }
  if (blob.size > maxBytes) return { ok: false, erro: 'grande_demais' }
  const bytes = new Uint8Array(await blob.arrayBuffer())

  if (audio && formato) {
    const dur = duracaoAudioS(bytes, formato)
    const duracaoS = dur === null ? null : Math.round(dur)
    if (duracaoS !== null && duracaoS > MAX_DURACAO_S) return { ok: false, erro: 'longo_demais', duracaoS }
    if (restante(ex) < FOLGA_MS) return { ok: false, erro: 'sem_tempo' }
    const { r, custo } = await chamarIa(ex, pedidoTranscricao(MODELO_AUDIO, encodeBase64(bytes), formato), TIMEOUT_AUDIO_MS, interpretarTranscricao)
    return r.ok ? { ok: true, texto: r.texto, idioma: r.idioma, duracaoS, modelo: MODELO_AUDIO, custo } : { ok: false, erro: r.erro, duracaoS }
  }
  if (restante(ex) < FOLGA_MS) return { ok: false, erro: 'sem_tempo' }
  const { r, custo } = await chamarIa(ex, pedidoDescricao(MODELO_IMAGEM, encodeBase64(bytes), mime!), TIMEOUT_IMAGEM_MS, interpretarDescricao)
  return r.ok ? { ok: true, texto: r.texto, idioma: null, duracaoS: null, modelo: MODELO_IMAGEM, custo } : { ok: false, erro: r.erro }
}

/** Grava o resultado (sempre por empresa). Devolve o status final. */
async function gravar(ex: Execucao, it: ItemFila, res: Resultado): Promise<string> {
  const agora = new Date()
  let campos: Record<string, unknown>
  let status: string
  if (res.ok) {
    status = 'ok'
    campos = {
      status, texto: res.texto, idioma: res.idioma, duracao_s: res.duracaoS, modelo: res.modelo,
      custo_usd: res.custo, erro_code: null, processado_em: agora.toISOString(), reivindicado_em: null,
    }
  } else {
    const prox = proximoEstado(res.erro, it.tentativas, agora)
    if (prox.pararLote) ex.parar = true
    status = prox.status
    campos = {
      status: prox.status,
      erro_code: prox.erro_code,
      reivindicado_em: null,
      ...(res.duracaoS !== undefined && res.duracaoS !== null ? { duracao_s: res.duracaoS } : {}),
      ...(prox.devolverTentativa ? { tentativas: Math.max(0, it.tentativas - 1) } : {}),
      ...(prox.status === 'pendente'
        ? { proxima_tentativa_em: prox.proxima_tentativa_em }
        : { processado_em: agora.toISOString() }),
    }
  }
  let q = ex.admin.from('chat_midia_texto').update(campos)
    .eq('tenant_id', it.tenant_id).eq('message_id', it.message_id)
  // O responder pode ter transcrito na hora enquanto este item estava na fila.
  if (!res.ok) q = q.neq('status', 'ok')
  const { error } = await q
  if (error) {
    // Fica com o aluguel (10 min) e volta para a fila sozinho.
    console.error('wa-midia-processar: falha ao gravar', error.code)
    return 'gravacao_falhou'
  }
  return res.ok ? status : `${status}:${res.erro}`
}

servirComLicenca(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  if (!(await cronAutorizado(admin, req))) return json({ ok: false, error: 'unauthorized' }, 401)

  const bruto = await req.text().catch(() => '')
  if (bruto.length > 1024) return json({ ok: false, error: 'Pedido grande demais.' }, 413)

  // trim: a chave salva nos secrets pode ter quebra de linha no fim (header inválido → 401).
  const chave = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
  if (!chave) {
    console.error('wa-midia-processar: OPENROUTER_API_KEY não configurada')
    return json({ ok: false, error: 'IA não configurada.' }, 500)
  }

  const { data, error } = await admin.rpc('chat_midia_reivindicar', { p_limite: TAMANHO_LOTE, p_max_tenant_dia: LIMITE_DIA })
  if (error) {
    console.error('wa-midia-processar: falha ao reivindicar', error.code)
    return json({ ok: false, error: 'Não foi possível ler a fila.' }, 500)
  }
  const fila = (data ?? []) as ItemFila[]
  const ex: Execucao = { admin, chave, prazo: Date.now() + ORCAMENTO_MS, parar: false, contagem: {} }

  let proxima = 0
  const trabalhador = async () => {
    while (true) {
      const i = proxima++
      if (i >= fila.length) return
      const it = fila[i]
      let res: Resultado
      if (ex.parar || restante(ex) < FOLGA_MS) {
        res = { ok: false, erro: 'sem_tempo' } // devolve para a fila sem contar tentativa
      } else {
        try {
          res = await processar(ex, it)
        } catch (e) {
          console.error('wa-midia-processar: erro inesperado', (e as Error)?.name)
          res = { ok: false, erro: 'ia_http_5xx' }
        }
      }
      conta(ex, await gravar(ex, it, res))
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador))

  console.log(`wa-midia-processar: ${fila.length} item(ns)`, JSON.stringify(ex.contagem))
  return json({ ok: true, itens: fila.length, resultado: ex.contagem, modelos: { audio: MODELO_AUDIO, imagem: MODELO_IMAGEM } })
})
