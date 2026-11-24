import { describe, expect, it, vi } from 'vitest'
import { createSessionController, type VerifiedSession, type SessionProfile } from './authSession'
import { parsePasswordChangeStatus, sessionIdFromToken, type PasswordChangeStatus } from './passwordChange'
import { createPasswordChanger } from './passwordChangeRequest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const profile: SessionProfile = { id: 'a', tenant_id: 'tenant-a', nome: 'A', email: 'a@example.invalid', perfil: 'admin', foto_url: null, ativo: true }
const status = (state: PasswordChangeStatus['state'], session_id = 'session-a'): PasswordChangeStatus => ({ state, session_id, requirement_active: state === 'password_change_required' })
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function controller(loadPasswordStatus: () => Promise<PasswordChangeStatus>) {
  const loadProfile = vi.fn(async () => profile)
  const states: VerifiedSession[] = []
  const clearCache = vi.fn()
  const current = createSessionController({ loadProfile, loadPasswordStatus, clearCache, publish: s => states.push(s) })
  return { current, loadProfile, states, clearCache }
}

describe('troca de senha decidida pelo backend e vinculada à sessão', () => {
  it('bloqueia antes de ler perfil e mantém identidade mínima confirmada', async () => {
    const c = controller(async () => status('password_change_required'))
    expect(await c.current.transition('a', 'session-a')).toBeNull()
    expect(c.loadProfile).not.toHaveBeenCalled()
    expect(c.current.getState()).toMatchObject({ user: null, loading: false, access: { state: 'password_change_required' }, identity: { userId: 'a', sessionId: 'session-a' } })
  })
  it('sessão antiga continua liberada e login novo do mesmo usuário perde cache/perfil', async () => {
    const gate = vi.fn().mockResolvedValueOnce(status('ok')).mockResolvedValueOnce(status('ok')).mockResolvedValueOnce(status('password_change_required', 'session-new'))
    const c = controller(gate)
    await c.current.transition('a', 'session-a')
    const clears = c.clearCache.mock.calls.length
    await c.current.transition('a', 'session-a')
    expect(c.clearCache).toHaveBeenCalledTimes(clears)
    const pending = c.current.transition('a', 'session-new')
    expect(c.current.isCurrent('a', 'session-a')).toBe(false)
    expect(c.current.isCurrent('a', 'session-new')).toBe(true)
    expect(c.current.getState()).toMatchObject({ user: null, loading: true })
    await pending
    expect(c.current.getState().access?.state).toBe('password_change_required')
    expect(c.loadProfile).toHaveBeenCalledTimes(2)
  })
  it('falha de RPC não vira acesso livre nem perfil presumido', async () => {
    const c = controller(async () => { throw new Error('network') })
    await c.current.transition('a', 'session-a')
    expect(c.current.getState()).toMatchObject({ user: null, loading: false, accessError: true })
    expect(c.loadProfile).not.toHaveBeenCalled()
  })
  it.each([status('invalid_session'), status('ok', 'foreign-session')])('nega sessão inválida ou resposta para outra sessão', async gate => {
    const c = controller(async () => gate)
    await c.current.transition('a', 'session-a')
    expect(c.current.getState().user).toBeNull()
    expect(c.loadProfile).not.toHaveBeenCalled()
  })
  it('descarta status tardio após logout', async () => {
    const old = deferred<PasswordChangeStatus>()
    const c = controller(() => old.promise)
    const task = c.current.transition('a', 'session-a')
    await new Promise(r => setTimeout(r, 0))
    await c.current.transition(null)
    old.resolve(status('ok'))
    await task
    expect(c.current.getState()).toMatchObject({ user: null, identity: null, access: null })
    expect(c.loadProfile).not.toHaveBeenCalled()
  })
  it('só publica perfil após confirmação do backend; senha salva não é prova local', async () => {
    let current = status('password_change_required')
    const c = controller(async () => current)
    await c.current.transition('a', 'session-a')
    await c.current.transition('a', 'session-a')
    expect(c.loadProfile).not.toHaveBeenCalled()
    current = status('ok')
    await c.current.transition('a', 'session-a')
    expect(c.current.getState().user).toMatchObject({ id: 'a' })
    expect(c.loadProfile).toHaveBeenCalledOnce()
  })
  it('não aceita payload RPC incompleto ou tipo inválido', () => {
    for (const raw of [null, {}, { state: 'ok', requirement_active: false, session_id: null }, { state: 'ok', requirement_active: 'false', session_id: 'x' }]) expect(() => parsePasswordChangeStatus(raw)).toThrow()
    expect(parsePasswordChangeStatus(status('ok'))).toEqual(status('ok'))
  })
  it('extrai session_id apenas para separar cache, e falha fechado em token ilegível', () => {
    expect(sessionIdFromToken(`header.${btoa(JSON.stringify({ session_id: 's1' }))}.signature`)).toBe('s1')
    expect(sessionIdFromToken('invalid')).toBeNull()
  })
})

