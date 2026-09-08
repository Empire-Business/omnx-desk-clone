import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product, Deliverable, ProductWithDeliverables } from '@/types/database'

export const productKeys = {
  all: ['products'] as const,
  list: () => ['products', 'list'] as const,
  byClient: (clientId: string) => ['products', 'client', clientId] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
  deliverables: (productId: string) => ['deliverables', 'product', productId] as const,
}

export function useProdutos() {
  return useQuery({
    queryKey: productKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, clients(id, nome)')
        .order('nome')
      if (error) throw error
      return data as Array<Product & { clients: { id: string; nome: string } }>
    },
  })
}

export function useProdutosByClient(clientId: string) {
  return useQuery({
    queryKey: productKeys.byClient(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, deliverables(*)')
        .eq('client_id', clientId)
        .order('nome')
      if (error) throw error
      return data as ProductWithDeliverables[]
    },
    enabled: Boolean(clientId),
  })
}

export function useProduto(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, deliverables(*), clients(id, nome)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as ProductWithDeliverables
    },
    enabled: Boolean(id),
  })
}

export function useCreateProduto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { client_id: string; nome: string; descricao?: string }) => {
      const { data, error } = await supabase.from('products').insert(input).select().single()
      if (error) throw error
      return data as Product
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.all })
      queryClient.invalidateQueries({ queryKey: productKeys.byClient(data.client_id) })
    },
  })
}

export function useCreateEntregavel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { product_id: string; nome: string; tipo: Deliverable['tipo']; descricao?: string; quantidade?: number }) => {
      const { data, error } = await supabase.from('deliverables').insert(input).select().single()
      if (error) throw error
      return data as Deliverable
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: productKeys.deliverables(data.product_id) })
      queryClient.invalidateQueries({ queryKey: productKeys.detail(data.product_id) })
      queryClient.invalidateQueries({ queryKey: productKeys.byClient('') }) // bust all byClient
    },
  })
}

export function useDeleteEntregavel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, product_id }: { id: string; product_id: string }) => {
      const { error } = await supabase.from('deliverables').delete().eq('id', id)
      if (error) throw error
      return { id, product_id }
    },
    onSuccess: ({ product_id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(product_id) })
      queryClient.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}
