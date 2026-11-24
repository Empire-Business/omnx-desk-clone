// Escopo do assistente da equipe: QUAIS clientes quem pergunta pode ver e O QUE
// (contratos, conversas). Tudo vem do SERVIDOR — nunca da IA nem da mensagem.
//
//   * privado: a carteira da pessoa (RPC wa_agente_escopo → total | client_ids) e as
//     permissões dela (RPC has_permissao_de: contratos/chat/automacoes-wa 'ver');
//   * grupo interno: a INTERSEÇÃO das carteiras de todos os participantes que são
//     membros cadastrados, e as permissões que TODOS têm. Se houver qualquer
//     participante de fora da equipe (ou a lista de participantes falhar/vier
//     vazia) → modo 'restrito': só ajuda, nada de cliente.
//   * grupo com "Todos no grupo veem tudo" (wa_agente_grupos.acesso_total, decisão do
//     dono 26/10/2026): carteira TOTAL da empresa e leitura completa para qualquer
//     pessoa do grupo — sem interseção e sem modo restrito por participante externo
//     (escopoAcessoTotal). Ações (fase 2) continuam exigindo membro com permissão;
//   * INSTÂNCIAS (números de WhatsApp) que a pessoa vê no Chat — mesma regra de
//     user_can_access_instance: admin/gerente → todas; demais → só as de
//     user_instance_assignments. Em grupo: interseção dos participantes; grupo com
//     acesso_total → todas. As ferramentas de conversa só leem contatos dessas
//     instâncias (cliente_timeline/cliente_canais_resumo recebem p_instancias);
//   * qualquer falha de leitura → restrito (falha fechada).
//
// Client service_role: toda consulta filtra tenant_id (F2). As regras puras ficam
// exportadas para o Vitest (wa-agente-escopo.test.ts).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chaveTelefone } from './telefone.ts'
import { formasDoGrupo } from './wa-grupos-internos.ts'

export interface PermissoesAgente {
  /** contratos 'ver': valores de contrato. */
  contratos: boolean
  /** chat 'ver': resumo de conversa com cliente. */
  chat: boolean
  /** automacoes-wa 'ver': alertas do painel. */
  automacoes: boolean
  /** GT3: alertas operacionais só da carteira do vínculo atual; não concede acesso ao painel. */
  alertasCarteiraGt3?: boolean
  /** GT3: análise ampla só com pode_ver_restrito + automacoes-wa/admin canônicos. */
  agregadosRestritos?: boolean
  /** contratos.onboarding 'ver': fila de vendas a cadastrar. */
  onboarding?: boolean
  /** atendimento 'ver': demandas do app Atendimento. */
  atendimento?: boolean
  /** Gestor de comissões: perfil admin/gerente ou papel admin/revisor em comissoes_papeis. */
  comissoes?: boolean
}

export type MotivoRestrito =
  | 'participante_externo' | 'sem_participantes' | 'falha_participantes' | 'falha_escopo'
  | 'perguntante_fora' | 'sem_membros'

export interface EscopoAgente {
  /** Canal GT3: somente clientes próprios, sem ferramentas ou contexto da empresa. */
  politica?: 'carteira_gt3'
  tenantId: string
  /** Quem perguntou (membro ativo). null só em grupo com acesso total (remetente não cadastrado). */
  userId: string | null
  modo: 'normal' | 'restrito'
  /** true = vê toda a carteira da empresa. */
  total: boolean
  /** Carteira quando !total. */
  clientIds: ReadonlySet<string>
  permissoes: PermissoesAgente
  motivoRestrito?: MotivoRestrito
  /** Grupo: quantos membros entraram na interseção. */
  participantesMembros?: number
  /** Grupo com "Todos no grupo veem tudo". */
  acessoTotalGrupo?: boolean
  /**
   * Instâncias (whatsapp_instances.id) cujas conversas a pessoa pode ler.
   * null/ausente = todas (admin/gerente, grupo "veem tudo"). Conjunto vazio = nenhuma.
   */
  instancias?: ReadonlySet<string> | null
}

