// Leitura dos grupos INTERNOS do número que envia (regras em ./wa-grupos-internos.ts).
//
// Client service_role: TODA consulta filtra tenant_id (F2). Nada de telefone sai
// daqui — só o id do grupo (…@g.us) e o nome dele no Chat.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  chavesDeClientesAtivos, destinoGrupo, gruposComNomeDeCliente, gruposDeCliente, gruposInternos,
  type ContatoDeGrupo, type GrupoInterno,
} from './wa-grupos-internos.ts'

const LOTE = 200
/** Lote menor para o filtro por padrão (cada item vira um termo do `or`). */
const LOTE_PADRAO = 50
const MAX_CLIENTES = 10_000
const MAX_CONVERSAS = 5_000

export class GruposError extends Error {
  constructor(public etapa: string) {
    super(`leitura_grupos_${etapa}`)
    this.name = 'GruposError'
  }
}

export interface LeituraGrupos {
  /** whatsapp_instances.id do número que envia (null = não configurado/não encontrado). */
  instanciaUuid: string | null
  /** Grupos internos (sem vínculo com cliente) do número que envia. */
  grupos: GrupoInterno[]
  /** Jids (dentre os lidos) vinculados a cliente — para o motivo no histórico. */
  deCliente: Set<string>
  /** Jids (dentre os lidos) com nome igual ao de um cliente ativo. */
  nomeDeCliente: Set<string>
}

const vazio = (instanciaUuid: string | null): LeituraGrupos =>
  ({ instanciaUuid, grupos: [], deCliente: new Set(), nomeDeCliente: new Set() })

function emLotes<T>(lista: readonly T[], tamanho = LOTE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho))
  return out
}

/**
 * Contatos da empresa cujo numero_whatsapp, NORMALIZADO (trim + minúsculo, com ou
 * sem "@g.us" — igual ao lower(btrim()) do trigger), é um destes grupos.
 * Busca larga por padrão (só a base do id, já validada por destinoGrupo: dígitos
 * e "-", sem curinga nem vírgula) e confere exato em memória. Sempre no tenant;
 * `instanciaUuid` restringe ao número que envia.
 */
async function contatosDosGrupos(
  admin: SupabaseClient, tenantId: string, jids: Iterable<string>, instanciaUuid: string | null, etapa: string,
): Promise<ContatoDeGrupo[]> {
  const alvo = new Set<string>()
  for (const j of jids) { const d = destinoGrupo(j); if (d) alvo.add(d) }
  const bases = [...alvo].map((d) => d.slice(0, -'@g.us'.length)).filter((b) => /^[0-9-]+$/.test(b))
  const out: ContatoDeGrupo[] = []
  for (const lote of emLotes(bases, LOTE_PADRAO)) {
    let q = admin
      .from('chat_contacts')
      .select('id, nome, numero_whatsapp, client_id')
      .eq('tenant_id', tenantId)
    if (instanciaUuid) q = q.eq('instance_id', instanciaUuid)
    const { data, error } = await q.or(lote.map((b) => `numero_whatsapp.ilike.*${b}*`).join(','))
    if (error) throw new GruposError(etapa)
    for (const c of (data ?? []) as ContatoDeGrupo[]) {
      const d = destinoGrupo(c.numero_whatsapp)
      if (d && alvo.has(d)) out.push(c)
    }
  }
  return out
}

/** whatsapp_instances.id do instance_id configurado, conferido contra o tenant. */
export async function instanciaUuidDaEmpresa(
  admin: SupabaseClient, tenantId: string, instanceId: string | null | undefined,
): Promise<string | null> {
  const inst = (instanceId ?? '').trim()
  if (!inst || !/^[A-Za-z0-9_-]{1,128}$/.test(inst)) return null
  const { data, error } = await admin
    .from('whatsapp_instances')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('instance_id', inst)
    .maybeSingle()
  if (error) throw new GruposError('instancia')
  return (data as { id: string } | null)?.id ?? null
}

