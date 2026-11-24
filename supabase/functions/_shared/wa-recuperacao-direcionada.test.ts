import { describe, expect, it, vi } from 'vitest'
import { autoriaIgual, grupoJidValido, lerMensagensDirecionadas, opcoesRecuperacao, permiteReconciliarAutoria, resultadoHistorySync } from './wa-recuperacao-direcionada.ts'
import { validarPeriodo } from './wa-recuperacao.ts'
const CHAT = '120363000000000001@g.us'
const AGORA = Date.parse('2026-11-06T15:00:00Z')
const periodo = { desde: AGORA - 100000, ate: AGORA }
const m = (id: string, chatid = CHAT) => ({ messageid: id, chatid, messageTimestamp: AGORA - 1000 })

describe('recuperação direcionada sem execução externa', () => {
  it('somente grupo completo; operação de histórico/autoria exige alvo e dry_run:false explícito', () => {
    expect(grupoJidValido(CHAT)).toBe(true)
    for (const chatid of ['', '5511999999999@s.whatsapp.net', 'abc@g.us', null]) expect(grupoJidValido(chatid)).toBe(false)
    for (const flag of ['solicitar_historico', 'reconciliar_autoria']) {
      expect(opcoesRecuperacao({ [flag]: true })).toHaveProperty('erro')
      expect(opcoesRecuperacao({ chatid: CHAT, [flag]: true })).toHaveProperty('erro')
      expect(opcoesRecuperacao({ chatid: CHAT, dry_run: false, [flag]: true })).not.toHaveProperty('erro')
    }
    expect(opcoesRecuperacao({ chatid: CHAT })).toMatchObject({ dryRun: true, solicitarHistorico: false })
  })
  it('janela estendida só no modo direcionado, limitada e sem data futura', () => {
    const desde = new Date(AGORA - 90 * 86400000).toISOString()
    expect(validarPeriodo(desde, undefined, AGORA)).toHaveProperty('erro', 'alem_de_7_dias')
    expect(validarPeriodo(desde, undefined, AGORA, true)).toEqual({ desde: Date.parse(desde), ate: AGORA })
    expect(validarPeriodo('2020-01-01', undefined, AGORA, true)).toHaveProperty('erro', 'alem_de_366_dias')
    expect(validarPeriodo(desde, '2027-01-01', AGORA, true)).toHaveProperty('erro', 'periodo_no_futuro')
  })
  it('completed sozinho ou paginação vazia não provam histórico completo', () => {
    expect(resultadoHistorySync({ status: 'completed' }).completo).toBe(false)
    expect(resultadoHistorySync({ status: 'completed', has_more: true }).completo).toBe(false)
    expect(resultadoHistorySync({ data: { status: 'completed', has_more: false, request_id: 'safe-id' } })).toMatchObject({ completo: true, request_id: 'safe-id' })
    expect(resultadoHistorySync(null)).toMatchObject({ status: 'unknown', completo: false })
    expect(resultadoHistorySync({ status: 'timeout', has_more: false }).completo).toBe(false)
  })
  it.each(['history_access_unavailable', 'pagination_no_progress'])('preserva bloqueio %s sem converter em sucesso', (code) => {
    expect(resultadoHistorySync({ status: 'blocked', code })).toMatchObject({ status: 'blocked', codigo: code, completo: false })
  })
  it('paginação de find deduplica IDs e nunca mistura outro grupo', async () => {
    const post = vi.fn().mockResolvedValueOnce({ messages: [m('a'), m('outro', '120363000000000002@g.us')], pagination: { nextOffset: 2, hasMore: true } })
      .mockResolvedValueOnce({ messages: [m('a'), m('b')], pagination: { hasMore: false } })
    const r = await lerMensagensDirecionadas(post, CHAT, periodo, AGORA + 10000, () => AGORA)
    expect(r.mensagens.map((x) => x.messageid)).toEqual(['a', 'b'])
    expect(r.fim).toBe('has_more_false')
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ chatid: CHAT, limit: 200, offset: 0 }, { chatid: CHAT, limit: 200, offset: 2 }])
  })
  it('página repetida interrompe sem retry mesmo que o provedor avance offset', async () => {
    const post = vi.fn().mockResolvedValue({ messages: [m('a')], pagination: { hasMore: true } })
    const r = await lerMensagensDirecionadas(post, CHAT, periodo, AGORA + 10000, () => AGORA)
    expect(r.fim).toBe('pagination_no_progress')
    expect(post).toHaveBeenCalledTimes(2)
    expect(r.mensagens).toHaveLength(1)
  })
  it('offset sem progresso ou resposta vazia sem has_more:false não significam completo', async () => {
    for (const response of [{ messages: [m('a')], pagination: { nextOffset: 0, hasMore: true } }, { messages: [] }]) {
      const post = vi.fn().mockResolvedValue(response)
      expect((await lerMensagensDirecionadas(post, CHAT, periodo, AGORA + 10000, () => AGORA)).fim).toBe('pagination_no_progress')
      expect(post).toHaveBeenCalledTimes(1)
    }
  })
  it('esgotar orçamento não executa nova chamada', async () => {
    const post = vi.fn()
    expect((await lerMensagensDirecionadas(post, CHAT, periodo, AGORA, () => AGORA)).fim).toBe('timeout')
    expect(post).not.toHaveBeenCalled()
  })
  it('erro do provedor não dispara retry', async () => {
    const post = vi.fn().mockResolvedValue(null)
    expect((await lerMensagensDirecionadas(post, CHAT, periodo, AGORA + 10000, () => AGORA)).fim).toBe('provider_error')
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('não reconcilia mensagem da plataforma ou IA', () => {
    const base = { enviado_por_ia: false, fonte_envio: null, autor_origem: 'backfill', autor_tipo: 'cliente' }
    expect(permiteReconciliarAutoria(base)).toBe(true)
    for (const patch of [{ enviado_por_ia: true }, { fonte_envio: 'plataforma' }, { autor_origem: 'plataforma' }, { autor_tipo: 'ia' }]) expect(permiteReconciliarAutoria({ ...base, ...patch })).toBe(false)
  })
})


