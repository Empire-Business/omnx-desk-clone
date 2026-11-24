import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ResumoApp { app: string; erros: number; avisos: number; ultimo: string | null }
interface LinhaLog {
  id: string; app: string; nivel: string; evento: string
  mensagem: string | null; rota: string | null; created_at: string
}

export function resumoSaudeOptions(horas: number) {
  return {
    queryKey: ['saude', 'resumo', horas],
    queryFn: async (): Promise<ResumoApp[]> => {
      const { data, error } = await supabase.rpc('resumo_saude_apps' as never, { p_horas: horas } as never)
      if (error) throw error
      return (data ?? []) as unknown as ResumoApp[]
    },
  }
}

export function ultimosErrosOptions(horas: number) {
  return {
    queryKey: ['saude', 'ultimos', horas],
    queryFn: async (): Promise<LinhaLog[]> => {
      const inicio = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('app_logs' as never)
        .select('id, app, nivel, evento, mensagem, rota, created_at')
        .eq('nivel', 'erro')
        .gte('created_at', inicio)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as LinhaLog[]
    },
  }
}

export function useSaude(horas: number, enabled: boolean) {
  return {
    resumo: useQuery({ ...resumoSaudeOptions(horas), enabled }),
    ultimos: useQuery({ ...ultimosErrosOptions(horas), enabled }),
  }
}
