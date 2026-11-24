// uazapi-webhook → AUTORIA da mensagem (fase F2 do plano "satisfação e histórico").
//
// A regra é pura e testada em _shared/wa-autoria.ts; aqui só se carrega do banco
// o que ela precisa (com cache curto por isolate) e se grava o LID aprendido.
// Falha ao carregar ⇒ devolve null e a mensagem é gravada sem autor (o banco
// aplica a regra antiga pelas flags). Nada de conteúdo, nome ou telefone em log.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chaveTelefone } from '../_shared/telefone.ts'
import {
  type Autor, type ContextoNomes, type EntradaAutor, type IdentidadeEquipe, type NomeExterno, type PessoaEquipe,
  chaveNome, extrairRemetente, lidParaAprender, precisaDeExternos, resolverAutor,
} from '../_shared/wa-autoria.ts'

const TTL_IDENTIDADES_MS = 5 * 60_000
const TTL_EQUIPE_MS = 10 * 60_000
const TTL_EXTERNOS_MS = 10 * 60_000
const LIMITE_LINHAS = 10_000

interface Cache<T> { valor: T; ate: number }
const cacheIdentidades = new Map<string, Cache<IdentidadeEquipe[]>>()
const cacheEquipe = new Map<string, Cache<PessoaEquipe[]>>()
const cacheExternos = new Map<string, Cache<{ externos: NomeExterno[]; telefonesClientes: Set<string> }>>()

function lerCache<T>(m: Map<string, Cache<T>>, tenant: string): T | null {
  const c = m.get(tenant)
  return c && c.ate > Date.now() ? c.valor : null
}

function gravarCache<T>(m: Map<string, Cache<T>>, tenant: string, valor: T, ttl: number): void {
  if (m.size > 50) m.clear()
  m.set(tenant, { valor, ate: Date.now() + ttl })
}

/** Pessoas da equipe (perfil ≠ cliente), ativas e inativas. Erro ⇒ lança. */
async function equipeDoTenant(supabase: SupabaseClient, tenant: string): Promise<PessoaEquipe[]> {
  const c = lerCache(cacheEquipe, tenant)
  if (c) return c
  const { data, error } = await supabase
    .from('users')
    .select('id, nome, ativo, perfil')
    .eq('tenant_id', tenant)
    .limit(2000)
  if (error) throw new Error(`equipe:${error.code ?? 'erro'}`)
  const lista = (data ?? [])
    .filter((u) => (u as { perfil: string | null }).perfil !== 'cliente')
    .map((u) => {
      const r = u as { id: string; nome: string | null; ativo: boolean | null }
      return { user_id: r.id, nome: r.nome, ativo: r.ativo === true }
    })
  gravarCache(cacheEquipe, tenant, lista, TTL_EQUIPE_MS)
  return lista
}

/** Identidades ativas cuja pessoa (se houver) está ativa na equipe. Erro ⇒ lança. */
async function identidadesDoTenant(supabase: SupabaseClient, tenant: string): Promise<IdentidadeEquipe[]> {
  const c = lerCache(cacheIdentidades, tenant)
  if (c) return c
  const { data, error } = await supabase
    .from('equipe_identidades')
    .select('user_id, telefone_norm, lid')
    .eq('tenant_id', tenant)
    .eq('ativo', true)
    .limit(1000)
  if (error) throw new Error(`identidades:${error.code ?? 'erro'}`)
  const ativos = new Set((await equipeDoTenant(supabase, tenant)).filter((p) => p.ativo).map((p) => p.user_id))
  const lista = ((data ?? []) as IdentidadeEquipe[]).filter((i) => i.user_id === null || ativos.has(i.user_id))
  gravarCache(cacheIdentidades, tenant, lista, TTL_IDENTIDADES_MS)
  return lista
}

/**
 * Primeiros nomes de clientes e de contatos privados (com telefone) e telefones
 * de cliente. Só é lido quando o nome do remetente bate com alguém da equipe.
 */
