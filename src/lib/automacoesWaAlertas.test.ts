import { describe, expect, it } from 'vitest'
import {
  agruparAlertas, alertaCobertoPor, ateDaquiDias, formataDesde, montarIgnorado, rotuloModoIgnorado,
  rotuloTipoAlerta, textoOcultos, type AlertaHoje,
} from './automacoesWa'

// 26/10/2026 (segunda). Brasília = UTC-3.
const SEG_10H = new Date('2026-10-26T13:00:00Z') // 10:00 em Brasília
const SEG_23H30 = new Date('2026-10-27T02:30:00Z') // 23:30 de segunda em Brasília

const alerta = (p: Partial<AlertaHoje> = {}): AlertaHoje => ({
  chave_alerta: 'k1',
  tipo: 'sem_resposta',
  cliente: 'Full Sales',
  client_id: 'cli-1',
  contact_id: 'ct-1',
  conversation_id: 'conv-1',
  detalhe: 'Escreveu e ninguém respondeu',
  desde: '2026-10-26T10:00:00Z',
  prioridade: 1,
  ...p,
})

describe('ateDaquiDias', () => {
  it('vai até o fim do dia (Brasília) daqui a N dias', () => {
    // 26/10 + 7 = 02/11, 23:59:59.999 em Brasília = 03/11 02:59:59.999 UTC
    expect(ateDaquiDias(7, SEG_10H)).toBe('2026-11-03T02:59:59.999Z')
    expect(ateDaquiDias(30, SEG_10H)).toBe('2026-11-26T02:59:59.999Z')
  })
  it('usa o dia de Brasília, não o de UTC, perto da meia-noite', () => {
    // 23:30 de segunda em Brasília já é terça em UTC; ainda conta a partir de segunda.
    expect(ateDaquiDias(7, SEG_23H30)).toBe('2026-11-03T02:59:59.999Z')
  })
})

describe('rotuloModoIgnorado', () => {
  it('traduz cada modo', () => {
    expect(rotuloModoIgnorado('resolvido', null)).toBe('resolvido')
    expect(rotuloModoIgnorado('ate_novidade', null)).toBe('até o cliente escrever')
    expect(rotuloModoIgnorado('sempre', null)).toBe('nunca mais')
    expect(rotuloModoIgnorado('xyz', null)).toBe('silenciado')
  })
  it('ate_data mostra o dia em Brasília', () => {
    expect(rotuloModoIgnorado('ate_data', ateDaquiDias(7, SEG_10H), SEG_10H)).toBe('até 02/11')
    expect(rotuloModoIgnorado('ate_data', '2027-01-05T02:59:59Z', SEG_10H)).toBe('até 04/01/2027')
    expect(rotuloModoIgnorado('ate_data', null, SEG_10H)).toBe('por um tempo')
  })
})

describe('rotuloTipoAlerta', () => {
  it('tem título simples para tipos conhecidos, todos e desconhecidos', () => {
    expect(rotuloTipoAlerta('sem_resposta')).toBe('Clientes esperando resposta')
    expect(rotuloTipoAlerta('todos')).toBe('Todos os alertas')
    expect(rotuloTipoAlerta('novo_tipo')).toBe('Outros alertas')
  })
})

describe('montarIgnorado', () => {
  it('resolvido: mesmo tipo, pelo cliente', () => {
    expect(montarIgnorado(alerta(), { acao: 'resolvido' }, SEG_10H)).toEqual({
      tipo: 'sem_resposta', client_id: 'cli-1', contact_id: null, modo: 'resolvido', ate: null, motivo: null,
    })
  })
  it('sem cliente, usa o contato', () => {
    const r = montarIgnorado(alerta({ client_id: null }), { acao: 'ate_novidade' }, SEG_10H)
    expect(r).toMatchObject({ client_id: null, contact_id: 'ct-1', modo: 'ate_novidade' })
  })
  it('silenciar 7 dias grava a data', () => {
    const r = montarIgnorado(alerta(), { acao: 'silenciar', dias: 7 }, SEG_10H)
    expect(r).toMatchObject({ modo: 'ate_data', ate: '2026-11-03T02:59:59.999Z' })
  })
  it('nunca mais: só este tipo ou o cliente inteiro, motivo aparado e limitado', () => {
    const tipo = montarIgnorado(alerta(), { acao: 'nunca', escopo: 'tipo', motivo: '  ' }, SEG_10H)
    expect(tipo).toMatchObject({ tipo: 'sem_resposta', modo: 'sempre', motivo: null })
    const cli = montarIgnorado(alerta(), { acao: 'nunca', escopo: 'cliente', motivo: ' cancelou o contrato ' }, SEG_10H)
    expect(cli).toMatchObject({ tipo: 'todos', modo: 'sempre', motivo: 'cancelou o contrato' })
    const longo = montarIgnorado(alerta(), { acao: 'nunca', escopo: 'tipo', motivo: 'x'.repeat(300) }, SEG_10H)
    expect(longo?.motivo).toHaveLength(200)
  })
  it('sem cliente nem contato não dá para silenciar', () => {
    expect(montarIgnorado(alerta({ client_id: null, contact_id: null }), { acao: 'resolvido' })).toBeNull()
  })
  it('tipo desconhecido: só "nenhum alerta deste cliente"', () => {
    expect(montarIgnorado(alerta({ tipo: 'novo' }), { acao: 'resolvido' })).toBeNull()
    expect(montarIgnorado(alerta({ tipo: 'novo' }), { acao: 'nunca', escopo: 'cliente' })).toMatchObject({ tipo: 'todos' })
  })
})