export const SEM_PERMISSOES: PermissoesAgente = { contratos: false, chat: false, automacoes: false, onboarding: false, atendimento: false, comissoes: false }

export const PERMISSOES_COMPLETAS: PermissoesAgente = { contratos: true, chat: true, automacoes: true, onboarding: true, atendimento: true, comissoes: true }

/**
 * Grupo com "Todos no grupo veem tudo": carteira total e leitura completa, para
 * qualquer pessoa do grupo (o admin ligou isso conscientemente na tela).
 */
export function escopoAcessoTotal(tenantId: string, userId: string | null): EscopoAgente {
  return {
    tenantId, userId, modo: 'normal', total: true, clientIds: new Set(), permissoes: PERMISSOES_COMPLETAS, acessoTotalGrupo: true,
  }
}

export function escopoRestrito(tenantId: string, userId: string | null, motivo: MotivoRestrito): EscopoAgente {
  return { tenantId, userId, modo: 'restrito', total: false, clientIds: new Set(), permissoes: SEM_PERMISSOES, motivoRestrito: motivo }
}

/** Pode ver este cliente? Restrito ou sem id → não. */
export function podeVerCliente(e: EscopoAgente, clientId: string | null | undefined): boolean {
  if (e.modo !== 'normal' || !clientId) return false
  return (e.politica !== 'carteira_gt3' && e.total) || e.clientIds.has(clientId)
}

/**
 * Pode ver um item SEM cliente vinculado (contato solto, reunião sem cliente)?
 * Só quem vê a carteira toda.
 */
export function podeVerSemCliente(e: EscopoAgente): boolean {
  return e.modo === 'normal' && e.politica !== 'carteira_gt3' && e.total
}

/** Pode ler conversas desta instância? (null/ausente = todas; sem instância → só quem vê todas.) */
export function podeVerInstancia(e: EscopoAgente, instanceId: string | null | undefined): boolean {
  if (e.modo !== 'normal') return false
  if (!e.instancias) return true
  return !!instanceId && e.instancias.has(instanceId)
}

/** Instâncias para os RPCs (p_instancias): null = todas. */
export function instanciasParaRpc(e: EscopoAgente): string[] | null {
  return e.instancias ? [...e.instancias] : null
}

/** Interseção de instâncias (null = todas). */
export function intersecaoInstancias(lista: readonly (ReadonlySet<string> | null | undefined)[]): Set<string> | null {
  const conjuntos = lista.filter((x): x is ReadonlySet<string> => !!x)
  if (conjuntos.length === 0) return null
  return new Set([...conjuntos[0]].filter((id) => conjuntos.every((c) => c.has(id))))
}

/** Linha do RPC wa_agente_escopo (objeto ou lista de 1) → total + ids. null = formato inválido. */
export function lerEscopoRpc(data: unknown): { total: boolean; clientIds: Set<string> } | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.total !== 'boolean') return null
  const ids = Array.isArray(r.client_ids) ? r.client_ids.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  return { total: r.total, clientIds: new Set(ids) }
}

/** Interseção de carteiras (total ∩ X = X; X ∩ Y = comum). Lista vazia → nada. */
export function intersecaoCarteiras(
  carteiras: readonly { total: boolean; clientIds: ReadonlySet<string> }[],
): { total: boolean; clientIds: Set<string> } {
  if (carteiras.length === 0) return { total: false, clientIds: new Set() }
  const parciais = carteiras.filter((c) => !c.total)
  if (parciais.length === 0) return { total: true, clientIds: new Set() }
  let atual = new Set(parciais[0].clientIds)
  for (const c of parciais.slice(1)) atual = new Set([...atual].filter((id) => c.clientIds.has(id)))
  return { total: false, clientIds: atual }
}

