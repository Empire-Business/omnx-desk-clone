// Perfil longo da Íris. Uma linha namespaced em app_settings.valor (TEXT), sem
// alterar schema. A API administrativa e o runtime compartilham esta leitura.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PERFIL_AGENTE_PADRAO, VERSAO_PERFIL_PADRAO } from './wa-agente-perfil-padrao.ts'

export const LIMITE_CAMPO_PERFIL = 32_000
export const LIMITE_TOTAL_PERFIL = 64_000
export const LIMITE_CORPO_PERFIL_BYTES = 256 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTROLES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

export interface PerfilAgente { personalidade: string; contexto: string }
export interface PerfilAgentePainel extends PerfilAgente {
  origem: 'padrao' | 'salvo'
  revisao: string | null
  atualizado_em: string | null
  atualizado_por: string | null
  versao_padrao: string
  limites: { personalidade: number; contexto: number; total: number }
}
interface PerfilSalvo extends PerfilAgente {
  schema: 1
  atualizado_em: string
  atualizado_por: string
  autor_id: string
}
interface Linha { id: string; valor: string; atualizado_em: string | null }

export class ErroPerfil extends Error {
  constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem); this.name = 'ErroPerfil' }
}

export function validarPerfilAgente(bruto: unknown): PerfilAgente {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) throw new ErroPerfil(400, 'perfil_invalido', 'Perfil inválido.')
  const o = bruto as Record<string, unknown>
  const campos = ['personalidade', 'contexto'] as const
  for (const campo of campos) {
    if (typeof o[campo] !== 'string') throw new ErroPerfil(400, 'perfil_invalido', 'Preencha os dois campos do perfil.')
    if (!o[campo].trim()) throw new ErroPerfil(400, 'perfil_invalido', 'Preencha os dois campos do perfil.')
    if (o[campo].length > LIMITE_CAMPO_PERFIL) throw new ErroPerfil(400, 'perfil_limite', `Cada campo aceita até ${LIMITE_CAMPO_PERFIL} caracteres.`)
    if (CONTROLES.test(o[campo])) throw new ErroPerfil(400, 'perfil_invalido', 'O perfil contém caracteres de controle inválidos.')
  }
  const personalidade = o.personalidade as string
  const contexto = o.contexto as string
  if (personalidade.length + contexto.length > LIMITE_TOTAL_PERFIL) throw new ErroPerfil(400, 'perfil_limite', `O perfil aceita até ${LIMITE_TOTAL_PERFIL} caracteres no total.`)
  // Não resumir, quebrar em aprendizados ou cortar parágrafos silenciosamente.
  return { personalidade, contexto }
}

export function chavePerfilAgente(tenantId: string): string {
  if (!UUID.test(tenantId)) throw new ErroPerfil(403, 'perfil_sem_empresa', 'Empresa não identificada.')
  return `wa_agente_perfil:${tenantId.toLowerCase()}`
}

async function lerLinha(admin: SupabaseClient, tenantId: string): Promise<Linha | null> {
  const { data, error } = await admin.from('app_settings').select('id, valor, atualizado_em')
    .eq('tenant_id', tenantId).eq('chave', chavePerfilAgente(tenantId)).maybeSingle()
  if (error) throw new ErroPerfil(503, 'perfil_leitura', 'Não foi possível carregar o perfil da Íris. Tente novamente.')
  return data as Linha | null
}

function lerSalvo(valor: string): PerfilSalvo {
  try {
    const o = JSON.parse(valor) as Record<string, unknown>
    if (o.schema !== 1 || typeof o.atualizado_em !== 'string' || typeof o.atualizado_por !== 'string' || typeof o.autor_id !== 'string') throw new Error('formato')
    return { schema: 1, ...validarPerfilAgente(o), atualizado_em: o.atualizado_em, atualizado_por: o.atualizado_por, autor_id: o.autor_id }
  } catch {
    throw new ErroPerfil(409, 'perfil_salvo_invalido', 'O perfil salvo tem formato inválido. A administração precisa revisar esse registro.')
  }
}