async function externosDoTenant(
  supabase: SupabaseClient, tenant: string,
): Promise<{ externos: NomeExterno[]; telefonesClientes: Set<string> }> {
  const c = lerCache(cacheExternos, tenant)
  if (c) return c
  const [cli, con, ctt, vin] = await Promise.all([
    supabase.from('clients').select('nome, telefone, whatsapp').eq('tenant_id', tenant).limit(LIMITE_LINHAS),
    supabase.from('contratos').select('whatsapp').eq('tenant_id', tenant).not('whatsapp', 'is', null).limit(LIMITE_LINHAS),
    supabase.from('chat_contacts').select('id, nome, numero_whatsapp, client_id').eq('tenant_id', tenant).limit(LIMITE_LINHAS),
    supabase.from('chat_contact_clients').select('contact_id').eq('tenant_id', tenant).limit(LIMITE_LINHAS),
  ])
  const erro = cli.error ?? con.error ?? ctt.error ?? vin.error
  if (erro) throw new Error(`externos:${erro.code ?? 'erro'}`)

  const externos: NomeExterno[] = []
  const telefonesClientes = new Set<string>()
  const addTel = (t: unknown) => {
    const k = typeof t === 'string' ? chaveTelefone(t) : ''
    if (k) telefonesClientes.add(k)
  }
  for (const r of (cli.data ?? []) as { nome: string | null; telefone: string | null; whatsapp: string | null }[]) {
    const p = chaveNome(r.nome).split(' ')[0]
    if (p) externos.push({ primeiro: p, chaveTel: null })
    addTel(r.telefone)
    addTel(r.whatsapp)
  }
  for (const r of (con.data ?? []) as { whatsapp: string | null }[]) addTel(r.whatsapp)
  const vinculados = new Set(((vin.data ?? []) as { contact_id: string }[]).map((v) => v.contact_id))
  for (const r of (ctt.data ?? []) as { id: string; nome: string | null; numero_whatsapp: string | null; client_id: string | null }[]) {
    const num = String(r.numero_whatsapp ?? '')
    if (!/^[0-9]{8,15}$/.test(num)) continue // grupo ou lixo
    const tel8 = chaveTelefone(num) || null
    const p = chaveNome(r.nome).split(' ')[0]
    if (p) externos.push({ primeiro: p, chaveTel: tel8 })
    if (tel8 && (r.client_id || vinculados.has(r.id))) telefonesClientes.add(tel8)
  }
  const valor = { externos, telefonesClientes }
  gravarCache(cacheExternos, tenant, valor, TTL_EXTERNOS_MS)
  return valor
}

/**
 * Quem escreveu a mensagem que chegou. null = não deu para carregar o que a
 * regra precisa (grava sem autor; o banco usa as flags).
 *
 * `confiavel` = webhook com token válido da instância (agenteAutorizado). Sem
 * ele não se consulta nada: só fromMe vira equipe (auditoria F3).
 */
export async function resolverAutorWebhook(
  supabase: SupabaseClient, tenant: string, entrada: EntradaAutor, confiavel: boolean,
): Promise<Autor | null> {
  if (!confiavel || entrada.fromMe) return resolverAutor(entrada, [], null, false)
  try {
    const identidades = await identidadesDoTenant(supabase, tenant)
    let nomes: ContextoNomes | null = null
    if (entrada.ehGrupo) {
      const r = extrairRemetente(entrada)
      // Heurística por nome só com telefone do remetente (LID sozinho não basta).
      if (r.nome && r.telefone) {
        const equipe = await equipeDoTenant(supabase, tenant)
        // Só lê clientes/contatos se o nome pode casar com alguém da equipe.
        if (precisaDeExternos(r.nome, equipe)) {
          const ext = await externosDoTenant(supabase, tenant)
          nomes = { equipe, externos: ext.externos, telefonesClientes: ext.telefonesClientes }
        }
      }
    }
    return resolverAutor(entrada, identidades, nomes, true)
  } catch (e) {
    console.warn('[webhook] autoria indisponível:', e instanceof Error ? e.message.slice(0, 40) : 'erro')
    return null
  }
}

/**
 * Grupo: chegou telefone + LID de alguém da equipe ⇒ grava o LID na linha do
 * telefone (para reconhecer quando o WhatsApp mandar só o LID). Só com webhook
 * autenticado por token (payload forjado não ensina identidade).
 */
export async function aprenderLidEquipe(
  supabase: SupabaseClient, agenteAutorizado: boolean, tenant: string, entrada: EntradaAutor,
): Promise<void> {
  if (!agenteAutorizado || !entrada.ehGrupo || entrada.fromMe) return
  try {
    const identidades = await identidadesDoTenant(supabase, tenant)
    const par = lidParaAprender(entrada, identidades)
    if (!par) return
    const { error } = await supabase
      .from('equipe_identidades')
      .update({ lid: par.lid, lid_aprendido_em: new Date().toISOString() })
      .eq('tenant_id', tenant)
      .eq('telefone_norm', par.telefone_norm)
      .eq('ativo', true)
    if (error) {
      console.warn('[webhook] LID da equipe não gravado:', error.code ?? 'erro')
      return
    }
    cacheIdentidades.delete(tenant)
  } catch { /* não crítico */ }
}

/** Erro de coluna inexistente (migration de autoria ainda não aplicada). */
export function colunaAutorAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  return (e.code === 'PGRST204' || e.code === '42703') && /autor_/.test(String(e.message ?? ''))
}
