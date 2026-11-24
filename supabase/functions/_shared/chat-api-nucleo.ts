// Núcleo compartilhado da API externa (REST chat-api-v2 e MCP desk-mcp).
// Roda com service_role (sem RLS): TODA consulta é filtrada à mão por tenant_id da chave
// e esconde grupos INTERNOS (restrito_admin / chat_grupos_restritos).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  avaliarChave,
  type ChaveApi,
  ehUuid,
  listaUuidsFiltro,
  paginacao,
  type ResultadoChave,
  sanitizarBusca,
} from './chat-api-regras.ts'
import {
  COLUNAS_CONTATO,
  COLUNAS_CONVERSA,
  COLUNAS_MENSAGEM,
  hashChave,
  lerResultadoLimite,
  limiteDeConfig,
  limiteMensagens,
  type ResultadoLimite,
} from './chat-api-v2-regras.ts'

type Db = SupabaseClient

// Coluna/tabela/função ainda não existe (migration não aplicada).
export const OBJETO_INEXISTENTE = new Set(['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])

export type Resultado<T> = { ok: true; data: T } | { ok: false; status: number; erro: string }
const falha = (status: number, erro: string): { ok: false; status: number; erro: string } => ({ ok: false, status, erro })

export async function verificarChave(db: Db, chave: string): Promise<ResultadoChave> {
  const { data } = await db
    .from('api_keys')
    .select('id, permissoes, ativo, expira_em, tenant_id')
    .eq('key_hash', await hashChave(chave))
    .maybeSingle()
  const auth = avaliarChave(data as ChaveApi | null)
  if (auth.valid) {
    await db.from('api_keys').update({ ultimo_uso: new Date().toISOString() }).eq('id', auth.keyId)
  }
  return auth
}

/** Limite por chave (RPC api_rate_limit_hit). Função ausente (migration pendente) libera com aviso; outro erro nega. */
export async function consumirLimite(db: Db, keyId: string, config: string | undefined): Promise<ResultadoLimite> {
  const { requisicoes, janelaSeg } = limiteDeConfig(config)
  const { data, error } = await db.rpc('api_rate_limit_hit', {
    p_key_id: keyId, p_limite: requisicoes, p_janela_seg: janelaSeg,
  })
  if (error) {
    if (OBJETO_INEXISTENTE.has(error.code ?? '')) {
      console.warn('[chat-api-v2] api_rate_limit_hit ausente: aplique a migration 20261118120000')
      return { permitido: true, restante: requisicoes, resetSeg: janelaSeg }
    }
    return { permitido: false, restante: 0, resetSeg: janelaSeg }
  }
  return lerResultadoLimite(data)
}

/** Auditoria da chamada. Nunca guarda corpo, query string nem texto de mensagem. Falha não derruba a chamada. */
export async function auditar(
  db: Db,
  r: { tenantId: string; keyId: string; canal: 'rest' | 'mcp'; metodo: string; rota: string; status: number; inicio: number },
): Promise<void> {
  try {
    const { error } = await db.from('api_request_log').insert({
      tenant_id: r.tenantId, key_id: r.keyId, canal: r.canal, metodo: r.metodo, rota: r.rota,
      status: r.status, duracao_ms: Math.max(0, Date.now() - r.inicio),
    })
    if (error && !OBJETO_INEXISTENTE.has(error.code ?? '')) console.error('[chat-api-v2] auditoria falhou', error.code)
  } catch (e) {
    console.error('[chat-api-v2] auditoria falhou', e instanceof Error ? e.message : 'erro')
  }
}

/** Ids dos contatos INTERNOS da empresa. Erro (exceto objeto inexistente) = exceção (falha fechada). */
export async function contatosRestritos(db: Db, tenantId: string): Promise<string[]> {
  const ids = new Set<string>()
  const marcados = await db.from('chat_contacts').select('id').eq('tenant_id', tenantId).eq('restrito_admin', true)
  if (marcados.error) {
    if (!OBJETO_INEXISTENTE.has(marcados.error.code ?? '')) throw new Error('Falha ao checar grupos internos')
  } else {
    for (const c of marcados.data ?? []) ids.add((c as { id: string }).id)
  }
  const registro = await db.from('chat_grupos_restritos').select('grupo_base').eq('tenant_id', tenantId)
  if (registro.error) {
    if (!OBJETO_INEXISTENTE.has(registro.error.code ?? '')) throw new Error('Falha ao checar grupos internos')
  } else {
    const bases = (registro.data ?? []).map((g) => (g as { grupo_base: string }).grupo_base)
    if (bases.length > 0) {
      const { data, error } = await db
        .from('chat_contacts').select('id').eq('tenant_id', tenantId)
        .in('numero_whatsapp', bases.flatMap((b) => [b, `${b}@g.us`]))
      if (error) throw new Error('Falha ao checar grupos internos')
      for (const c of data ?? []) ids.add((c as { id: string }).id)
    }
  }
  return [...ids]
}

export interface ConversaTenant { id: string; contact_id: string | null; instance_id: string | null }

/** Conversa da empresa e que não é de grupo interno; senão null. */
export async function conversaDoTenant(db: Db, tenantId: string, conversationId: string): Promise<ConversaTenant | null> {
  if (!ehUuid(conversationId)) return null
  const { data: conv } = await db
    .from('chat_conversations').select('id, contact_id, instance_id')
    .eq('id', conversationId).eq('tenant_id', tenantId).maybeSingle()
  if (!conv) return null
  const restritos = await contatosRestritos(db, tenantId)
  if (conv.contact_id && restritos.includes(conv.contact_id)) return null
  return conv as ConversaTenant
}

export async function usuarioDoTenant(db: Db, tenantId: string, userId: unknown): Promise<boolean> {
  if (!ehUuid(userId)) return false
  const { data } = await db.from('users').select('id').eq('id', userId).eq('tenant_id', tenantId).neq('ativo', false).maybeSingle()
  return Boolean(data)
}

export async function departamentoDoTenant(db: Db, tenantId: string, departmentId: unknown): Promise<boolean> {
  if (!ehUuid(departmentId)) return false
  const { data } = await db.from('chat_departments').select('id').eq('id', departmentId).eq('tenant_id', tenantId).maybeSingle()
  return Boolean(data)
}

export async function instanciaDoTenant(db: Db, tenantId: string, instanceId: unknown): Promise<{ id: string } | null> {
  if (!ehUuid(instanceId)) return null
  const { data } = await db
    .from('whatsapp_instances').select('id')
    .eq('id', instanceId).eq('tenant_id', tenantId).eq('ativo', true).maybeSingle()
  return (data as { id: string } | null) ?? null
}

export interface FiltroConversas {
  status?: string | null
  instance_id?: string | null
  department_id?: string | null
  limit?: string | null
  offset?: string | null
}

export async function listarConversas(db: Db, tenantId: string, f: FiltroConversas) {
  const { limit, offset } = paginacao(f.limit ?? null, f.offset ?? null)
  if (f.instance_id && !ehUuid(f.instance_id)) return falha(400, 'Invalid instance_id')
  if (f.department_id && !ehUuid(f.department_id)) return falha(400, 'Invalid department_id')
  const restritos = await contatosRestritos(db, tenantId)
  let query = db
    .from('chat_conversations')
    .select(`${COLUNAS_CONVERSA}, chat_contacts(id, nome, numero_whatsapp, foto_url, bloqueado)`, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('atualizado_em', { ascending: false })
    .range(offset, offset + limit - 1)
  if (restritos.length > 0) query = query.not('contact_id', 'in', listaUuidsFiltro(restritos))
  if (f.status) query = query.eq('status', f.status)
  if (f.instance_id) query = query.eq('instance_id', f.instance_id)
  if (f.department_id) query = query.eq('department_id', f.department_id)
  const { data, count, error } = await query
  if (error) return falha(500, 'Failed to list conversations')
  return { ok: true as const, data: { data, total: count, limit, offset } }
}

export async function obterConversa(db: Db, tenantId: string, conversationId: string, limiteTxt?: string | null) {
  if (!(await conversaDoTenant(db, tenantId, conversationId))) return falha(404, 'Conversation not found')
  const { data: conversation } = await db
    .from('chat_conversations')
    .select(`${COLUNAS_CONVERSA}, chat_contacts(id, nome, numero_whatsapp, foto_url, bloqueado)`)
    .eq('id', conversationId).eq('tenant_id', tenantId).maybeSingle()
  if (!conversation) return falha(404, 'Conversation not found')
  const { data: recentes } = await db
    .from('chat_messages').select(COLUNAS_MENSAGEM)
    .eq('conversation_id', conversationId).eq('tenant_id', tenantId)
    // notas internas da equipe nunca saem pela API/MCP
    .or('tipo.is.null,tipo.neq.nota_interna')
    .order('criado_em', { ascending: false })
    .limit(limiteMensagens(limiteTxt))
  return { ok: true as const, data: { ...conversation, messages: [...(recentes ?? [])].reverse() } }
}

export async function listarContatos(db: Db, tenantId: string, f: { search?: string | null; limit?: string | null; offset?: string | null }) {
  const { limit, offset } = paginacao(f.limit ?? null, f.offset ?? null)
  const search = sanitizarBusca(f.search ?? null)
  const restritos = await contatosRestritos(db, tenantId)
  let query = db
    .from('chat_contacts').select(COLUNAS_CONTATO, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('criado_em', { ascending: false })
    .range(offset, offset + limit - 1)
  if (restritos.length > 0) query = query.not('id', 'in', listaUuidsFiltro(restritos))
  if (search) query = query.or(`nome.ilike.%${search}%,numero_whatsapp.ilike.%${search}%`)
  const { data, count, error } = await query
  if (error) return falha(500, 'Failed to list contacts')
  return { ok: true as const, data: { data, total: count, limit, offset } }
}

export async function listarInstancias(db: Db, tenantId: string) {
  const { data, error } = await db
    .from('whatsapp_instances').select('id, nome, numero_whatsapp, ativo')
    .eq('tenant_id', tenantId).eq('ativo', true).order('nome')
  if (error) return falha(500, 'Failed to list instances')
  return { ok: true as const, data: { data } }
}
