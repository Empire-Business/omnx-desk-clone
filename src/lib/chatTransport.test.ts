import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { obterTokenChat, lerRespostaEnvio } from './chatTransport'
import { lerReacoes } from './chatReactions'

const session = (id = 'actor-a', expires_at = Math.floor(Date.now() / 1000) + 3600): Session => ({
  access_token: `fixture-${id}`, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at,
  user: { id, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
})
function auth(current: Session | null, refreshed: Session | null = null) {
  return {
    getSession: vi.fn(async (): ReturnType<SupabaseClient['auth']['getSession']> =>
      current ? { data: { session: current }, error: null } : { data: { session: null }, error: null }),
    refreshSession: vi.fn(async (): ReturnType<SupabaseClient['auth']['refreshSession']> =>
      refreshed ? { data: { session: refreshed, user: refreshed.user }, error: null }
        : { data: { session: null, user: null }, error: null }),
  }
}

describe('token de envio sem fallback expirado', () => {
  it('usa token válido da identidade esperada sem renovar', async () => {
    const source = auth(session())
    expect(await obterTokenChat(source, 'actor-a')).toBe('fixture-actor-a')
    expect(source.refreshSession).not.toHaveBeenCalled()
  })
  it('não usa token da outra conta', async () => {
    await expect(obterTokenChat(auth(session('actor-b')), 'actor-a')).rejects.toThrow('sessão mudou')
  })
  it('renova vencido, mas recusa renovação vazia, vencida ou de outro ator', async () => {
    const expired = session('actor-a', 1)
    expect(await obterTokenChat(auth(expired, session()))).toBe('fixture-actor-a')
    for (const invalid of [null, expired, session('actor-b')]) {
      await expect(obterTokenChat(auth(expired, invalid))).rejects.toThrow('renovar sua sessão')
    }
  })
  it('sem sessão nega sem renovar ou enviar', async () => {
    const source = auth(null)
    await expect(obterTokenChat(source)).rejects.toThrow('Sessão expirada')
    expect(source.refreshSession).not.toHaveBeenCalled()
  })
})

describe('confirmação de envio pelo provedor', () => {
  it('não transforma HTTP 200 com falha em sucesso', async () => {
    await expect(lerRespostaEnvio(Response.json({ ok: false, error: 'Provedor recusou' }))).rejects.toThrow('Provedor recusou')
  })
  it('preserva sucesso já aceito com aviso de persistência para evitar duplicação', async () => {
    await expect(lerRespostaEnvio(Response.json({ ok: true, persisted: false, warning: 'Confira o histórico' })))
      .resolves.toEqual({ ok: true, persisted: false, warning: 'Confira o histórico' })
  })
  it('recusa HTTP negado e resposta não JSON sem publicar corpo bruto', async () => {
    await expect(lerRespostaEnvio(Response.json({ error: 'Não foi possível confirmar; confira histórico' }, { status: 504 })))
      .rejects.toThrow('confira histórico')
    await expect(lerRespostaEnvio(new Response('<html>segredo</html>', { status: 502 })))
      .rejects.toThrow('Confira o histórico')
  })
  it('lê apenas reações JSON no formato esperado, sem quebrar a conversa', () => {
    expect(lerReacoes([{ emoji: '👍', from: 'pessoa', from_me: false }, 'invalido', null, { emoji: 'x' }]))
      .toEqual([{ emoji: '👍', from: 'pessoa', from_me: false }])
  })
})
