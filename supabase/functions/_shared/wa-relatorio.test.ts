import { describe, expect, it } from 'vitest'
import {
  type DadosRelatorio, LIMIAR_PADRAO, contarRelatorio, partesDoAviso, dataBR, descreverHoras, horaBR,
  limitesDoDia, montarTemplateRelatorio, montarTextoRelatorio, nomeDoCliente, nomeSeguro, normalizarRegras,
  relatorioDevido, semRepetidos,
} from './wa-relatorio.ts'

const base: DadosRelatorio = {
  data: '26/10/2026',
  alertas: {
    sem_resposta: [{ cliente: 'Maria Souza', detalhe: 'esperando há 6h' }],
    pendencia: [{ cliente: 'Ana Lima', detalhe: 'contrato inadimplente' }],
  },
  reunioes: [{ hora: '10:00', cliente: 'João Prado' }],
}

describe('normalizarRegras', () => {
  it('devolve as 4 regras na ordem, com padrão para o que faltar', () => {
    const r = normalizarRegras([{ tipo: 'queda_volume', ativo: true, limiar: '30' }])
    expect(r.map((x) => x.tipo)).toEqual(['sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume'])
    expect(r[3]).toEqual({ tipo: 'queda_volume', ativo: true, limiar: 30 })
    expect(r[0]).toEqual({ tipo: 'sem_resposta', ativo: false, limiar: LIMIAR_PADRAO.sem_resposta })
  })
  it('ignora tipo desconhecido, ativo não booleano e limiar fora da faixa', () => {
    const r = normalizarRegras([
      { tipo: 'apagar_tudo', ativo: true, limiar: 1 },
      { tipo: 'sem_resposta', ativo: 'sim', limiar: -5 },
      null,
    ])
    expect(r[0]).toEqual({ tipo: 'sem_resposta', ativo: false, limiar: 4 })
    expect(r).toHaveLength(4)
  })
})

describe('nomeSeguro', () => {
  it('tira quebra de linha, formatação do WhatsApp e menção', () => {
    expect(nomeSeguro('*Maria*\n_Souza_ @5511')).toBe('Maria Souza 5511')
  })
  it('quebra endereço para não virar link', () => {
    expect(nomeSeguro('https://golpe.com/pix')).toBe('https golpe. com/pix')
    expect(nomeSeguro('loja.xyz')).toBe('loja. xyz')
  })
  it('remove caracteres invisíveis e de inversão de texto', () => {
    expect(nomeSeguro('Ana‮Beto​')).toBe('Ana Beto')
  })
  it('limita o tamanho e devolve null quando nada sobra', () => {
    // Teto de segurança 120 (acima do maior nome do WhatsApp, 100): nome real nunca é cortado.
    expect(nomeSeguro('x'.repeat(100))).toBe('x'.repeat(100))
    expect(Array.from(nomeSeguro('x'.repeat(300)) as string)).toHaveLength(120)
    expect(nomeSeguro(' \n ** ')).toBeNull()
    expect(nomeSeguro(null)).toBeNull()
  })
  it('não deixa placeholder passar', () => {
    expect(nomeSeguro('{{gestor}}')).toBe('gestor')
  })
})

describe('nomeDoCliente', () => {
  it('prefere o cadastro, depois o contato, depois o final do telefone', () => {
    expect(nomeDoCliente('Cliente Cadastro', 'Push Name', '+5511999998888')).toBe('Cliente Cadastro')
    expect(nomeDoCliente(null, 'Push Name', '+5511999998888')).toBe('Push Name')
    expect(nomeDoCliente(null, '  ', '5511999998888')).toBe('Contato sem nome (final 8888)')
    expect(nomeDoCliente(null, null, null)).toBe('Contato sem nome')
  })
})

describe('semRepetidos', () => {
  it('remove cliente + frase iguais, ignorando caixa', () => {
    expect(semRepetidos([
      { cliente: 'Ana', detalhe: 'contrato pausado' },
      { cliente: 'ana', detalhe: 'Contrato pausado' },
      { cliente: 'Ana', detalhe: 'contrato inadimplente' },
    ])).toHaveLength(2)
  })
})

