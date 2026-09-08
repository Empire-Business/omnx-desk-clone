import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Local types ──────────────────────────────────────────────────────────────

export interface LearningPath {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'interno' | 'cliente'
  thumbnail_url: string | null
  ativo: boolean
  ordem: number
  criado_em: string
  atualizado_em: string
}

export interface LearningModule {
  id: string
  path_id: string
  titulo: string
  descricao: string | null
  ordem: number
  criado_em: string
}

export interface LearningLesson {
  id: string
  module_id: string
  titulo: string
  descricao: string | null
  tipo: 'video' | 'texto' | 'pdf' | 'link'
  conteudo_url: string | null
  conteudo_texto: string | null
  duracao_minutos: number | null
  ordem: number
  criado_em: string
}

export interface LearningProgress {
  id: string
  user_id: string
  lesson_id: string
  concluido: boolean
  concluido_em: string | null
  criado_em: string
}

export interface LearningModuleWithLessons extends LearningModule {
  learning_lessons: LearningLesson[]
}

export interface LearningPathWithModules extends LearningPath {
  learning_modules: LearningModuleWithLessons[]
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const trilhasKeys = {
  all: ['trilhas'] as const,
  list: (tipo?: 'interno' | 'cliente') => ['trilhas', 'list', tipo ?? 'all'] as const,
  detail: (id: string) => ['trilhas', 'detail', id] as const,
  progress: (userId: string) => ['trilhas', 'progress', userId] as const,
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTrilhas(tipo?: 'interno' | 'cliente') {
  return useQuery({
    queryKey: trilhasKeys.list(tipo),
    queryFn: async () => {
      let query = supabase
        .from('learning_paths')
        .select('*')
        .order('ordem', { ascending: true })

      if (tipo) query = query.eq('tipo', tipo)

      const { data, error } = await query
      if (error) throw error
      return data as LearningPath[]
    },
  })
}

export function useTrilha(id: string) {
  return useQuery({
    queryKey: trilhasKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_paths')
        .select('*, learning_modules(*, learning_lessons(*))')
        .eq('id', id)
        .single()
      if (error) throw error

      // Sort modules and lessons by ordem
      const path = data as LearningPathWithModules
      path.learning_modules = [...path.learning_modules].sort((a, b) => a.ordem - b.ordem)
      path.learning_modules.forEach((mod) => {
        mod.learning_lessons = [...mod.learning_lessons].sort((a, b) => a.ordem - b.ordem)
      })
      return path
    },
    enabled: Boolean(id),
  })
}

export function useMyProgress() {
  const { user } = useAuth()
  return useQuery({
    queryKey: trilhasKeys.progress(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_progress')
        .select('*')
        .eq('user_id', user!.id)
      if (error) throw error
      return data as LearningProgress[]
    },
    enabled: Boolean(user?.id),
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useMarkLessonComplete() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (lessonId: string) => {
      if (!user) throw new Error('Usuário não autenticado')
      const { data, error } = await supabase
        .from('learning_progress')
        .upsert(
          {
            user_id: user.id,
            lesson_id: lessonId,
            concluido: true,
            concluido_em: new Date().toISOString(),
          },
          { onConflict: 'user_id,lesson_id' },
        )
        .select()
        .single()
      if (error) throw error
      return data as LearningProgress
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: trilhasKeys.progress(user.id) })
      }
    },
  })
}

export function useCreatePath() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      titulo: string
      descricao?: string
      tipo: 'interno' | 'cliente'
      thumbnail_url?: string
      ativo?: boolean
      ordem?: number
    }) => {
      const { data, error } = await supabase
        .from('learning_paths')
        .insert({ ativo: true, ordem: 0, ...input })
        .select()
        .single()
      if (error) throw error
      return data as LearningPath
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trilhasKeys.all })
    },
  })
}

export function useCreateModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      path_id: string
      titulo: string
      descricao?: string
      ordem?: number
    }) => {
      const { data, error } = await supabase
        .from('learning_modules')
        .insert({ ordem: 0, ...input })
        .select()
        .single()
      if (error) throw error
      return data as LearningModule
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: trilhasKeys.detail(vars.path_id) })
    },
  })
}

export function useCreateLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      module_id: string
      path_id: string // used only for cache invalidation
      titulo: string
      descricao?: string
      tipo: 'video' | 'texto' | 'pdf' | 'link'
      conteudo_url?: string
      conteudo_texto?: string
      duracao_minutos?: number
      ordem?: number
    }) => {
      const { path_id: _path_id, ...insertInput } = input
      const { data, error } = await supabase
        .from('learning_lessons')
        .insert({ ordem: 0, ...insertInput })
        .select()
        .single()
      if (error) throw error
      return data as LearningLesson
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: trilhasKeys.detail(vars.path_id) })
    },
  })
}
