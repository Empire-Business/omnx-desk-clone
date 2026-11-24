import { renderToStaticMarkup } from 'react-dom/server'
import { writeFile } from 'node:fs/promises'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EpisodioTempoResposta } from '@/lib/tempoResposta'
import { LinhaTempoResposta, TempoRespostaTab } from './TempoRespostaTab'

const estado = vi.hoisted(() => ({ painel: null as unknown, erro: false }))

vi.mock('@/hooks/useTempoResposta', () => ({
  useAcaoTempoResposta: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEscopoTempoResposta: () => ({ data: { actorId: 'ator-a', tenantId: 'tenant-a' }, isLoading: false, isError: false }),
  usePainelTempoResposta: () => ({ data: estado.painel, isLoading: false, isError: estado.erro, isFetching: false, error: new Error('Acesso não confirmado'), refetch: vi.fn() }),
  erroTempoResposta: (e: Error) => e?.message || 'Falha',
}))
afterEach(() => { estado.painel = null; estado.erro = false })

const base: EpisodioTempoResposta = {
  id: 'e1', client_id: 'c1', cliente: 'Empresa Exemplo', conversation_id: 'cv1', inicio: '2026-11-03T12:00:00Z',
  resposta_em: null, respondente: null, responsavel_id: 'u1', responsavel: 'Pessoa responsável', qualidade: 'confiavel', motivo: null,
  estado: 'aberto', minutos_cliente: 80, minutos_estrategista: 50, minutos_descontados: 30, etapa: '60', pausado: true,
  segmentos: [{ user_id: 'u1', nome: 'Pessoa responsável', inicio: '2026-11-03T12:00:00Z', fim: null }],
  historico_alertas: [{ id: 'a1', etapa: '60', status: 'enviado', created_at: '2026-11-03T13:20:00Z', texto: 'Mensagem exata\n<script>alert(1)</script>' }],
}
const render = (extra: Partial<EpisodioTempoResposta> = {}) => renderToStaticMarkup(<MemoryRouter><LinhaTempoResposta episodio={{ ...base, ...extra }} /></MemoryRouter>)