/** Permissão do grupo = o que TODOS os participantes membros têm. */
export function permissoesMinimas(lista: readonly PermissoesAgente[]): PermissoesAgente {
  if (lista.length === 0) return SEM_PERMISSOES
  return {
    contratos: lista.every((p) => p.contratos),
    chat: lista.every((p) => p.chat),
    automacoes: lista.every((p) => p.automacoes),
    onboarding: lista.every((p) => p.onboarding === true),
    atendimento: lista.every((p) => p.atendimento === true),
    comissoes: lista.every((p) => p.comissoes === true),
  }
}

/** Telefone/jid de participante → chave de comparação (DDD + 8 últimos). '' = não reconhecido. */
export function chaveParticipante(bruto: string | null | undefined): string {
  const s = String(bruto ?? '').trim().toLowerCase()
  // LID (identificador interno do WhatsApp) não é telefone: não dá para saber quem é.
  if (!s || s.endsWith('@lid') || s.endsWith('@g.us')) return ''
  return chaveTelefone(s.split('@')[0].split(':')[0])
}

export interface ClassificacaoParticipantes {
  /** user_id dos membros presentes (sem repetir). */
  membros: string[]
  /** Participantes que não são membros nem números da própria empresa. */
  externos: number
}

/**
 * Separa os participantes do grupo: membros (pela chave do telefone), números da
 * própria empresa (instâncias — o assistente e as reservas) e externos. Participante
 * sem telefone reconhecível conta como EXTERNO (falha fechada).
 */
export function classificarParticipantes(
  participantes: readonly (string | null)[],
  membroPorChave: ReadonlyMap<string, string>,
  numerosProprios: ReadonlySet<string>,
): ClassificacaoParticipantes {
  const membros = new Set<string>()
  let externos = 0
  for (const p of participantes) {
    const k = chaveParticipante(p)
    if (k && numerosProprios.has(k)) continue
    const u = k ? membroPorChave.get(k) : undefined
    if (u) membros.add(u)
    else externos++
  }
  return { membros: [...membros], externos }
}

/**
 * Participantes de /group/info (UAZAPI) → um telefone por participante ('' quando
 * só há LID — conta como externo). Tolerante ao formato: procura "…@s.whatsapp.net"
 * em qualquer campo de texto do participante ou o campo PhoneNumber. null = formato
 * inválido / sem lista.
 */
export function participantesDoGrupoInfo(info: unknown): string[] | null {
  const g = info && typeof info === 'object' && !Array.isArray(info) ? info as Record<string, unknown> : null
  const lista = g?.Participants ?? g?.participants
  if (!Array.isArray(lista)) return null
  return lista.slice(0, 1100).map((p) => {
    if (typeof p === 'string') return p
    if (!p || typeof p !== 'object') return ''
    const o = p as Record<string, unknown>
    for (const v of Object.values(o)) {
      if (typeof v === 'string' && /@(s\.whatsapp\.net|c\.us)$/i.test(v.trim())) return v.trim()
    }
    const tel = o.PhoneNumber ?? o.phoneNumber ?? o.phone
    return typeof tel === 'string' && /^\+?\d{10,15}$/.test(tel.trim()) ? tel.trim() : ''
  })
}

// ---------------------------------------------------------------------------
// Leitura (service_role)
// ---------------------------------------------------------------------------

const RECURSOS: Record<'contratos' | 'chat' | 'automacoes' | 'onboarding' | 'atendimento', string> = {
  contratos: 'contratos', chat: 'chat', automacoes: 'automacoes-wa', onboarding: 'contratos.onboarding', atendimento: 'atendimento',
}

