// Rodapé "como falar com o assistente" nos envios INTERNOS pela UAZAPI (relatório
// diário). Decide QUEM recebe o rodapé e monta o texto literal
// (./wa-agente-como-chamar.ts).
//
// Regra (plano 1e): só com o assistente LIGADO (wa_auto_config.agente_ativo) e só
// para destino que o assistente atende de fato:
//   * pessoa: telefone de um membro ATIVO (wa_agente_membros) e respostas no privado ligadas;
//   * grupo: grupo liberado e ativo em wa_agente_grupos e respostas em grupo ligadas.
// Nunca no resumo semanal (cliente) nem no link de reunião (grupo do cliente).
// Tabelas ainda não criadas (migration não aplicada) → sem rodapé (falha silenciosa).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chaveTelefone } from './telefone.ts'
import { destinoGrupo } from './wa-grupos-internos.ts'
import { rodapeComoChamar } from './wa-agente-como-chamar.ts'

export interface InfoComoFalar {
  nome: string
  nomeContato: string | null
  privado: boolean
  grupos: boolean
  /** Chaves (telefone.ts) dos membros ativos. */
  membros: ReadonlySet<string>
  /** Grupo liberado → telefone do número principal dele (ou null). */
  gruposLiberados: ReadonlyMap<string, string | null>
}

export type DestinoRodape = { tipo: 'pessoa'; destino: string } | { tipo: 'grupo'; destino: string }

/** Rodapé para este destino, ou null (não é membro/grupo liberado, ou canal desligado). PURA. */
export function comoFalarPara(info: InfoComoFalar | null, d: DestinoRodape, aleatorio: () => number = Math.random): string | null {
  if (!info) return null
  if (d.tipo === 'pessoa') {
    if (!info.privado) return null
    const k = chaveTelefone(d.destino)
    if (!k || !info.membros.has(k)) return null
    return rodapeComoChamar('privado', { nome: info.nome }, aleatorio)
  }
  if (!info.grupos) return null
  const jid = destinoGrupo(d.destino)
  if (!jid || !info.gruposLiberados.has(jid)) return null
  return rodapeComoChamar('grupo', { nome: info.nome, nomeContato: info.nomeContato, telefoneNumero: info.gruposLiberados.get(jid) ?? null }, aleatorio)
}

/** Lê o que o rodapé precisa. Assistente desligado, tabela ausente ou erro → null. */
export async function carregarInfoComoFalar(admin: SupabaseClient, tenantId: string): Promise<InfoComoFalar | null> {
  try {
    const { data: cfg, error } = await admin.from('wa_auto_config').select('*').eq('tenant_id', tenantId).maybeSingle()
    if (error || !cfg) return null
    const c = cfg as Record<string, unknown>
    if (c.agente_ativo !== true) return null
    const nome = typeof c.agente_nome === 'string' && c.agente_nome.trim() ? c.agente_nome.trim() : null
    if (!nome) return null

    const { data: ms, error: e1 } = await admin.from('wa_agente_membros').select('telefone')
      .eq('tenant_id', tenantId).eq('ativo', true).limit(500)
    if (e1) return null
    const membros = new Set(((ms ?? []) as { telefone: string | null }[]).map((m) => chaveTelefone(m.telefone)).filter(Boolean))

    const gruposLiberados = new Map<string, string | null>()
    const { data: gs, error: e2 } = await admin.from('wa_agente_grupos').select('id, grupo_jid')
      .eq('tenant_id', tenantId).eq('ativo', true).limit(100)
    if (!e2) {
      const grupos = (gs ?? []) as { id: string; grupo_jid: string }[]
      const ids = grupos.map((g) => g.id)
      const principal = new Map<string, string>()
      if (ids.length > 0) {
        const { data: ns } = await admin.from('wa_agente_grupo_numeros').select('grupo_id, instance_uuid, ordem')
          .eq('tenant_id', tenantId).in('grupo_id', ids).order('ordem', { ascending: true })
        for (const n of (ns ?? []) as { grupo_id: string; instance_uuid: string }[]) {
          if (!principal.has(n.grupo_id)) principal.set(n.grupo_id, n.instance_uuid)
        }
      }
      const insts = [...new Set(principal.values())]
      const telefones = new Map<string, string | null>()
      if (insts.length > 0) {
        const { data: wi } = await admin.from('whatsapp_instances').select('id, numero_whatsapp').eq('tenant_id', tenantId).in('id', insts)
        for (const w of (wi ?? []) as { id: string; numero_whatsapp: string | null }[]) telefones.set(w.id, w.numero_whatsapp)
      }
      for (const g of grupos) {
        const jid = destinoGrupo(g.grupo_jid)
        if (jid) gruposLiberados.set(jid, telefones.get(principal.get(g.id) ?? '') ?? null)
      }
    }
    return {
      nome,
      nomeContato: typeof c.agente_nome_contato === 'string' ? c.agente_nome_contato : null,
      privado: c.agente_privado !== false,
      grupos: c.agente_grupos === true,
      membros,
      gruposLiberados,
    }
  } catch {
    return null
  }
}
