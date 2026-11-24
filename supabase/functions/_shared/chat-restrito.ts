// Grupos INTERNOS do Chat (chat_contacts.restrito_admin = true): só admin e gerente
// podem ver. No banco quem garante é a RLS (migration 20261026260000); aqui ficam
// as conferências das funções que rodam com service_role e, por isso, ignoram a RLS
// (push do webhook e ações diretas na UAZAPI).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Perfis que enxergam grupos internos (igual a public.pode_ver_restrito()). */
export const PERFIS_VEEM_RESTRITO: readonly string[] = ['admin', 'gerente']

export interface UsuarioPerfil {
  id: string
  perfil: string | null
  ativo: boolean | null
  tenant_id: string | null
}

/** Mantém só admin/gerente ativos da empresa, na ordem original e sem repetir. */
export function filtrarPerfisRestrito(ids: string[], usuarios: UsuarioPerfil[], tenantId: string): string[] {
  const ok = new Set(
    usuarios
      .filter((u) => u.ativo !== false && u.tenant_id === tenantId && PERFIS_VEEM_RESTRITO.includes(u.perfil ?? ''))
      .map((u) => u.id),
  )
  return [...new Set(ids)].filter((id) => ok.has(id))
}

/** Id do chat como o Chat guarda: minúsculo, sem espaços e sem "@g.us"/"@s.whatsapp.net"/"@c.us". */
export function baseDoChat(numero: unknown): string {
  if (typeof numero !== 'string') return ''
  return numero.trim().toLowerCase().replace(/@(g\.us|s\.whatsapp\.net|c\.us)$/, '')
}

/** Coluna/tabela/função ainda não existe (migration 20261026260000 não aplicada). */
const ERROS_OBJETO_INEXISTENTE = new Set(['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])

/**
 * true se o chat (número/grupo) é interno: contato com restrito_admin (em qualquer
 * empresa — na dúvida, esconde) OU grupo no registro chat_grupos_restritos da
 * empresa (quando tenantId vem; sem tenantId, de qualquer empresa). Objeto
 * inexistente (migration ainda não aplicada) = não restrito por aquela fonte;
 * outros erros = restrito (falha fechada). Precisa de cliente service_role.
 */
export async function chatEhRestrito(
  supabase: SupabaseClient,
  numero: unknown,
  tenantId?: string | null,
): Promise<boolean> {
  const base = baseDoChat(numero)
  if (!base) return false

  const contatos = await supabase
    .from('chat_contacts')
    .select('id')
    .eq('restrito_admin', true)
    .in('numero_whatsapp', [base, `${base}@g.us`])
    .limit(1)
  if (contatos.error) {
    if (!ERROS_OBJETO_INEXISTENTE.has(contatos.error.code ?? '')) return true
  } else if ((contatos.data ?? []).length > 0) {
    return true
  }

  let registro = supabase
    .from('chat_grupos_restritos')
    .select('grupo_base')
    .eq('grupo_base', base)
  if (tenantId) registro = registro.eq('tenant_id', tenantId)
  const grupos = await registro.limit(1)
  if (grupos.error) return !ERROS_OBJETO_INEXISTENTE.has(grupos.error.code ?? '')
  return (grupos.data ?? []).length > 0
}

/** Pergunta ao banco, COMO o usuário (JWT dele), se ele pode ver restritos. Erro = não. */
export async function usuarioPodeVerRestrito(usuario: SupabaseClient): Promise<boolean> {
  const { data, error } = await usuario.rpc('pode_ver_restrito')
  return !error && data === true
}

/**
 * Igual a usuarioPodeVerRestrito, mas se a função ainda não existe no banco
 * (migration não aplicada) decide pelo perfil (admin/gerente). Outros erros = não.
 */
export async function podeVerRestritoOuPerfil(usuario: SupabaseClient, perfil: string | null | undefined): Promise<boolean> {
  const { data, error } = await usuario.rpc('pode_ver_restrito')
  if (!error) return data === true
  if (ERROS_OBJETO_INEXISTENTE.has(error.code ?? '')) return PERFIS_VEEM_RESTRITO.includes(perfil ?? '')
  return false
}
