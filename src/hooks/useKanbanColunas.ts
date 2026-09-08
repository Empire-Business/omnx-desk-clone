import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Colunas configuráveis do kanban de Contratos (Fase 1).
 * Cada coluna representa um valor de `contratos.status_secundario`.
 * Escrita é permitida só para admin (garantido por RLS no banco).
 */
export interface KanbanColuna {
  id: string
  titulo: string
  status_chave: string
  cor: string
  ordem: number
  is_onboarding: boolean
  criado_em: string
  atualizado_em: string
}

// A tabela `contratos_kanban_colunas` foi criada depois da geração do types.ts,
// então ela ainda não está no tipo `Database`. Usamos um acesso destipado
// localizado apenas aqui (os resultados são convertidos para KanbanColuna
// logo abaixo). Justificativa do `any`: evitar regenerar o types.ts inteiro
// só por causa de uma tabela nova; o resto do app segue tipado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from('contratos_kanban_colunas')

const queryKey = ['contratos', 'kanban-colunas'] as const

export function useKanbanColunas() {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await tabela().select('*').order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as KanbanColuna[]
    },
  })
}

export type NovaColuna = { titulo: string; status_chave: string; cor: string; ordem: number }

export function useCreateColuna() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NovaColuna) => {
      const { data, error } = await tabela().insert(input).select().single()
      if (error) throw error
      return data as KanbanColuna
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}

export function useUpdateColuna() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<KanbanColuna> & { id: string }) => {
      const { error } = await tabela()
        .update({ ...patch, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}

export function useDeleteColuna() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabela().delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}

/** Persiste a nova ordem de várias colunas (poucas linhas, updates sequenciais). */
export function useReorderColunas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ordenadas: { id: string; ordem: number }[]) => {
      for (const c of ordenadas) {
        const { error } = await tabela().update({ ordem: c.ordem }).eq('id', c.id)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}

/** Deriva o status primário (constraint do banco) a partir da chave da coluna. */
export function statusPrimarioDaChave(chave: string): 'ativo' | 'cancelado' | 'concluido' {
  const k = (chave ?? '').toUpperCase()
  if (k.includes('CANCEL')) return 'cancelado'
  if (k.includes('CONCLU')) return 'concluido'
  return 'ativo'
}

/** Paleta de cores (classe do "dot") oferecida no gerenciador de colunas. */
export const CORES_COLUNA = [
  { valor: 'bg-success', label: 'Verde' },
  { valor: 'bg-info', label: 'Azul' },
  { valor: 'bg-warning', label: 'Amarelo' },
  { valor: 'bg-orange-500', label: 'Laranja' },
  { valor: 'bg-danger', label: 'Vermelho' },
  { valor: 'bg-purple-500', label: 'Roxo' },
  { valor: 'bg-emerald-500', label: 'Esmeralda' },
  { valor: 'bg-primary', label: 'Primária' },
  { valor: 'bg-muted-foreground', label: 'Cinza' },
] as const
