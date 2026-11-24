import { describe, expect, it } from 'vitest'
import { FERRAMENTAS, ferramentasVisiveis, processarMensagem, VERSOES_MCP } from './desk-mcp-protocolo.ts'

const todas = { permissoes: ['*'] }
const exec = async (f: string, a: Record<string, unknown>) => ({ ok: true as const, data: { f, a } })
const rpc = (method: string, params?: unknown, id: number | null = 1) => ({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params })
type Corpo = { result?: Record<string, unknown>; error?: { code: number } }
const corpo = (r: Awaited<ReturnType<typeof processarMensagem>>) => ('body' in r ? (r.body as Corpo) : {})

describe('desk-mcp: protocolo', () => {
  it('initialize negocia versão e informa que é somente leitura', async () => {
    const r = corpo(await processarMensagem(rpc('initialize', { protocolVersion: '2025-06-18' }), todas, exec))
    expect(r.result?.protocolVersion).toBe('2025-06-18')
    expect(String(r.result?.instructions)).toMatch(/somente leitura/i)
    const novo = corpo(await processarMensagem(rpc('initialize', { protocolVersion: '1999-01-01' }), todas, exec))
    expect(novo.result?.protocolVersion).toBe(VERSOES_MCP[0])
  })
  it('notificação devolve 202 sem corpo; ping responde', async () => {
    expect(await processarMensagem(rpc('notifications/initialized', undefined, null), todas, exec)).toEqual({ status: 202 })
    expect(corpo(await processarMensagem(rpc('ping'), todas, exec)).result).toEqual({})
  })
  it('lote, lixo e método desconhecido', async () => {
    expect(corpo(await processarMensagem([rpc('ping')], todas, exec)).error?.code).toBe(-32600)
    expect(corpo(await processarMensagem('x', todas, exec)).error?.code).toBe(-32600)
    expect(corpo(await processarMensagem(rpc('resources/list'), todas, exec)).error?.code).toBe(-32601)
  })
})

describe('desk-mcp: ferramentas', () => {
  it('todas são somente leitura e não existe ferramenta de envio/escrita', () => {
    expect(FERRAMENTAS.map((f) => f.name).sort()).toEqual(['get_conversation', 'list_contacts', 'list_conversations', 'list_instances'])
    expect(FERRAMENTAS.some((f) => /send|assign|close|create|update|delete/.test(f.name))).toBe(false)
  })
  it('tools/list respeita as permissões da chave e marca readOnlyHint', async () => {
    const r = corpo(await processarMensagem(rpc('tools/list'), { permissoes: ['view_instances'] }, exec))
    const tools = r.result?.tools as Array<{ name: string; annotations: { readOnlyHint: boolean } }>
    expect(tools.map((t) => t.name)).toEqual(['list_instances'])
    expect(tools[0].annotations.readOnlyHint).toBe(true)
    expect(ferramentasVisiveis({ permissoes: [] })).toEqual([])
  })
  it('chamada sem permissão não executa', async () => {
    let chamou = false
    const r = corpo(await processarMensagem(rpc('tools/call', { name: 'list_contacts', arguments: {} }), { permissoes: [] }, async () => { chamou = true; return { ok: true, data: 1 } }))
    expect(chamou).toBe(false)
    expect((r.result as { isError: boolean }).isError).toBe(true)
  })
  it('valida argumentos antes de executar', async () => {
    const ruim = async (a: unknown, nome = 'get_conversation') =>
      (corpo(await processarMensagem(rpc('tools/call', { name: nome, arguments: a }), todas, exec)).result as { isError: boolean }).isError
    expect(await ruim({ conversation_id: 'nao-uuid' })).toBe(true)
    expect(await ruim({})).toBe(true)
    expect(await ruim({ limit: 1000 }, 'list_conversations')).toBe(true)
    expect(await ruim({ status: 'xyz' }, 'list_conversations')).toBe(true)
    expect(await ruim({ status: ['aberta'] }, 'list_conversations')).toBe(true)
    expect(await ruim({ status: 'aberta' }, 'list_conversations')).toBe(false)
    expect(await ruim({ conversation_id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' })).toBe(false)
  })
  it('ferramenta desconhecida é erro de protocolo; chamada ok devolve texto JSON e nome para auditoria', async () => {
    expect(corpo(await processarMensagem(rpc('tools/call', { name: 'send_message' }), todas, exec)).error?.code).toBe(-32602)
    const r = await processarMensagem(rpc('tools/call', { name: 'list_instances' }), todas, exec)
    expect(r.ferramenta).toBe('list_instances')
    expect(JSON.parse(((corpo(r).result as { content: Array<{ text: string }> }).content[0].text))).toMatchObject({ f: 'list_instances' })
  })
})