describe('linha do painel de tempo de resposta', () => {
  it('expõe espera do cliente e desconto individual separadamente', () => {
    const html = render()
    expect(html).toContain('80 min')
    expect(html).toContain('50 min')
    expect(html).toContain('30 min de pausa descontados')
    expect(html).toContain('Prazo ultrapassado')
    expect(html).toContain('Responsável em pausa')
    expect(html).toContain('avisos em pausa')
    expect(html).toContain('Tempo do responsável atual')
  })
  it('mostra desconto da agenda sem afirmar presença em reunião', () => {
    const html = render({ agenda_status: 'connected', qualidade_individual: 'confiavel' })
    expect(html).toContain('Agenda consultada')
    expect(html).toContain('sem confirmar presença em reunião')
    expect(html).not.toContain('Sem agenda conectada')
  })
  it.each(['unavailable', 'incomplete'] as const)('agenda %s não transforma número individual incerto em medição', (agenda_status) => {
    const html = render({ agenda_status, qualidade_individual: 'inconclusiva', minutos_estrategista: 999, minutos_descontados: 888 })
    expect(html).toContain('80 min')
    expect(html).toContain('Medição pendente')
    expect(html).not.toContain('999 min')
    expect(html).not.toContain('888 min')
  })
  it('desconexão informa retomada de avisos pela espera do cliente', () => {
    const html = render({ agenda_status: 'disconnected', qualidade_individual: 'inconclusiva', minutos_estrategista: null, minutos_descontados: null })
    expect(html).toContain('Agenda desconectada')
    expect(html).toContain('os avisos voltam a considerar a espera do cliente')
    expect(html).not.toContain('aguardam a disponibilidade voltar')
  })
  it('backend anterior permanece compatível sem prometer disponibilidade', () => {
    expect(render()).toContain('Sem agenda conectada ou sem informação de sincronização')
  })
  it('exibe a mensagem exata escapada, sem interpretar HTML', () => {
    const html = render()
    expect(html).toContain('Ver mensagem registrada')
    expect(html).toContain('Mensagem exata\n&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('não acusa atraso nem mostra métricas numéricas quando a autoria é inconclusiva', () => {
    const html = render({ qualidade: 'inconclusiva', minutos_cliente: 999, minutos_estrategista: 999 })
    expect(html).toContain('Medição pendente')
    expect(html).not.toContain('999 min')
    expect(html).not.toContain('Prazo ultrapassado')
  })
  it('identifica resposta de apoio pelo autor real', () => {
    const html = render({ estado: 'respondido', resposta_em: '2026-11-03T13:20:00Z', respondente: 'Pessoa de apoio' })
    expect(html).toContain('Pessoa de apoio')
    expect(html).toContain('Respondido após a meta')
  })
  it('não cria link quebrado para conversa sem cliente vinculado', () => {
    expect(render({ client_id: null })).not.toContain('href="/clientes/')
  })
})

describe('painel e dados desatualizados', () => {
  it('oculta o corpo anterior após erro de atualização, mesmo se existir cache', () => {
    estado.erro = true
    estado.painel = { episodios: [base] }
    const html = renderToStaticMarkup(<MemoryRouter><TempoRespostaTab /></MemoryRouter>)
    expect(html).toContain('Acesso não confirmado')
    expect(html).not.toContain('Empresa Exemplo')
  })
  it('indica amostra da página, calendário explícito e nenhum vínculo automático', () => {
    estado.painel = {
      ok: true, actor_id: 'ator-a', tenant_id: 'tenant-a', agora: '2026-11-03T13:20:00Z',
      config: { modo: 'observacao', feriados: [], anos_confirmados: [], revisao: 0, monitorando_desde: null },
      episodios: [base], proximo_cursor: 'e2', estrategistas: [], titulares: [], pausas: [], avisos: [],
    }
    const html = renderToStaticMarkup(<MemoryRouter><TempoRespostaTab /></MemoryRouter>)
    expect(html).toContain('Não são totais de toda a operação')
    expect(html).toContain('Só as datas cadastradas serão descontadas')
    expect(html).toContain('Observar não envia mensagens')
    expect(html).toContain('Próxima página')
    expect(html).toContain('Estrategista')
    expect(html).toContain('casos em que participou')
    expect(html).toContain('mesmo antes de uma troca')
    expect(html).toContain('Não é preciso registrar pausas no dia a dia')
    expect(html).toContain('Pausas manuais (opcional)')
    expect(html).toContain('Iniciar pausa')
    expect(html).toContain('GT3 → Configurações → Minha agenda')
    expect(html).toContain('depende da integração configurada e sincronizada')
  })
  it('preserva a visibilidade e o encerramento de uma pausa anterior ainda ativa', () => {
    estado.painel = {
      ok: true, actor_id: 'ator-a', tenant_id: 'tenant-a', agora: '2026-11-03T13:20:00Z',
      config: { modo: 'observacao', feriados: [], anos_confirmados: [], revisao: 0, monitorando_desde: null },
      episodios: [base], proximo_cursor: null, estrategistas: [], titulares: [], avisos: [],
      pausas: [{ id: 'p1', user_id: 'u1', nome: 'Pessoa responsável', inicio: '2026-11-03T13:00:00Z', fim: '2026-11-03T14:00:00Z', motivo: 'Registro anterior' }],
    }
    const html = renderToStaticMarkup(<MemoryRouter><TempoRespostaTab /></MemoryRouter>)
    expect(html).toContain('Pausas já registradas')
    expect(html).toContain('Registro anterior')
    expect(html).toContain('Encerrar pausa')
    expect(html).toContain('Iniciar pausa')
  })
  it.runIf(process.env.TEMPO_RESPOSTA_PREVIEW === '1')('gera prévia visual isolada com dados fictícios', async () => {
    estado.painel = {
      ok: true, actor_id: 'ator-a', tenant_id: 'tenant-a', agora: '2026-11-03T14:20:00Z',
      config: { modo: 'observacao', feriados: ['2026-11-02', '2026-12-25'], anos_confirmados: [2026], revisao: 1, monitorando_desde: '2026-11-03T12:00:00Z' },
      episodios: [
        { ...base, cliente: 'Ateliê Horizonte', responsavel: 'Marina Costa', historico_alertas: [] },
        { ...base, id: 'e2', client_id: 'c2', cliente: 'Estúdio Aurora', responsavel_id: 'u2', responsavel: 'Rafael Lima', minutos_cliente: 52, minutos_estrategista: 52, minutos_descontados: 0, etapa: '50', pausado: false, historico_alertas: [] },
        { ...base, id: 'e3', client_id: null, cliente: 'Conversa sem vínculo', responsavel_id: null, responsavel: null, qualidade: 'inconclusiva', motivo: 'Confirme o cliente e o responsável para medir esta espera.', minutos_cliente: null, minutos_estrategista: null, minutos_descontados: null, etapa: null, pausado: false, segmentos: [], historico_alertas: [] },
        { ...base, id: 'e4', client_id: 'c3', cliente: 'Casa do Vale', responsavel: 'Marina Costa', estado: 'respondido', resposta_em: '2026-11-03T12:35:00Z', respondente: 'Marina Costa', respondente_id: 'u1', minutos_cliente: 35, minutos_estrategista: 35, minutos_descontados: 0, etapa: '30', pausado: false, historico_alertas: [] },
      ],
      proximo_cursor: 'e5', estrategistas: [{ id: 'u1', nome: 'Marina Costa' }, { id: 'u2', nome: 'Rafael Lima' }],
      titulares: [{ client_id: 'c4', cliente: 'Oficina Brisa', titular_id: null, candidatos: [{ id: 'u1', nome: 'Marina Costa' }, { id: 'u2', nome: 'Rafael Lima' }] }],
      pausas: [{ id: 'p1', user_id: 'u1', nome: 'Marina Costa', inicio: '2026-11-03T14:00:00Z', fim: '2026-11-03T14:30:00Z', motivo: 'Reunião de acompanhamento' }],
      avisos: ['Modo de observação: nenhum aviso está sendo enviado ao GT3.'],
    }
    const corpo = renderToStaticMarkup(<MemoryRouter><TempoRespostaTab /></MemoryRouter>).replace('id="tempo-resposta-config" hidden=""', 'id="tempo-resposta-config"')
    await writeFile('/private/tmp/tempo-resposta-preview.html', `<!doctype html><html lang="pt-BR" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia fictícia — Tempo de resposta</title><style id="preview-css"></style></head><body class="bg-background text-foreground"><main style="max-width:1260px;margin:0 auto;padding:32px 20px"><p style="margin-bottom:24px;padding:12px;border:1px dashed #888;font:14px sans-serif">Prévia visual com dados fictícios. Os botões não salvam nem enviam mensagens.</p>${corpo}</main></body></html>`, 'utf8')
    expect(corpo).toContain('Ateliê Horizonte')
  })
})