async function revisao(linha: Linha): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([linha.id, linha.atualizado_em, linha.valor]))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function paraPainel(linha: Linha | null): Promise<PerfilAgentePainel> {
  const salvo = linha ? lerSalvo(linha.valor) : null
  return {
    ...(salvo ? { personalidade: salvo.personalidade, contexto: salvo.contexto } : validarPerfilAgente(PERFIL_AGENTE_PADRAO)),
    origem: salvo ? 'salvo' : 'padrao', revisao: linha ? await revisao(linha) : null,
    atualizado_em: salvo?.atualizado_em ?? null, atualizado_por: salvo?.atualizado_por ?? null,
    versao_padrao: VERSAO_PERFIL_PADRAO,
    limites: { personalidade: LIMITE_CAMPO_PERFIL, contexto: LIMITE_CAMPO_PERFIL, total: LIMITE_TOTAL_PERFIL },
  }
}

export async function carregarPerfilAgente(admin: SupabaseClient, tenantId: string): Promise<PerfilAgentePainel> {
  // Só ausência legítima de linha usa padrão. Erro de leitura não vira perfil vazio.
  return paraPainel(await lerLinha(admin, tenantId))
}

export async function carregarPerfilRuntime(admin: SupabaseClient, tenantId: string, modo: 'normal' | 'restrito'): Promise<PerfilAgente | null> {
  if (modo !== 'normal') return null // Não buscar contexto interno para grupo restrito.
  const p = await carregarPerfilAgente(admin, tenantId)
  return { personalidade: p.personalidade, contexto: p.contexto }
}

export async function salvarPerfilAgente(
  admin: SupabaseClient, tenantId: string, autorId: string, autorNome: string | null, bruto: unknown,
): Promise<PerfilAgentePainel> {
  const p = validarPerfilAgente(bruto)
  const esperado = (bruto as Record<string, unknown>).revisao
  if (esperado !== null && (typeof esperado !== 'string' || !/^[0-9a-f]{64}$/.test(esperado))) throw new ErroPerfil(400, 'perfil_revisao', 'Recarregue o perfil antes de salvar.')
  const atual = await lerLinha(admin, tenantId)
  const atualHash = atual ? await revisao(atual) : null
  if (esperado !== atualHash) throw new ErroPerfil(409, 'perfil_conflito', 'O perfil foi alterado em outra tela. Recarregue a versão salva antes de tentar novamente.')
  const valor = JSON.stringify({ schema: 1, ...p, atualizado_em: new Date().toISOString(), atualizado_por: autorNome?.trim().slice(0, 80) || 'Pessoa autorizada', autor_id: autorId } satisfies PerfilSalvo)
  let gravada: Linha | null
  if (atual) {
    // CAS por timestamp pequeno: comparar o TEXT de 64k no filtro criaria URL enorme.
    let q = admin.from('app_settings').update({ valor }).eq('tenant_id', tenantId)
      .eq('chave', chavePerfilAgente(tenantId)).eq('id', atual.id)
    q = atual.atualizado_em === null ? q.is('atualizado_em', null) : q.eq('atualizado_em', atual.atualizado_em)
    const { data, error } = await q.select('id, valor, atualizado_em').maybeSingle()
    if (error) throw new ErroPerfil(503, 'perfil_escrita', 'Não foi possível salvar o perfil. Tente novamente.')
    gravada = data as Linha | null
  } else {
    // Nunca upsert pela chave global: não mover nem sobrescrever linha de outro tenant.
    const { data, error } = await admin.from('app_settings').insert({ tenant_id: tenantId, chave: chavePerfilAgente(tenantId), valor })
      .select('id, valor, atualizado_em').single()
    if (error && error.code === '23505') throw new ErroPerfil(409, 'perfil_conflito', 'Não foi possível reservar o perfil. Recarregue a página ou procure a administração.')
    if (error) throw new ErroPerfil(503, 'perfil_escrita', 'Não foi possível salvar o perfil. Tente novamente.')
    gravada = data as Linha | null
  }
  if (!gravada) throw new ErroPerfil(409, 'perfil_conflito', 'O perfil mudou enquanto você salvava. Recarregue a versão salva.')
  return paraPainel(gravada)
}
