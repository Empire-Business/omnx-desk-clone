import { describe, expect, it } from 'vitest'
import {
  EXEMPLO_RESUMO_SEMANAL, estadoAutomacao, formataDataCurta, formataQuando, infoStatusModelo, juntarPendencias,
  mascaraTelefone, modeloPronto, pendenciasAutomacao, prefixoDia, primeirosPassos, proximoEnvioDiario,
  proximoEnvioSemanal, traduzErroEnvio, type ConfigPendencias, type StatusModeloWa, type TipoModeloWa,
} from './automacoesWa'

// 26/10/2026 é uma segunda-feira. Brasília = UTC-3.
const SEG_08H = new Date('2026-10-26T11:00:00Z') // 08:00 em Brasília
const SEG_10H = new Date('2026-10-26T13:00:00Z') // 10:00 em Brasília
const SEG_23H30 = new Date('2026-10-27T02:30:00Z') // 23:30 de segunda em Brasília

const base: ConfigPendencias = {
  provider: 'uazapi',
  uazapi_instance_id: 'inst-1',
  relatorio_ativo: false,
  resumo_ativo: false,
  resumo_destino: 'privado',
  agendamento_ativo: false,
  template_relatorio: null,
  template_resumo: null,
}
const gestorAtivo = [{ ativo: true }]
const modelo = (tipo: TipoModeloWa, status: StatusModeloWa | null, nome_configurado: string | null = null) =>
  ({ tipo, status, nome: `omnx_${tipo}_v1`, nome_configurado })
const aprovados = [modelo('relatorio', 'APPROVED'), modelo('resumo', 'APPROVED'), modelo('link', 'APPROVED')]

