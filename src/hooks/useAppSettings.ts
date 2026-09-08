import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const settingsKeys = {
  all: ['app-settings'] as const,
}

export function useAppSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*')
      if (error) throw error
      const settings: Record<string, string> = {}
      for (const row of data ?? []) {
        settings[row.chave] = row.valor
      }
      return settings
    },
  })
}

export function useSaveAppSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ chave, valor }: { chave: string; valor: string }) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ chave, valor }, { onConflict: 'chave' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  })
}

export function useSaveAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entries: { chave: string; valor: string }[]) => {
      for (const entry of entries) {
        const { error } = await supabase
          .from('app_settings')
          .upsert({ chave: entry.chave, valor: entry.valor }, { onConflict: 'chave' })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
  })
}
