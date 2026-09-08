import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Vínculos do cliente que vivem em OUTROS apps.
 *
 * O §6 do brief de reestruturação pede que o cadastro do cliente seja central:
 * uma pessoa, vários contratos, produtos, fluxos financeiros, conversas e
 * atendimentos — visíveis num lugar só. Contratos e produtos já estavam na
 * tela; conversas (Chat) e demandas (Atendimento) só existiam dentro dos seus
 * apps, então "o que está acontecendo com este cliente?" exigia abrir três
 * telas e cruzar de cabeça.
 *
 * Estas queries são deliberadamente rasas: a visão 360 é um índice do que
 * existe, não uma segunda cópia de cada app. Quem quiser operar clica e vai
 * para o app dono do dado — que é onde a permissão e o fluxo completo moram.
 *
 * Segurança: nenhuma query filtra por tenant. A RLS já faz isso em toda tabela,
 * e repetir o filtro no front dá falsa sensação de proteção — se a policy
 * falhar, o front não seguraria mesmo.
 */

export interface ConversaDoCliente {
  id: string
  status: string | null
  atualizado_em: string | null
  /** O inbox abre conversa por contato (`/chat?contato=…`), não por id de conversa. */
  contato_id: string | null
  contato_nome: string | null
  contato_numero: string | null
}

/** Conversas de WhatsApp de todos os contatos ligados a este cliente. */
export function useConversasDoCliente(clientId: string | undefined) {
  return useQuery({
    queryKey: ['cliente-vinculos', 'conversas', clientId],
    queryFn: async (): Promise<ConversaDoCliente[]> => {
      // !inner porque só interessam conversas cujo contato é deste cliente —
      // sem o inner, o PostgREST devolveria conversa com contato nulo.
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id, status, atualizado_em, contact_id, chat_contacts!inner(nome, numero_whatsapp, client_id)')
        .eq('chat_contacts.client_id', clientId!)
        .order('atualizado_em', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []).map((c: any) => ({
        id: c.id,
        status: c.status,
        atualizado_em: c.atualizado_em,
        contato_id: c.contact_id ?? null,
        contato_nome: c.chat_contacts?.nome ?? null,
        contato_numero: c.chat_contacts?.numero_whatsapp ?? null,
      }))
    },
    enabled: !!clientId,
  })
}

export interface DemandaDoCliente {
  id: string
  codigo: string | null
  titulo: string
  prazo: string | null
  concluida_em: string | null
  etapa_nome: string | null
  responsavel_nome: string | null
}

/** Demandas/atendimentos abertos e recentes deste cliente. */
export function useDemandasDoCliente(clientId: string | undefined) {
  return useQuery({
    queryKey: ['cliente-vinculos', 'demandas', clientId],
    queryFn: async (): Promise<DemandaDoCliente[]> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_demandas')
        .select('id, codigo, titulo, prazo, concluida_em, etapa:atendimento_etapas(nome), responsavel:users(nome)')
        .eq('cliente_id', clientId!)
        // Em aberto primeiro (concluida_em nulo), depois por prazo mais próximo.
        .order('concluida_em', { ascending: true, nullsFirst: true })
        .order('prazo', { ascending: true, nullsFirst: false })
        .limit(20)
      if (error) throw error
      return (data ?? []).map((d: any) => ({
        id: d.id,
        codigo: d.codigo,
        titulo: d.titulo,
        prazo: d.prazo,
        concluida_em: d.concluida_em,
        etapa_nome: d.etapa?.nome ?? null,
        responsavel_nome: d.responsavel?.nome ?? null,
      }))
    },
    enabled: !!clientId,
  })
}
