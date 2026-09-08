import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { podeNoBanco } from '@/lib/permissaoRemota'
import type { Client, ClientContract, ClientWithProducts } from '@/types/database'

export const clientKeys = {
  all: ['clients'] as const,
  list: () => ['clients', 'list'] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
}

/** Fetch all clients. Non-admin users only see clients assigned to them. */
export function useClientes() {
  return useQuery({
    queryKey: clientKeys.list(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return [] as Client[]

      // Quem vê a carteira inteira? A resposta vem da MESMA função que a RLS
      // usa (has_permissao), e não mais de uma lista de perfis no código. O
      // fallback repete o gate antigo, para falha de rede não mudar acesso.
      const { data: profile } = await supabase
        .from('users')
        .select('perfil')
        .eq('id', user.id)
        .single()

      const legado = ['admin', 'gerente', 'atendimento'].includes(profile?.perfil ?? '')
      if (await podeNoBanco('clientes.carteira', 'ver', legado)) {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('nome')
        if (error) throw error
        return data as Client[]
      }

      // Non-admin: only clients assigned to this user
      const { data: assignments, error: aErr } = await supabase
        .from('client_assignments')
        .select('client_id')
        .eq('user_id', user.id)

      if (aErr) throw aErr
      if (!assignments || assignments.length === 0) return [] as Client[]

      const clientIds = assignments.map(a => a.client_id)
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .in('id', clientIds)
        .order('nome')
      if (error) throw error
      return data as Client[]
    },
  })
}

/** Fetch all contracts visible to the current user (RLS-filtered). */
export function useAllContracts() {
  return useQuery({
    queryKey: ['clients', 'contracts', 'all'] as const,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_contracts')
        .select('id, client_id, produto, data_assinatura, status')
      if (error) throw error
      return (data ?? []) as Pick<ClientContract, 'id' | 'client_id' | 'produto' | 'data_assinatura' | 'status'>[]
    },
  })
}

/** Catalog products (client_id IS NULL): the modern offering list. */
export function useCatalogProducts() {
  return useQuery({
    queryKey: ['products', 'catalog'] as const,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, nome, ativo')
        .is('client_id', null)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return (data ?? []) as { id: string; nome: string; ativo: boolean }[]
    },
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, products(*), client_contracts(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as ClientWithProducts
    },
    enabled: Boolean(id),
  })
}

export function useCreateCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nome: string; razao_social?: string; cnpj?: string; email?: string; telefone?: string; segmento?: string; endereco?: string; instagram?: string; faturamento?: string; posicionamento?: string; notas?: string; whatsapp?: string; nicho?: string; empresa?: string }) => {
      const { data, error } = await supabase.from('clients').insert(input).select().single()
      if (error) throw error
      return data as Client
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: clientKeys.all }) },
  })
}

export function useUpdateCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase.from('clients').update(input).eq('id', id).select().single()
      if (error) throw error
      return data as Client
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(data.id) })
    },
  })
}

// Contract hooks
export function useCreateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<ClientContract> & { client_id: string }) => {
      const { data, error } = await supabase.from('client_contracts').insert(input).select().single()
      if (error) throw error
      return data as ClientContract
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(data.client_id) })
    },
  })
}

export function useUpdateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ClientContract> & { id: string }) => {
      const { data, error } = await supabase.from('client_contracts').update(input).eq('id', id).select().single()
      if (error) throw error
      return data as ClientContract
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(data.client_id) })
    },
  })
}

export function useDeleteContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, client_id }: { id: string; client_id: string }) => {
      const { error } = await supabase.from('client_contracts').delete().eq('id', id)
      if (error) throw error
      return client_id
    },
    onSuccess: (client_id) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(client_id) })
    },
  })
}
