import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ContextoReporte } from '@/lib/reporte-contexto'
import type { EntradaConsole, EntradaRede } from '@/lib/reporte-buffers'

/**
 * Reporte de erros (multi-tenant). A RLS resolve o tenant e a visibilidade:
 * usuário comum vê/insere os próprios; admin vê e tria todos do tenant.
 * O front confirma o tenant da sessão antes de inserir; a RLS valida o acesso.
 */

export type ReporteImpacto = 'baixo' | 'medio' | 'alto' | 'critico'
export type ReporteCategoria = 'bug' | 'duvida' | 'sugestao' | 'outro'
export type ReporteStatus =
  | 'recebido' | 'em_triagem' | 'precisa_info' | 'confirmado'
  | 'em_desenvolvimento' | 'em_validacao' | 'corrigido'
  | 'nao_reproduzido' | 'duplicado' | 'encerrado'
export type ReportePrioridade = 'baixa' | 'media' | 'alta'

export interface Reporte {
  id: string
  protocolo: string
  titulo: string
  descricao: string | null
  passos: string | null
  resultado_esperado: string | null
  resultado_ocorrido: string | null
  impacto: ReporteImpacto
  categoria: ReporteCategoria
  modulo: string | null
  rota: string | null
  contexto: ContextoReporte | Record<string, unknown>
  console_logs: EntradaConsole[]
  network_logs: EntradaRede[]
  reportado_por: string | null
  reportado_nome: string | null
  reportado_email: string | null
  status: ReporteStatus
  prioridade: ReportePrioridade
  /** Nota de triagem — privada da equipe, o autor não vê. */
  resposta_interna: string | null
  /** Resposta que o autor do reporte enxerga no acompanhamento. */
  resposta_usuario: string | null
  /** Link para onde a task realmente vive (issue, board externo). */
  link_externo: string | null
  anexos: AnexoReporte[]
  resolvido_em: string | null
  resolvido_versao: string | null
  created_at: string
  updated_at: string
}

export interface AnexoReporte {
  storage_path: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
}

export interface NovoReporte {
  titulo: string
  descricao?: string
  passos?: string
  resultado_esperado?: string
  resultado_ocorrido?: string
  impacto: ReporteImpacto
  categoria: ReporteCategoria
  modulo?: string
  rota?: string
  contexto: ContextoReporte
  /** Ring buffer do console, capturado desde o boot (ver lib/reporte-buffers). */
  console_logs?: EntradaConsole[]
  /** Últimas requisições — método, URL, status e duração. Nunca o corpo. */
  network_logs?: EntradaRede[]
  reportado_nome?: string
  reportado_email?: string
}

const reporteKeys = {
  all: ['reportes'] as const,
  meus: ['reportes', 'meus'] as const,
}

/** Cria um reporte. Retorna o registro criado (com protocolo). */
export function useCriarReporte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NovoReporte): Promise<Reporte> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('reportes_erro')
        .insert({ ...input, contexto: { ...input.contexto }, console_logs: input.console_logs?.map(log => ({ ...log })), network_logs: input.network_logs?.map(log => ({ ...log })), reportado_por: user?.id, tenant_id: await tenantDaSessao() })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as Reporte
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reporteKeys.all })
    },
  })
}

/** Lista de reportes visíveis (admin vê todos do tenant; usuário vê os próprios). */
export function useReportes() {
  return useQuery({
    queryKey: reporteKeys.all,
    queryFn: async (): Promise<Reporte[]> => {
      const { data, error } = await supabase
        .from('reportes_erro')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Reporte[]
    },
    staleTime: 1000 * 30,
  })
}

/**
 * Reportes do próprio usuário, para ele acompanhar o andamento (§14.5).
 * A RLS já limita o que cada um enxerga; o filtro aqui é para o admin, que
 * enxerga todos, não ver a lista inteira nesta tela.
 */
export function useMeusReportes() {
  return useQuery({
    queryKey: reporteKeys.meus,
    queryFn: async (): Promise<Reporte[]> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      const { data, error } = await supabase
        .from('reportes_erro')
        .select('*')
        .eq('reportado_por', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Reporte[]
    },
    staleTime: 1000 * 30,
  })
}

/** Anexa arquivos a um reporte já criado (print de tela). */
export function useAnexarAoReporte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ reporteId, arquivos }: { reporteId: string; arquivos: File[] }) => {
      const anexos: AnexoReporte[] = []
      for (const file of arquivos) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
        // O caminho carrega o id do reporte: é dele que a RLS deriva o dono.
        const path = `reportes/${reporteId}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('reportes-anexos').upload(path, file, {
          contentType: file.type,
          upsert: false,
        })
        if (error) throw error
        anexos.push({
          storage_path: path,
          nome_original: file.name,
          mime_type: file.type,
          tamanho_bytes: file.size,
        })
      }

      const { error: updErr } = await supabase
        .from('reportes_erro')
        .update({ anexos: anexos as unknown as never })
        .eq('id', reporteId)
      if (updErr) throw updErr
      return anexos
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reporteKeys.all })
      queryClient.invalidateQueries({ queryKey: reporteKeys.meus })
    },
  })
}

/** URL assinada (5 min) para ver um anexo — o bucket é privado. */
export async function urlAnexoReporte(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from('reportes-anexos').createSignedUrl(storagePath, 300)
  return data?.signedUrl ?? null
}

/** Atualiza triagem (status/prioridade/resposta) — só admin (RLS). */
export function useAtualizarReporte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...campos
    }: { id: string } & Partial<
      Pick<
        Reporte,
        | 'status' | 'prioridade' | 'resposta_interna' | 'resposta_usuario'
        | 'link_externo' | 'resolvido_versao' | 'resolvido_em'
      >
    >) => {
      const { error } = await supabase
        .from('reportes_erro')
        .update(campos)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reporteKeys.all })
    },
  })
}
