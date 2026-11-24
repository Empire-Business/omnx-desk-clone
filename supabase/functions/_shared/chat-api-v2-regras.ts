// Regras da chat-api-v2 (endurecida). Aditivo: o original chat-api-regras.ts NÃO é alterado nem importa este arquivo.

// ─── Endurecimento: chave, CORS, limite e auditoria ──────────────────────────

/** Permissões reconhecidas. `send_message` e `create_broadcast` existem só por compatibilidade (ver ENVIO_PELA_API). */
export const PERMISSOES_API = [
  'send_message',
  'list_conversations',
  'manage_contacts',
  'create_broadcast',
  'view_instances',
] as const

/**
 * Envio de mensagem pela API externa está DESLIGADO: uazapi-send-message envia o texto cru
 * (não passa pela humanização por LLM exigida para números não oficiais). Só volta a true
 * quando o caminho humanizado existir e tiver teste.
 */
export const ENVIO_PELA_API = false

export function temPermissao(permissoes: string[], exigida: string): boolean {
  return permissoes.includes('*') || permissoes.includes(exigida)
}

const PREFIXO_CHAVE = /^edk_[0-9a-f]{64}$/

/** Lê a chave de `X-API-Key` ou de `Authorization: Bearer edk_...`. Formato inválido = null. */
export function extrairChave(headers: { get(nome: string): string | null }): string | null {
  const x = headers.get('x-api-key')?.trim()
  const auth = headers.get('authorization')?.trim()
  const bearer = auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : null
  const chave = x || (bearer?.startsWith('edk_') ? bearer : null)
  return chave && PREFIXO_CHAVE.test(chave) ? chave : null
}

export async function hashChave(chave: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chave))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Origens liberadas para navegador (lista separada por vírgula). Vazio = nenhuma (chamadas servidor-a-servidor seguem funcionando). */
export function origensPermitidas(env: string | undefined | null): string[] {
  return (env ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter((o) => /^https:\/\/[^/\s]+$/.test(o))
}

export function corsHeaders(origin: string | null, permitidas: string[], metodos = 'GET, POST, PATCH, OPTIONS'): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  }
  if (origin && permitidas.includes(origin)) {
    base['Access-Control-Allow-Origin'] = origin
    base['Access-Control-Allow-Methods'] = metodos
    base['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-API-Key'
    base['Access-Control-Max-Age'] = '600'
  }
  return base
}

export const LIMITE_PADRAO = { requisicoes: 60, janelaSeg: 60 }

/** Lê `CHAT_API_RATE_LIMIT` ("60" ou "60/60" = requisições/janela em segundos). Lixo vira o padrão. */
export function limiteDeConfig(txt: string | undefined | null): { requisicoes: number; janelaSeg: number } {
  const m = /^(\d{1,5})(?:\/(\d{1,5}))?$/.exec((txt ?? '').trim())
  if (!m) return LIMITE_PADRAO
  const requisicoes = Number(m[1])
  const janelaSeg = m[2] ? Number(m[2]) : LIMITE_PADRAO.janelaSeg
  return requisicoes > 0 && janelaSeg > 0 ? { requisicoes, janelaSeg } : LIMITE_PADRAO
}

export interface ResultadoLimite { permitido: boolean; restante: number; resetSeg: number }

/** Interpreta o jsonb de api_rate_limit_hit. Resposta estranha = nega (falha fechada). */
export function lerResultadoLimite(v: unknown): ResultadoLimite {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (typeof o.permitido !== 'boolean') return { permitido: false, restante: 0, resetSeg: 60 }
  return {
    permitido: o.permitido,
    restante: typeof o.restante === 'number' ? o.restante : 0,
    resetSeg: typeof o.reset_seg === 'number' ? o.reset_seg : 60,
  }
}

/**
 * Caminho da rota a partir do `pathname`. No Edge Runtime do Supabase ele chega como `/chat-api-v2/...`
 * (sem `/functions/v1`); por trás de proxy ou em teste local pode vir completo. Aceita os dois.
 */
export function caminhoDaRota(pathname: string): string {
  return pathname.replace(/^\/(?:functions\/v1\/)?chat-api-v2(?=\/|$)/, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

/** Rota para a auditoria: ids viram :id, sem query string, tamanho limitado. */
export function rotaNormalizada(metodo: string, caminho: string): string {
  const limpo = caminho.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  return `${metodo.toUpperCase()} /${limpo.replace(/^\/+/, '')}`.slice(0, 120)
}

/** Colunas devolvidas pela API (lista fechada: nada de notas, tags internas, ids de usuário ou do WhatsApp). */
export const COLUNAS_CONVERSA =
  'id, instance_id, contact_id, department_id, agente_id, status, protocolo, is_group, aguardando_resposta, primeira_resposta_em, encerrada_em, ultima_msg_cliente_em, criado_em, atualizado_em'
export const COLUNAS_CONTATO = 'id, instance_id, numero_whatsapp, nome, foto_url, client_id, bloqueado, criado_em, atualizado_em'
export const COLUNAS_MENSAGEM =
  'id, conversation_id, tipo, conteudo, media_url, enviado_por_agente, enviado_por_ia, autor_nome, autor_tipo, status_envio, lida, reply_to_id, criado_em'

/** Limite de mensagens de uma conversa: 1..200 (padrão 50). */
export function limiteMensagens(txt: string | null | undefined): number {
  const n = Number.parseInt(txt ?? '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50
}
