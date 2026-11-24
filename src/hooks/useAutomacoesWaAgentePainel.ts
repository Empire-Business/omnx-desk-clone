import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { AprendizadoAgente } from './useAutomacoesWa'

// Leituras feitas com o usuário/RLS existentes. Nenhum client privilegiado no
// navegador e nenhum estado de aprovação inventado: aprendizado é ativo ou não.
const banco = () => supabase as unknown as SupabaseClient
const TAMANHO_PAGINA = 25

export interface PaginaAgente<T> {
  itens: T[]
  /** Contagem sob os filtros/RLS desta consulta. */
  total: number | null
  proximaPagina: number | null
  disponivel: boolean
}

export interface AprendizadoAgentePainel extends AprendizadoAgente {
  criado_por_user: string | null
  pedido_id: string | null
}

export interface FiltrosAprendizadosAgente {
  categoria?: string
  ativo?: boolean
  origem?: 'whatsapp' | 'tela'
}

function ausente(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

function pagina<T>(itens: T[], total: number | null, indice: number): PaginaAgente<T> {
  return {
    itens: itens.slice(0, TAMANHO_PAGINA), total,
    proximaPagina: itens.length > TAMANHO_PAGINA ? indice + 1 : null,
    disponivel: true,
  }
}

function indisponivel<T>(): PaginaAgente<T> {
  return { itens: [], total: null, proximaPagina: null, disponivel: false }
}

/** Histórico integral, inclusive desativados; a tela pede as páginas seguintes. */
export function useAprendizadosAgentePaginados(habilitado = true, filtros: FiltrosAprendizadosAgente = {}) {
  const { user } = useAuth()
  return useInfiniteQuery({
    // Mesmo prefixo dos hooks de escrita: salvar/desativar/excluir invalida aqui.
    queryKey: ['wa-agente', 'aprendizados', 'paginas', user?.id, filtros],
    enabled: habilitado && !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<PaginaAgente<AprendizadoAgentePainel>> => {
      let q = banco().from('wa_agente_aprendizados')
        .select('id, instrucao, categoria, origem, criado_por_user, criado_por_nome, pedido_id, ativo, created_at, desativado_em', { count: 'exact' })
      if (filtros.categoria) q = q.eq('categoria', filtros.categoria)
      if (typeof filtros.ativo === 'boolean') q = q.eq('ativo', filtros.ativo)
      if (filtros.origem) q = q.eq('origem', filtros.origem)
      const inicio = pageParam * TAMANHO_PAGINA
      const { data, error, count } = await q.order('created_at', { ascending: false }).order('id')
        .range(inicio, inicio + TAMANHO_PAGINA)
      if (error) { if (ausente(error)) return indisponivel(); throw error }
      return pagina((data ?? []) as AprendizadoAgentePainel[], count, pageParam)
    },
    getNextPageParam: (ultima) => ultima.proximaPagina ?? undefined,
  })
}

/** Mesma regra já aplicada por RLS aos resumos de todas as instâncias. */
export function usePodeVerMemoriasAgente(habilitado = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wa-agente', 'memorias', 'permissao', user?.id],
    enabled: habilitado && !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [admin, restrito] = await Promise.all([
        banco().rpc('has_permissao', { p_recurso: 'automacoes-wa', p_acao: 'admin' }),
        banco().rpc('pode_ver_restrito'),
      ])
      if (admin.error) throw admin.error
      if (restrito.error) throw restrito.error
      return admin.data === true && restrito.data === true
    },
  })
}

export interface PendenciaMemoriaAgente { desde: string; tema_curto: string; status: string }
export interface EventoMemoriaAgente { data: string; tipo: string; resumo_curto: string }

/** Memória analítica por cliente; não é treinamento do modelo nem chat completo. */
export interface MemoriaAgente {
  client_id: string
  cliente_nome: string | null
  resumo: string
  motivo: string | null
  satisfacao: string
  confianca: number
  risco: string
  risco_motivos: string[]
  sinais_cliente: string[]
  tendencia: string | null
  pendencias: PendenciaMemoriaAgente[]
  eventos: EventoMemoriaAgente[]
  metricas: Record<string, unknown>
  cobertura: Record<string, unknown>
  analisado_ate: string | null
  analisado_em: string | null
  processado_em: string | null
}

type MemoriaLida = Omit<MemoriaAgente, 'cliente_nome'> & { cliente: { nome?: string | null } | null }
function memoria(linha: MemoriaLida): MemoriaAgente {
  const { cliente, ...resto } = linha
  return { ...resto, cliente_nome: cliente?.nome ?? null }
}

export function useMemoriasAgente(habilitado = true) {
  const { user } = useAuth()
  const acesso = usePodeVerMemoriasAgente(habilitado)
  return useInfiniteQuery({
    queryKey: ['wa-agente', 'memorias', 'paginas', user?.id],
    enabled: habilitado && !!user && acesso.data === true,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<PaginaAgente<MemoriaAgente>> => {
      const inicio = pageParam * TAMANHO_PAGINA
      const { data, error, count } = await banco().from('cliente_relacionamento')
        .select('client_id, resumo, motivo, satisfacao, confianca, risco, risco_motivos, sinais_cliente, tendencia, pendencias, eventos, metricas, cobertura, analisado_ate, analisado_em, processado_em, cliente:clients(nome)', { count: 'exact' })
        .order('client_id').range(inicio, inicio + TAMANHO_PAGINA)
      if (error) { if (ausente(error)) return indisponivel(); throw error }
      return pagina(((data ?? []) as unknown as MemoriaLida[]).map(memoria), count, pageParam)
    },
    getNextPageParam: (ultima) => ultima.proximaPagina ?? undefined,
  })
}

