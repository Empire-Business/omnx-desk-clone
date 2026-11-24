// Telefones e JIDs do WhatsApp (lado servidor). Módulo PURO: sem imports, sem
// banco, sem Deno — roda na edge function e no Vitest.
//
//   waNumberVariants  — as duas formas de um celular BR (com e sem o 9º dígito),
//                       usadas pelo uazapi-webhook para não duplicar contatos.
//   chaveTelefoneBR   — forma CANÔNICA (sempre com o 9º dígito no celular BR).
//                       É a MESMA regra da coluna gerada
//                       wa_agente_membros.telefone_chave (migration
//                       20261027090000_automacoes_wa_agente_base.sql). Mudou aqui →
//                       mude lá (e vice-versa).
//   jidParaNumero     — "5511…@s.whatsapp.net" / "5511…:12@s.whatsapp.net" → dígitos.
//                       LID ("…@lid") e grupo ("…@g.us") NÃO são telefone → null.
//   jidUsuario        — parte do usuário de qualquer JID, sem o ":aparelho"
//                       (serve para comparar LIDs).

/**
 * O WhatsApp ora manda o número com o 9 (55 + DDD + 9 + 8 díg = 13), ora sem (12).
 * Para não duplicar contatos, geramos as duas variações e procuramos por ambas.
 */
export function waNumberVariants(numero: string): string[] {
  const d = String(numero ?? '').replace(/\D/g, '')
  const set = new Set<string>()
  if (d) set.add(d)
  // Só trata números brasileiros (55 + DDD + número local)
  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4)
    const local = d.slice(4)
    if (local.length === 9 && local.startsWith('9')) {
      set.add(`55${ddd}${local.slice(1)}`) // versão SEM o nono dígito
    } else if (local.length === 8) {
      set.add(`55${ddd}9${local}`) // versão COM o nono dígito
    }
  }
  return [...set]
}

/** Celular BR gravado sem o 9º dígito: 55 + DDD (11–99) + 8 dígitos começando em 6–9. */
const CELULAR_BR_SEM_NOVE = /^55[1-9][0-9][6-9][0-9]{7}$/

/**
 * Chave canônica de telefone (só dígitos, sem "+"):
 *   - celular BR sem o 9º dígito → '55' + DDD + '9' + 8 dígitos;
 *   - qualquer outro número (BR com 9, fixo BR, internacional) → os dígitos como vieram.
 * Vazio quando não há dígitos. Igual à coluna gerada wa_agente_membros.telefone_chave:
 *   CASE WHEN telefone ~ '^\+55[1-9][0-9][6-9][0-9]{7}$'
 *        THEN '55' || substr(telefone, 4, 2) || '9' || substr(telefone, 6)
 *        ELSE substr(telefone, 2) END
 */
export function chaveTelefoneBR(bruto: string | null | undefined): string {
  const d = String(bruto ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (CELULAR_BR_SEM_NOVE.test(d)) return `55${d.slice(2, 4)}9${d.slice(4)}`
  return d
}

/** Parte do usuário de um JID ("123:4@lid" → "123"), minúscula. Vazio se não houver. */
export function jidUsuario(jid: string | null | undefined): string {
  const s = String(jid ?? '').trim().toLowerCase()
  if (!s) return ''
  const semServidor = s.split('@')[0] ?? ''
  return (semServidor.split(':')[0] ?? '').trim()
}

/** Servidor do JID ("s.whatsapp.net", "lid", "g.us", "c.us") ou '' quando não há "@". */
export function jidServidor(jid: string | null | undefined): string {
  const s = String(jid ?? '').trim().toLowerCase()
  const i = s.indexOf('@')
  return i >= 0 ? s.slice(i + 1) : ''
}

/**
 * Telefone (só dígitos) de um JID de PESSOA. LID e grupo não carregam telefone → null.
 * Sem "@" (ex.: "5511999998888") aceita como número puro.
 */
export function jidParaNumero(jid: string | null | undefined): string | null {
  const servidor = jidServidor(jid)
  if (servidor && servidor !== 's.whatsapp.net' && servidor !== 'c.us') return null
  const usuario = jidUsuario(jid)
  if (!/^[0-9]{8,15}$/.test(usuario)) return null
  return usuario
}
