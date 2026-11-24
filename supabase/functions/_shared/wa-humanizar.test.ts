import { describe, expect, it } from 'vitest'
import {
  arrumarEspacos, assinatura, atrasoDigitacaoMs, criarChamadaOpenRouter, desmascarar, humanizarTexto, lerSaidaIa, mascarar,
  montarFallback, montarPrompt, pausaEntreEnviosMs, periodoDoDia, validarTexto,
  type ChamadaIa, type PedidoHumanizacao,
} from './wa-humanizar.ts'
import { TEXTO_TESTE, pedidoLinkReuniao, pedidoTeste } from './wa-humanizar-pedidos.ts'
import { pedidoHumanizacaoRelatorio, type DadosRelatorio } from './wa-relatorio.ts'
import { renderizarTexto } from './wa-mensagem.ts'
import { montarResumo, pedidoHumanizacaoResumo } from '../wa-auto-resumo-semanal/regras.ts'

/** Gerador com semente (mulberry32): testes repetíveis. */
function semente(n: number): () => number {
  let a = n >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MODELO_LINK = 'Olá, {{cliente}}! Segue o link da nossa reunião de {{data}} às {{hora}}:\n{{link}}'
const LINK = 'https://meet.google.com/abc-defg-hij'

function pedidoLink(periodo: 'manha' | 'tarde' | 'noite' = 'tarde'): PedidoHumanizacao {
  const textoBase = renderizarTexto(MODELO_LINK, { cliente: 'Padaria Sol', data: '30/10/2026', hora: '14:30', link: LINK })
  return pedidoLinkReuniao({ textoBase, cliente: 'Padaria Sol', data: '30/10/2026', hora: '14:30', link: LINK, periodo })
}

const BOA = `Oi, Padaria Sol! Boa tarde.\nNossa reunião ficou para 30/10/2026 às 14:30. O link para entrar é este:\n${LINK}\nAté lá!`

const dadosRelatorio: DadosRelatorio = {
  data: '26/10/2026',
  alertas: {
    sem_resposta: [
      { cliente: 'Maria Souza', detalhe: 'esperando há 5h' },
      { cliente: 'João Lima', detalhe: 'esperando há 2 dias' },
    ],
    pendencia: [{ cliente: 'Loja Azul', detalhe: 'contrato pausado' }],
  },
  reunioes: [{ hora: '14:30', cliente: 'Pessoa exclusiva da agenda' }],
}

const dadosResumo = {
  cliente: 'Maria Souza',
  periodo: '19/10 a 26/10',
  temas: ['Calendário de posts', 'Ajuste do anúncio de outubro'],
  proximos: ['Equipe envia as artes revisadas'],
}

function pedidoResumo(origem: 'privado' | 'grupo' = 'privado'): PedidoHumanizacao {
  const { modelo, valores } = montarResumo('uazapi', origem, dadosResumo)
  return pedidoHumanizacaoResumo(origem, renderizarTexto(modelo, valores), dadosResumo, 'manha')
}

const iaQueResponde = (...respostas: Array<string | null>): ChamadaIa & { chamadas: number } => {
  const f = (async () => {
    const r = respostas[Math.min(f.chamadas, respostas.length - 1)]
    f.chamadas++
    return r
  }) as ChamadaIa & { chamadas: number }
  f.chamadas = 0
  return f
}

describe('validarTexto — o que a IA não pode mudar', () => {
  const p = pedidoLink()
  const ok = (t: string) => validarTexto(t, p, { modo: 'ia' })

  it('aceita uma reescrita natural com todos os fatos', () => {
    expect(ok(BOA)).toEqual({ ok: true })
  })

  it.each([
    ['nome do cliente sumiu', BOA.replace('Padaria Sol', 'pessoal')],
    ['link alterado', BOA.replace(LINK, 'https://meet.google.com/abc-defg-hix')],
    ['data alterada', BOA.replace('30/10/2026', '31/10/2026')],
    ['hora alterada', BOA.replace('14:30', '15:30')],
  ])('recusa: %s', (_n, t) => {
    expect(ok(t).ok).toBe(false)
  })

  it.each([
    ['url nova', `${BOA}\nVeja também https://golpe.example.com`, 'url_nova'],
    ['domínio novo sem https', `${BOA}\nMais em promo.com.br`, 'url_nova'],
    ['telefone novo', `${BOA}\nQualquer coisa liga 11 98888-7777`, 'numero_novo'],
    ['e-mail', `${BOA}\nmanda para x@y.com`, 'url_nova'],
    ['menção', `${BOA}\nfala com @fulano`, 'arroba_nova'],
    ['valor em R$ (mesmo com número do base)', BOA.replace('Até lá!', 'Custa R$ 30.'), 'dinheiro_novo'],
    ['número novo', BOA.replace('Até lá!', 'Somos 12 pessoas.'), 'numero_novo'],
    ['marcador de modelo', BOA.replace('Até lá!', '{{fim}}'), 'chaves_ou_colchetes'],
    ['termo de golpe', BOA.replace('Até lá!', 'Me passa o pix para confirmar.'), 'termo_proibido'],
    ['promessa', BOA.replace('Até lá!', 'Garantimos o resultado.'), 'termo_proibido'],
    ['comentário da IA', `Aqui está a mensagem:\n${BOA}`, 'termo_proibido'],
    ['dia da semana inventado', BOA.replace('Até lá!', 'Até sexta!'), 'tempo_relativo'],
    ['amanhã inventado', BOA.replace('Até lá!', 'Até amanhã!'), 'tempo_relativo'],
    ['cumprimento de outro período', BOA.replace('Boa tarde', 'Bom dia'), 'cumprimento_errado'],
    ['markdown', `# Reunião\n${BOA}`, 'markdown'],
    ['emoji demais', `${BOA} 🎉🎉🎉`, 'emoji_demais'],
    ['negrito demais (cliente)', BOA.replace('Até lá!', '*Até* *lá*!'), 'negrito_demais'],
  ])('recusa: %s', (_n, t, motivo) => {
    expect(ok(t)).toEqual({ ok: false, motivo })
  })

  it('recusa % novo e R$ sem número', () => {
    expect(ok(BOA.replace('Até lá!', 'Com desconto de 100%')).ok).toBe(false)
    expect(ok(BOA.replace('Até lá!', 'Sem custo em R$.'))).toEqual({ ok: false, motivo: 'dinheiro_novo' })
  })

  it('recusa texto igual ao base (colado) e igual a um envio recente', () => {
    expect(ok(p.textoBase)).toEqual({ ok: false, motivo: 'igual_base' })
    expect(validarTexto(BOA, p, { modo: 'ia', recentes: new Set([assinatura(BOA)]) })).toEqual({ ok: false, motivo: 'repetido' })
  })

  it('"clique/acesse" só quando o base já tem link', () => {
    const t = pedidoTeste('tarde')
    expect(validarTexto('Oi! Teste das Automações WhatsApp, clique para confirmar.', t, { modo: 'ia' }).ok).toBe(false)
    expect(ok(BOA.replace('O link para entrar é este:', 'É só acessar o link:')).ok).toBe(true)
  })

  it('padrão obrigatório (resumo precisa dizer que é automático)', () => {
    const r = pedidoResumo()
    const sem = 'Oi, Maria Souza! Resumo de 19/10 a 26/10: Calendário de posts; Ajuste do anúncio de outubro. Próximo: Equipe envia as artes revisadas.'
    expect(validarTexto(sem, r, { modo: 'ia' })).toEqual({ ok: false, motivo: 'padrao_ausente' })
    expect(validarTexto(`${sem} Resumo automático; se algo estiver errado, me avisa.`, r, { modo: 'ia' })).toEqual({ ok: true })
  })

  it('assunto do resumo pode começar com minúscula, mas não pode mudar', () => {
    const r = pedidoResumo()
    const t = 'Oi, Maria Souza! De 19/10 a 26/10 falamos de calendário de posts e ajuste do anúncio de outubro. Próximo passo: Equipe envia as artes revisadas. Resumo automático, qualquer erro me avisa.'
    expect(validarTexto(t, r, { modo: 'ia' })).toEqual({ ok: true })
    expect(validarTexto(t.replace('anúncio de outubro', 'anúncio'), r, { modo: 'ia' })).toEqual({ ok: false, motivo: 'fato_ausente' })
  })

  it('relatório: listas voltam literais; moldura livre', () => {
    const r = pedidoHumanizacaoRelatorio('Ana', dadosRelatorio, 'manha', semente(2))
    const m = mascarar(r)!
    const listas = m.marcadores.filter((x) => x.bloco).map((x) => x.valor)
    const certo = `Bom dia, Ana! Aviso de 26/10/2026.\n${listas[1]}\n\n${listas[0]}\nQualquer coisa, está no OMNX Desk.`
    expect(validarTexto(certo, r, { modo: 'ia' })).toEqual({ ok: true })
    // Trocar dois itens de linha (cliente com o motivo de outro) altera o bloco.
    const trocado = certo.replace('Maria Souza', 'XX').replace('João Lima', 'Maria Souza').replace('XX', 'João Lima')
    expect(validarTexto(trocado, r, { modo: 'ia' }).ok).toBe(false)
  })
})

describe('marcadores — nomes, datas e links não vão para a IA', () => {
  it('troca os fatos por [MARCADOR] e devolve os valores exatos', () => {
    const p = pedidoLink()
    const m = mascarar(p)
    expect(m).not.toBeNull()
    if (!m) return
    expect(m.texto).toBe('Olá, [CLIENTE]! Segue o link da nossa reunião de [DATA_HORA]:\n[LINK]')
    expect(m.texto).not.toContain('Padaria')
    expect(m.texto).not.toContain('meet.google')
    const prompt = montarPrompt(p, m)
    expect(prompt.usuario).not.toContain('Padaria Sol')
    expect(prompt.usuario).not.toContain(LINK)
    expect(prompt.sistema).toContain('Boa tarde')
    const des = desmascarar('Oi, [cliente]! Reunião [DATA_HORA].\n[LINK]', m)
    expect(des).toEqual({ ok: true, texto: `Oi, Padaria Sol! Reunião 30/10/2026 às 14:30.\n${LINK}` })
  })

  it('recusa marcador inventado, sumido ou link repetido', () => {
    const m = mascarar(pedidoLink())!
    expect(desmascarar('Oi [CLIENTE] [DATA_HORA] [LINK] [VALOR]', m)).toEqual({ ok: false, motivo: 'marcador_desconhecido' })
    expect(desmascarar('Oi [CLIENTE] [DATA_HORA]', m)).toEqual({ ok: false, motivo: 'marcador_ausente' })
    expect(desmascarar('Oi [CLIENTE] [DATA_HORA] [LINK] [LINK]', m)).toEqual({ ok: false, motivo: 'marcador_repetido' })
  })

  it('não casa no meio de palavra e não recoloca dentro de outro marcador', () => {
    const p: PedidoHumanizacao = {
      ...pedidoLink(),
      textoBase: 'Oi, Ana! Banana Ana Paula',
      fatos: [{ valor: 'Ana', marcador: 'CLIENTE' }, { valor: 'Ana Paula', marcador: 'CLIENTE_2' }],
    }
    expect(mascarar(p)?.texto).toBe('Oi, [CLIENTE]! Banana [CLIENTE_2]')
  })

  it('fato com marcador fora do texto base → null (IA nem é chamada)', () => {
    expect(mascarar({ ...pedidoLink(), fatos: [{ valor: 'Outro', marcador: 'CLIENTE' }] })).toBeNull()
  })

  it('relatório: nomes de clientes não vão para a IA', () => {
    const p = pedidoHumanizacaoRelatorio('Ana', dadosRelatorio, 'manha')
    const m = mascarar(p)!
    for (const n of ['Ana', 'Maria Souza', 'João Lima', 'Loja Azul', '26/10/2026', '14:30', 'esperando', 'contrato pausado']) {
      expect(m.texto).not.toContain(n)
    }
    expect(m.texto.split('\n')).toContain('[ITENS_ALERTAS]')
    expect(m.texto).not.toContain('[ITENS_REUNIOES]')
    expect(p.textoBase).not.toMatch(/reuni|agenda|14:30/i)
    expect(p.fatos.some((f) => f.marcador === 'ITENS_REUNIOES')).toBe(false)
    expect(p.fatosNaMesmaLinha?.flat()).not.toContain('Pessoa exclusiva da agenda')
  })
})

describe('lerSaidaIa', () => {
  it('lê JSON, JSON dentro de texto, tira aspas e espaços', () => {
    expect(lerSaidaIa('{"texto":"Oi!\\n\\n\\n\\nTudo bem?  "}')).toBe('Oi!\n\nTudo bem?')
    expect(lerSaidaIa('```json\n{"texto":"\\"Oi\\""}\n```')).toBe('Oi')
    expect(lerSaidaIa('sem json')).toBeNull()
    expect(lerSaidaIa('{"msg":"x"}')).toBeNull()
  })
  it('arrumarEspacos remove invisíveis e mantém quebras', () => {
    expect(arrumarEspacos('a​ b\r\nc  ')).toBe('a b\nc')
  })
})

describe('fallback determinístico com variação', () => {
  const casos: Array<[string, () => PedidoHumanizacao]> = [
    ['teste', () => pedidoTeste('manha')],
    ['link', () => pedidoLink('noite')],
    ['relatório', () => pedidoHumanizacaoRelatorio('Ana', dadosRelatorio, 'tarde')],
    ['relatório vazio', () => pedidoHumanizacaoRelatorio('Ana', { data: '26/10/2026', alertas: { sem_resposta: [] }, reunioes: [] }, 'manha')],
    ['resumo privado', () => pedidoResumo('privado')],
    ['resumo grupo', () => pedidoResumo('grupo')],
    ['resumo sem próximos', () => {
      const d = { ...dadosResumo, proximos: [] }
      const { modelo, valores } = montarResumo('uazapi', 'privado', d)
      return pedidoHumanizacaoResumo('privado', renderizarTexto(modelo, valores), d, 'noite')
    }],
  ]

  it.each(casos)('%s: sempre válido (fatos preservados) e variado', (_n, criar) => {
    const p = criar()
    const r = semente(7)
    const vistos = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const f = montarFallback(p, { aleatorio: r })
      expect(validarTexto(f.texto, p, { modo: 'fallback' })).toEqual({ ok: true })
      expect(f.texto).not.toBe(p.textoBase)
      for (const fato of p.fatos) expect(f.texto.toLowerCase()).toContain(fato.valor.toLowerCase())
      expect(f.texto).not.toMatch(/\{\{|\}\}|\[[A-Z_0-9]+\]/)
      vistos.add(f.texto)
    }
    expect(vistos.size).toBeGreaterThanOrEqual(8)
  })

  it('nunca repete o que está em "evitar"', () => {
    const p = pedidoLink()
    const evitar = new Set<string>()
    const r = semente(3)
    for (let i = 0; i < 25; i++) {
      const f = montarFallback(p, { aleatorio: r, evitar })
      expect(evitar.has(f.assinatura)).toBe(false)
      evitar.add(f.assinatura)
    }
  })

  it('link: o link sai idêntico e sozinho numa linha', () => {
    const r = semente(11)
    for (let i = 0; i < 20; i++) {
      const t = montarFallback(pedidoLink(), { aleatorio: r }).texto
      expect(t.split('\n')).toContain(LINK)
      expect(t).toContain('Padaria Sol')
    }
  })

  it('variantes quebradas → devolve o texto base (o envio nunca é bloqueado)', () => {
    const p = { ...pedidoLink(), variantes: { saudacoes: ['Oi!'], aberturas: [''], blocos: [['sem link']], fechos: [''] } }
    expect(montarFallback(p).texto).toBe(p.textoBase)
  })
})

