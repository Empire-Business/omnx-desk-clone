import { describe, expect, it } from 'vitest'
import {
  type EntradaGatilho, chamouPeloNome, detectarGatilho, ehNumeroDoAgente, ehTipoAudio, extrairDadosMensagem,
  gatilhoComAudio, lidsDosNumeros, tipoAcionaAgente, validarNomeAgente,
} from './wa-agente-gatilho.ts'

// Números fictícios.
const TEL_AGENTE = '551100009900'
const LID_AGENTE = '111222333444555@lid'
const LID_OUTRO = '999888777666555@lid'

const base = (x: Partial<EntradaGatilho>): EntradaGatilho => ({
  texto: '',
  mencionados: [],
  quotedId: null,
  quotedParticipante: null,
  ehGrupo: true,
  nomeAgente: 'Ana',
  numerosInstancia: [TEL_AGENTE, LID_AGENTE],
  idsRespostasAgente: [],
  ...x,
})

describe('detectarGatilho — privado', () => {
  it('privado aciona sempre (quem chama já conferiu que é membro)', () => {
    expect(detectarGatilho(base({ ehGrupo: false, texto: 'quantos alertas hoje' }))).toBe('privado')
    expect(detectarGatilho(base({ ehGrupo: false, texto: '' }))).toBe('privado')
  })
})

describe('detectarGatilho — menção', () => {
  it('@menção por LID (formato real do grupo)', () => {
    expect(detectarGatilho(base({ texto: '@111222333444555 alertas?', mencionados: [LID_AGENTE] }))).toBe('mencao')
  })
  it('@menção por LID com aparelho', () => {
    expect(detectarGatilho(base({ texto: 'oi', mencionados: ['111222333444555:3@lid'] }))).toBe('mencao')
  })
  it('@menção por telefone, com ou sem o 9º dígito', () => {
    expect(detectarGatilho(base({ texto: 'x', mencionados: [`${TEL_AGENTE}@s.whatsapp.net`] }))).toBe('mencao')
    const cel = base({ numerosInstancia: ['5511987654321'], texto: 'x', mencionados: ['551187654321@s.whatsapp.net'] })
    expect(detectarGatilho(cel)).toBe('mencao')
  })
  it('menção a OUTRA pessoa não aciona', () => {
    expect(detectarGatilho(base({ texto: '@999888777666555 olha isso', mencionados: [LID_OUTRO] }))).toBeNull()
  })
  it('telefone digitado com @ conta como menção', () => {
    expect(detectarGatilho(base({ texto: 'oi @551100009900 tudo bem' }))).toBe('mencao')
    expect(detectarGatilho(base({ texto: 'oi @111222333444555' }))).toBe('mencao')
    expect(detectarGatilho(base({ texto: 'liga pro @5511999990000' }))).toBeNull()
  })
  it('sem números do assistente, menção não aciona', () => {
    expect(detectarGatilho(base({ numerosInstancia: [], texto: 'x', mencionados: [LID_AGENTE] }))).toBeNull()
  })
})

describe('detectarGatilho — quote', () => {
  it('citação de mensagem conhecida do assistente', () => {
    expect(detectarGatilho(base({ texto: 'e esse?', quotedId: 'ABC123', idsRespostasAgente: ['ABC123'] }))).toBe('quote')
    expect(detectarGatilho(base({ texto: 'e esse', quotedId: 'ABC123', idsRespostasAgente: new Set(['ABC123']) }))).toBe('quote')
  })
  it('citação cujo autor é o número do assistente (ex.: relatório diário)', () => {
    expect(detectarGatilho(base({ texto: 'detalha', quotedId: 'XYZ', quotedParticipante: LID_AGENTE }))).toBe('quote')
  })
  it('citação de outra pessoa não aciona', () => {
    expect(detectarGatilho(base({ texto: 'concordo', quotedId: 'XYZ', quotedParticipante: LID_OUTRO }))).toBeNull()
    expect(detectarGatilho(base({ texto: 'concordo', quotedId: 'XYZ', idsRespostasAgente: ['OUTRO'] }))).toBeNull()
  })
  it('participante sem citação é ignorado', () => {
    expect(detectarGatilho(base({ texto: 'concordo', quotedId: null, quotedParticipante: LID_AGENTE }))).toBeNull()
  })
})

