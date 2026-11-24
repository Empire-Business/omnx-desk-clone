import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ClientNote {
  id: string
  client_id: string
  author_id: string | null
  author_nome: string | null
  conteudo: string
  created_at: string
  updated_at: string
}

const notesKey = (clientId: string) => ['client-notes', clientId] as const

export function useClientNotes(clientId: string | undefined) {
  return useQuery({
    queryKey: notesKey(clientId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ClientNote[]
    },
    enabled: Boolean(clientId),
    staleTime: 30 * 1000,
  })
}

export function useCreateClientNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { client_id: string; conteudo: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      let author_nome: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('nome')
          .eq('id', user.id)
          .single()
        author_nome = profile?.nome ?? null
      }
      const { data, error } = await supabase
        .from('client_notes')
        .insert({ ...({
          client_id: input.client_id,
          conteudo: input.conteudo,
          author_id: user?.id ?? null,
          author_nome,
        }), tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as ClientNote
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: notesKey(note.client_id) })
    },
  })
}

export function useUpdateClientNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; conteudo: string }) => {
      const { data, error } = await supabase
        .from('client_notes')
        .update({ conteudo: input.conteudo })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      return data as ClientNote
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: notesKey(note.client_id) })
    },
  })
}

export function useDeleteClientNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; client_id: string }) => {
      const { error } = await supabase.from('client_notes').delete().eq('id', input.id)
      if (error) throw error
      return input
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: notesKey(input.client_id) })
    },
  })
}