describe('humanizarTexto — IA, nova tentativa e fallback', () => {
  const mem = () => new Map<string, string[]>()

  it('IA válida → origem "ia", fatos recolocados', async () => {
    const ia = iaQueResponde(JSON.stringify({ texto: 'Oi, [CLIENTE]! Boa tarde.\nNossa reunião ficou para [DATA_HORA]. O link para entrar é este:\n[LINK]\nAté lá!' }))
    const r = await humanizarTexto(pedidoLink(), { chamarIa: ia, prazoMs: 10_000, memoria: mem() })
    expect(r).toMatchObject({ origem: 'ia', tentativasIa: 1, texto: BOA })
  })

  it('reprovou 1x → tenta de novo e aceita', async () => {
    const ruim = JSON.stringify({ texto: 'Oi, [CLIENTE]! Pix para confirmar [DATA_HORA]\n[LINK]' })
    const boa = JSON.stringify({ texto: 'Olá, [CLIENTE]! Reunião marcada para [DATA_HORA]. Para entrar:\n[LINK]\nAté mais!' })
    const ia = iaQueResponde(ruim, boa)
    const r = await humanizarTexto(pedidoLink(), { chamarIa: ia, prazoMs: 10_000, memoria: mem() })
    expect(r.origem).toBe('ia')
    expect(r.tentativasIa).toBe(2)
    expect(r.motivos).toEqual(['termo_proibido'])
  })

  it('reprovou 2x → fallback válido (link nunca bloqueado)', async () => {
    const ia = iaQueResponde(JSON.stringify({ texto: 'Oi! [LINK]' }))
    const p = pedidoLink()
    const r = await humanizarTexto(p, { chamarIa: ia, prazoMs: 10_000, memoria: mem(), aleatorio: semente(1) })
    expect(r.origem).toBe('fallback')
    expect(ia.chamadas).toBe(2)
    expect(validarTexto(r.texto, p, { modo: 'fallback' })).toEqual({ ok: true })
  })

  it('IA fora (null/erro), sem chave ou sem tempo → fallback', async () => {
    const p = pedidoLink()
    const fora = iaQueResponde(null)
    expect((await humanizarTexto(p, { chamarIa: fora, prazoMs: 10_000, memoria: mem() })).origem).toBe('fallback')
    const lanca: ChamadaIa = () => Promise.reject(new Error('x'))
    expect((await humanizarTexto(p, { chamarIa: lanca, prazoMs: 10_000, memoria: mem() })).origem).toBe('fallback')
    expect((await humanizarTexto(p, { chamarIa: null, prazoMs: 10_000, memoria: mem() })).motivos).toEqual(['ia_indisponivel'])
    const semTempo = iaQueResponde('x')
    const r = await humanizarTexto(p, { chamarIa: semTempo, prazoMs: 0, memoria: mem() })
    expect(r.origem).toBe('fallback')
    expect(semTempo.chamadas).toBe(0)
  })

  it('IA que devolve o texto colado (igual ao base) é recusada', async () => {
    const ia = iaQueResponde(JSON.stringify({ texto: 'Olá, [CLIENTE]! Segue o link da nossa reunião de [DATA_HORA]:\n[LINK]' }))
    const r = await humanizarTexto(pedidoLink(), { chamarIa: ia, prazoMs: 10_000, memoria: mem() })
    expect(r.origem).toBe('fallback')
    expect(r.motivos).toContain('igual_base')
  })

  it('envios seguidos do mesmo tipo nunca saem iguais (memória)', async () => {
    const memoria = mem()
    const r = semente(5)
    const textos = new Set<string>()
    for (let i = 0; i < 15; i++) {
      const h = await humanizarTexto(pedidoTeste('manha'), { chamarIa: null, prazoMs: 0, memoria, aleatorio: r })
      expect(h.texto).not.toBe(TEXTO_TESTE)
      textos.add(h.texto)
    }
    expect(textos.size).toBe(15)
  })
})