export interface HistoricoMemoriaAgente {
  id: string
  client_id: string
  satisfacao: string
  confianca: number
  risco: string
  risco_motivos: string[]
  sinais_cliente: string[]
  tendencia: string | null
  pendencias: PendenciaMemoriaAgente[]
  motivo: string | null
  resumo: string
  analisado_ate: string | null
  criado_em: string
}

export function useHistoricoMemoriaAgente(clientId: string | null, habilitado = true) {
  const { user } = useAuth()
  const acesso = usePodeVerMemoriasAgente(habilitado)
  return useInfiniteQuery({
    queryKey: ['wa-agente', 'memorias', 'historico', user?.id, clientId],
    enabled: habilitado && !!user && acesso.data === true && !!clientId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<PaginaAgente<HistoricoMemoriaAgente>> => {
      const inicio = pageParam * TAMANHO_PAGINA
      const { data, error, count } = await banco().from('cliente_relacionamento_hist')
        .select('id, client_id, satisfacao, confianca, risco, risco_motivos, sinais_cliente, tendencia, pendencias, motivo, resumo, analisado_ate, criado_em', { count: 'exact' })
        .eq('client_id', clientId).order('criado_em', { ascending: false }).order('id')
        .range(inicio, inicio + TAMANHO_PAGINA)
      if (error) { if (ausente(error)) return indisponivel(); throw error }
      return pagina((data ?? []) as HistoricoMemoriaAgente[], count, pageParam)
    },
    getNextPageParam: (ultima) => ultima.proximaPagina ?? undefined,
  })
}

export interface FerramentaAgentePainel { nome: string; descricao: string; altera_dados: boolean }

/** Catálogo vigente do servidor; disponibilidade real varia com pessoa/canal. */
export function useFerramentasAgentePainel(habilitado = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wa-agente', 'ferramentas', user?.id],
    enabled: habilitado && !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<FerramentaAgentePainel[]> => {
      const { data, error } = await supabase.functions.invoke('wa-agente-admin', { body: { acao: 'ferramentas' } })
      if (error) throw error
      const r = data as { ok?: boolean; error?: string; ferramentas?: FerramentaAgentePainel[] } | null
      if (!r?.ok || !Array.isArray(r.ferramentas)) throw new Error(r?.error ?? 'Não foi possível carregar as ferramentas da Íris.')
      return r.ferramentas
    },
  })
}

export interface PerfilAgentePainel {
  personalidade: string
  contexto: string
  origem: 'padrao' | 'salvo'
  revisao: string | null
  atualizado_em: string | null
  /** Nome legível; não expõe o identificador do autor. */
  atualizado_por: string | null
  versao_padrao: string
  limites: { personalidade: number; contexto: number; total: number }
}

export interface SalvarPerfilAgente {
  personalidade: string
  contexto: string
  /** Revisão do snapshot que abriu o editor; null apenas quando não havia salvo. */
  revisao: string | null
}

export class ErroPerfilAgente extends Error {
  status: number
  codigo: string | null
  constructor(status: number, codigo: string | null, mensagem: string) {
    super(mensagem)
    this.name = 'ErroPerfilAgente'
    this.status = status
    this.codigo = codigo
  }
}

async function invocarPerfil(body: Record<string, unknown>): Promise<PerfilAgentePainel> {
  const { data, error } = await supabase.functions.invoke('wa-agente-admin', { body })
  if (error) {
    const contexto = (error as { context?: unknown }).context
    if (contexto instanceof Response) {
      const falha = await contexto.clone().json().catch(() => null) as { error?: string; codigo?: string } | null
      throw new ErroPerfilAgente(contexto.status, falha?.codigo ?? null, falha?.error ?? 'Não foi possível acessar o perfil da Íris.')
    }
    throw new ErroPerfilAgente(0, null, 'Não foi possível acessar o perfil da Íris. Confira sua conexão e tente novamente.')
  }
  const r = data as (PerfilAgentePainel & { ok?: boolean; error?: string; codigo?: string }) | null
  if (!r?.ok || typeof r.personalidade !== 'string' || typeof r.contexto !== 'string'
    || !['padrao', 'salvo'].includes(r.origem) || !r.limites || typeof r.versao_padrao !== 'string') {
    throw new ErroPerfilAgente(500, r?.codigo ?? null, r?.error ?? 'A resposta do perfil da Íris não está disponível nesta versão.')
  }
  return {
    personalidade: r.personalidade, contexto: r.contexto, origem: r.origem,
    revisao: r.revisao, atualizado_em: r.atualizado_em, atualizado_por: r.atualizado_por,
    versao_padrao: r.versao_padrao, limites: r.limites,
  }
}

export function usePerfilAgente(habilitado = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wa-agente', 'perfil', user?.id],
    enabled: habilitado && !!user,
    queryFn: () => invocarPerfil({ acao: 'perfil' }),
  })
}

export function useSalvarPerfilAgente() {
  const { user } = useAuth()
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (perfil: SalvarPerfilAgente) => invocarPerfil({ acao: 'salvar_perfil', ...perfil }),
    onSuccess: (salvo) => {
      // O snapshot do editor passa a ser a versão que o servidor persistiu.
      cache.setQueryData(['wa-agente', 'perfil', user?.id], salvo)
    },
  })
}