/**
 * Grupos internos do número que envia.
 *   * sem `jids`: todos (lista da tela) — parte das conversas de grupo do número;
 *   * com `jids`: só esses (conferência no envio) — parte dos contatos com esses grupos.
 */
export async function carregarGruposInternos(
  admin: SupabaseClient, tenantId: string, instanceId: string | null | undefined, jids?: readonly string[],
): Promise<LeituraGrupos> {
  if (!tenantId) throw new GruposError('tenant')
  const instanciaUuid = await instanciaUuidDaEmpresa(admin, tenantId, instanceId)
  if (!instanciaUuid) return vazio(null)

  // 1) Contatos candidatos (do número que envia).
  let candidatos: ContatoDeGrupo[] = []
  if (jids) {
    if (!jids.some((j) => destinoGrupo(j))) return vazio(instanciaUuid)
    candidatos = await contatosDosGrupos(admin, tenantId, jids, instanciaUuid, 'contatos')
  } else {
    const { data: convs, error } = await admin
      .from('chat_conversations')
      .select('contact_id')
      .eq('tenant_id', tenantId)
      .eq('instance_id', instanciaUuid)
      .eq('is_group', true)
      .not('contact_id', 'is', null)
      .limit(MAX_CONVERSAS)
    if (error) throw new GruposError('conversas')
    const ids = [...new Set((convs ?? []).map((c) => (c as { contact_id: string }).contact_id))]
    for (const lote of emLotes(ids)) {
      const { data, error: e2 } = await admin
        .from('chat_contacts')
        .select('id, nome, numero_whatsapp, client_id')
        .eq('tenant_id', tenantId)
        .eq('instance_id', instanciaUuid)
        .in('id', lote)
      if (e2) throw new GruposError('contatos')
      candidatos.push(...((data ?? []) as ContatoDeGrupo[]))
    }
  }

  // 2) Só conta como grupo se houver conversa is_group desse contato neste número.
  if (jids && candidatos.length > 0) {
    const comConversa = new Set<string>()
    for (const lote of emLotes(candidatos.map((c) => c.id))) {
      const { data, error } = await admin
        .from('chat_conversations')
        .select('contact_id')
        .eq('tenant_id', tenantId)
        .eq('instance_id', instanciaUuid)
        .eq('is_group', true)
        .in('contact_id', lote)
      if (error) throw new GruposError('conversas')
      for (const r of (data ?? []) as { contact_id: string }[]) comConversa.add(r.contact_id)
    }
    candidatos = candidatos.filter((c) => comConversa.has(c.id))
  }

  // 3) Todos os contatos da empresa com estes grupos (qualquer número, número
  //    normalizado) + vínculos.
  const mesmoGrupo = await contatosDosGrupos(
    admin, tenantId, candidatos.map((c) => String(c.numero_whatsapp ?? '')), null, 'mesmo_grupo',
  )
  const todosIds = [...new Set([...candidatos, ...mesmoGrupo].map((c) => c.id))]
  const vinculados = new Set<string>()
  for (const lote of emLotes(todosIds)) {
    const { data, error } = await admin
      .from('chat_contact_clients')
      .select('contact_id')
      .eq('tenant_id', tenantId)
      .in('contact_id', lote)
    if (error) throw new GruposError('vinculos')
    for (const r of (data ?? []) as { contact_id: string }[]) vinculados.add(r.contact_id)
  }

  // 4) Nomes dos clientes ativos: grupo com nome de cliente fica de fora.
  const { data: cls, error: eCli } = await admin
    .from('clients')
    .select('nome, ativo')
    .eq('tenant_id', tenantId)
    .neq('ativo', false)
    .limit(MAX_CLIENTES)
  if (eCli) throw new GruposError('clientes')
  const chaves = chavesDeClientesAtivos((cls ?? []) as { nome: string | null; ativo: boolean | null }[])

  const todos = [...candidatos, ...mesmoGrupo]
  return {
    instanciaUuid,
    grupos: gruposInternos(candidatos, mesmoGrupo, vinculados, chaves),
    deCliente: gruposDeCliente(todos, vinculados),
    nomeDeCliente: gruposComNomeDeCliente(todos, chaves),
  }
}