describe('detectarGatilho — nome', () => {
  const g = (texto: string, nome = 'Ana') => detectarGatilho(base({ texto, nomeAgente: nome }))

  it.each([
    'Ana, quantos alertas hoje?',
    'Ana: alertas de hoje',
    'ana me passa os alertas',
    'ANA, ajuda',
    'Ána, oi',
    '*Ana*, reuniões de amanhã',
    'oi Ana',
    'Oi, Ana! tudo bem?',
    'bom dia Ana me passa a agenda',
    'Boa tarde, ana',
    'e aí Ana',
    '@Ana quais clientes estão insatisfeitos',
    'me passa os alertas, Ana?',
    'valeu, Ana!',
    'obrigado, Ana 🙂',
    'quantos clientes sem resposta hoje Ana?',
    'Ana?',
    '  Ana , me ajuda',
    'Ana',
  ])('aciona: %s', (t) => {
    expect(g(t)).toBe('nome')
  })

  it.each([
    'Ana Maria ligou hoje', // nome composto de pessoa (maiúscula depois)
    'banana com aveia', // dentro de outra palavra
    'falei com a Ana ontem', // nome no meio, sem pergunta
    'Mariana, tudo certo', // outra pessoa
    'anagrama',
    'a ana vai na reunião',
    '',
    'oiana',
  ])('não aciona: %s', (t) => {
    expect(g(t)).toBeNull()
  })

  it('nome composto do assistente', () => {
    expect(g('Ana Clara, alertas?', 'Ana Clara')).toBe('nome')
    expect(g('oi ana   clara', 'Ana Clara')).toBe('nome')
    expect(g('Ana, alertas?', 'Ana Clara')).toBeNull()
  })

  it('nome com acento no cadastro', () => {
    expect(g('Lúcia, oi', 'Lúcia')).toBe('nome')
    expect(g('lucia me ajuda', 'Lúcia')).toBe('nome')
  })

  it('nome vazio/curto nunca aciona', () => {
    expect(g('A, oi', 'A')).toBeNull()
    expect(chamouPeloNome('qualquer coisa?', '')).toBe(false)
    expect(chamouPeloNome('qualquer coisa?', null)).toBe(false)
  })

  it('nome com caractere especial de regex não quebra', () => {
    // Escapado: casa só o texto literal, "." não vira curinga.
    expect(chamouPeloNome('a.b, oi', 'a.b')).toBe(true)
    expect(chamouPeloNome('axb, oi', 'a.b')).toBe(false)
    expect(() => chamouPeloNome('(oi', 'An(a')).not.toThrow()
  })

  it('mensagem gigante não trava', () => {
    const t = 'x '.repeat(50_000) + 'Ana?'
    const ini = Date.now()
    chamouPeloNome(t, 'Ana')
    expect(Date.now() - ini).toBeLessThan(500)
  })
})

describe('detectarGatilho — prioridade', () => {
  it('menção vem antes de quote e nome', () => {
    expect(detectarGatilho(base({ texto: 'Ana, oi', mencionados: [LID_AGENTE], quotedId: 'A', idsRespostasAgente: ['A'] })))
      .toBe('mencao')
  })
  it('quote vem antes do nome', () => {
    expect(detectarGatilho(base({ texto: 'Ana, e esse?', quotedId: 'A', idsRespostasAgente: ['A'] }))).toBe('quote')
  })
  it('grupo sem nada = null', () => {
    expect(detectarGatilho(base({ texto: 'bom dia pessoal' }))).toBeNull()
  })
})

describe('ehNumeroDoAgente', () => {
  it('telefone com/sem 9, LID com aparelho', () => {
    expect(ehNumeroDoAgente('551100009900@s.whatsapp.net', [TEL_AGENTE])).toBe(true)
    expect(ehNumeroDoAgente('111222333444555:9@lid', [LID_AGENTE])).toBe(true)
    expect(ehNumeroDoAgente('5511987654321', ['551187654321'])).toBe(true)
    expect(ehNumeroDoAgente('5511987654321', [LID_AGENTE])).toBe(false)
    expect(ehNumeroDoAgente(null, [TEL_AGENTE])).toBe(false)
  })
  it('LID e telefone com os mesmos dígitos não se confundem', () => {
    expect(ehNumeroDoAgente('551100009900@lid', [TEL_AGENTE])).toBe(false)
  })
})

describe('extrairDadosMensagem (formato real da UAZAPI, valores fictícios)', () => {
  const body = { owner: '551100009900', instanceName: 'Suporte4', EventType: 'messages' }

  it('menção em grupo', () => {
    const msg = {
      chatid: '120363000000000001@g.us', isGroup: true, quoted: '', owner: '551100009900',
      sender_pn: '5521999990000@s.whatsapp.net', sender_lid: '222@lid', sender: '222:5@lid',
      content: { text: '@111222333444555 oi', contextInfo: { mentionedJID: [LID_AGENTE] } },
    }
    expect(extrairDadosMensagem(body, msg)).toEqual({
      remetenteGrupo: '5521999990000', mencionados: [LID_AGENTE], quotedId: null, quotedParticipante: null,
      owner: '551100009900',
    })
  })

  it('citação (quoted + contextInfo.stanzaID/participant)', () => {
    const msg = {
      quoted: 'MSGID123', sender_pn: '5521999990000@s.whatsapp.net',
      content: { text: 'e esse?', contextInfo: { stanzaID: 'MSGID123', participant: LID_AGENTE, quotedMessage: {} } },
    }
    const d = extrairDadosMensagem(body, msg)
    expect(d.quotedId).toBe('MSGID123')
    expect(d.quotedParticipante).toBe(LID_AGENTE)
  })

  it('content em texto (Conversation) e campos ausentes/errados', () => {
    expect(extrairDadosMensagem({}, { content: 'oi', quoted: '', sender_pn: '' })).toEqual({
      remetenteGrupo: null, mencionados: [], quotedId: null, quotedParticipante: null, owner: null,
    })
    expect(extrairDadosMensagem(null, null).mencionados).toEqual([])
    const lixo = extrairDadosMensagem(body, { content: { contextInfo: { mentionedJID: 'não é lista' } }, quoted: 42 })
    expect(lixo.mencionados).toEqual([])
    expect(lixo.quotedId).toBeNull()
  })

  it('limita a 50 menções', () => {
    const muitos = Array.from({ length: 80 }, (_, i) => `${i}@lid`)
    expect(extrairDadosMensagem(body, { content: { contextInfo: { mentionedJID: muitos } } }).mencionados).toHaveLength(50)
  })
})

