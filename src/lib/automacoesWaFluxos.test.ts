import { describe, expect, it } from 'vitest'
import {
  dataHoraBrasiliaParaIso, formataDataHoraBrasilia, interpretarEnvioLink, mensagemErroPrevia,
  precisaConfirmarResumo, resumoContagem, validarLinkReuniao, validarMarcacao,
} from './automacoesWa'

describe('dataHoraBrasiliaParaIso', () => {
  it('lê o campo como horário de Brasília (UTC-3)', () => {
    expect(dataHoraBrasiliaParaIso('2026-10-27T14:30')).toBe('2026-10-27T17:30:00.000Z')
    expect(dataHoraBrasiliaParaIso('2026-12-31T23:00')).toBe('2027-01-01T02:00:00.000Z')
  })
  it('recusa vazio, formato errado e datas impossíveis', () => {
    expect(dataHoraBrasiliaParaIso('')).toBeNull()
    expect(dataHoraBrasiliaParaIso('27/10/2026 14:30')).toBeNull()
    expect(dataHoraBrasiliaParaIso('2026-02-31T10:00')).toBeNull()
    expect(dataHoraBrasiliaParaIso('2026-10-27T24:00')).toBeNull()
  })
})

describe('formataDataHoraBrasilia', () => {
  it('mostra no fuso de Brasília', () => {
    expect(formataDataHoraBrasilia('2026-10-27T17:30:00.000Z')).toBe('27/10/2026 às 14:30')
  })
  it('trata vazio e inválido', () => {
    expect(formataDataHoraBrasilia(null)).toBe('')
    expect(formataDataHoraBrasilia('xyz')).toBe('')
  })
})

describe('validarMarcacao', () => {
  const agora = new Date('2026-10-26T12:00:00.000Z')
  const base = { clientId: 'c1', dataHora: '2026-10-27T10:00', duracaoMin: 30 }

  it('aceita e devolve o corpo para a função', () => {
    expect(validarMarcacao(base, agora)).toEqual({
      ok: true,
      valor: { client_id: 'c1', scheduled_at: '2026-10-27T13:00:00.000Z', duracao_min: 30 },
    })
  })
  it('exige cliente, data válida, futuro e até 12 meses', () => {
    expect(validarMarcacao({ ...base, clientId: '' }, agora)).toMatchObject({ ok: false, erro: 'Escolha o cliente da reunião.' })
    expect(validarMarcacao({ ...base, dataHora: '' }, agora).ok).toBe(false)
    expect(validarMarcacao({ ...base, dataHora: '2026-10-25T10:00' }, agora)).toMatchObject({ erro: 'A reunião precisa ser no futuro.' })
    expect(validarMarcacao({ ...base, dataHora: '2027-12-01T10:00' }, agora)).toMatchObject({ erro: 'A reunião precisa ser nos próximos 12 meses.' })
  })
  it('limita a duração entre 15 e 480 minutos', () => {
    expect(validarMarcacao({ ...base, duracaoMin: 10 }, agora).ok).toBe(false)
    expect(validarMarcacao({ ...base, duracaoMin: 481 }, agora).ok).toBe(false)
    expect(validarMarcacao({ ...base, duracaoMin: 480 }, agora).ok).toBe(true)
  })
})

describe('validarLinkReuniao', () => {
  it('vazio é permitido (usa a sala do sistema)', () => {
    expect(validarLinkReuniao('  ')).toEqual({ ok: true, valor: null })
  })
  it('aceita https com domínio', () => {
    expect(validarLinkReuniao(' https://meet.google.com/abc-defg-hij ')).toEqual({ ok: true, valor: 'https://meet.google.com/abc-defg-hij' })
  })
  it('recusa http, IP, usuário/senha, espaços e texto solto', () => {
    expect(validarLinkReuniao('http://meet.google.com/x')).toMatchObject({ ok: false, erro: 'O link precisa começar com https://' })
    expect(validarLinkReuniao('https://10.0.0.1/sala').ok).toBe(false)
    expect(validarLinkReuniao('https://a:b@meet.google.com/x').ok).toBe(false)
    expect(validarLinkReuniao('https://meet.google.com/a b').ok).toBe(false)
    expect(validarLinkReuniao('reunião amanhã').ok).toBe(false)
    expect(validarLinkReuniao(`https://x.com/${'a'.repeat(500)}`).ok).toBe(false)
  })
})

