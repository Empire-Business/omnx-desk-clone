import { afterEach, describe, expect, it, vi } from 'vitest'
import { mensagemErro } from './mensagemErro'
import { appDaRota, instalarObservabilidade, registrarEvento } from './observabilidade'

const database = vi.hoisted(() => ({ insert: vi.fn(async (_row: unknown) => ({ error: null })) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => database } }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('app de cada rota (endereços novos e antigos)', () => {
  it.each([
    ['/conversas', 'chat'], ['/conversas/quadro', 'chat'], ['/chat', 'chat'],
    ['/tickets', 'atendimento'], ['/tickets/abc', 'atendimento'], ['/', 'atendimento'], ['/atendimento/demandas', 'atendimento'],
    ['/ia', 'automacoes-wa'], ['/ia/alertas', 'automacoes-wa'], ['/clientes/grupos', 'automacoes-wa'],
    ['/contratos/lista', 'contratos'], ['/clientes', 'nucleo'], ['/iaxyz', 'nucleo'], ['/ajustes', 'nucleo'],
  ])('%s → %s', (rota, app) => {
    expect(appDaRota(rota)).toBe(app)
  })
})

describe('mensagens de erros estruturados', () => {
  it('preserva mensagem e código PostgREST, sem serializar dados privados do payload', () => {
    expect(mensagemErro({ code: '42501', message: 'permission denied', details: 'payload privado', token: 'segredo' }))
      .toBe('[42501] permission denied')
    expect(mensagemErro({ error_description: 'Sessão expirada' })).toBe('Sessão expirada')
  })

  it('não suprime AbortError nem perde seu nome', () => {
    const error = new Error('Lock broken by another request with steal option')
    error.name = 'AbortError'
    expect(mensagemErro(error)).toBe('AbortError: Lock broken by another request with steal option')
  })

  it('não produz [object Object] para payload sem mensagem e tolera getters hostis', () => {
    expect(mensagemErro({ outro: 'valor' })).toBe('Erro sem mensagem disponível')
    expect(mensagemErro({ get message() { throw new Error('getter') } })).toBe('Erro sem mensagem disponível')
  })

  it('mantém mascaramento de segredos ao gravar a mensagem normalizada', () => {
    registrarEvento({ evento: 'teste_segredo', mensagem: mensagemErro({ message: 'falhou token=segredo-api' }) })
    expect(database.insert.mock.calls[0]?.[0]).toMatchObject({ mensagem: 'falhou token=[oculto]' })
  })

  it('normaliza também rejeições globais e registra AbortError como incidente', () => {
    const handlers = new Map<string, (event: { reason: unknown }) => void>()
    vi.stubGlobal('window', { location: { pathname: '/chat' }, addEventListener: (name: string, handler: (event: { reason: unknown }) => void) => handlers.set(name, handler) })
    instalarObservabilidade()
    handlers.get('unhandledrejection')!({ reason: { message: 'Falha estruturada global' } })
    expect(database.insert.mock.calls[0]?.[0]).toMatchObject({ app: 'chat', mensagem: 'Falha estruturada global' })
    const error = new Error('Lock broken by another request with steal option')
    error.name = 'AbortError'
    handlers.get('unhandledrejection')!({ reason: error })
    expect(database.insert.mock.calls[1]?.[0]).toMatchObject({ nivel: 'erro', mensagem: 'AbortError: Lock broken by another request with steal option' })
  })
})
