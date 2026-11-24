// Leitura das transcrições de áudio / descrições de imagem (chat_midia_texto,
// migration 20261027130000) para quem monta transcrição de conversa: análise de
// satisfação (wa-auto-satisfacao) e ferramentas da Íris (resumo_conversa_*).
//
// * Sempre por empresa (`.eq('tenant_id', T)`) e só status 'ok'.
// * Falha de leitura (inclusive a tabela ainda não existir) NÃO derruba quem
//   chamou: sem texto, a mensagem continua "(enviou um áudio)".
// * O texto é DADO não confiável; quem formata (montarTranscricao) limpa e
//   neutraliza de novo.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface TextoMidia {
  tipo: 'transcricao' | 'descricao'
  texto: string
}

const LOTE = 150

/** message_id → texto (só os que deram certo). */
export async function carregarTextosMidia(
  admin: SupabaseClient, tenantId: string, messageIds: readonly string[],
): Promise<Map<string, TextoMidia>> {
  const mapa = new Map<string, TextoMidia>()
  const ids = [...new Set(messageIds.filter((x) => typeof x === 'string' && x.length > 0))]
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await admin.from('chat_midia_texto')
      .select('message_id, tipo, texto')
      .eq('tenant_id', tenantId)
      .eq('status', 'ok')
      .in('message_id', ids.slice(i, i + LOTE))
    if (error) return mapa
    for (const r of (data ?? []) as { message_id: string; tipo: string; texto: string | null }[]) {
      if ((r.tipo === 'transcricao' || r.tipo === 'descricao') && r.texto) {
        mapa.set(r.message_id, { tipo: r.tipo, texto: r.texto })
      }
    }
  }
  return mapa
}

/**
 * Devolve as mensagens com `midia_texto` preenchido quando há transcrição /
 * descrição (só para mensagens de mídia, que são as únicas que podem ter).
 */
export async function comTextosMidia<T extends { id?: string | null; tipo?: string | null }>(
  admin: SupabaseClient, tenantId: string, msgs: readonly T[],
): Promise<(T & { midia_texto?: TextoMidia | null })[]> {
  const ids = msgs
    .filter((m) => m.id && String(m.tipo ?? 'texto').toLowerCase() !== 'texto')
    .map((m) => m.id as string)
  if (ids.length === 0) return [...msgs]
  let mapa: Map<string, TextoMidia>
  try {
    mapa = await carregarTextosMidia(admin, tenantId, ids)
  } catch {
    return [...msgs]
  }
  return msgs.map((m) => (m.id && mapa.has(m.id) ? { ...m, midia_texto: mapa.get(m.id) } : m))
}