describe('proximoEnvioDiario', () => {
  it('sai hoje se o horário ainda não passou', () => {
    expect(proximoEnvioDiario('09:00', SEG_08H).toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })
  it('vai para amanhã se o horário já passou', () => {
    expect(proximoEnvioDiario('09:00:00', SEG_10H).toISOString()).toBe('2026-10-27T12:00:00.000Z')
  })
  it('usa o dia de Brasília, não o do UTC, perto da meia-noite', () => {
    expect(proximoEnvioDiario('09:00', SEG_23H30).toISOString()).toBe('2026-10-27T12:00:00.000Z')
    expect(proximoEnvioDiario('23:45', SEG_23H30).toISOString()).toBe('2026-10-27T02:45:00.000Z')
  })
  it('horário vazio cai em 09:00', () => {
    expect(proximoEnvioDiario(null, SEG_08H).toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })
})

describe('proximoEnvioSemanal', () => {
  it('mesmo dia, horário ainda por vir', () => {
    expect(proximoEnvioSemanal(1, '09:00', SEG_08H).toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })
  it('mesmo dia, horário passado: semana que vem', () => {
    expect(proximoEnvioSemanal(1, '09:00', SEG_10H).toISOString()).toBe('2026-11-02T12:00:00.000Z')
  })
  it('outros dias da semana', () => {
    expect(proximoEnvioSemanal(3, '09:00', SEG_10H).toISOString()).toBe('2026-10-28T12:00:00.000Z')
    expect(proximoEnvioSemanal(7, '18:30', SEG_10H).toISOString()).toBe('2026-11-01T21:30:00.000Z')
  })
})

describe('formataQuando / formataDataCurta', () => {
  it('hoje, amanhã, dia da semana e data', () => {
    expect(formataQuando(new Date('2026-10-26T12:00:00Z'), SEG_08H)).toBe('hoje às 09:00')
    expect(formataQuando(new Date('2026-10-27T12:00:00Z'), SEG_10H)).toBe('amanhã às 09:00')
    expect(formataQuando(new Date('2026-10-28T12:00:00Z'), SEG_10H)).toBe('quarta, 28/10 às 09:00')
    expect(formataQuando(new Date('2026-11-02T12:00:00Z'), SEG_10H)).toBe('02/11 às 09:00')
    expect(formataQuando(new Date('2026-10-25T13:00:00Z'), SEG_10H)).toBe('ontem às 10:00')
  })
  it('data curta do histórico no fuso de Brasília', () => {
    expect(formataDataCurta('2026-10-26T13:00:00Z')).toBe('26/10 às 10:00')
    expect(formataDataCurta('2026-10-27T02:30:00Z')).toBe('26/10 às 23:30')
    expect(formataDataCurta(null)).toBe('')
    expect(formataDataCurta('xyz')).toBe('')
  })
})

describe('pendenciasAutomacao', () => {
  it('tudo pronto na não oficial', () => {
    expect(pendenciasAutomacao(base, gestorAtivo, { zernioConectado: false }, undefined)).toEqual([])
  })
  it('sem número: relatório, resumo e link travam', () => {
    const p = pendenciasAutomacao({ ...base, uazapi_instance_id: null }, gestorAtivo, { zernioConectado: false }, undefined)
    expect(p.map((x) => x.automacao).sort()).toEqual(['link', 'relatorio', 'resumo'])
    expect(p.every((x) => x.aba === 'conexao')).toBe(true)
  })
  it('relatório sem gestor ativo', () => {
    const p = pendenciasAutomacao(base, [{ ativo: false }], { zernioConectado: false }, undefined)
    expect(p).toEqual([{ automacao: 'relatorio', texto: 'cadastrar quem recebe o relatório', aba: 'relatorio' }])
  })
  it('oficial sem conexão e sem textos aprovados', () => {
    const p = pendenciasAutomacao({ ...base, provider: 'zernio' }, gestorAtivo, { zernioConectado: false },
      [modelo('relatorio', 'PENDING'), modelo('resumo', null)])
    const textos = p.map((x) => `${x.automacao}:${x.texto}`)
    expect(textos).toContain('relatorio:conectar o WhatsApp Oficial')
    expect(textos).toContain('relatorio:aprovar o texto do relatório na Meta')
    expect(textos).toContain('resumo:aprovar o texto do resumo na Meta')
  })
  it('oficial com resumo no grupo: avisa que só sai no privado', () => {
    const p = pendenciasAutomacao({ ...base, provider: 'zernio', resumo_destino: 'grupo' }, gestorAtivo,
      { zernioConectado: true }, aprovados)
    expect(p).toEqual([{ automacao: 'resumo', texto: 'no WhatsApp Oficial o resumo só sai no privado', aba: 'resumo' }])
  })
  it('oficial tudo certo; reuniões ainda precisam do número do Chat', () => {
    const cfg = { ...base, provider: 'zernio' as const }
    expect(pendenciasAutomacao(cfg, gestorAtivo, { zernioConectado: true }, aprovados)).toEqual([])
    const sem = pendenciasAutomacao({ ...cfg, uazapi_instance_id: null }, gestorAtivo, { zernioConectado: true }, aprovados)
    expect(sem).toEqual([{ automacao: 'link', texto: 'escolher o número para grupos', aba: 'conexao' }])
  })
  it('config ausente = não oficial sem nada', () => {
    const p = pendenciasAutomacao(null, [], { zernioConectado: false }, undefined)
    expect(p.length).toBeGreaterThan(0)
  })
})

describe('modeloPronto', () => {
  it('aprovado no catálogo', () => {
    expect(modeloPronto(aprovados, 'relatorio')).toBe(true)
    expect(modeloPronto([modelo('relatorio', 'PENDING')], 'relatorio')).toBe(false)
  })
  it('texto próprio configurado conta como pronto', () => {
    expect(modeloPronto([modelo('relatorio', 'NAO_CRIADO', 'meu_texto')], 'relatorio')).toBe(true)
    expect(modeloPronto([modelo('relatorio', 'PENDING', 'omnx_relatorio_v1')], 'relatorio')).toBe(false)
  })
  it('catálogo não carregado: vale o nome salvo', () => {
    expect(modeloPronto(undefined, 'relatorio', 'omnx_aviso_diario_v1')).toBe(true)
    expect(modeloPronto(undefined, 'relatorio', null)).toBe(false)
  })
})

describe('estadoAutomacao', () => {
  const pend = [{ automacao: 'relatorio' as const, texto: 'cadastrar quem recebe o relatório', aba: 'relatorio' as const }]
  it('quatro estados', () => {
    expect(estadoAutomacao(true, [])).toEqual({ tipo: 'ligado' })
    expect(estadoAutomacao(false, [])).toEqual({ tipo: 'desligado' })
    expect(estadoAutomacao(true, pend)).toEqual({ tipo: 'ligado_sem_envio', motivo: 'cadastrar quem recebe o relatório' })
    expect(estadoAutomacao(false, pend)).toEqual({ tipo: 'falta_configurar', motivo: 'cadastrar quem recebe o relatório' })
  })
  it('junta as pendências numa frase, sem repetir', () => {
    const p = (texto: string) => ({ automacao: 'relatorio' as const, texto, aba: 'conexao' as const })
    expect(juntarPendencias([p('a')])).toBe('a')
    expect(juntarPendencias([p('a'), p('b'), p('a'), p('c')])).toBe('a, b e c')
  })
})

describe('primeirosPassos', () => {
  const entrada = {
    provider: 'uazapi' as const, conectado: true, textosAprovados: false, testeEnviado: false,
    gestoresAtivos: 0, relatorioAtivo: false,
  }
  it('não oficial: 4 passos (sem textos aprovados)', () => {
    const p = primeirosPassos(entrada)
    expect(p.map((x) => x.chave)).toEqual(['conexao', 'teste', 'gestores', 'relatorio'])
    expect(p.map((x) => x.feito)).toEqual([true, false, false, false])
  })
  it('oficial: 5 passos', () => {
    const p = primeirosPassos({ ...entrada, provider: 'zernio', textosAprovados: true, gestoresAtivos: 2 })
    expect(p.map((x) => x.chave)).toEqual(['conexao', 'textos', 'teste', 'gestores', 'relatorio'])
    expect(p.filter((x) => x.feito).map((x) => x.chave)).toEqual(['conexao', 'textos', 'gestores'])
  })
})

describe('mascaraTelefone', () => {
  it('formata enquanto digita', () => {
    expect(mascaraTelefone('')).toBe('')
    expect(mascaraTelefone('1')).toBe('(1')
    expect(mascaraTelefone('119')).toBe('(11) 9')
    expect(mascaraTelefone('1199999')).toBe('(11) 9999-9')
    expect(mascaraTelefone('1133334444')).toBe('(11) 3333-4444')
    expect(mascaraTelefone('11999998888')).toBe('(11) 99999-8888')
  })
  it('descarta o 55, letras e o excesso', () => {
    expect(mascaraTelefone('+55 11 99999-8888')).toBe('(11) 99999-8888')
    expect(mascaraTelefone('11999998888123')).toBe('(11) 99999-8888')
  })
})

describe('textos da tela', () => {
  it('prefixo do dia concorda com o gênero', () => {
    expect(prefixoDia(1)).toBe('toda')
    expect(prefixoDia(6)).toBe('todo')
    expect(prefixoDia(7)).toBe('todo')
  })
  it('selos dos textos aprovados', () => {
    expect(infoStatusModelo('APPROVED').rotulo).toBe('Aprovado')
    expect(infoStatusModelo('PENDING').rotulo).toBe('Em análise')
    expect(infoStatusModelo('REJECTED').rotulo).toBe('Reprovado')
    expect(infoStatusModelo('NAO_CRIADO')).toMatchObject({ rotulo: 'Não enviado', podeCriar: true })
    expect(infoStatusModelo(null)).toMatchObject({ rotulo: 'Não verificado', podeCriar: true })
  })
  it('erro do histórico em linguagem simples e com nomes de aba atuais', () => {
    expect(traduzErroEnvio(null)).toBe('')
    expect(traduzErroEnvio('AbortError: timed out')).toMatch(/demorou demais/)
    expect(traduzErroEnvio('HTTP 401 Unauthorized')).toMatch(/chave de acesso/)
    expect(traduzErroEnvio('Ligue o "Agendamento em duas etapas" na aba Agendamento.'))
      .toBe('Ligue o "Permitir enviar o link no grupo pelo WhatsApp" na aba Reuniões.')
    expect(traduzErroEnvio('Número sem WhatsApp.')).toBe('Número sem WhatsApp.')
  })
})

describe('exemplo do resumo semanal', () => {
  it('é o texto do catálogo oficial preenchido com os exemplos', async () => {
    // Import por caminho em variável: o vitest carrega o arquivo do servidor, e o
    // type-check do front não passa a compilar código das edge functions.
    const caminho = '../../supabase/functions/_shared/wa-modelos-oficiais.ts'
    const mod = (await import(/* @vite-ignore */ caminho)) as {
      MODELOS_OFICIAIS: readonly { tipo: string }[]
      previaModelo: (m: unknown) => string
    }
    const resumo = mod.MODELOS_OFICIAIS.find((m) => m.tipo === 'resumo')
    expect(resumo).toBeTruthy()
    expect(EXEMPLO_RESUMO_SEMANAL).toBe(mod.previaModelo(resumo))
  })
})