async function permissoesDe(admin: SupabaseClient, tenantId: string, userId: string): Promise<PermissoesAgente | null> {
  const out: PermissoesAgente = { ...SEM_PERMISSOES }
  for (const chave of Object.keys(RECURSOS) as (keyof typeof RECURSOS)[]) {
    const { data, error } = await admin.rpc('has_permissao_de', { p_user_id: userId, p_recurso: RECURSOS[chave], p_acao: 'ver' })
    if (error) return null
    out[chave] = data === true
  }
  // Liberação individual de contratos (users.acesso_contratos, a mesma que o front respeita)
  // e gestor de comissões (espelha a RLS de `comissoes`). Sempre com tenant explícito.
  const { data: u, error: eU } = await admin.from('users').select('perfil, acesso_contratos')
    .eq('id', userId).eq('tenant_id', tenantId).maybeSingle()
  if (eU) return null
  const usuario = u as { perfil?: string | null; acesso_contratos?: boolean | null } | null
  if (usuario?.acesso_contratos === true) out.contratos = true
  let comissoes = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'
  if (!comissoes) {
    const { data: papeis, error: eP } = await admin.from('comissoes_papeis').select('papel')
      .eq('tenant_id', tenantId).eq('user_id', userId).in('papel', ['admin', 'revisor']).limit(1)
    if (!eP) comissoes = (papeis ?? []).length > 0
  }
  out.comissoes = comissoes
  return out
}

/** Perfis que veem todas as instâncias no Chat (= user_can_access_instance). */
const PERFIS_TODAS_INSTANCIAS = ['admin', 'gerente']

/** Instâncias da pessoa: null = todas; undefined = falha de leitura. */
async function instanciasDe(admin: SupabaseClient, tenantId: string, userId: string): Promise<Set<string> | null | undefined> {
  const { data: u, error } = await admin.from('users').select('perfil').eq('id', userId).eq('tenant_id', tenantId).maybeSingle()
  if (error) return undefined
  if (PERFIS_TODAS_INSTANCIAS.includes(String((u as { perfil?: string | null } | null)?.perfil ?? ''))) return null
  const { data, error: e2 } = await admin.from('user_instance_assignments').select('instance_id')
    .eq('tenant_id', tenantId).eq('user_id', userId).limit(500)
  if (e2) return undefined
  return new Set(((data ?? []) as { instance_id: string | null }[]).map((r) => r.instance_id).filter((x): x is string => !!x))
}

/** Carteira + permissões de UMA pessoa. Falha → restrito. */
export async function carregarEscopo(admin: SupabaseClient, tenantId: string, userId: string): Promise<EscopoAgente> {
  if (!tenantId || !userId) return escopoRestrito(tenantId, userId, 'falha_escopo')
  try {
    const { data, error } = await admin.rpc('wa_agente_escopo', { p_tenant: tenantId, p_user: userId })
    const carteira = error ? null : lerEscopoRpc(data)
    if (!carteira) return escopoRestrito(tenantId, userId, 'falha_escopo')
    const permissoes = await permissoesDe(admin, tenantId, userId)
    if (!permissoes) return escopoRestrito(tenantId, userId, 'falha_escopo')
    const instancias = await instanciasDe(admin, tenantId, userId)
    if (instancias === undefined) return escopoRestrito(tenantId, userId, 'falha_escopo')
    return { tenantId, userId, modo: 'normal', total: carteira.total, clientIds: carteira.clientIds, permissoes, instancias }
  } catch {
    return escopoRestrito(tenantId, userId, 'falha_escopo')
  }
}

/** Membros ativos do tenant: chave do telefone → user_id. */
export async function mapaDeMembros(admin: SupabaseClient, tenantId: string): Promise<Map<string, string> | null> {
  const { data, error } = await admin
    .from('wa_agente_membros')
    .select('user_id, telefone')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .limit(500)
  if (error) return null
  const mapa = new Map<string, string>()
  for (const m of (data ?? []) as { user_id: string; telefone: string | null }[]) {
    const k = chaveTelefone(m.telefone)
    if (k && m.user_id) mapa.set(k, m.user_id)
  }
  return mapa
}

/** Telefones dos números (instâncias) da própria empresa, como chave. */
async function numerosDaEmpresa(admin: SupabaseClient, tenantId: string): Promise<Set<string> | null> {
  const { data, error } = await admin.from('whatsapp_instances').select('numero_whatsapp').eq('tenant_id', tenantId).limit(200)
  if (error) return null
  return new Set(((data ?? []) as { numero_whatsapp: string | null }[]).map((r) => chaveTelefone(r.numero_whatsapp)).filter(Boolean))
}

