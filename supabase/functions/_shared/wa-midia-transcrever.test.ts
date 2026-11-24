import { afterEach, describe, expect, it, vi } from 'vitest'
import { chamarIaMidia, paraBase64, transcreverDoStorage, type TranscricaoAgora, URL_OPENROUTER } from './wa-midia-transcrever.ts'
import { interpretarTranscricao } from './wa-midia.ts'

const SUPA = 'https://wuzmckatbmlpkdxtfhqr.supabase.co'
const CONV = '6f1c2a34-1111-4222-8333-944455556666'
const URL_AUDIO = `${SUPA}/storage/v1/object/public/chat-media/${CONV}/1730000000000.ogg`

function oggOpus(segundos: number): Uint8Array {
  const b = new Uint8Array(400)
  const enc = (s: string, i: number) => { for (let k = 0; k < s.length; k++) b[i + k] = s.charCodeAt(k) }
  enc('OggS', 0); enc('OpusHead', 28)
  enc('OggS', 300)
  new DataView(b.buffer).setUint32(300 + 6, segundos * 48_000, true)
  return b
}

interface Arquivo { nome: string; bytes: Uint8Array; mime?: string; tamanho?: number }

function storageFalso(arquivos: Arquivo[], opts: { erroLista?: boolean; erroDownload?: boolean } = {}) {
  const chamadas: { op: string; arg: string }[] = []
  const admin = {
    storage: {
      from: (bucket: string) => ({
        list: async (pasta: string, o: { search?: string }) => {
          chamadas.push({ op: `list:${bucket}`, arg: `${pasta}|${o.search}` })
          if (opts.erroLista) return { data: null, error: { message: 'x' } }
          return {
            data: arquivos.filter((a) => a.nome.startsWith(`${pasta}/`)).map((a) => ({
              name: a.nome.split('/')[1], metadata: { size: a.tamanho ?? a.bytes.length, mimetype: a.mime ?? 'audio/ogg' },
            })),
            error: null,
          }
        },
        download: async (caminho: string) => {
          chamadas.push({ op: `download:${bucket}`, arg: caminho })
          const a = arquivos.find((x) => x.nome === caminho)
          if (!a || opts.erroDownload) return { data: null, error: { message: 'x' } }
          return { data: new Blob([a.bytes]), error: null }
        },
      }),
    },
  }
  return { admin: admin as unknown as Parameters<typeof transcreverDoStorage>[0], chamadas }
}

const respostaOk = (texto: string, custo = 0.0012) => new Response(JSON.stringify({
  choices: [{ message: { content: `idioma: pt-BR\n${texto}` }, finish_reason: 'stop' }], usage: { cost: custo },
}), { status: 200 })

function opcoes(extra: Partial<TranscricaoAgora> = {}): TranscricaoAgora {
  return {
    chave: 'chave-teste', modelo: 'google/gemini-2.5-flash', supabaseUrl: SUPA, mediaUrl: URL_AUDIO, conversationId: CONV,
    maxBytes: 15 * 1024 * 1024, maxDuracaoS: 300, timeoutMs: 30_000, origem: 'teste', titulo: 'Teste',
    fetchFn: vi.fn(async () => respostaOk('Íris, como está a Jane?')) as unknown as typeof fetch,
    ...extra,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('paraBase64', () => {
  it('igual ao Buffer do Node, inclusive acima do tamanho do pedaço', () => {
    const b = new Uint8Array(70_000).map((_, i) => (i * 31) % 256)
    expect(paraBase64(b)).toBe(Buffer.from(b).toString('base64'))
    expect(paraBase64(new Uint8Array())).toBe('')
  })
})

describe('chamarIaMidia', () => {
  it('manda o corpo ao OpenRouter e devolve interpretação + custo', async () => {
    const fetchFn = vi.fn(async () => respostaOk('oi'))
    const r = await chamarIaMidia({
      chave: 'k', corpo: { a: 1 }, timeoutMs: 5_000, interpretar: interpretarTranscricao, origem: 't', titulo: 'T',
      fetchFn: fetchFn as unknown as typeof fetch,
    })
    expect(r).toEqual({ r: { ok: true, texto: 'oi', idioma: 'pt-BR' }, custo: 0.0012 })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(URL_OPENROUTER)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })
  it('HTTP de erro vira código; exceção vira ia_http_5xx; log sem conteúdo', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r402 = await chamarIaMidia({
      chave: 'k', corpo: {}, timeoutMs: 5_000, interpretar: interpretarTranscricao, origem: 't', titulo: 'T',
      fetchFn: (async () => new Response('segredo', { status: 402 })) as unknown as typeof fetch,
    })
    expect(r402.r).toEqual({ ok: false, erro: 'ia_sem_credito' })
    const rx = await chamarIaMidia({
      chave: 'k', corpo: {}, timeoutMs: 5_000, interpretar: interpretarTranscricao, origem: 't', titulo: 'T',
      fetchFn: (async () => { throw new TypeError('rede') }) as unknown as typeof fetch,
    })
    expect(rx.r).toEqual({ ok: false, erro: 'ia_http_5xx' })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/segredo/)
  })
})

