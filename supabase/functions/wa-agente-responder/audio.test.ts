import { describe, expect, it, vi } from 'vitest'
import { criarSupabaseFalso } from '../_shared/teste-supabase-falso.ts'
import type { ResultadoTranscricao } from '../_shared/wa-midia-transcrever.ts'
import { type MsgAudio, audiosDeHoje, gravarTranscricao, ouvirAudios } from './audio.ts'

const T = 'tenant-1'
const msg = (id: string, tipo = 'audio', criado_em = '2026-10-27T12:00:00Z'): MsgAudio => ({
  id, tipo, media_url: `https://x.supabase.co/storage/v1/object/public/chat-media/conv/${id}.mp3`, conversation_id: 'conv', criado_em,
})
const ok = (texto: string, custo = 0.0012): ResultadoTranscricao =>
  ({ ok: true, texto, idioma: 'pt-BR', duracaoS: 33, modelo: 'google/gemini-2.5-flash', custo })

describe('ouvirAudios', () => {
  it('usa a transcrição pronta (status ok, da empresa) sem chamar a IA', async () => {
    const f = criarSupabaseFalso({
      chat_midia_texto: [{ message_id: 'a1', tenant_id: T, tipo: 'transcricao', status: 'ok', texto: 'pronto' }],
    })
    const transcrever = vi.fn()
    const r = await ouvirAudios(f.client, T, [msg('a1')], { transcrever })
    expect(transcrever).not.toHaveBeenCalled()
    expect(r.get('a1')).toEqual({ ok: true, texto: 'pronto', custoUsd: 0, nova: false })
    expect(f.consultas.every((c) => c.filtros.includes('eq:tenant_id'))).toBe(true)
  })

  it('transcreve agora o que falta e grava como ok (para a fila não refazer)', async () => {
    const f = criarSupabaseFalso({ chat_midia_texto: [] })
    const r = await ouvirAudios(f.client, T, [msg('a1')], { transcrever: async () => ok('Íris, como está a Jane?') })
    expect(r.get('a1')).toEqual({ ok: true, texto: 'Íris, como está a Jane?', custoUsd: 0.0012, nova: true })
    const ins = f.inseridos.find((i) => i.tabela === 'chat_midia_texto')
    expect(ins?.linhas[0]).toMatchObject({
      message_id: 'a1', tenant_id: T, tipo: 'transcricao', status: 'ok', texto: 'Íris, como está a Jane?',
      mensagem_em: '2026-10-27T12:00:00Z', custo_usd: 0.0012,
    })
  })

  it('linha pendente da fila é completada; uma ok existente nunca é sobrescrita', async () => {
    const f = criarSupabaseFalso({
      chat_midia_texto: [{ message_id: 'a1', tenant_id: T, tipo: 'transcricao', status: 'pendente', texto: null }],
    })
    await gravarTranscricao(f.client, T, msg('a1'), ok('novo') as Extract<ResultadoTranscricao, { ok: true }>)
    const upd = f.consultas.filter((c) => c.tabela === 'chat_midia_texto' && c.operacao === 'update')
    expect(upd).toHaveLength(1)
    expect(upd[0].filtros).toEqual(expect.arrayContaining(['eq:tenant_id', 'eq:message_id', 'neq:status']))
    expect(f.atualizados[0].campos).toMatchObject({ status: 'ok', texto: 'novo' })

    const g = criarSupabaseFalso({
      chat_midia_texto: [{ message_id: 'a1', tenant_id: T, tipo: 'transcricao', status: 'ok', texto: 'antigo' }],
    })
    await gravarTranscricao(g.client, T, msg('a1'), ok('novo') as Extract<ResultadoTranscricao, { ok: true }>)
    expect(g.inseridos.find((i) => i.tabela === 'chat_midia_texto')?.linhas ?? []).toHaveLength(0)
  })

  it('falha não grava nada e devolve o erro (sem custo)', async () => {
    const f = criarSupabaseFalso({ chat_midia_texto: [] })
    const r = await ouvirAudios(f.client, T, [msg('a1')], { transcrever: async () => ({ ok: false, erro: 'midia_ausente' }) })
    expect(r.get('a1')).toEqual({ ok: false, erro: 'midia_ausente', custoUsd: 0 })
    expect(f.inseridos).toHaveLength(0)
  })

  it('sem tempo (transcrever → null) vira sem_tempo', async () => {
    const f = criarSupabaseFalso({ chat_midia_texto: [] })
    const r = await ouvirAudios(f.client, T, [msg('a1')], { transcrever: async () => null })
    expect(r.get('a1')).toEqual({ ok: false, erro: 'sem_tempo', custoUsd: 0 })
  })

  it('o áudio do próprio pedido é ouvido primeiro; além do máximo, os agrupados ficam sem transcrição', async () => {
    const f = criarSupabaseFalso({ chat_midia_texto: [] })
    const ordem: string[] = []
    const r = await ouvirAudios(f.client, T, [
      msg('velho', 'audio', '2026-10-27T12:00:00Z'),
      msg('meio', 'audio', '2026-10-27T12:00:10Z'),
      msg('principal', 'audio', '2026-10-27T11:59:00Z'),
      msg('t', 'texto'),
    ], { idPrincipal: 'principal', maxAgora: 2, transcrever: async (m) => { ordem.push(m.id); return ok(m.id) } })
    expect(ordem).toEqual(['principal', 'meio'])
    expect(r.get('velho')).toEqual({ ok: false, erro: 'sem_tempo', custoUsd: 0 })
    expect(r.has('t')).toBe(false)
  })
})

describe('audiosDeHoje', () => {
  it('conta execuções de gatilho audio da empresa desde o início do dia', async () => {
    const f = criarSupabaseFalso({
      wa_agente_execucoes: [
        { id: '1', tenant_id: T, gatilho: 'audio', created_at: '2026-10-27T13:00:00Z' },
        { id: '2', tenant_id: T, gatilho: 'nome', created_at: '2026-10-27T13:00:00Z' },
        { id: '3', tenant_id: 'outra', gatilho: 'audio', created_at: '2026-10-27T13:00:00Z' },
        { id: '4', tenant_id: T, gatilho: 'audio', created_at: '2026-10-26T13:00:00Z' },
      ],
    })
    expect(await audiosDeHoje(f.client, T, new Date('2026-10-27T03:00:00Z'))).toBe(1)
    expect(f.consultas[0].filtros).toEqual(expect.arrayContaining(['eq:tenant_id', 'eq:gatilho', 'gte:created_at']))
  })
})
