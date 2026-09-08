import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatTemplate {
  id: string
  nome: string
  categoria: 'saudacao' | 'encerramento' | 'csat' | 'informativo' | 'cobranca' | 'outro'
  conteudo: string
  variaveis: string[]
  ativo: boolean
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))]
}

// ─── Query keys ──────────────────────────────────────────────────────────────

const templateKeys = {
  all: ['chat_templates'] as const,
  list: (categoria?: string) => ['chat_templates', 'list', categoria] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useTemplates(categoria?: string) {
  return useQuery({
    queryKey: templateKeys.list(categoria),
    queryFn: async () => {
      let query = supabase
        .from('chat_templates')
        .select('*')
        .order('nome', { ascending: true })

      if (categoria) query = query.eq('categoria', categoria)

      const { data, error } = await query
      if (error) throw error
      return data as ChatTemplate[]
    },
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      nome: string
      categoria: string
      conteudo: string
    }) => {
      const variaveis = extractVariables(params.conteudo)
      const { data, error } = await supabase
        .from('chat_templates')
        .insert({ ...params, variaveis })
        .select()
        .single()
      if (error) throw error
      return data as ChatTemplate
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      nome?: string
      categoria?: string
      conteudo?: string
    }) => {
      const { id, ...updates } = params
      if (updates.conteudo) {
        (updates as Record<string, unknown>).variaveis = extractVariables(updates.conteudo)
      }
      (updates as Record<string, unknown>).atualizado_em = new Date().toISOString()
      const { error } = await supabase.from('chat_templates').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chat_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  })
}

export function useToggleTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('chat_templates')
        .update({ ativo: !ativo, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all }),
  })
}
