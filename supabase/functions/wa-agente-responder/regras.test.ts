import { describe, expect, it } from 'vitest'
import {
  type EntradaTravas, type Pedido, LIMITE_EMPRESA_DIA, LIMITE_PESSOA_DIA, agruparPedidos, chaveConversa, ehPedidoDeAjuda,
  MOTIVO_ENVIANDO, ORCAMENTO_FUNCAO_MS, PRAZO_MINIMO_CEREBRO_MS, RESERVA_ENVIO_MS, envioFoiInterrompido,
  humanoAssumiu, instanciaDesconectada, juntarPerguntas, prazoDoCerebro, primeiroNome, separarAutorDoGrupo, tetoDaEnv,
  verificarTravas, MAX_DURACAO_AUDIO_S, MAX_TENTATIVAS_AUDIO, PREFIXO_AUDIO, RESERVA_CEREBRO_APOS_AUDIO_MS,
  ROTULO_AUDIO_FALHOU, ROTULO_AUDIO_LONGO, ROTULO_AUDIO_SEM_FALA, TIMEOUT_TRANSCRICAO_MS, contextoDoAudio,
  custoDasAudicoes, decidirAudio, devolverPorAudio, textoDoAudio, timeoutDaTranscricao,
} from './regras.ts'

function pedido(p: Partial<Pedido>): Pedido {
  return {
    id: 'p', tenant_id: 't', instance_uuid: 'i', conversation_id: 'v', chat_message_id: 'm', chat_jid: '5511911112222@s.whatsapp.net',
    eh_grupo: false, membro_id: 'mb1', user_id: 'u1', remetente_chave: null, message_id_wpp: 'w', gatilho: 'privado',
    status: 'processando', created_at: '2026-10-26T12:00:00Z', ...p,
  }
}

describe('debounce (agruparPedidos)', () => {
  it('mesmo chat + mesma pessoa: só o mais novo responde, os outros viram agrupado', () => {
    const r = agruparPedidos([
      pedido({ id: 'a', created_at: '2026-10-26T12:00:01Z' }),
      pedido({ id: 'b', created_at: '2026-10-26T12:00:03Z' }),
      pedido({ id: 'c', created_at: '2026-10-26T12:00:02Z' }),
    ])
    expect(r.processar.map((p) => p.id)).toEqual(['b'])
    expect(r.agrupar.map((p) => p.id).sort()).toEqual(['a', 'c'])
  })
  it('pessoas diferentes no mesmo grupo respondem separadas', () => {
    const g = '120363000000000001@g.us'
    const r = agruparPedidos([
      pedido({ id: 'a', chat_jid: g, membro_id: 'm1', user_id: 'u1' }),
      pedido({ id: 'b', chat_jid: g, membro_id: 'm2', user_id: 'u2' }),
      pedido({ id: 'c', chat_jid: g, membro_id: null, user_id: null, remetente_chave: '5511900000000' }),
    ])
    expect(r.processar).toHaveLength(3)
    expect(r.agrupar).toHaveLength(0)
  })
  it('empresas diferentes nunca se misturam', () => {
    expect(chaveConversa(pedido({ tenant_id: 'a' }))).not.toBe(chaveConversa(pedido({ tenant_id: 'b' })))
  })
})

describe('texto do grupo', () => {
  it('separa "[Autor] pergunta"', () => {
    expect(separarAutorDoGrupo('[Bruno Guzela] Ana, alertas de hoje?')).toEqual({ autor: 'Bruno Guzela', texto: 'Ana, alertas de hoje?' })
    expect(separarAutorDoGrupo('sem autor')).toEqual({ autor: null, texto: 'sem autor' })
  })
  it('junta perguntas e limita o tamanho', () => {
    expect(juntarPerguntas(['oi', '', null, ' tem reunião hoje? '])).toBe('oi\ntem reunião hoje?')
    expect(juntarPerguntas(['a'.repeat(5000)]).length).toBe(4000)
  })
  it('primeiro nome seguro', () => {
    expect(primeiroNome('Bruno Guzela')).toBe('Bruno')
    expect(primeiroNome('*@Bob*\nX')).toBe('Bob')
    expect(primeiroNome('')).toBeNull()
  })
})

describe('ehPedidoDeAjuda', () => {
  it.each([
    'ajuda', 'Ajuda!', 'menu', '/ajuda', 'o que você faz?', 'O que vc faz', 'como te uso?', 'Ana, ajuda', '@Ana menu',
    'oi Ana o que você faz?', 'ajuda, Ana',
  ])('"%s" é ajuda', (t) => expect(ehPedidoDeAjuda(t, 'Ana')).toBe(true))
  it.each(['ajuda com a Maria?', 'quais alertas de hoje?', 'menu do restaurante do cliente', ''])(
    '"%s" não é ajuda', (t) => expect(ehPedidoDeAjuda(t, 'Ana')).toBe(false))
})

