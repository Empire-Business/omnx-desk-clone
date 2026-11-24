import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecusarSugestaoIris } from './useAtendimento'

const banco = vi.hoisted(() => ({
  resposta: { data: [{ id: 'ticket-a' }] as unknown, error: null as { code: string; message: string } | null },
  updates: [] as unknown[],
  filtros: [] as Array<[string, unknown]>,
  invalidadas: [] as unknown[],
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: (opcoes: unknown) => opcoes,
  useQueryClient: () => ({ invalidateQueries: (filtro: unknown) => { banco.invalidadas.push(filtro) } }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => {
    const consulta = {
      update: (payload: unknown) => { banco.updates.push(payload); return consulta },
      eq: (coluna: string, valor: unknown) => { banco.filtros.push([coluna, valor]); return consulta },
      select: async () => banco.resposta,
    }
    return consulta
  } },
}))

type Opcoes = { mutationFn: (id: string) => Promise<void>; onSuccess: () => void }
const mutacao = () => useRecusarSugestaoIris() as unknown as Opcoes

beforeEach(() => {
  banco.resposta = { data: [{ id: 'ticket-a' }], error: null }
  banco.updates = []; banco.filtros = []; banco.invalidadas = []
})

describe('Manter aberto (recusar a sugestão da Íris)', () => {
  it('só limpa a sugestão daquele ticket, sem mexer na etapa', async () => {
    await mutacao().mutationFn('ticket-a')
    expect(banco.filtros).toEqual([['id', 'ticket-a']])
    const payload = banco.updates[0] as Record<string, unknown>
    expect(Object.keys(payload).every((k) => k.startsWith('wa_sugestao_'))).toBe(true)
    expect(payload.wa_sugestao_evidencias).toEqual([])
    expect(payload).not.toHaveProperty('etapa_id')
  })

  it('atualiza ficha, lista e quadro depois de gravar', () => {
    mutacao().onSuccess()
    expect(banco.invalidadas).toEqual([{ queryKey: ['atendimento'] }])
  })

  it('avisa quando a RLS não deixou gravar (nenhuma linha devolvida)', async () => {
    banco.resposta = { data: [], error: null }
    await expect(mutacao().mutationFn('ticket-a')).rejects.toThrow(/permissão/)
  })

  it('repassa o erro do banco', async () => {
    const erro = { code: '42501', message: 'Permissão negada' }
    banco.resposta = { data: null, error: erro }
    await expect(mutacao().mutationFn('ticket-a')).rejects.toEqual(erro)
  })
})