it('erro HTTP e código do provider permanecem legíveis sem expor texto livre ou alegar completo', () => {
  const r = resultadoHistorySync({ http_status: 409, data: { status: 'blocked', code: 'history_access_unavailable', has_more: false, message: 'segredo proibido' } })
  expect(r).toMatchObject({ http_status: 409, status: 'blocked', codigo: 'history_access_unavailable', completo: false })
  expect(JSON.stringify(r)).not.toContain('segredo proibido')
  expect(resultadoHistorySync({ http_status: 500, status: 'completed', has_more: false }).completo).toBe(false)
})


it('limite de período impede alegar histórico completo mesmo com hasMore:false', async () => {
  const post = vi.fn().mockResolvedValue({ messages: [m('a'), { ...m('antiga'), messageTimestamp: periodo.desde - 1 }], pagination: { hasMore: false } })
  const r = await lerMensagensDirecionadas(post, CHAT, periodo, AGORA + 10000, () => AGORA)
  expect(r.fim).toBe('inicio_periodo')
  expect(r.mensagens.map((m) => m.messageid)).toEqual(['a'])
})
it('preserva pending, histórico indisponível e erros de âncora sem inventar finalização', () => {
  expect(resultadoHistorySync({ status: 'pending', has_more: false })).toMatchObject({ status: 'pending', completo: false })
  expect(resultadoHistorySync({ status: 'blocked', history_access: 'unavailable' }).codigo).toBe('history_access_unavailable')
  for (const code of ['anchor_unavailable', 'cursor_lookup_failed']) expect(resultadoHistorySync({ status: 'blocked', error: code }).codigo).toBe(code)
  expect(resultadoHistorySync({ status: 'unknown', code: 'request_timeout' })).toMatchObject({ status: 'unknown', codigo: 'request_timeout', completo: false })
})
it('não conta autoria já igual como correção; compara também pessoa, chave e nome', () => {
  const autor = { tipo: 'equipe', origem: 'webhook', user_id: 'u', chave: 'lid:1', nome: 'Equipe' }
  const row = { autor_tipo: 'equipe', autor_origem: 'webhook', autor_user_id: 'u', autor_chave: 'lid:1', autor_nome: 'Equipe' }
  expect(autoriaIgual(row, autor)).toBe(true)
  for (const patch of [{ autor_user_id: 'outro' }, { autor_chave: null }, { autor_nome: 'Anterior' }]) expect(autoriaIgual({ ...row, ...patch }, autor)).toBe(false)
})