/** Participantes (telefone/jid) do grupo, lidos de chat_group_members dos contatos desse grupo. */
async function participantesDoGrupo(admin: SupabaseClient, tenantId: string, grupoJid: string): Promise<string[] | null> {
  const formas = formasDoGrupo(grupoJid)
  if (formas.length === 0) return null
  const { data: contatos, error } = await admin
    .from('chat_contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('numero_whatsapp', formas)
    .limit(20)
  if (error) return null
  const ids = ((contatos ?? []) as { id: string }[]).map((c) => c.id)
  if (ids.length === 0) return []
  const { data: membros, error: e2 } = await admin
    .from('chat_group_members')
    .select('numero_whatsapp')
    .eq('tenant_id', tenantId)
    .in('contact_id', ids)
    .limit(1100)
  if (e2) return null
  return [...new Set(((membros ?? []) as { numero_whatsapp: string | null }[]).map((m) => String(m.numero_whatsapp ?? '')))]
}

/**
 * Escopo no GRUPO interno: interseção das carteiras dos participantes membros.
 * Restrito se houver alguém de fora, se a lista falhar/vier vazia ou se quem
 * perguntou não estiver entre os participantes reconhecidos.
 */
export interface OpcoesEscopoGrupo {
  /** "Todos no grupo veem tudo" (wa_agente_grupos.acesso_total). */
  acessoTotal?: boolean
  /**
   * Participantes lidos AGORA do WhatsApp (participantesDoGrupoInfo de /group/info).
   * Sem isto (ou null), cai em chat_group_members.
   */
  lerParticipantes?: () => Promise<string[] | null>
}

export async function escopoDoGrupo(
  admin: SupabaseClient, tenantId: string, perguntanteId: string | null, grupoJid: string, opcoes: OpcoesEscopoGrupo = {},
): Promise<EscopoAgente> {
  const acessoTotal = opcoes.acessoTotal === true
  if (acessoTotal) return escopoAcessoTotal(tenantId, perguntanteId)
  if (!perguntanteId) return escopoRestrito(tenantId, null, 'perguntante_fora')
  try {
    const [participantes, membros, proprios] = await Promise.all([
      (async () => (opcoes.lerParticipantes ? await opcoes.lerParticipantes() : null) ?? participantesDoGrupo(admin, tenantId, grupoJid))(),
      mapaDeMembros(admin, tenantId),
      numerosDaEmpresa(admin, tenantId),
    ])
    if (!participantes || !membros || !proprios) return escopoRestrito(tenantId, perguntanteId, 'falha_participantes')
    if (participantes.length === 0) return escopoRestrito(tenantId, perguntanteId, 'sem_participantes')
    const c = classificarParticipantes(participantes, membros, proprios)
    if (c.externos > 0) return escopoRestrito(tenantId, perguntanteId, 'participante_externo')
    if (c.membros.length === 0) return escopoRestrito(tenantId, perguntanteId, 'sem_membros')
    if (!c.membros.includes(perguntanteId)) return escopoRestrito(tenantId, perguntanteId, 'perguntante_fora')
    if (c.membros.length > 30) return escopoRestrito(tenantId, perguntanteId, 'falha_participantes')

    const escopos: EscopoAgente[] = []
    for (const u of c.membros) {
      const e = await carregarEscopo(admin, tenantId, u)
      if (e.modo !== 'normal') return escopoRestrito(tenantId, perguntanteId, 'falha_escopo')
      escopos.push(e)
    }
    const carteira = intersecaoCarteiras(escopos)
    return {
      tenantId, userId: perguntanteId, modo: 'normal', total: carteira.total, clientIds: carteira.clientIds,
      permissoes: permissoesMinimas(escopos.map((e) => e.permissoes)), participantesMembros: c.membros.length,
      instancias: intersecaoInstancias(escopos.map((e) => e.instancias)),
    }
  } catch {
    return escopoRestrito(tenantId, perguntanteId, 'falha_participantes')
  }
}