describe('transcreverDoStorage', () => {
  const nome = `${CONV}/1730000000000.ogg`

  it('baixa do bucket chat-media, confere e transcreve', async () => {
    const { admin, chamadas } = storageFalso([{ nome, bytes: oggOpus(33) }])
    const o = opcoes()
    const r = await transcreverDoStorage(admin, o)
    expect(r).toEqual({ ok: true, texto: 'Íris, como está a Jane?', idioma: 'pt-BR', duracaoS: 33, modelo: o.modelo, custo: 0.0012 })
    expect(chamadas.map((c) => c.op)).toEqual(['list:chat-media', 'download:chat-media'])
    const corpo = JSON.parse(((o.fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string)
    expect(corpo.provider).toEqual({ data_collection: 'deny' })
    expect(corpo.messages[1].content[1].input_audio.format).toBe('ogg')
  })

  it('sem URL ou ainda fora do Storage (subindo) → midia_ausente', async () => {
    const { admin } = storageFalso([])
    expect(await transcreverDoStorage(admin, opcoes({ mediaUrl: null }))).toEqual({ ok: false, erro: 'midia_ausente' })
    expect(await transcreverDoStorage(admin, opcoes())).toEqual({ ok: false, erro: 'midia_ausente' })
  })

  it('URL de outro lugar / outra conversa → fora_do_storage (não baixa)', async () => {
    const { admin, chamadas } = storageFalso([{ nome, bytes: oggOpus(5) }])
    expect(await transcreverDoStorage(admin, opcoes({ mediaUrl: 'https://empirebusiness.uazapi.com/f/1.ogg' })))
      .toEqual({ ok: false, erro: 'fora_do_storage' })
    expect(await transcreverDoStorage(admin, opcoes({ conversationId: 'outra' }))).toEqual({ ok: false, erro: 'fora_do_storage' })
    expect(chamadas).toHaveLength(0)
  })

  it('grande demais pelos metadados → não baixa', async () => {
    const { admin, chamadas } = storageFalso([{ nome, bytes: oggOpus(5), tamanho: 50 * 1024 * 1024 }])
    expect(await transcreverDoStorage(admin, opcoes())).toEqual({ ok: false, erro: 'grande_demais' })
    expect(chamadas.map((c) => c.op)).toEqual(['list:chat-media'])
  })

  it('formato desconhecido → formato_nao_suportado', async () => {
    const n = `${CONV}/1730000000000.xyz`
    const { admin } = storageFalso([{ nome: n, bytes: oggOpus(5), mime: 'application/octet-stream' }])
    const r = await transcreverDoStorage(admin, opcoes({ mediaUrl: `${SUPA}/storage/v1/object/public/chat-media/${n}` }))
    expect(r).toEqual({ ok: false, erro: 'formato_nao_suportado' })
  })

  it('acima do limite de duração → longo_demais, sem chamar a IA', async () => {
    const { admin } = storageFalso([{ nome, bytes: oggOpus(400) }])
    const o = opcoes()
    expect(await transcreverDoStorage(admin, o)).toEqual({ ok: false, erro: 'longo_demais', duracaoS: 400 })
    expect(o.fetchFn).not.toHaveBeenCalled()
  })

  it('erro de listagem/download → download_falhou (pode tentar de novo)', async () => {
    expect(await transcreverDoStorage(storageFalso([{ nome, bytes: oggOpus(5) }], { erroLista: true }).admin, opcoes()))
      .toEqual({ ok: false, erro: 'download_falhou' })
    expect(await transcreverDoStorage(storageFalso([{ nome, bytes: oggOpus(5) }], { erroDownload: true }).admin, opcoes()))
      .toEqual({ ok: false, erro: 'download_falhou' })
  })

  it('áudio sem fala → sem_fala', async () => {
    const { admin } = storageFalso([{ nome, bytes: oggOpus(5) }])
    const fetchFn = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '[SEM_FALA]' } }] }))) as unknown as typeof fetch
    expect(await transcreverDoStorage(admin, opcoes({ fetchFn }))).toEqual({ ok: false, erro: 'sem_fala', duracaoS: 5 })
  })
})
