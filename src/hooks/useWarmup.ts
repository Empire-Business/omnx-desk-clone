import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface WarmupGroup {
  id: string
  nome: string
  wa_chatid: string
  instance_ids: string[]
  frases: string[]
  intervalo_min_seg: number
  intervalo_max_seg: number
  horario_inicio: string
  horario_fim: string
  ativo: boolean
  ultima_mensagem_em: string | null
  proxima_mensagem_em: string | null
  criado_em: string
  usar_ia: boolean
  tema: string
  personalidades: Record<string, string>
}

export interface WarmupLog {
  id: string
  group_id: string
  instance_id: string
  mensagem: string
  sucesso: boolean
  enviado_em: string
  uazapi_response: Record<string, unknown> | null
}

export function useWarmupGroups() {
  return useQuery({
    queryKey: ['warmup-groups'],
    queryFn: async (): Promise<WarmupGroup[]> => {
      const { data, error } = await supabase
        .from('wa_warmup_groups')
        .select('*')
        .order('criado_em', { ascending: true })
      if (error) throw error
      return (data ?? []) as WarmupGroup[]
    },
  })
}

export function useUpdateWarmupGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<Omit<WarmupGroup, 'id'>>) => {
      const { id, ...patch } = input
      const { error } = await supabase
        .from('wa_warmup_groups')
        .update({ ...patch, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warmup-groups'] }),
  })
}

export function useWarmupLogs(groupId: string | null, limit = 20) {
  return useQuery({
    queryKey: ['warmup-logs', groupId, limit],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<WarmupLog[]> => {
      const { data, error } = await supabase
        .from('wa_warmup_logs')
        .select('id, group_id, instance_id, mensagem, sucesso, enviado_em, uazapi_response')
        .eq('group_id', groupId!)
        .order('enviado_em', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as WarmupLog[]
    },
    refetchInterval: 30_000,
  })
}

export function useWarmupCountToday(groupId: string | null) {
  return useQuery({
    queryKey: ['warmup-count-today', groupId],
    enabled: Boolean(groupId),
    queryFn: async (): Promise<number> => {
      const startUtc = new Date()
      startUtc.setUTCHours(3, 0, 0, 0) // ~00:00 BRT
      const { count, error } = await supabase
        .from('wa_warmup_logs')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId!)
        .gte('enviado_em', startUtc.toISOString())
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 30_000,
  })
}