describe('pedido de troca sem retry e com ator/sessão capturados', () => {
  const identity = { userId: 'a', sessionId: 'session-a' }
  const snapshot = { ...identity, token: 'fixture-token-a' }
  function setup() {
    const session = vi.fn(async () => snapshot)
    const verify = vi.fn(async () => 'a')
    const invoke = vi.fn(async (_body: unknown, _headers: Record<string, string>): Promise<unknown> => ({ ok: true, state: 'ok', password_updated: true }))
    return { session, verify, invoke, send: createPasswordChanger({ session, verify, invoke }) }
  }
  it('usa JWT capturado e headers próprios sem mudar corpo', async () => {
    const c = setup()
    expect(await c.send(identity, { password: 'fixture-only-password' })).toMatchObject({ ok: true, passwordUpdated: true })
    expect(c.invoke).toHaveBeenCalledWith({ password: 'fixture-only-password' }, { Authorization: 'Bearer fixture-token-a', 'x-actor-id': 'a', 'x-session-id': 'session-a' })
  })
  it('troca de conta durante confirmação impede envio', async () => {
    const c = setup()
    c.session.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ userId: 'b', sessionId: 'session-b', token: 'fixture-b' })
    await expect(c.send(identity, { password: 'fixture-only-password' })).rejects.toThrow('sessão mudou')
    expect(c.invoke).not.toHaveBeenCalled()
  })
  it('falha de rede é incerta e não repete a senha', async () => {
    const c = setup(); c.invoke.mockRejectedValue(new Error('network'))
    expect(await c.send(identity, { password: 'fixture-only-password' })).toMatchObject({ ok: false, error: 'password_update_uncertain' })
    expect(c.invoke).toHaveBeenCalledOnce()
  })
  it('recibo parcial conserva proof; confirmação posterior envia somente proof', async () => {
    const c = setup(); c.invoke.mockResolvedValueOnce({ ok: false, error: 'completion_pending', password_updated: true, completion_proof: 'fixture-proof' })
    expect(await c.send(identity, { password: 'fixture-only-password' })).toMatchObject({ ok: false, passwordUpdated: true, proof: 'fixture-proof' })
    await c.send(identity, { completion_proof: 'fixture-proof' })
    expect(c.invoke.mock.calls[1][0]).toEqual({ completion_proof: 'fixture-proof' })
  })
  it('solicitação explícita de código não significa senha alterada nem acesso liberado', async () => {
    const c = setup(); c.invoke.mockResolvedValue({ ok: true, reauthentication_sent: true, password_updated: false })
    expect(await c.send(identity, { reauthenticate: true })).toMatchObject({ ok: false, passwordUpdated: false, reauthenticationSent: true })
    expect(c.invoke.mock.calls[0][0]).toEqual({ reauthenticate: true })
  })
  it('encaminha senha atual e nonce nativos somente quando explicitamente informados', async () => {
    const c = setup()
    const body = { password: 'fixture-password-only', current_password: 'fixture-current-only', nonce: '123456' }
    await c.send(identity, body)
    expect(c.invoke.mock.calls[0][0]).toEqual(body)
    expect(c.invoke).toHaveBeenCalledOnce()
  })
})