describe('interpretarEnvioLink', () => {
  it('enviado cita o grupo', () => {
    expect(interpretarEnvioLink({ ok: true, status: 'enviado', grupo: { contact_id: 'g', nome: 'Equipe ACME' } }))
      .toEqual({ tipo: 'enviado', texto: 'Link enviado no grupo "Equipe ACME".' })
  })
  it('já enviado', () => {
    expect(interpretarEnvioLink({ ok: true, status: 'ja_enviado', mensagem: 'Já foi.' })).toEqual({ tipo: 'ja_enviado', texto: 'Já foi.' })
  })
  it('pede para escolher o grupo quando vierem opções', () => {
    const grupos = [{ contact_id: 'a', nome: 'A' }, { contact_id: 'b', nome: 'B' }]
    const d = interpretarEnvioLink({ ok: false, status: 'escolher_grupo', error: 'Escolha.', grupos })
    expect(d).toEqual({ tipo: 'escolher_grupo', texto: 'Escolha.', grupos })
    // sem opções não há o que escolher: vira erro comum
    expect(interpretarEnvioLink({ ok: false, status: 'escolher_grupo', error: 'x', grupos: [] }).tipo).toBe('erro')
  })
  it('pede confirmação de reenvio', () => {
    expect(interpretarEnvioLink({ ok: false, status: 'confirmar_reenvio', error: 'Confira.' }))
      .toEqual({ tipo: 'confirmar_reenvio', texto: 'Confira.' })
  })
  it('falhas, incerto e resposta vazia viram erro com texto', () => {
    expect(interpretarEnvioLink({ ok: false, status: 'incerto', error: 'Demorou.' })).toEqual({ tipo: 'erro', texto: 'Demorou.' })
    expect(interpretarEnvioLink({ ok: false, status: 'enviado' }).tipo).toBe('erro')
    expect(interpretarEnvioLink(null).tipo).toBe('erro')
    expect(interpretarEnvioLink({}).texto).toBe('O envio não deu certo.')
  })
})

describe('prévia do relatório', () => {
  it('resume a contagem', () => {
    expect(resumoContagem({ sem_resposta: 0, sentimento_negativo: 0, pendencia: 0, queda_volume: 0, reunioes: 1 }))
      .toBe('nenhum ponto de atenção')
    expect(resumoContagem({ sem_resposta: 2, sentimento_negativo: 0, pendencia: 1, queda_volume: 0, reunioes: 0 }))
      .toBe('2 × cliente sem resposta · 1 × contrato parado')
    expect(resumoContagem(null)).toBe('')
  })
  it('traduz erros técnicos', () => {
    expect(mensagemErroPrevia('forbidden')).toBe('Só o administrador da empresa pode ver a prévia.')
    expect(mensagemErroPrevia(undefined)).toBe('Não foi possível gerar a prévia. Tente de novo.')
    expect(mensagemErroPrevia('Limite de 20 prévias por hora atingido.')).toBe('Limite de 20 prévias por hora atingido.')
  })
})

describe('precisaConfirmarResumo', () => {
  it('confirma ao ligar (qualquer destino) ou ao trocar o destino com o resumo ligado', () => {
    expect(precisaConfirmarResumo({ ativo: false, destino: 'grupo' }, { ativo: true, destino: 'grupo' })).toBe(true)
    expect(precisaConfirmarResumo({ ativo: false, destino: 'privado' }, { ativo: true, destino: 'privado' })).toBe(true)
    expect(precisaConfirmarResumo({ ativo: true, destino: 'privado' }, { ativo: true, destino: 'grupo' })).toBe(true)
    expect(precisaConfirmarResumo({ ativo: true, destino: 'grupo' }, { ativo: true, destino: 'privado' })).toBe(true)
  })
  it('não pergunta ao desligar, ao mexer com ele desligado ou sem mudança', () => {
    expect(precisaConfirmarResumo({ ativo: true, destino: 'grupo' }, { ativo: false, destino: 'grupo' })).toBe(false)
    expect(precisaConfirmarResumo({ ativo: false, destino: 'privado' }, { ativo: false, destino: 'grupo' })).toBe(false)
    expect(precisaConfirmarResumo({ ativo: true, destino: 'grupo' }, { ativo: true, destino: 'grupo' })).toBe(false)
  })
})
