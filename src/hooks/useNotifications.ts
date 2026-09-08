import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface Notification {
  id: string
  user_id: string
  tipo: string
  titulo: string
  mensagem: string | null
  lida: boolean
  link: string | null
  metadata: Record<string, unknown> | null
  criado_em: string
}

export const notifKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
  unread: () => ['notifications', 'unread'] as const,
}

export function useNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: notifKeys.list(),
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('criado_em', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Notification[]
    },
    enabled: Boolean(user),
  })
}

export function useUnreadCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: notifKeys.unread(),
    queryFn: async () => {
      if (!user) return 0
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('lida', false)
      if (error) throw error
      return count ?? 0
    },
    enabled: Boolean(user),
  })
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ lida: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notifKeys.list() })
      queryClient.invalidateQueries({ queryKey: notifKeys.unread() })
    },
  })
}

export function useMarkAllAsRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!user) return
      const { error } = await supabase
        .from('notifications')
        .update({ lida: true })
        .eq('user_id', user.id)
        .eq('lida', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notifKeys.list() })
      queryClient.invalidateQueries({ queryKey: notifKeys.unread() })
    },
  })
}

export function useRealtimeNotifications() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('notifications:' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: notifKeys.all })
        queryClient.invalidateQueries({ queryKey: notifKeys.unread() })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])
}