describe('lidsDosNumeros (participantes de /group/info)', () => {
  it('acha o LID do participante cujo telefone é do assistente (qualquer nome de campo)', () => {
    const info = {
      Participants: [
        { JID: '551100009900@s.whatsapp.net', LID: LID_AGENTE, IsAdmin: false },
        { JID: LID_OUTRO, PhoneNumber: '5521999990000@s.whatsapp.net' },
        { PhoneNumber: '5511987654321@s.whatsapp.net', JID: '777@lid' },
      ],
    }
    expect(lidsDosNumeros(info, [TEL_AGENTE])).toEqual([LID_AGENTE])
    expect(lidsDosNumeros(info, ['551187654321'])).toEqual(['777@lid']) // casa sem o 9
    expect(lidsDosNumeros(info, ['5500000000000'])).toEqual([])
  })
  it('formato inesperado = lista vazia', () => {
    expect(lidsDosNumeros(null, [TEL_AGENTE])).toEqual([])
    expect(lidsDosNumeros({ Participants: 'x' }, [TEL_AGENTE])).toEqual([])
    expect(lidsDosNumeros({ participants: [null, 1, 'a'] }, [TEL_AGENTE])).toEqual([])
    expect(lidsDosNumeros({ Participants: [{ JID: LID_AGENTE }] }, [])).toEqual([])
  })
})

describe('validarNomeAgente (reexportado de wa-agente-como-chamar)', () => {
  it('aceita nome simples e recusa número', () => {
    expect(validarNomeAgente('Ana').ok).toBe(true)
    expect(validarNomeAgente('Ana2').ok).toBe(false)
  })
})

describe('áudio no grupo', () => {
  it('tipos de áudio', () => {
    expect(ehTipoAudio('audio')).toBe(true)
    expect(ehTipoAudio('PTT')).toBe(true)
    expect(ehTipoAudio('texto')).toBe(false)
    expect(ehTipoAudio(null)).toBe(false)
  })
  it('aciona: texto com conteúdo; áudio só no grupo; outras mídias nunca', () => {
    expect(tipoAcionaAgente('texto', 'oi', false)).toBe(true)
    expect(tipoAcionaAgente('texto', '', true)).toBe(false)
    expect(tipoAcionaAgente('audio', null, true)).toBe(true)
    expect(tipoAcionaAgente('audio', null, false)).toBe(false)
    expect(tipoAcionaAgente('imagem', 'legenda', true)).toBe(false)
  })
  it('áudio que CITA mensagem da assistente (aviso diário) → quote', () => {
    const d = detectarGatilho(base({ texto: '', quotedId: 'MSG-AVISO', idsRespostasAgente: ['MSG-AVISO'] }))
    expect(d).toBe('quote')
    expect(gatilhoComAudio(d, { tipo: 'audio', ehGrupo: true, remetenteMembro: false })).toBe('quote')
  })
  it('áudio citando o número da assistente pelo LID → quote', () => {
    expect(detectarGatilho(base({ texto: '', quotedId: 'X', quotedParticipante: LID_AGENTE }))).toBe('quote')
  })
  it('áudio de membro sem menção/citação → "audio" (o responder confere o nome na fala)', () => {
    const d = detectarGatilho(base({ texto: '' }))
    expect(d).toBeNull()
    expect(gatilhoComAudio(d, { tipo: 'audio', ehGrupo: true, remetenteMembro: true })).toBe('audio')
  })
  it('áudio de quem não é membro (grupo "todos veem tudo") sem menção/citação → nada', () => {
    expect(gatilhoComAudio(null, { tipo: 'audio', ehGrupo: true, remetenteMembro: false })).toBeNull()
  })
  it('texto sem gatilho continua sem gatilho; fora do grupo nunca vira "audio"', () => {
    expect(gatilhoComAudio(null, { tipo: 'texto', ehGrupo: true, remetenteMembro: true })).toBeNull()
    expect(gatilhoComAudio(null, { tipo: 'audio', ehGrupo: false, remetenteMembro: true })).toBeNull()
  })
})
