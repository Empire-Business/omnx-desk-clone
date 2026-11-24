// Quem pode disparar uma função de envio agendado (cobrança, campanhas).
//
// Essas funções rodam com service_role e mandam mensagens de WhatsApp, e ficam com
// verify_jwt = false (o agendador do banco não tem sessão). Por isso a função
// confere sozinha, e só aceita:
//   1. o agendador do banco: cabeçalho x-cron-secret conferido pela RPC
//      wa_auto_cron_secret_confere (segredo do Vault, igual a cron-wa-protegido.ts);
//   2. uma pessoa logada, ativa, com a permissão pedida (has_permissao) na própria
//      empresa. Nesse caso a função só age dentro da empresa dela.
// Qualquer outra coisa (sem cabeçalho, chave anon, token inválido) = 401.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AutorizacaoAgendador =
  | { tipo: 'cron' }
  | { tipo: 'usuario'; userId: string; tenantId: string }

export interface OpcoesAgendador {
  /** Cliente que age COMO a pessoa (anon key + Authorization do pedido). */
  criarUsuario: (jwt: string) => SupabaseClient
  recurso: string
  acao: 'ver' | 'editar' | 'admin'
}

export async function autorizarAgendador(
  req: Request, admin: SupabaseClient, opcoes: OpcoesAgendador,
): Promise<AutorizacaoAgendador | null> {
  const segredo = req.headers.get('x-cron-secret')
  if (segredo !== null) {
    if (segredo.length < 32 || segredo.length > 256) return null
    try {
      const r = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
      return !r.error && r.data === true ? { tipo: 'cron' } : null
    } catch {
      return null
    }
  }

  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!jwt) return null
  try {
    const { data, error } = await admin.auth.getUser(jwt)
    const userId = data?.user?.id
    if (error || !userId) return null
    const { data: u } = await admin.from('users').select('ativo, tenant_id').eq('id', userId).maybeSingle()
    const conta = u as { ativo?: boolean | null; tenant_id?: string | null } | null
    if (!conta?.tenant_id || conta.ativo === false) return null
    const usuario = opcoes.criarUsuario(jwt)
    const { data: pode, error: errPerm } = await usuario.rpc('has_permissao', {
      p_recurso: opcoes.recurso,
      p_acao: opcoes.acao,
    })
    if (errPerm || pode !== true) return null
    return { tipo: 'usuario', userId, tenantId: conta.tenant_id }
  } catch {
    return null
  }
}
