import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Delivery, DeliveryStatus, DeliveryWithDetails, DeliveryWithVersions } from '@/types/database'

export const deliveryKeys = {
  all: ['deliveries'] as const,
  list: (filters?: DeliveryFilters) => ['deliveries', 'list', filters ?? {}] as const,
  detail: (id: string) => ['deliveries', 'detail', id] as const,
}

export interface DeliveryFilters {
  status?: DeliveryStatus
  clientId?: string
  responsavelId?: string
}

export function useEntregas(filters?: DeliveryFilters) {
  return useQuery({
    queryKey: deliveryKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('deliveries')
        .select('*, clients(id, nome), deliverables(id, nome, tipo, products(id, nome)), users(id, nome)')
        .order('criado_em', { ascending: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.clientId) query = query.eq('client_id', filters.clientId)
      if (filters?.responsavelId) query = query.eq('responsavel_id', filters.responsavelId)

      const { data, error } = await query
      if (error) throw error
      return data as DeliveryWithDetails[]
    },
  })
}

export function useEntrega(id: string) {
  return useQuery({
    queryKey: deliveryKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*, clients(id, nome), deliverables(id, nome, tipo, products(id, nome)), users(id, nome), delivery_versions(*, delivery_content_items(*))')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as DeliveryWithVersions
    },
    enabled: Boolean(id),
  })
}

export function useCreateEntrega() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { deliverable_id: string; client_id: string; titulo: string; prazo?: string; responsavel_id?: string }) => {
      const { data, error } = await supabase.from('deliveries').insert(input).select().single()
      if (error) throw error
      return data as Delivery
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: deliveryKeys.all }) },
  })
}

export function useUpdateEntregaStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DeliveryStatus }) => {
      const { data, error } = await supabase.from('deliveries').update({ status }).eq('id', id).select().single()
      if (error) throw error
      return data as Delivery
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.detail(data.id) })
    },
  })
}