describe('humanoAssumiu', () => {
  const agora = new Date('2026-10-26T12:00:00Z')
  it('mensagem de pessoa da equipe (OMNX ou celular) nos últimos 30 min → silêncio', () => {
    expect(humanoAssumiu([{ enviado_por_agente: true, enviado_por_ia: false, fonte_envio: null, criado_em: '2026-10-26T11:45:00Z' }], agora)).toBe(true)
    expect(humanoAssumiu([{ enviado_por_agente: true, enviado_por_ia: false, fonte_envio: 'externo', criado_em: '2026-10-26T11:50:00Z' }], agora)).toBe(true)
  })
  it('respostas do próprio assistente, da IA, antigas ou do membro não contam', () => {
    expect(humanoAssumiu([
      { enviado_por_agente: false, enviado_por_ia: true, fonte_envio: 'assistente', criado_em: '2026-10-26T11:59:00Z' },
      { enviado_por_agente: true, enviado_por_ia: false, fonte_envio: 'assistente', criado_em: '2026-10-26T11:59:00Z' },
      { enviado_por_agente: true, enviado_por_ia: false, fonte_envio: null, criado_em: '2026-10-26T11:20:00Z' },
      { enviado_por_agente: false, enviado_por_ia: false, fonte_envio: null, criado_em: '2026-10-26T11:59:00Z' },
    ], agora)).toBe(false)
  })
})

describe('verificarTravas', () => {
  const ok: EntradaTravas = {
    agenteAtivo: true, appLigado: true, canalLigado: true, membroAtivo: true, ehGrupo: false, grupoLiberado: false,
    grupoInterno: false, grupoAcessoTotal: false, humanoAssumiu: false, usoPessoaHora: 0, usoPessoaDia: 0, usoEmpresaDia: 0, limiteHora: 30,
    custoHojeUsd: 0, tetoDiaUsd: 15,
  }
  it('tudo certo → null', () => expect(verificarTravas(ok)).toBeNull())
  it('ordem: desligado > app > canal > grupo > membro > humano > limites > teto', () => {
    expect(verificarTravas({ ...ok, agenteAtivo: false, appLigado: false })?.motivo).toBe('agente_desligado')
    expect(verificarTravas({ ...ok, appLigado: false })?.motivo).toBe('app_desligado')
    expect(verificarTravas({ ...ok, canalLigado: false })?.motivo).toBe('privado_desligado')
    expect(verificarTravas({ ...ok, ehGrupo: true, canalLigado: false })?.motivo).toBe('grupos_desligados')
    expect(verificarTravas({ ...ok, ehGrupo: true })?.motivo).toBe('grupo_nao_liberado')
    expect(verificarTravas({ ...ok, ehGrupo: true, grupoLiberado: true })?.motivo).toBe('grupo_nao_interno')
    expect(verificarTravas({ ...ok, membroAtivo: false })?.motivo).toBe('nao_membro')
    expect(verificarTravas({ ...ok, humanoAssumiu: true })?.resultado).toBe('humano_assumiu')
    expect(verificarTravas({ ...ok, usoPessoaHora: 30 })).toEqual({ resultado: 'limite', motivo: 'limite_hora' })
    expect(verificarTravas({ ...ok, usoPessoaDia: LIMITE_PESSOA_DIA })?.motivo).toBe('limite_pessoa_dia')
    expect(verificarTravas({ ...ok, usoEmpresaDia: LIMITE_EMPRESA_DIA })?.resultado).toBe('teto')
    expect(verificarTravas({ ...ok, custoHojeUsd: 15 })).toEqual({ resultado: 'teto', motivo: 'teto_custo' })
  })
  it('grupo liberado com "todos veem tudo": remetente não cadastrado pode perguntar', () => {
    expect(verificarTravas({ ...ok, ehGrupo: true, grupoLiberado: true, grupoInterno: true, membroAtivo: false, grupoAcessoTotal: true })).toBeNull()
    expect(verificarTravas({ ...ok, ehGrupo: true, grupoLiberado: true, grupoInterno: true, membroAtivo: false, grupoAcessoTotal: false })?.motivo).toBe('nao_membro')
  })
  it('"todos veem tudo" não libera grupo que deixou de ser interno', () => {
    expect(verificarTravas({ ...ok, ehGrupo: true, grupoLiberado: false, grupoAcessoTotal: true })?.motivo).toBe('grupo_nao_liberado')
    expect(verificarTravas({ ...ok, ehGrupo: true, grupoLiberado: true, grupoInterno: false, grupoAcessoTotal: true })?.motivo).toBe('grupo_nao_interno')
  })
  it('"humano assumiu" só silencia no privado; no grupo interno a equipe conversa normalmente', () => {
    expect(verificarTravas({ ...ok, humanoAssumiu: true })?.motivo).toBe('humano_assumiu')
    expect(verificarTravas({ ...ok, ehGrupo: true, grupoLiberado: true, grupoInterno: true, humanoAssumiu: true })).toBeNull()
  })
  it('privado nunca usa acesso total', () => {
    expect(verificarTravas({ ...ok, membroAtivo: false, grupoAcessoTotal: true })?.motivo).toBe('nao_membro')
  })
  it('limite por hora inválido cai no padrão', () => {
    expect(verificarTravas({ ...ok, limiteHora: 0, usoPessoaHora: 20 })?.motivo).toBe('limite_hora')
    expect(verificarTravas({ ...ok, limiteHora: 0, usoPessoaHora: 19 })).toBeNull()
  })
})

