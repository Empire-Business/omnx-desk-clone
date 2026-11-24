import type { Json } from '@/integrations/supabase/types'
import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  user_id: string | null
  user_nome: string | null
  user_perfil: string | null
  acao: string
  entidade: string
  entidade_id: string | null
  detalhes: Record<string, unknown> | null
  ip_address: string | null
  criado_em: string
}

export interface AuditLogFilters {
  acao?: string
  entidade?: string
  user_id?: string
  from?: string
  to?: string
}

// ─── Query keys ──────────────────────────────────────────────────────────────

const auditKeys = {
  all: ['audit_logs'] as const,
  list: (filters?: AuditLogFilters) => ['audit_logs', 'list', filters] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(200)

      if (filters?.acao) query = query.eq('acao', filters.acao)
      if (filters?.entidade) query = query.eq('entidade', filters.entidade)
      if (filters?.user_id) query = query.eq('user_id', filters.user_id)
      if (filters?.from) query = query.gte('criado_em', filters.from)
      if (filters?.to) query = query.lte('criado_em', filters.to)

      const { data, error } = await query
      if (error) throw error
      return data as AuditLog[]
    },
  })
}

export function useLogAudit() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      acao: string
      entidade: string
      entidade_id?: string
      detalhes?: { [key: string]: Json | undefined }
    }) => {
      const { error } = await supabase.from('audit_logs').insert({
        tenant_id: await tenantDaSessao(),
        user_id: user?.id ?? null,
        user_nome: user?.nome ?? null,
        user_perfil: user?.perfil ?? null,
        acao: params.acao,
        entidade: params.entidade,
        entidade_id: params.entidade_id ?? null,
        detalhes: params.detalhes ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: auditKeys.all }),
  })
}
