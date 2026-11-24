import { beforeEach, describe, expect, it, vi } from 'vitest'
import { juntarTrechos, lerTicketsWhatsApp, statusDaDemanda, type MensagemDaConversa, type WhatsAppDoTicket } from './useAtendimentoTickets'
import { payloadEditavelDemanda } from './useAtendimento'

type Falha = { code: string; message: string }
const banco = vi.hoisted(() => ({
  respostas: [] as Array<{ data: unknown; error: Falha | null }>,
  selecoes: [] as string[],
  filtros: [] as Array<[string, ...unknown[]]>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opcoes: unknown) => opcoes,
  useMutation: vi.fn(), useQueryClient: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => {
    const consulta = {
      select: (campos: string) => { banco.selecoes.push(campos); return consulta },
      not: (...args: unknown[]) => { banco.filtros.push(['not', ...args]); return consulta },
      eq: (...args: unknown[]) => { banco.filtros.push(['eq', ...args]); return consulta },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        const resposta = banco.respostas.shift()
        if (!resposta) return Promise.reject(new Error('Consulta extra não prevista')).then(ok, falha)
        return Promise.resolve(resposta).then(ok, falha)
      },
    }
    return consulta
  } },
}))

beforeEach(() => { banco.respostas = []; banco.selecoes = []; banco.filtros = [] })

const ausente = (code: string) => ({ code, message: 'Coluna ainda não disponível' })

describe('lerTicketsWhatsApp — consulta tolerante', () => {
  it('lê origem e resolução quando o banco tem tudo', async () => {
    const linhas = [{ id: 't1', wa_origem_mensagem_id: 'm1', wa_reaberta_em: null, wa_resolvida_manualmente: false, wa_resolucao_metodo: 'ia' }]
    banco.respostas.push({ data: linhas, error: null })
    expect(await lerTicketsWhatsApp()).toEqual(linhas)
    expect(banco.selecoes).toHaveLength(1)
    expect(banco.selecoes[0]).toContain('wa_resolucao_metodo')
    expect(banco.filtros).toEqual([['not', 'wa_origem_mensagem_id', 'is', null]])
  })

  it('filtra pelo cliente quando pedido', async () => {
    banco.respostas.push({ data: [], error: null })
    await lerTicketsWhatsApp('cliente-a')
    expect(banco.filtros).toContainEqual(['eq', 'cliente_id', 'cliente-a'])
  })

  it('pede as colunas da sugestão da Íris na primeira consulta', async () => {
    banco.respostas.push({ data: [], error: null })
    await lerTicketsWhatsApp()
    expect(banco.selecoes[0]).toContain('wa_sugestao_em')
    expect(banco.selecoes[0]).toContain('wa_sugestao_razao')
  })

  it.each(['42703', 'PGRST204'])('sem as colunas da sugestão, mantém a resolução (%s)', async (code) => {
    const linhas = [{ id: 't1', wa_origem_mensagem_id: 'm1', wa_reaberta_em: null, wa_resolvida_manualmente: false, wa_resolucao_metodo: 'ia' }]
    banco.respostas.push({ data: null, error: ausente(code) }, { data: linhas, error: null })
    expect(await lerTicketsWhatsApp()).toEqual(linhas)
    expect(banco.selecoes).toHaveLength(2)
    expect(banco.selecoes[1]).toContain('wa_resolucao_metodo')
    expect(banco.selecoes[1]).not.toContain('wa_sugestao')
  })

  it.each(['42703', 'PGRST204'])('sem os campos de resolução, mantém a origem (%s)', async (code) => {
    const linhas = [{ id: 't1', wa_origem_mensagem_id: 'm1', wa_reaberta_em: null, wa_resolvida_manualmente: false }]
    banco.respostas.push({ data: null, error: ausente(code) }, { data: null, error: ausente(code) }, { data: linhas, error: null })
    expect(await lerTicketsWhatsApp()).toEqual(linhas)
    expect(banco.selecoes).toHaveLength(3)
    expect(banco.selecoes[2]).not.toContain('wa_resolucao_metodo')
    expect(banco.selecoes[2]).not.toContain('wa_sugestao')
  })

  it('sem a ponte do WhatsApp, devolve vazio sem quebrar a lista', async () => {
    banco.respostas.push(
      { data: null, error: ausente('42703') }, { data: null, error: ausente('42703') }, { data: null, error: ausente('42703') },
    )
    expect(await lerTicketsWhatsApp()).toEqual([])
  })

  it('não esconde falha de permissão no meio da cadeia', async () => {
    const erro = { code: '42501', message: 'Permissão negada' }
    banco.respostas.push({ data: null, error: ausente('42703') }, { data: null, error: erro })
    await expect(lerTicketsWhatsApp()).rejects.toEqual(erro)
  })

  it('não esconde falha de permissão como ausência de colunas', async () => {
    const erro = { code: '42501', message: 'Permissão negada' }
    banco.respostas.push({ data: null, error: erro })
    await expect(lerTicketsWhatsApp()).rejects.toEqual(erro)
  })
})