describe('ritmo anti-bloqueio', () => {
  it('"digitando…" proporcional ao tamanho, entre 1,5 s e 7 s', () => {
    expect(atrasoDigitacaoMs('oi', () => 0)).toBe(1_500)
    expect(atrasoDigitacaoMs('x'.repeat(5_000), () => 0.99)).toBe(7_000)
    const curto = atrasoDigitacaoMs('x'.repeat(50), () => 0.5)
    const medio = atrasoDigitacaoMs('x'.repeat(120), () => 0.5)
    expect(medio).toBeGreaterThan(curto)
  })
  it('pausa entre envios de 3 a 6 s', () => {
    expect(pausaEntreEnviosMs(() => 0)).toBe(3_000)
    expect(pausaEntreEnviosMs(() => 0.999)).toBeLessThan(6_000)
  })
  it('período do dia no fuso de Brasília', () => {
    expect(periodoDoDia(new Date('2026-10-26T12:00:00Z'))).toBe('manha') // 09h BRT
    expect(periodoDoDia(new Date('2026-10-26T18:00:00Z'))).toBe('tarde') // 15h
    expect(periodoDoDia(new Date('2026-10-26T23:30:00Z'))).toBe('noite') // 20h30
  })
})

// ---------------------------------------------------------------------------
// Auditoria de segurança da humanização (achados A1–A6, LLM-06) — cada caso é a
// prova de conceito do ataque, agora recusado.
// ---------------------------------------------------------------------------
describe('auditoria A1 — relatório: a IA não mexe nas listas', () => {
  const dados: DadosRelatorio = {
    data: '26/10/2026',
    alertas: {
      sem_resposta: [],
      sentimento_negativo: [{ cliente: 'Beta Ltda', detalhe: 'conversa com tom negativo' }],
      pendencia: [{ cliente: 'Acme', detalhe: 'contrato inadimplente' }],
      queda_volume: [],
    },
    reunioes: [],
  }
  const pedido = () => pedidoHumanizacaoRelatorio('Bruno', dados, 'manha', semente(4))

  it('PoC: trocar o motivo ("contrato inadimplente" → "conversa tranquila") é impossível', async () => {
    const p = pedido()
    const m = mascarar(p)!
    // A IA não vê nomes nem motivos: só a moldura e os marcadores das listas.
    expect(m.texto).not.toMatch(/Acme|Beta|inadimplente|negativo/)
    // Ataque do PoC: a IA "inventa" os itens com marcadores de cliente → marcador desconhecido.
    const ataque = 'Bom dia, [GESTOR]! Aviso de [DATA]:\nClientes que pedem atenção (1)\n• [CLIENTE_1] — tudo certo\n• [CLIENTE_2] — conversa tranquila\nDetalhes no OMNX Desk.'
    expect(desmascarar(ataque, m)).toEqual({ ok: false, motivo: 'marcador_desconhecido' })
    // Mesmo pela orquestração completa: sai o fallback, com o motivo real na linha do cliente.
    const r = await humanizarTexto(p, { chamarIa: iaQueResponde(JSON.stringify({ texto: ataque })), prazoMs: 10_000, memoria: new Map(), aleatorio: semente(1) })
    expect(r.origem).toBe('fallback')
    expect(r.texto.split('\n').some((l) => l.includes('Acme') && l.includes('contrato inadimplente'))).toBe(true)
    expect(r.texto).not.toContain('tranquila')
  })

  it('moldura que contradiz a lista, item a mais, bloco quebrado, repetido ou sumido → recusa', () => {
    const p = pedido()
    const m = mascarar(p)!
    const valida = (ia: string) => {
      const d = desmascarar(ia, m)
      return d.ok ? validarTexto(d.texto, p, { modo: 'ia' }) : d
    }
    const ok = 'Oi, [GESTOR]! Resumo de [DATA]:\n[ITENS_ALERTAS]\nMais detalhes lá no OMNX Desk.'
    expect(valida(ok)).toEqual({ ok: true })
    expect(valida(ok.replace('Resumo de [DATA]:', 'Está tudo tranquilo em [DATA]:'))).toEqual({ ok: false, motivo: 'termo_proibido' })
    expect(valida(ok.replace('Resumo de [DATA]:', 'Nenhum alerta sério em [DATA]:'))).toEqual({ ok: false, motivo: 'termo_proibido' })
    expect(valida(ok.replace('Mais detalhes', '• Gama — conversa boa\nMais detalhes'))).toEqual({ ok: false, motivo: 'itens_lista' })
    expect(valida('Oi, [GESTOR]! Em [DATA]: [ITENS_ALERTAS]. Detalhes no OMNX Desk.')).toEqual({ ok: false, motivo: 'bloco_alterado' })
    expect(valida(`${ok}\n[ITENS_ALERTAS]`)).toEqual({ ok: false, motivo: 'marcador_repetido' })
    expect(valida('Oi, [GESTOR]! Resumo de [DATA]:\nDetalhes no OMNX Desk.')).toEqual({ ok: false, motivo: 'marcador_ausente' })
    expect(valida(`${ok}\n[ITENS_REUNIOES]`)).toEqual({ ok: false, motivo: 'marcador_desconhecido' })
  })

  it.each([
    'Reuniões marcadas: nenhuma reunião prevista.',
    'Sem reuniões na agenda.',
    'Agenda do dia sem compromissos.',
  ])('recusa agenda inventada pela IA: %s', async (agenda) => {
    const p = pedidoHumanizacaoRelatorio('Bruno', dadosRelatorio, 'manha', semente(4))
    const m = mascarar(p)!
    expect(m.texto).not.toMatch(/ITENS_REUNIOES|reuni|agenda/i)
    const ataque = `Oi, [GESTOR]! Resumo de [DATA]:\n[ITENS_ALERTAS]\n${agenda}\nMais detalhes no OMNX Desk.`
    const d = desmascarar(ataque, m)
    expect(d.ok).toBe(true)
    if (!d.ok) return
    // Sem "hoje/amanhã" novos: a recusa precisa vir da agenda inventada.
    expect(validarTexto(d.texto, p, { modo: 'ia' })).toEqual({ ok: false, motivo: 'termo_proibido' })
    const r = await humanizarTexto(p, {
      chamarIa: iaQueResponde(JSON.stringify({ texto: ataque })), prazoMs: 10_000, memoria: new Map(), aleatorio: semente(1),
    })
    expect(r.origem).toBe('fallback')
    expect(r.motivos).toContain('termo_proibido')
    expect(r.texto).not.toMatch(/reuni|agenda|14:30/i)
    expect(r.texto).toContain('contrato pausado')
  })

  it('motivo trocado entre clientes ou apagado no texto final → recusa', () => {
    const p = pedido()
    const fb = montarFallback(p, { aleatorio: semente(9) }).texto
    expect(validarTexto(fb, p, { modo: 'fallback' })).toEqual({ ok: true })
    const trocado = fb.replace('contrato inadimplente', 'XX').replace('conversa com tom negativo', 'contrato inadimplente').replace('XX', 'conversa com tom negativo')
    expect(validarTexto(trocado, p, { modo: 'fallback' }).ok).toBe(false)
    expect(validarTexto(fb.replace('contrato inadimplente', 'conversa tranquila'), p, { modo: 'fallback' }).ok).toBe(false)
  })

  it('lista completa (sem "e mais N") e contagem por seção preservadas', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ cliente: `Cliente ${String.fromCharCode(65 + i)}`, detalhe: 'contrato pausado' }))
    const p = pedidoHumanizacaoRelatorio('Bruno', { data: '26/10/2026', alertas: { pendencia: muitos }, reunioes: [] }, 'tarde', semente(5))
    const fb = montarFallback(p, { aleatorio: semente(6) }).texto
    expect(fb).not.toMatch(/e mais \d/)
    expect(fb).toMatch(/12/)
    expect(fb).toContain('Cliente L')
    // Tirar um cliente da lista é recusado (o texto não pode perder fato).
    expect(validarTexto(fb.replace(/^.*Cliente L.*$/m, ''), p, { modo: 'fallback' }).ok).toBe(false)
  })

  it('variação determinística das listas (marcador/formato/títulos) entre envios', () => {
    const bases = new Set<string>()
    for (let i = 0; i < 20; i++) bases.add(pedidoHumanizacaoRelatorio('Bruno', dadosRelatorio, 'manha', semente(i)).textoBase)
    expect(bases.size).toBeGreaterThanOrEqual(5)
  })
})

