import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailQueueItem {
  id: string
  destinatario_email: string
  destinatario_nome: string | null
  assunto: string
  corpo_html: string
  corpo_texto: string | null
  tipo: string
  referencia_tipo: string | null
  referencia_id: string | null
  tentativas: number
  max_tentativas: number
  status: 'pendente' | 'enviando' | 'enviado' | 'erro'
  erro: string | null
  enviado_em: string | null
  criado_em: string
}

export interface EmailStats {
  pendente: number
  enviado: number
  erro: number
  total: number
}

// ─── Query keys ──────────────────────────────────────────────────────────────

const emailKeys = {
  all: ['email_queue'] as const,
  list: (status?: string) => ['email_queue', 'list', status] as const,
  stats: () => ['email_queue', 'stats'] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useEmailQueue(filters?: { status?: string }) {
  return useQuery({
    queryKey: emailKeys.list(filters?.status),
    queryFn: async () => {
      let query = supabase
        .from('email_queue')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(100)

      if (filters?.status) query = query.eq('status', filters.status)

      const { data, error } = await query
      if (error) throw error
      return data as EmailQueueItem[]
    },
  })
}

export function useEmailStats() {
  return useQuery({
    queryKey: emailKeys.stats(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_queue')
        .select('status')

      if (error) throw error

      const stats: EmailStats = { pendente: 0, enviado: 0, erro: 0, total: 0 }
      for (const item of data ?? []) {
        stats.total++
        if (item.status === 'pendente' || item.status === 'enviando') stats.pendente++
        else if (item.status === 'enviado') stats.enviado++
        else if (item.status === 'erro') stats.erro++
      }
      return stats
    },
  })
}