describe('alertaCobertoPor', () => {
  const a = alerta()
  it('mesmo tipo e cliente', () => {
    expect(alertaCobertoPor(a, { tipo: 'sem_resposta', client_id: 'cli-1', contact_id: null })).toBe(true)
    expect(alertaCobertoPor(a, { tipo: 'pendencia', client_id: 'cli-1', contact_id: null })).toBe(false)
    expect(alertaCobertoPor(a, { tipo: 'todos', client_id: 'cli-1', contact_id: null })).toBe(true)
    expect(alertaCobertoPor(a, { tipo: 'todos', client_id: 'cli-2', contact_id: null })).toBe(false)
  })
  it('por contato', () => {
    expect(alertaCobertoPor(a, { tipo: 'sem_resposta', client_id: null, contact_id: 'ct-1' })).toBe(true)
    expect(alertaCobertoPor(a, { tipo: 'sem_resposta', client_id: null, contact_id: null })).toBe(false)
  })
})

describe('agruparAlertas', () => {
  it('agrupa na ordem fixa, desconhecidos no fim, sem grupos vazios', () => {
    const g = agruparAlertas([
      alerta({ chave_alerta: 'q', tipo: 'queda_volume' }),
      alerta({ chave_alerta: 'x', tipo: 'novo' }),
      alerta({ chave_alerta: 's', tipo: 'sem_resposta' }),
    ])
    expect(g.map((x) => x.tipo)).toEqual(['sem_resposta', 'queda_volume', 'outros'])
    expect(g[2].titulo).toBe('Outros alertas')
  })
  it('ordena por prioridade, depois quem espera há mais tempo, depois nome', () => {
    const g = agruparAlertas([
      alerta({ chave_alerta: 'b', prioridade: 1, desde: '2026-10-25T10:00:00Z', cliente: 'B' }),
      alerta({ chave_alerta: 'a', prioridade: 'alta', desde: '2026-10-26T10:00:00Z' }),
      alerta({ chave_alerta: 'c', prioridade: 1, desde: '2026-10-24T10:00:00Z' }),
      alerta({ chave_alerta: 'd', prioridade: 1, desde: '2026-10-25T10:00:00Z', cliente: 'A' }),
    ])
    expect(g[0].alertas.map((x) => x.chave_alerta)).toEqual(['a', 'c', 'd', 'b'])
  })
  it('lista vazia ou nula', () => {
    expect(agruparAlertas(null)).toEqual([])
    expect(agruparAlertas([])).toEqual([])
  })
})

describe('formataDesde', () => {
  it('relativo até 7 dias, data depois', () => {
    expect(formataDesde('2026-10-26T12:30:00Z', SEG_10H)).toBe('há poucos minutos')
    expect(formataDesde('2026-10-26T08:00:00Z', SEG_10H)).toBe('há 5 h')
    expect(formataDesde('2026-10-25T12:00:00Z', SEG_10H)).toBe('há 1 dia')
    expect(formataDesde('2026-10-23T12:00:00Z', SEG_10H)).toBe('há 3 dias')
    expect(formataDesde('2026-10-12T12:00:00Z', SEG_10H)).toBe('desde 12/10')
    expect(formataDesde(null, SEG_10H)).toBe('')
    expect(formataDesde('lixo', SEG_10H)).toBe('')
  })
})

describe('textoOcultos', () => {
  it('frase amigável, chaves desconhecidas viram "outros"', () => {
    expect(textoOcultos({
      contrato_encerrado: 3, cliente_inativo: 2, fora_da_janela: 1, ignorados_pelo_gestor: 4, duplicado: 2, spam: 1,
    })).toEqual({
      automaticos: '3 com contrato encerrado, 2 clientes inativos, 1 parada há mais de 7 dias e 3 por outros motivos',
      pelo_gestor: 4,
    })
  })
  it('singular e zeros', () => {
    expect(textoOcultos({ cliente_inativo: 1, contrato_encerrado: 0 })).toEqual({ automaticos: '1 cliente inativo', pelo_gestor: 0 })
    expect(textoOcultos({ fora_da_janela: 5 }).automaticos).toBe('5 paradas há mais de 7 dias')
  })
  it('vazio, nulo ou valores inválidos', () => {
    expect(textoOcultos(null)).toEqual({ automaticos: null, pelo_gestor: 0 })
    expect(textoOcultos({ contrato_encerrado: 'x', cliente_inativo: -2 })).toEqual({ automaticos: null, pelo_gestor: 0 })
  })
})
