import { describe, expect, it, vi } from 'vitest'
import { enviarAvisoCompleto } from './preparar.ts'

describe('enviarAvisoCompleto — o aviso sai inteiro, em partes', () => {
  const longo = Array.from({ length: 4 }, (_, i) => `Parágrafo ${i}\n${'linha de cliente\n'.repeat(120)}`.trim()).join('\n\n')

  it('texto curto: uma mensagem com a chave original', async () => {
    const send = vi.fn(async () => ({ messageId: 'm1' }))
    const r = await enviarAvisoCompleto({ sendText: send } as never, 'g@g.us', 'Oi', { chaveIdempotencia: 'k' }, async () => {})
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]).toEqual(['g@g.us', 'Oi', { chaveIdempotencia: 'k' }])
    expect(r).toMatchObject({ messageId: 'm1', partes: 1, messageIds: ['m1'] })
  })

  it('texto longo: várias mensagens em ordem, chaves :p2, :p3… e pausa entre elas', async () => {
    const send = vi.fn(async (_d: string, _t: string, o: { chaveIdempotencia?: string }) => ({ messageId: o.chaveIdempotencia ?? null }))
    const esperas: number[] = []
    const r = await enviarAvisoCompleto({ sendText: send } as never, 'g@g.us', longo, { chaveIdempotencia: 'k' }, async (ms) => { esperas.push(ms) }, () => 0)
    expect(r.partes).toBeGreaterThan(1)
    expect(send.mock.calls.map((c) => c[2].chaveIdempotencia)).toEqual(['k', ...Array.from({ length: r.partes - 1 }, (_, i) => `k:p${i + 2}`)])
    expect(esperas).toHaveLength(r.partes - 1)
    expect(esperas.every((ms) => ms >= 1_500 && ms < 3_000)).toBe(true)
    expect(send.mock.calls.map((c) => c[1]).join('\n\n').replace(/\s+/g, ' ')).toBe(longo.replace(/\s+/g, ' '))
  })

  it('falha numa parte depois da primeira vira incerta (não repetir às cegas)', async () => {
    let n = 0
    const send = vi.fn(async () => {
      n++
      if (n === 2) throw Object.assign(new Error('rede'), { incerto: false })
      return { messageId: `m${n}` }
    })
    await expect(enviarAvisoCompleto({ sendText: send } as never, 'g@g.us', longo, {}, async () => {})).rejects.toMatchObject({ incerto: true })
  })
})