describe('auditoria A2 — qualquer domínio novo é recusado (comparado inteiro)', () => {
  const p = pedidoLink()
  it.each([
    ['PoC .ru', 'meet-google.ru'],
    ['sufixo no domínio do base', 'meet.google.com.ru'],
    ['TLD fora de lista', 'promo-oficial.click'],
    ['TLD longo', 'suporte.whatsapp-seguranca.support'],
    ['IDN', 'gооgle.com'],
    ['encurtador com caminho', 'bit.ly/abc'],
    ['outro esquema', 'ftp://arquivos.exemplo'],
  ])('recusa: %s', (_n, dominio) => {
    expect(validarTexto(BOA.replace('Até lá!', `Se não abrir, use ${dominio}`), p, { modo: 'ia' })).toEqual({ ok: false, motivo: 'url_nova' })
  })
  it('o link do base continua aceito', () => {
    expect(validarTexto(BOA, p, { modo: 'ia' })).toEqual({ ok: true })
  })
})

describe('auditoria A3 — data/hora juntas e aviso "automático" sem negação', () => {
  it('PoC: data e hora trocadas → recusa', () => {
    const t = `Oi, Padaria Sol! Nossa reunião ficou para 14:30, às 30/10/2026. Link:\n${LINK}`
    expect(validarTexto(t, pedidoLink(), { modo: 'ia' })).toEqual({ ok: false, motivo: 'fato_ausente' })
  })
  it('data e hora vão num marcador só (a IA não tem como inverter)', () => {
    const m = mascarar(pedidoLink())!
    expect(m.texto).toContain('[DATA_HORA]')
    expect(m.texto).not.toMatch(/\[DATA\]|\[HORA\]/)
  })
  it('modelo sem "data às hora" → IA nem é chamada (fallback)', () => {
    const p = pedidoLinkReuniao({ textoBase: `Oi, Padaria Sol! Reunião 30/10/2026, 14:30:\n${LINK}`, cliente: 'Padaria Sol', data: '30/10/2026', hora: '14:30', link: LINK, periodo: 'tarde' })
    expect(mascarar(p)).toBeNull()
  })
  it('resumo: "não é automático" / "feito manualmente" → recusa', () => {
    const r = pedidoResumo()
    const t = 'Oi, Maria Souza! Resumo de 19/10 a 26/10: Calendário de posts; Ajuste do anúncio de outubro. Próximo: Equipe envia as artes revisadas.'
    expect(validarTexto(`${t} Este resumo não é automático.`, r, { modo: 'ia' })).toEqual({ ok: false, motivo: 'padrao_negado' })
    expect(validarTexto(`${t} Nem foi gerado automaticamente.`, r, { modo: 'ia' })).toEqual({ ok: false, motivo: 'padrao_negado' })
    expect(validarTexto(`${t} Feito manualmente, não é resumo automático.`, r, { modo: 'ia' }).ok).toBe(false)
    expect(validarTexto(`${t} Se algo não estiver certo, avise: o resumo é automático.`, r, { modo: 'ia' })).toEqual({ ok: true })
  })
})

