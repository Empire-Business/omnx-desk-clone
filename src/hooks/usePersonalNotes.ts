import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PersonalNote {
  id: string
  user_id: string
  title: string | null
  content: string
  tipo: 'texto' | 'imagem' | 'documento'
  media_url: string | null
  pinned: boolean
  tags: string[]
  color: string
  reminder_at: string | null
  created_at: string
  updated_at: string
}

export const noteKeys = {
  all: ['personal-notes'] as const,
  list: (search?: string, tag?: string) => ['personal-notes', 'list', search ?? '', tag ?? ''] as const,
}

export function usePersonalNotes(search?: string, tag?: string) {
  return useQuery({
    queryKey: noteKeys.list(search, tag),
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      let query = supabase
        .from('personal_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (tag) query = query.contains('tags', [tag])

      const { data, error } = await query
      if (error) throw error

      let notes = data as PersonalNote[]
      if (search) {
        const s = search.toLowerCase()
        notes = notes.filter(n =>
          n.content.toLowerCase().includes(s) ||
          (n.title ?? '').toLowerCase().includes(s)
        )
      }
      return notes
    },
  })
}

export function useAddNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      content: string
      title?: string | null
      tipo?: PersonalNote['tipo']
      media_url?: string
      tags?: string[]
      color?: string
      reminder_at?: string | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')
      const { data, error } = await supabase
        .from('personal_notes')
        .insert({ user_id: user.id, color: 'default', ...payload })
        .select()
        .single()
      if (error) throw error
      return data as PersonalNote
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Omit<PersonalNote, 'id' | 'user_id' | 'created_at'>>) => {
      const { data, error } = await supabase
        .from('personal_notes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as PersonalNote
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.all }),
  })
}

export function useRealtimeNotes(enabled = true) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel('personal-notes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_notes' }, () => {
        queryClient.invalidateQueries({ queryKey: noteKeys.all })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient, enabled])
}

export async function uploadNoteMedia(file: File, userId: string) {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `personal-notes/${userId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('chat-media')
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(data.path)
  return urlData.publicUrl
}
