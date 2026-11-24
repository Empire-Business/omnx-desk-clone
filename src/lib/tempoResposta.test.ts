import { describe, expect, it } from 'vitest'
import {
  anoTempoResposta, conferirPainelTempoResposta, filtrarEpisodiosTempoResposta,
  lerFeriadosTempoResposta, minutosTempoResposta, situacaoTempoResposta, validarConfigTempoResposta,
  resultadosTitularesTempoResposta,
  type EpisodioTempoResposta, type PainelTempoResposta,
} from './tempoResposta'

const escopo = { actorId: 'ator-a', tenantId: 'tenant-a' }
const episodio = (extra: Partial<EpisodioTempoResposta> = {}): EpisodioTempoResposta => ({
  id: 'e1', client_id: 'c1', cliente: 'Empresa Exemplo', conversation_id: 'cv1', inicio: '2026-11-03T12:00:00Z',
  resposta_em: null, respondente: null, responsavel_id: 'u1', responsavel: 'Luís', qualidade: 'confiavel', motivo: null,
  estado: 'aberto', minutos_cliente: 50, minutos_estrategista: 40, minutos_descontados: 10,
  etapa: '50', pausado: false, segmentos: [{ user_id: 'u0', nome: 'Pessoa anterior', inicio: '2026-11-03T12:00:00Z', fim: '2026-11-03T12:20:00Z' }], historico_alertas: [], ...extra,
})
const painel = (): PainelTempoResposta => ({
  ok: true, actor_id: escopo.actorId, tenant_id: escopo.tenantId, agora: '2026-11-03T12:50:00Z',
  config: { modo: 'observacao', feriados: ['2026-11-02'], anos_confirmados: [2026], revisao: 2, monitorando_desde: null },
  episodios: [episodio()], proximo_cursor: null, estrategistas: [], titulares: [], pausas: [], avisos: [],
})

describe('calendário e configuração do painel', () => {
  it('deduplica e ordena feriados explicitamente cadastrados', () => {
    expect(lerFeriadosTempoResposta('2026-12-25\r\n\n2026-11-02\n2026-12-25\n')).toEqual(['2026-11-02', '2026-12-25'])
    expect(lerFeriadosTempoResposta('')).toEqual([])
  })
  it.each(['2026-02-29', '2026-11-31', '02/11/2026', '2026-1-01', '2026-11-02,2026-12-25'])('rejeita feriado inválido %s', (data) => {
    expect(() => lerFeriadosTempoResposta(data)).toThrow(/data/)
  })
  it('exige calendário confirmado apenas ao acompanhar e usa ano de Brasília', () => {
    const c = { ...painel().config, anos_confirmados: [] }
    expect(anoTempoResposta('2027-01-01T01:00:00Z')).toBe(2026)
    expect(validarConfigTempoResposta(c, painel().agora)).toMatch(/confirme o calendário/)
    expect(validarConfigTempoResposta({ ...c, modo: 'desligado' }, painel().agora)).toBeNull()
    expect(validarConfigTempoResposta({ ...c, anos_confirmados: [2026] }, painel().agora)).toBeNull()
  })
})

describe('leitura e filtros da medição', () => {
  it('não apresenta60exatos como atraso e não arredonda atraso curto para60', () => {
    expect(situacaoTempoResposta(episodio({ minutos_cliente: 60 })).texto).toBe('Perto do prazo')
    expect(situacaoTempoResposta(episodio({ minutos_cliente: 60.01 })).texto).toBe('Prazo ultrapassado')
    expect(minutosTempoResposta(60.01)).toBe('Mais de 60 min')
    expect(minutosTempoResposta(null)).toBe('Medição pendente')
  })
  it('incerteza é pendência, mesmo quando há número alto no payload', () => {
    expect(situacaoTempoResposta(episodio({ qualidade: 'inconclusiva', minutos_cliente: 900 })).texto).toBe('Medição pendente')
    expect(filtrarEpisodiosTempoResposta([episodio({ qualidade: 'inconclusiva', minutos_cliente: 900 })], { busca: '', estado: 'atrasado', estrategista: '' })).toEqual([])
    expect(situacaoTempoResposta(episodio({ estado: 'respondido', minutos_cliente: null })).texto).toBe('Medição pendente')
  })
  it('filtra nomes sem acento e preserva filtro de responsável histórico', () => {
    const lista = [episodio(), episodio({ id: 'e2', cliente: 'Outra', responsavel: 'Outra pessoa', responsavel_id: 'u2', segmentos: [] })]
    expect(filtrarEpisodiosTempoResposta(lista, { busca: 'luis', estado: '', estrategista: '' }).map((e) => e.id)).toEqual(['e1'])
    expect(filtrarEpisodiosTempoResposta(lista, { busca: '', estado: '', estrategista: 'u0' }).map((e) => e.id)).toEqual(['e1'])
  })
})

