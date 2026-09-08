import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DeliveryApproval, DeliveryComment } from '@/types/database'
import { deliveryKeys } from '@/hooks/useEntregas'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalWithUser extends DeliveryApproval {
  users: { id: string; nome: string } | null
}

export interface CommentWithAuthor extends DeliveryComment {
  users: { id: string; nome: string; perfil: string } | null
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const approvalKeys = {
  all: ['approvals'] as const,
  approvals: (deliveryId: string) => ['approvals', 'list', deliveryId] as const,
  comments: (deliveryId: string) => ['approvals', 'comments', deliveryId] as const,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useApprovals(deliveryId: string) {
  return useQuery({
    queryKey: approvalKeys.approvals(deliveryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_approvals')
        .select('*, users(id, nome)')
        .eq('delivery_id', deliveryId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as ApprovalWithUser[]
    },
    enabled: Boolean(deliveryId),
  })
}

export function useComments(deliveryId: string) {
  return useQuery({
    queryKey: approvalKeys.comments(deliveryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_comments')
        .select('*, users(id, nome, perfil)')
        .eq('delivery_id', deliveryId)
        .order('criado_em')
      if (error) throw error
      return data as CommentWithAuthor[]
    },
    enabled: Boolean(deliveryId),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useApproveDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      versionId,
      userId,
      notas,
    }: {
      deliveryId: string
      versionId: string
      userId: string
      notas?: string
    }) => {
      const { error: approvalError } = await supabase
        .from('delivery_approvals')
        .insert({
          delivery_id: deliveryId,
          version_id: versionId,
          aprovado_por: userId,
          aprovado: true,
          notas: notas ?? null,
        })
      if (approvalError) throw approvalError

      const { data, error: statusError } = await supabase
        .from('deliveries')
        .update({ status: 'aprovado' })
        .eq('id', deliveryId)
        .select()
        .single()
      if (statusError) throw statusError
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.approvals(variables.deliveryId) })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.detail(variables.deliveryId) })
    },
  })
}

export function useRejectDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      versionId,
      userId,
      notas,
    }: {
      deliveryId: string
      versionId: string
      userId: string
      notas?: string
    }) => {
      const { error: approvalError } = await supabase
        .from('delivery_approvals')
        .insert({
          delivery_id: deliveryId,
          version_id: versionId,
          aprovado_por: userId,
          aprovado: false,
          notas: notas ?? null,
        })
      if (approvalError) throw approvalError

      const { data, error: statusError } = await supabase
        .from('deliveries')
        .update({ status: 'em_revisao' })
        .eq('id', deliveryId)
        .select()
        .single()
      if (statusError) throw statusError
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.approvals(variables.deliveryId) })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.detail(variables.deliveryId) })
    },
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      versionId,
      userId,
      texto,
    }: {
      deliveryId: string
      versionId?: string
      userId: string
      texto: string
    }) => {
      const { data, error } = await supabase
        .from('delivery_comments')
        .insert({
          delivery_id: deliveryId,
          version_id: versionId ?? null,
          autor_id: userId,
          texto,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.comments(variables.deliveryId) })
    },
  })
}

export function usePublishDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ deliveryId }: { deliveryId: string }) => {
      const { data, error } = await supabase
        .from('deliveries')
        .update({ status: 'publicado' })
        .eq('id', deliveryId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.detail(variables.deliveryId) })
    },
  })
}