describe('descreverHoras', () => {
  it('horas e dias', () => {
    expect(descreverHoras(5.9)).toBe('5h')
    expect(descreverHoras(30)).toBe('1 dia')
    expect(descreverHoras(50)).toBe('2 dias')
  })
})

describe('datas no fuso de Brasília', () => {
  const t = new Date('2026-10-26T02:30:00Z') // 25/10 23:30 em Brasília
  it('dataBR e horaBR usam o fuso, não o UTC', () => {
    expect(dataBR(t)).toBe('25/10/2026')
    expect(horaBR(t)).toBe('23:30')
  })
  it('limitesDoDia = 00:00 até 00:00 do dia seguinte em Brasília', () => {
    const { inicio, fim } = limitesDoDia(t)
    expect(inicio.toISOString()).toBe('2026-10-25T03:00:00.000Z')
    expect(fim.toISOString()).toBe('2026-10-26T03:00:00.000Z')
  })
  it('limitesDoDia na virada do mês', () => {
    const { fim } = limitesDoDia(new Date('2026-10-31T15:00:00Z'))
    expect(fim.toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })
})

describe('relatorioDevido', () => {
  const as = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00-03:00`)
  it('só depois do horário e dentro da tolerância de 3h', () => {
    expect(relatorioDevido(as('08:59'), '09:00:00')).toBe(false)
    expect(relatorioDevido(as('09:00'), '09:00:00')).toBe(true)
    expect(relatorioDevido(as('11:59'), '09:00')).toBe(true)
    expect(relatorioDevido(as('12:00'), '09:00')).toBe(false)
  })
  it('horário inválido nunca dispara', () => {
    expect(relatorioDevido(as('09:00'), null)).toBe(false)
    expect(relatorioDevido(as('09:00'), 'nove horas')).toBe(false)
    expect(relatorioDevido(as('09:00'), '25:00')).toBe(false)
  })
})

describe('montarTextoRelatorio (não oficial)', () => {
  it('cita clientes dos alertas, data e gestor, ignorando reuniões legadas', () => {
    const t = montarTextoRelatorio('Bruno', base)
    expect(t).toContain('*Aviso diário — 26/10/2026*')
    expect(t).toContain('Bom dia, Bruno!')
    expect(t).toContain('• Maria Souza — esperando há 6h')
    expect(t).toContain('• Ana Lima — contrato inadimplente')
    expect(t).not.toMatch(/reuni|agenda|João Prado|10:00/i)
  })
  it('sem alertas: não afirma que a agenda está vazia', () => {
    const t = montarTextoRelatorio('Bruno', { data: '26/10/2026', alertas: { sem_resposta: [] }, reunioes: [] })
    expect(t).toContain('Nenhum alerta hoje.')
    expect(t).not.toMatch(/reuni|agenda/i)
  })
  it('reuniões legadas preenchidas não mudam o relatório vazio', () => {
    const comLegado = montarTextoRelatorio('Bruno', { ...base, alertas: {} })
    const semLegado = montarTextoRelatorio('Bruno', { ...base, alertas: {}, reunioes: [] })
    expect(comLegado).toBe(semLegado)
    expect(comLegado).toContain('Nenhum alerta hoje.')
    expect(comLegado).not.toMatch(/reuni|agenda|João Prado|10:00/i)
  })
  it('seção longa sai inteira, sem "e mais N"', () => {
    const muitos = Array.from({ length: 13 }, (_, i) => ({ cliente: `Cliente ${i}`, detalhe: 'esperando há 5h' }))
    const t = montarTextoRelatorio('Bruno', { ...base, alertas: { sem_resposta: muitos } })
    expect(t).toContain('*Clientes sem resposta (13)*')
    expect(t).toContain('Cliente 12')
    expect(t).not.toMatch(/e mais \d/)
  })
  it('partesDoAviso: aviso longo vira várias mensagens, sem cortar linha nem perder texto', () => {
    const linhas = Array.from({ length: 200 }, (_, i) => `• Cliente ${i}: esperando há 5h`)
    const texto = `*Clientes sem resposta (200)*\n${linhas.join('\n')}\n\nFim do aviso.`
    const partes = partesDoAviso(texto, 1_000)
    expect(partes.length).toBeGreaterThan(1)
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(1_000)
    const junto = partes.join('\n')
    for (const l of linhas) expect(junto).toContain(l)
    expect(junto).toContain('Fim do aviso.')
    expect(partesDoAviso('curto')).toEqual(['curto'])
    expect(partesDoAviso('  ')).toEqual([])
  })
  it('nome de gestor malicioso não injeta placeholder nem quebra linha', () => {
    const t = montarTextoRelatorio('{{alertas}}\nPIX', base)
    expect(t).toContain('Bom dia, alertas PIX!')
  })
})

describe('montarTemplateRelatorio (oficial)', () => {
  it('3 variáveis numeradas, cada uma em uma linha só, sem agenda legada', () => {
    const o = montarTemplateRelatorio('Bruno', base)
    expect(o.modeloNumerado).toBe(
      'Bom dia, {{1}}! Aviso diário de {{2}}. Alertas: {{3}}. Detalhes no OMNX Desk.')
    expect(o.variaveis[0]).toBe('Bruno')
    expect(o.variaveis[1]).toBe('26/10/2026')
    expect(o.variaveis[2]).toBe('Sem resposta: Maria Souza (esperando há 6h); Pendências: Ana Lima (contrato inadimplente)')
    expect(o.variaveis).toHaveLength(3)
    expect(o.ordem).toEqual(['gestor', 'data', 'alertas'])
    for (const v of o.variaveis) expect(v).not.toMatch(/[\r\n\t]/)
    expect(o.textoPrevia).toContain('Alertas: Sem resposta: Maria Souza')
    expect(o.textoPrevia).not.toMatch(/reuni|agenda|João Prado|10:00/i)
  })
  it('sem alertas: "nenhum" (variável nunca vazia)', () => {
    const o = montarTemplateRelatorio('Bruno', { data: '26/10/2026', alertas: {}, reunioes: [] })
    expect(o.variaveis.slice(2)).toEqual(['nenhum'])
  })
  it('respeita o limite de tamanho do corpo do modelo (1024)', () => {
    const muitos = Array.from({ length: 200 }, (_, i) => ({ cliente: `Cliente com nome comprido ${i}`, detalhe: 'esperando há 12h' }))
    const reunioes = Array.from({ length: 40 }, (_, i) => ({ hora: '10:00', cliente: `Pessoa ${i}` }))
    const o = montarTemplateRelatorio('Bruno', { data: '26/10/2026', alertas: { sem_resposta: muitos, pendencia: muitos }, reunioes })
    expect(o.variaveis[2].length).toBeLessThanOrEqual(600)
    expect(o.variaveis).toHaveLength(3)
    expect(o.textoPrevia).not.toMatch(/reuni|agenda|Pessoa \d|10:00/i)
    expect(o.variaveis[2]).toMatch(/ e mais \d+$/)
    expect(o.textoPrevia.length).toBeLessThanOrEqual(1024)
    // a contagem do "e mais" fecha com o total
    const listados = o.variaveis[2].replace(/ e mais \d+$/, '').split('; ').length
    expect(listados + Number(/ e mais (\d+)$/.exec(o.variaveis[2])?.[1])).toBe(400)
  })
})

describe('contarRelatorio', () => {
  it('conta alertas e mantém zero na chave legada de reuniões', () => {
    expect(contarRelatorio(base)).toEqual({
      sem_resposta: 1, sentimento_negativo: 0, pendencia: 1, queda_volume: 0, grupo_sem_cliente: 0, reunioes: 0,
    })
  })
})