describe('resposta do painel por ator e tenant', () => {
  it('aceita somente o ator e tenant da requisição', () => {
    expect(conferirPainelTempoResposta(painel(), escopo).episodios).toHaveLength(1)
    expect(() => conferirPainelTempoResposta({ ...painel(), actor_id: 'outro' }, escopo)).toThrow(/acesso/)
    expect(() => conferirPainelTempoResposta({ ...painel(), tenant_id: 'outro' }, escopo)).toThrow(/acesso/)
  })
  it('aceita estado da agenda compatível e rejeita valores desconhecidos', () => {
    expect(conferirPainelTempoResposta({ ...painel(), episodios: [episodio({ agenda_status: 'unavailable', qualidade_individual: 'inconclusiva', minutos_estrategista: null })] }, escopo).episodios[0].agenda_status).toBe('unavailable')
    expect(() => conferirPainelTempoResposta({ ...painel(), episodios: [{ ...episodio(), agenda_status: 'livre_com_certeza' }] }, escopo)).toThrow(/medição/)
  })
  it('recusa configurações e medições incompletas sem usá-las no cache', () => {
    expect(() => conferirPainelTempoResposta({ ...painel(), episodios: [episodio({ minutos_cliente: NaN })] }, escopo)).toThrow(/medição/)
    expect(() => conferirPainelTempoResposta({ ...painel(), pausas: undefined }, escopo)).toThrow(/dados esperados/)
    expect(() => conferirPainelTempoResposta({ ...painel(), episodios: Array(101).fill(episodio()) }, escopo)).toThrow(/dados esperados/)
  })
})

describe('resultados por titular na amostra', () => {
  it('separa resposta própria e cobertura por IDs, nunca pelo nome', () => {
    const r = resultadosTitularesTempoResposta([
      episodio({ estado: 'respondido', respondente_id: 'u1', minutos_cliente: 30, minutos_estrategista: 10 }),
      episodio({ id: 'e2', estado: 'respondido', respondente_id: 'apoio', minutos_cliente: 80, minutos_estrategista: 50 }),
      episodio({ id: 'e3', estado: 'respondido', respondente: 'Luís', minutos_cliente: 40, minutos_estrategista: 30 }),
      episodio({ id: 'e4', estado: 'aberto' }),
      episodio({ id: 'e5', estado: 'respondido', qualidade: 'inconclusiva' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ respostas: 3, respostasProprias: 1, coberturas: 1, autoriaPendente: 1, percentualNaMeta: 67, medianaCliente: 40, medianaIndividual: 30 })
  })
  it('não inclui tempo individual inconclusivo na mediana mesmo com número residual', () => {
    const r = resultadosTitularesTempoResposta([episodio({ estado: 'respondido', minutos_cliente: 50, minutos_estrategista: 999, qualidade_individual: 'inconclusiva', agenda_status: 'incomplete' })])
    expect(r[0]).toMatchObject({ medianaCliente: 50, medianaIndividual: null })
  })
  it('não atribui toda a espera ao titular antigo de um segmento e não inventa amostra', () => {
    const r = resultadosTitularesTempoResposta([episodio({ estado: 'respondido', respondente_id: 'u1', minutos_cliente: 60, minutos_estrategista: 10 })])
    expect(r.map((x) => x.responsavelId)).toEqual(['u1'])
    expect(r[0]).toMatchObject({ medianaCliente: 60, medianaIndividual: 10, percentualNaMeta: 100 })
    expect(resultadosTitularesTempoResposta([episodio(), episodio({ estado: 'respondido', minutos_cliente: null })])).toEqual([])
  })
})