describe('auditoria A6 — chaves/colchetes só barram quando não estavam no base', () => {
  it('PoC: nome com chaves → fallback variado (não o texto colado)', () => {
    const b2 = 'Olá, Ana {SP}! Segue o link da nossa reunião de 26/10/2026 às 14:30:\nhttps://meet.google.com/x'
    const p2 = pedidoLinkReuniao({ textoBase: b2, cliente: 'Ana {SP}', data: '26/10/2026', hora: '14:30', link: 'https://meet.google.com/x', periodo: 'tarde' })
    const fb = montarFallback(p2, { aleatorio: semente(3) })
    expect(fb.texto).not.toBe(b2)
    expect(fb.texto).toContain('Ana {SP}')
    expect(validarTexto(fb.texto.replace('Ana {SP}', 'Ana {{SP}}'), p2, { modo: 'fallback' }).ok).toBe(false)
    expect(validarTexto(`${fb.texto} {x}`, p2, { modo: 'fallback' })).toEqual({ ok: false, motivo: 'chaves_ou_colchetes' })
  })
  it('PoC: nome com colchetes → sem IA, mas fallback variado', () => {
    const b3 = 'Olá, Ana [SP]! Segue o link da nossa reunião de 26/10/2026 às 14:30:\nhttps://meet.google.com/x'
    const p3 = pedidoLinkReuniao({ textoBase: b3, cliente: 'Ana [SP]', data: '26/10/2026', hora: '14:30', link: 'https://meet.google.com/x', periodo: 'tarde' })
    expect(mascarar(p3)).toBeNull()
    const fb = montarFallback(p3, { aleatorio: semente(3) })
    expect(fb.texto).not.toBe(b3)
    expect(validarTexto(fb.texto, p3, { modo: 'fallback' })).toEqual({ ok: true })
  })
})

describe('auditoria LLM-06 — OpenRouter sem retenção de dados', () => {
  it('pede provider.data_collection = deny', async () => {
    let corpo: Record<string, unknown> | null = null
    const fetchFn = (async (_u: string, init?: RequestInit) => {
      corpo = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"texto":"x"}' } }] }), { status: 200 })
    }) as unknown as typeof fetch
    const ia = criarChamadaOpenRouter('k', { fetchFn })!
    expect(await ia({ sistema: 's', usuario: 'u', timeoutMs: 5_000, maxTokens: 10 })).toBe('{"texto":"x"}')
    expect(corpo).toMatchObject({ provider: { data_collection: 'deny' } })
  })
})
