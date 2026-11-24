import { mensagensDoPeriodo, type MensagemUazapi, type Periodo } from './wa-recuperacao.ts'

export function grupoJidValido(v: unknown): v is string {
  return typeof v === 'string' && /^\d{5,30}(?:-\d{5,20})?@g\.us$/.test(v)
}
export type EstadoSync = 'completed' | 'blocked' | 'timeout' | 'pending' | 'unknown'
export interface ResultadoSync { status: EstadoSync; completo: boolean; codigo: string | null; request_id: string | null; has_more: boolean | null; http_status?: number }
/** Apenas estados documentados; ausência/forma desconhecida nunca significa histórico completo. */
export function resultadoHistorySync(raw: Record<string, unknown> | null): ResultadoSync {
  const r = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data as Record<string, unknown> : raw
  const status = r && ['completed', 'blocked', 'timeout', 'pending'].includes(String(r.status)) ? r.status as EstadoSync : 'unknown'
  const codigoBase = r && ['history_access_unavailable', 'pagination_no_progress', 'request_timeout', 'anchor_unavailable', 'cursor_lookup_failed'].includes(String(r.error ?? r.code ?? r.history_access)) ? String(r.error ?? r.code ?? r.history_access) : null
  const codigo = codigoBase ?? (r?.history_access === 'unavailable' ? 'history_access_unavailable' : null)
  const hasMore = typeof r?.has_more === 'boolean' ? r.has_more : null
  const httpStatus = typeof raw?.http_status === 'number' ? raw.http_status : undefined
  return { status, completo: status === 'completed' && hasMore === false && (httpStatus === undefined || httpStatus < 400), codigo, ...(httpStatus ? { http_status: httpStatus } : {}),
    request_id: typeof r?.request_id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(r.request_id) ? r.request_id : null, has_more: hasMore }
}
export interface HistoricoDirecionado { mensagens: MensagemUazapi[]; paginas: number; fim: 'has_more_false' | 'inicio_periodo' | 'pagination_no_progress' | 'timeout' | 'provider_error' | 'limite_paginas'; }
export type ConsultarProvider = (path: string, body: Record<string, unknown>, timeoutMs?: number) => Promise<Record<string, unknown> | null>
/** Uma leitura paginada do chat confirmado. Sem retry; páginas sem progresso param imediatamente. */
export async function lerMensagensDirecionadas(post: ConsultarProvider, chatid: string, periodo: Periodo, prazo: number, agora = Date.now): Promise<HistoricoDirecionado> {
  const mensagens: MensagemUazapi[] = []
  const vistos = new Set<string>()
  let offset = 0
  for (let pag = 0; pag < 15; pag++) {
    if (prazo - agora() < 500) return { mensagens, paginas: pag, fim: 'timeout' }
    const r = await post('/message/find', { chatid, limit: 200, offset }, Math.min(20_000, prazo - agora()))
    if (!r) return { mensagens, paginas: pag + 1, fim: 'provider_error' }
    const lista = Array.isArray(r.messages) ? r.messages as MensagemUazapi[] : []
    const pg = r.pagination && typeof r.pagination === 'object' ? r.pagination as Record<string, unknown> : r
    let progresso = 0
    const novas = lista.filter((m) => {
      if (m.chatid !== chatid || typeof m.messageid !== 'string' || !m.messageid || vistos.has(m.messageid)) return false
      vistos.add(m.messageid); progresso++; return true
    })
    const filtradas = mensagensDoPeriodo(novas, periodo)
    mensagens.push(...filtradas.msgs)
    if (filtradas.fim) return { mensagens, paginas: pag + 1, fim: 'inicio_periodo' }
    if (pg.has_more === false || pg.hasMore === false) return { mensagens, paginas: pag + 1, fim: 'has_more_false' }
    const next = typeof pg.nextOffset === 'number' ? pg.nextOffset : typeof pg.next_offset === 'number' ? pg.next_offset : offset + lista.length
    if (!progresso || !Number.isInteger(next) || next <= offset) return { mensagens, paginas: pag + 1, fim: 'pagination_no_progress' }
    offset = next
  }
  return { mensagens, paginas: 15, fim: 'limite_paginas' }
}
export interface MensagemExistenteRecuperacao { enviado_por_ia: boolean | null; fonte_envio: string | null; autor_origem: string | null; autor_tipo: string | null }
export function permiteReconciliarAutoria(m: MensagemExistenteRecuperacao): boolean {
  return m.enviado_por_ia !== true && m.autor_tipo !== 'ia' && m.autor_origem !== 'plataforma' && (m.fonte_envio === null || m.fonte_envio === 'externo')
}

export function opcoesRecuperacao(corpo: Record<string, unknown>) {
  const chatid = corpo.chatid === undefined ? null : corpo.chatid
  if (chatid !== null && !grupoJidValido(chatid)) return { erro: 'grupo_invalido' } as const
  const dryRun = corpo.dry_run !== false
  const solicitarHistorico = corpo.solicitar_historico === true
  const reconciliarAutoria = corpo.reconciliar_autoria === true
  if ((solicitarHistorico || reconciliarAutoria) && (!chatid || dryRun)) return { erro: 'operacao_exige_grupo_e_confirmacao' } as const
  const requestId = corpo.request_id
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId))) return { erro: 'request_id_invalido' } as const
  return { chatid, dryRun, solicitarHistorico, reconciliarAutoria, requestId }
}

export function autoriaIgual(existente: { autor_tipo: string | null; autor_origem: string | null; autor_user_id?: string | null; autor_chave?: string | null; autor_nome?: string | null }, novo: { tipo: string; origem: string; user_id: string | null; chave: string | null; nome: string | null }): boolean {
  return existente.autor_tipo === novo.tipo && existente.autor_origem === novo.origem &&
    (existente.autor_user_id ?? null) === novo.user_id && (existente.autor_chave ?? null) === novo.chave && (existente.autor_nome ?? null) === novo.nome
}
