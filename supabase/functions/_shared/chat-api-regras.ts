// Regras puras da chat-api (API externa por X-API-Key). Testadas em chat-api-regras.test.ts.

export interface ChaveApi {
  id: string
  permissoes: unknown
  ativo: boolean | null
  expira_em: string | null
  tenant_id: string | null
}

export type ResultadoChave =
  | { valid: true; keyId: string; tenantId: string; permissions: string[] }
  | { valid: false }

/**
 * A chave só vale se estiver ativa, dentro da validade e VINCULADA A UMA EMPRESA.
 * Chave sem tenant_id é recusada (nunca lista dados de todas as empresas).
 */
export function avaliarChave(registro: ChaveApi | null | undefined, agora: Date = new Date()): ResultadoChave {
  if (!registro || registro.ativo !== true || !registro.tenant_id) return { valid: false }
  if (registro.expira_em && new Date(registro.expira_em) < agora) return { valid: false }
  const permissions = Array.isArray(registro.permissoes)
    ? registro.permissoes.filter((p): p is string => typeof p === 'string')
    : []
  return { valid: true, keyId: registro.id, tenantId: registro.tenant_id, permissions }
}

/** limit 1..100 (padrão 50) e offset ≥ 0 (padrão 0); lixo vira o padrão. */
export function paginacao(limitTxt: string | null, offsetTxt: string | null): { limit: number; offset: number } {
  const l = Number.parseInt(limitTxt ?? '', 10)
  const o = Number.parseInt(offsetTxt ?? '', 10)
  return {
    limit: Number.isFinite(l) && l > 0 ? Math.min(l, 100) : 50,
    offset: Number.isFinite(o) && o > 0 ? o : 0,
  }
}

/**
 * Texto de busca seguro para o filtro .or() do PostgREST: tira os caracteres que
 * mudam a sintaxe do filtro (vírgula, parênteses, aspas, curingas, barra) e limita
 * o tamanho.
 */
export function sanitizarBusca(texto: string | null): string {
  if (!texto) return ''
  return texto.replace(/[,()"'*%\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** Monta o valor de um filtro "in" do PostgREST só com UUIDs válidos: (a,b,c). */
export function listaUuidsFiltro(ids: Iterable<string>): string {
  return `(${[...new Set(ids)].filter(ehUuid).join(',')})`
}

const TIPOS_MIDIA = ['imagem', 'video', 'audio', 'documento'] as const
export function tipoDaMensagem(tipo: unknown, mediaUrl: unknown): string {
  if (typeof mediaUrl !== 'string' || !mediaUrl) return 'texto'
  return typeof tipo === 'string' && (TIPOS_MIDIA as readonly string[]).includes(tipo) ? tipo : 'documento'
}