describe('tempo e envio interrompido', () => {
  it('prazo do cérebro = orçamento − gasto − reserva do envio', () => {
    const t0 = 1_000_000
    expect(prazoDoCerebro(t0, t0)).toBe(ORCAMENTO_FUNCAO_MS - RESERVA_ENVIO_MS)
    expect(prazoDoCerebro(t0, t0 + 20_000)).toBe(ORCAMENTO_FUNCAO_MS - RESERVA_ENVIO_MS - 20_000)
    expect(prazoDoCerebro(t0, t0 + 90_000)).toBeLessThan(PRAZO_MINIMO_CEREBRO_MS)
    // Orçamento + reserva cabem nos 150 s do pg_net com folga.
    expect(ORCAMENTO_FUNCAO_MS).toBeLessThanOrEqual(130_000)
  })
  it('pedido marcado "enviando" não é reenviado', () => {
    expect(envioFoiInterrompido({ motivo: MOTIVO_ENVIANDO })).toBe(true)
    expect(envioFoiInterrompido({ motivo: null })).toBe(false)
    expect(envioFoiInterrompido({})).toBe(false)
    expect(envioFoiInterrompido({ motivo: 'mensagem_mais_nova' })).toBe(false)
  })
})

describe('auxiliares', () => {
  it('teto da env', () => {
    expect(tetoDaEnv(undefined)).toBe(15)
    expect(tetoDaEnv('7,5')).toBe(7.5)
    expect(tetoDaEnv('-1')).toBe(15)
    expect(tetoDaEnv('abc')).toBe(15)
  })
  it('instância desconectada', () => {
    expect(instanciaDesconectada('disconnected')).toBe(true)
    expect(instanciaDesconectada('connected')).toBe(false)
    expect(instanciaDesconectada(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Áudio
// ---------------------------------------------------------------------------

describe('áudio — debounce', () => {
  it('pedido de gatilho "audio" não engole a pergunta de texto anterior (os dois seguem)', () => {
    const g = '120363000000000001@g.us'
    const r = agruparPedidos([
      pedido({ id: 'texto', chat_jid: g, eh_grupo: true, gatilho: 'nome', created_at: '2026-10-27T12:00:01Z' }),
      pedido({ id: 'audio', chat_jid: g, eh_grupo: true, gatilho: 'audio', created_at: '2026-10-27T12:00:03Z' }),
    ])
    expect(r.processar.map((p) => p.id).sort()).toEqual(['audio', 'texto'])
    expect(r.agrupar).toHaveLength(0)
  })
  it('áudio que cita a assistente (quote) agrupa como texto', () => {
    const r = agruparPedidos([
      pedido({ id: 'a', gatilho: 'nome', created_at: '2026-10-27T12:00:01Z' }),
      pedido({ id: 'b', gatilho: 'quote', created_at: '2026-10-27T12:00:03Z' }),
    ])
    expect(r.processar.map((p) => p.id)).toEqual(['b'])
  })
})

describe('áudio — rótulos e contexto', () => {
  it('transcrito vira "(áudio transcrito) …"; falhas viram rótulos', () => {
    expect(textoDoAudio({ ok: true, texto: 'Íris, como está a Jane?', custoUsd: 0.001, nova: true }))
      .toBe(`${PREFIXO_AUDIO} Íris, como está a Jane?`)
    expect(textoDoAudio({ ok: false, erro: 'longo_demais', custoUsd: 0 })).toBe(ROTULO_AUDIO_LONGO)
    expect(textoDoAudio({ ok: false, erro: 'sem_fala', custoUsd: 0 })).toBe(ROTULO_AUDIO_SEM_FALA)
    expect(textoDoAudio({ ok: false, erro: 'download_falhou', custoUsd: 0 })).toBe(ROTULO_AUDIO_FALHOU)
    expect(textoDoAudio(undefined)).toBe(ROTULO_AUDIO_FALHOU)
  })
  it('contexto: avisa transcrição automática e pede para escrever quando não ouviu', () => {
    expect(contextoDoAudio([])).toEqual([])
    const ok = contextoDoAudio([{ ok: true, texto: 'x', custoUsd: 0, nova: false }])
    expect(ok).toHaveLength(1)
    expect(ok[0]).toMatch(/transcrito automaticamente/)
    expect(contextoDoAudio([{ ok: false, erro: 'ia_timeout', custoUsd: 0 }])[0]).toMatch(/escrever a pergunta/)
    expect(contextoDoAudio([{ ok: false, erro: 'longo_demais', custoUsd: 0 }])[0]).toMatch(/resumo por escrito/)
  })
  it('custo soma só valores válidos', () => {
    expect(custoDasAudicoes([
      { ok: true, texto: 'a', custoUsd: 0.0012, nova: true },
      { ok: false, erro: 'sem_fala', custoUsd: 0 },
      { ok: true, texto: 'b', custoUsd: Number.NaN, nova: true },
    ])).toBeCloseTo(0.0012, 6)
  })
})

describe('áudio — devolver à fila', () => {
  it('sem tempo: volta já; temporário: espera até a 3ª tentativa; definitivo: não volta', () => {
    expect(devolverPorAudio('sem_tempo', 9)).toBe('ja')
    expect(devolverPorAudio('midia_ausente', 1)).toBe('espera')
    expect(devolverPorAudio('download_falhou', 2)).toBe('espera')
    expect(devolverPorAudio('ia_timeout', MAX_TENTATIVAS_AUDIO)).toBeNull()
    expect(devolverPorAudio('sem_fala', 1)).toBeNull()
    expect(devolverPorAudio('longo_demais', 1)).toBeNull()
    expect(devolverPorAudio('fora_do_storage', 1)).toBeNull()
    expect(devolverPorAudio('ia_chave_invalida', 1)).toBeNull()
  })
  it('timeout da transcrição cabe no orçamento e guarda tempo para o cérebro', () => {
    const t0 = 1_000_000
    expect(timeoutDaTranscricao(t0, t0)).toBe(TIMEOUT_TRANSCRICAO_MS)
    const tarde = t0 + (ORCAMENTO_FUNCAO_MS - RESERVA_ENVIO_MS - RESERVA_CEREBRO_APOS_AUDIO_MS - 10_000)
    expect(timeoutDaTranscricao(t0, tarde)).toBe(10_000)
    expect(timeoutDaTranscricao(t0, t0 + 80_000)).toBeNull()
    expect(RESERVA_CEREBRO_APOS_AUDIO_MS).toBeGreaterThan(PRAZO_MINIMO_CEREBRO_MS)
    expect(MAX_DURACAO_AUDIO_S).toBe(300)
  })
})

describe('áudio — gatilho "audio" só segue se chamar pelo nome', () => {
  const ok = (texto: string) => ({ ok: true as const, texto, custoUsd: 0.001, nova: true })
  it('outros gatilhos seguem sempre (inclusive áudio que cita a assistente)', () => {
    expect(decidirAudio('quote', ok('quem é a Jane?'), 'Íris')).toEqual({ seguir: true })
    expect(decidirAudio('quote', { ok: false, erro: 'ia_timeout', custoUsd: 0 }, 'Íris')).toEqual({ seguir: true })
    expect(decidirAudio('nome', null, 'Íris')).toEqual({ seguir: true })
  })
  it('nome na fala (com ou sem acento) → segue', () => {
    expect(decidirAudio('audio', ok('Íris, quantos alertas tem hoje?'), 'Íris')).toEqual({ seguir: true })
    expect(decidirAudio('audio', ok('Oi Iris tudo bem me fala dos clientes'), 'Íris')).toEqual({ seguir: true })
    expect(decidirAudio('audio', ok('Quantos alertas temos hoje, Íris?'), 'Íris')).toEqual({ seguir: true })
  })
  it('sem o nome → ignora em silêncio; sem transcrição → ignora', () => {
    expect(decidirAudio('audio', ok('Pessoal, a reunião mudou para as três.'), 'Íris'))
      .toEqual({ seguir: false, motivo: 'audio_sem_chamado' })
    expect(decidirAudio('audio', { ok: false, erro: 'sem_fala', custoUsd: 0 }, 'Íris'))
      .toEqual({ seguir: false, motivo: 'audio_nao_transcrito' })
    expect(decidirAudio('audio', null, 'Íris')).toEqual({ seguir: false, motivo: 'audio_nao_transcrito' })
  })
})
