import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sessaoDeskLiberada } from './desk-session.ts'

const session = '11111111-1111-4111-8111-111111111111'
function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  return { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
}

describe('gate humano antes de caminhos privilegiados', () => {
  it.each([false, true])('aceita sessão real liberada; marcador ativo=%s não bloqueia sessões anteriores', async active => {
    const c = client({ state: 'ok', requirement_active: active, session_id: session })
    expect(await sessaoDeskLiberada(c)).toBe(true)
    expect(c.rpc).toHaveBeenCalledExactlyOnceWith('desk_password_change_status')
  })
  it.each([
    null, {}, { state: 'password_change_required', requirement_active: true, session_id: session },
    { state: 'invalid_session', requirement_active: false, session_id: session },
    { state: 'ok', requirement_active: false, session_id: null },
    { state: 'ok', requirement_active: false, session_id: 'invalid' },
    { state: 'ok', session_id: session },
  ])('nega estado inválido, desconhecido ou pendente: %j', async data => {
    expect(await sessaoDeskLiberada(client(data))).toBe(false)
  })
  it('nega erro na RPC mesmo se existir resposta antiga', async () => {
    expect(await sessaoDeskLiberada(client({ state: 'ok', requirement_active: false, session_id: session }, { code: 'unavailable' }))).toBe(false)
  })
  it('nega exceção de rede', async () => {
    expect(await sessaoDeskLiberada({ rpc: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as Pick<SupabaseClient, 'rpc'>)).toBe(false)
  })
})