const msg = (id: string): MensagemDaConversa => ({
  id, conversation_id: 'c', conteudo: id, tipo: 'texto', criado_em: id,
  autor_tipo: 'cliente', autor_nome: null, enviado_por_agente: false, enviado_por_ia: false,
})

describe('juntarTrechos', () => {
  it('ordena antes → origem → depois, sem repetir as recentes', () => {
    const r = juntarTrechos([msg('a2'), msg('a1')], msg('o'), [msg('d1'), msg('d2')], [msg('d2'), msg('d1')])
    expect(r.mensagens.map((m) => m.id)).toEqual(['a1', 'a2', 'o', 'd1', 'd2'])
    expect(r.intervaloApos).toBeNull()
  })

  it('marca o salto quando a conversa é longa demais', () => {
    const depois = Array.from({ length: 40 }, (_, i) => msg(`d${String(i).padStart(2, '0')}`))
    const recentes = [msg('z2'), msg('z1')]
    const r = juntarTrechos([], msg('o'), depois, recentes)
    expect(r.mensagens.at(-1)?.id).toBe('z2')
    expect(r.intervaloApos).toBe(40)
  })
})

describe('statusDaDemanda', () => {
  const etapas = [
    { id: 'e1', nome: 'Solicitado', ordem: 1, is_final: false },
    { id: 'e9', nome: 'Publicado', ordem: 9, is_final: true },
  ]
  const wa = (aguardandoResposta: boolean | null, reabertaEm: string | null = null): WhatsAppDoTicket => ({
    demandaId: 't', origemMensagemId: 'm', reabertaEm, resolvidaManualmente: false,
    conversaId: 'c', contatoId: 'k', textoOrigem: 'oi', tipoOrigem: 'texto',
    aguardandoResposta, ultimaMsgClienteEm: null, conversaAtualizadaEm: null,
  })

  it('usa a conversa nos tickets do WhatsApp', () => {
    const d = { id: 't', etapa_id: 'e1', concluida_em: null, etapa: { is_final: false } }
    expect(statusDaDemanda(d, wa(true), etapas)).toBe('aguardando_equipe')
    expect(statusDaDemanda(d, wa(false), etapas)).toBe('aguardando_cliente')
    expect(statusDaDemanda(d, wa(null), etapas)).toBe('aberto')
    expect(statusDaDemanda(d, wa(false, '2026-11-06T10:00:00Z'), etapas)).toBe('reaberto')
  })

  it('etapa final é resolvido; sem WhatsApp usa a etapa', () => {
    expect(statusDaDemanda({ id: 't', etapa_id: 'e9', concluida_em: null, etapa: { is_final: true } }, wa(true), etapas)).toBe('resolvido')
    expect(statusDaDemanda({ id: 't', etapa_id: 'e1', concluida_em: null }, undefined, etapas)).toBe('aberto')
  })
})

describe('payloadEditavelDemanda', () => {
  it('nunca envia campos protegidos ao salvar', () => {
    const payload = payloadEditavelDemanda({
      etapa_id: 'e1', prioridade: 'alta', concluida_em: '2026-11-06', wa_origem_mensagem_id: 'm',
      wa_resolucao_metodo: 'ia', codigo: 'DEM-1', cliente: { nome: 'x' }, responsavel_id: null,
    })
    expect(payload).toEqual({ etapa_id: 'e1', prioridade: 'alta', responsavel_id: null })
  })
})
