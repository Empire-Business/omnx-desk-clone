import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Domain types ────────────────────────────────────────────────────────────

export interface NpsSurvey {
  id: string
  client_id: string
  delivery_id: string | null
  enviado_em: string
  respondido_em: string | null
  criado_em: string
  clients?: { id: string; nome: string }
}

export interface NpsResponse {
  id: string
  survey_id: string
  respondido_por: string | null
  nota: number
  comentario: string | null
  criado_em: string
}

export interface NpsStats {
  avg: number
  promotores: number
  neutros: number
  detratores: number
  total: number
  npsScore: number
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const npsKeys = {
  all: ['nps'] as const,
  surveys: () => ['nps', 'surveys'] as const,
  survey: (id: string) => ['nps', 'surveys', id] as const,
  responses: (surveyId: string) => ['nps', 'responses', surveyId] as const,
  allResponses: () => ['nps', 'responses', 'all'] as const,
  stats: () => ['nps', 'stats'] as const,
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useNpsSurveys() {
  return useQuery({
    queryKey: npsKeys.surveys(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*, clients(id, nome)')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as NpsSurvey[]
    },
  })
}

export type RespostaCampanha = Pick<NpsResponse, 'id' | 'nota' | 'comentario' | 'criado_em'>
export type CampanhaNps = NpsSurvey & { nps_responses: RespostaCampanha[] | null }

/**
 * Campanhas da equipe (/relatorios/pesquisas): cada pesquisa com o cliente e
 * as respostas, numa consulta só. A RLS decide o que volta.
 */
export function useCampanhasNps() {
  return useQuery({
    queryKey: [...npsKeys.surveys(), 'campanhas'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*, clients(id, nome), nps_responses(id, nota, comentario, criado_em)')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as CampanhaNps[]
    },
  })
}

export function useNpsSurvey(surveyId: string) {
  return useQuery({
    queryKey: npsKeys.survey(surveyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*, clients(id, nome)')
        .eq('id', surveyId)
        .single()
      if (error) throw error
      return data as NpsSurvey
    },
    enabled: Boolean(surveyId),
  })
}

export function useNpsResponses(surveyId: string) {
  return useQuery({
    queryKey: npsKeys.responses(surveyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_responses')
        .select('*')
        .eq('survey_id', surveyId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as NpsResponse[]
    },
    enabled: Boolean(surveyId),
  })
}

export function useNpsStats() {
  return useQuery({
    queryKey: npsKeys.stats(),
    queryFn: async (): Promise<NpsStats> => {
      const { data, error } = await supabase
        .from('nps_responses')
        .select('*')
        .order('criado_em', { ascending: false })
      if (error) throw error

      const responses = data as NpsResponse[]
      const total = responses.length

      if (total === 0) {
        return { avg: 0, promotores: 0, neutros: 0, detratores: 0, total: 0, npsScore: 0 }
      }

      const promotores = responses.filter(r => r.nota >= 9).length
      const neutros = responses.filter(r => r.nota >= 7 && r.nota <= 8).length
      const detratores = responses.filter(r => r.nota <= 6).length
      const sum = responses.reduce((acc, r) => acc + r.nota, 0)
      const avg = Math.round((sum / total) * 10) / 10
      const npsScore = Math.round(((promotores - detratores) / total) * 100)

      return { avg, promotores, neutros, detratores, total, npsScore }
    },
  })
}

export function useCreateSurvey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { client_id: string; delivery_id?: string }) => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .insert({ ...({ ...input, enviado_em: new Date().toISOString() }), tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as NpsSurvey
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: npsKeys.all })
    },
  })
}

export function useSubmitResponse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      survey_id: string
      nota: number
      comentario?: string
      respondido_por?: string
    }) => {
      const { error: insertError } = await supabase
        .from('nps_responses')
        .insert({ ...({
          survey_id: input.survey_id,
          nota: input.nota,
          comentario: input.comentario ?? null,
          respondido_por: input.respondido_por ?? null,
        }), tenant_id: await tenantDaSessao() })
      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from('nps_surveys')
        .update({ respondido_em: new Date().toISOString() })
        .eq('id', input.survey_id)
      if (updateError) throw updateError
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: npsKeys.all })
      queryClient.invalidateQueries({ queryKey: npsKeys.survey(variables.survey_id) })
      queryClient.invalidateQueries({ queryKey: npsKeys.responses(variables.survey_id) })
    },
  })
}
