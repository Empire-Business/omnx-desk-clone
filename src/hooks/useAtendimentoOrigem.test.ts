import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrigemWhatsAppDemanda, type OrigemWhatsAppDemanda } from './useAtendimento'

type Falha = { code: string; message: string }
const banco = vi.hoisted(() => ({
  respostas: [] as Array<{ data: unknown; error: Falha | null }>,
  selecoes: [] as string[],
  filtros: [] as Array<[string, unknown]>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opcoes: unknown) => opcoes,
  useMutation: vi.fn(), useQueryClient: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => {
    const consulta = {
      select: (campos: string) => { banco.selecoes.push(campos); return consulta },
      eq: (coluna: string, valor: unknown) => { banco.filtros.push([coluna, valor]); return consulta },
      single: async () => {
        const resposta = banco.respostas.shift()
        if (!resposta) throw new Error('Consulta extra não prevista')
        return resposta
      },
    }
    return consulta
  } },
}))

const origem: OrigemWhatsAppDemanda = {
  wa_origem_mensagem_id: 'mensagem-original', wa_ultima_analise: '2026-11-06T19:00:00Z',
  wa_resolucao_mensagem_id: null, wa_resolvida_manualmente: false, wa_reaberta_em: null,
}
const consulta = () => useOrigemWhatsAppDemanda('ticket-a') as unknown as { queryFn: () => Promise<OrigemWhatsAppDemanda | null> }
const ausente = (code: string) => ({ code, message: 'Coluna ainda não disponível' })

beforeEach(() => { banco.respostas = []; banco.selecoes = []; banco.filtros = [] })

describe('compatibilidade da ficha com a resolução automática', () => {
  it('mantém motivo e evidências quando a estrutura nova está disponível', async () => {
    const atual = { ...origem, wa_resolucao_metodo: 'ia', wa_resolucao_motivo: 'Cliente confirmou o acesso.', wa_resolucao_evidencias: ['mensagem-1'] }
    banco.respostas.push({ data: atual, error: null })
    expect(await consulta().queryFn()).toEqual(atual)
    expect(banco.filtros).toEqual([['id', 'ticket-a']])
    expect(banco.selecoes).toHaveLength(1)
  })

  it('lê a sugestão da Íris na primeira consulta quando o banco já tem as colunas', async () => {
    const atual = { ...origem, wa_resolucao_metodo: null, wa_sugestao_em: '2026-11-07T12:00:00Z', wa_sugestao_razao: 'so_equipe' }
    banco.respostas.push({ data: atual, error: null })
    expect(await consulta().queryFn()).toEqual(atual)
    expect(banco.selecoes[0]).toContain('wa_sugestao_em')
    expect(banco.selecoes[0]).toContain('wa_sugestao_evidencias')
    expect(banco.selecoes[0]).toContain('wa_resolucao_metodo')
  })

  it.each(['42703', 'PGRST204'])('sem as colunas da sugestão, mantém a resolução automática (%s)', async code => {
    const comResolucao = { ...origem, wa_resolucao_metodo: 'ia' }
    banco.respostas.push({ data: null, error: ausente(code) }, { data: comResolucao, error: null })
    expect(await consulta().queryFn()).toEqual(comResolucao)
    expect(banco.selecoes).toHaveLength(2)
    expect(banco.selecoes[1]).toContain('wa_resolucao_metodo')
    expect(banco.selecoes[1]).not.toContain('wa_sugestao')
    expect(banco.filtros).toEqual([['id', 'ticket-a'], ['id', 'ticket-a']])
  })

  it.each(['42703', 'PGRST204'])('preserva a origem anterior quando só a ponte existe (%s)', async code => {
    banco.respostas.push({ data: null, error: ausente(code) }, { data: null, error: ausente(code) }, { data: origem, error: null })
    expect(await consulta().queryFn()).toEqual(origem)
    expect(banco.selecoes).toHaveLength(3)
    expect(banco.selecoes[2]).toContain('wa_origem_mensagem_id')
    expect(banco.selecoes[2]).not.toContain('wa_resolucao_metodo')
    expect(banco.selecoes[2]).not.toContain('wa_sugestao')
  })

  it('mantém a ficha manual utilizável quando nem a ponte antiga existe', async () => {
    banco.respostas.push(
      { data: null, error: ausente('42703') }, { data: null, error: ausente('42703') }, { data: null, error: ausente('42703') },
    )
    expect(await consulta().queryFn()).toBeNull()
  })

  it.each(['42501', '503'])('não esconde falha de permissão ou rede como ausência da função (%s)', async code => {
    const erro = { code, message: 'A consulta não foi autorizada ou está indisponível' }
    banco.respostas.push({ data: null, error: erro })
    await expect(consulta().queryFn()).rejects.toEqual(erro)
    expect(banco.selecoes).toHaveLength(1)
  })

  it('preserva o erro real se a consulta de compatibilidade também for recusada', async () => {
    const erro = { code: '42501', message: 'Permissão negada' }
    banco.respostas.push({ data: null, error: ausente('42703') }, { data: null, error: erro })
    await expect(consulta().queryFn()).rejects.toEqual(erro)
    expect(banco.selecoes).toHaveLength(2)
  })
})
