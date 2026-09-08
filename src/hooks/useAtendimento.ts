import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { segmentoDe, type Segmento } from '@/lib/atendimentoSegmentos'

/**
 * App Atendimento — demandas, tipos, etapas, comentários e histórico.
 *
 * Multi-tenant: o front nunca envia `tenant_id`. A RLS resolve na leitura e o
 * trigger `set_tenant_id` carimba na escrita — mandar o tenant daqui seria
 * confiar num dado do cliente.
 *
 * Migrations: 20260804140000 (schema) e 20260804150000 (escada de permissões).
 * As tabelas ainda não estão em `integrations/supabase/types.ts`; regenerar os
 * tipos remove os casts `as never`/`as any` daqui.
 */

export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
export type Aprovacao = 'nao_enviado' | 'aguardando' | 'aprovado' | 'ajustes'

export interface AtendimentoTipo {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  ordem: number
}

export interface AtendimentoEtapa {
  id: string
  nome: string
  cor: string
  ordem: number
  is_final: boolean
}

export interface Demanda {
  id: string
  codigo: string
  cliente_id: string | null
  tipo_id: string | null
  etapa_id: string | null
  titulo: string
  descricao: string | null
  prioridade: Prioridade
  prazo: string | null
  responsavel_id: string | null
  aprovacao: Aprovacao
  aprovacao_obs: string | null
  anexos: AnexoDemanda[]
  criado_por: string | null
  concluida_em: string | null
  created_at: string
  updated_at: string
  // Vêm do join — o painel e a lista mostram nome, não id.
  cliente?: { nome: string | null } | null
  tipo?: { nome: string } | null
  etapa?: { nome: string; cor: string; is_final: boolean } | null
  responsavel?: { nome: string | null } | null
}

export interface AnexoDemanda {
  storage_path: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
}

export interface FiltrosDemanda {
  busca?: string
  etapaId?: string
  clienteId?: string
  responsavelId?: string
  prioridade?: Prioridade
  /** 'abertas' esconde o que já foi entregue — é o padrão de quem opera. */
  situacao?: 'abertas' | 'concluidas' | 'todas'
}

const keys = {
  tipos: ['atendimento', 'tipos'] as const,
  etapas: ['atendimento', 'etapas'] as const,
  demandas: (f?: FiltrosDemanda) => ['atendimento', 'demandas', f ?? {}] as const,
  demanda: (id: string) => ['atendimento', 'demanda', id] as const,
  comentarios: (id: string) => ['atendimento', 'comentarios', id] as const,
  historico: (id: string) => ['atendimento', 'historico', id] as const,
}

const SELECT_DEMANDA = `
  id, codigo, cliente_id, tipo_id, etapa_id, titulo, descricao, prioridade, prazo,
  responsavel_id, aprovacao, aprovacao_obs, anexos, criado_por, concluida_em,
  created_at, updated_at,
  cliente:clients(nome),
  tipo:atendimento_tipos(nome),
  etapa:atendimento_etapas(nome, cor, is_final),
  responsavel:users!atendimento_demandas_responsavel_id_fkey(nome)
`

// ─── Segmento da empresa ─────────────────────────────────────────────────────

/**
 * Segmento do tenant logado. Define abas, métricas e o vocabulário da interface.
 *
 * A RLS de `tenants` já limita a linha visível à empresa do usuário, então um
 * `select` sem filtro devolve exatamente uma linha — a dele.
 *
 * Enquanto carrega, devolve o segmento padrão: é melhor a tela abrir com as abas
 * de Social Media e se ajustar do que piscar vazia esperando uma consulta.
 */
export function useSegmentoAtendimento(): { segmento: Segmento; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['atendimento', 'segmento'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from('tenants')
        .select('atendimento_segmento')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.atendimento_segmento ?? null
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  return { segmento: segmentoDe(data), isLoading }
}

/**
 * Troca o segmento da empresa e semeia os tipos/etapas do ramo novo.
 *
 * O seed é **aditivo**: nada do fluxo antigo é apagado, porque pode haver
 * demanda parada numa etapa antiga — apagar deixaria trabalho órfão. O admin
 * remove à mão o que não quiser, na própria tela de configuração.
 */
export function useDefinirSegmento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (chave: string) => {
      const { data: tenant, error: errSel } = await (supabase as any)
        .from('tenants')
        .select('id')
        .limit(1)
        .maybeSingle()
      if (errSel) throw errSel
      if (!tenant?.id) throw new Error('Empresa não encontrada.')

      const { error } = await (supabase as any)
        .from('tenants')
        .update({ atendimento_segmento: chave })
        .eq('id', tenant.id)
      if (error) throw error

      const { error: errSeed } = await (supabase as any).rpc('seed_atendimento_segmento', {
        p_tenant: tenant.id,
        p_segmento: chave,
      })
      if (errSeed) throw errSeed
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atendimento'] }),
  })
}

// ─── Configuração (tipos e etapas) ────────────────────────────────────────────

export function useAtendimentoTipos() {
  return useQuery({
    queryKey: keys.tipos,
    queryFn: async (): Promise<AtendimentoTipo[]> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_tipos')
        .select('id, nome, descricao, ativo, ordem')
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAtendimentoEtapas() {
  return useQuery({
    queryKey: keys.etapas,
    queryFn: async (): Promise<AtendimentoEtapa[]> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_etapas')
        .select('id, nome, cor, ordem, is_final')
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSalvarEtapa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (etapa: Partial<AtendimentoEtapa> & { nome: string }) => {
      const payload = {
        nome: etapa.nome,
        cor: etapa.cor ?? 'slate',
        ordem: etapa.ordem ?? 0,
        is_final: etapa.is_final ?? false,
      }
      const query = etapa.id
        ? (supabase as any).from('atendimento_etapas').update(payload).eq('id', etapa.id)
        : (supabase as any).from('atendimento_etapas').insert(payload)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.etapas }),
  })
}

/**
 * Exclui uma etapa. O banco recusa (FK RESTRICT) se ainda houver demanda nela —
 * é a regra do brief §12: ninguém apaga uma coluna com trabalho dentro sem antes
 * dizer para onde esse trabalho vai. Aqui a mensagem traduz o erro do Postgres.
 */
export function useExcluirEtapa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('atendimento_etapas').delete().eq('id', id)
      if (error) {
        if (error.code === '23503') {
          throw new Error(
            'Esta etapa ainda tem demandas. Mova as demandas para outra etapa antes de excluí-la.',
          )
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.etapas }),
  })
}

export function useSalvarTipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tipo: Partial<AtendimentoTipo> & { nome: string }) => {
      const payload = {
        nome: tipo.nome,
        descricao: tipo.descricao ?? null,
        ativo: tipo.ativo ?? true,
        ordem: tipo.ordem ?? 0,
      }
      const query = tipo.id
        ? (supabase as any).from('atendimento_tipos').update(payload).eq('id', tipo.id)
        : (supabase as any).from('atendimento_tipos').insert(payload)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tipos }),
  })
}

// ─── Demandas ────────────────────────────────────────────────────────────────

export function useDemandas(filtros?: FiltrosDemanda) {
  return useQuery({
    queryKey: keys.demandas(filtros),
    queryFn: async (): Promise<Demanda[]> => {
      let query = (supabase as any)
        .from('atendimento_demandas')
        .select(SELECT_DEMANDA)
        // Prazo primeiro: quem opera quer ver o que vence antes. Demanda sem
        // prazo vai para o fim (nullsFirst: false) em vez de encabeçar a lista.
        .order('prazo', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (filtros?.etapaId) query = query.eq('etapa_id', filtros.etapaId)
      if (filtros?.clienteId) query = query.eq('cliente_id', filtros.clienteId)
      if (filtros?.responsavelId) query = query.eq('responsavel_id', filtros.responsavelId)
      if (filtros?.prioridade) query = query.eq('prioridade', filtros.prioridade)
      if (filtros?.busca) {
        const termo = `%${filtros.busca.trim()}%`
        query = query.or(`titulo.ilike.${termo},codigo.ilike.${termo},descricao.ilike.${termo}`)
      }
      if (filtros?.situacao === 'abertas') query = query.is('concluida_em', null)
      if (filtros?.situacao === 'concluidas') query = query.not('concluida_em', 'is', null)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Demanda[]
    },
  })
}

export function useDemanda(id: string | undefined) {
  return useQuery({
    queryKey: keys.demanda(id ?? ''),
    queryFn: async (): Promise<Demanda> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_demandas')
        .select(SELECT_DEMANDA)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Demanda
    },
    enabled: Boolean(id),
  })
}

export type NovaDemanda = {
  titulo: string
  descricao?: string | null
  cliente_id?: string | null
  tipo_id?: string | null
  etapa_id?: string | null
  prioridade?: Prioridade
  prazo?: string | null
  responsavel_id?: string | null
}

export function useCriarDemanda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NovaDemanda): Promise<Demanda> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_demandas')
        .insert(input)
        .select('id, codigo')
        .single()
      if (error) throw error
      return data as Demanda
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atendimento'] }),
  })
}

export function useAtualizarDemanda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<Demanda> & { id: string }) => {
      // O histórico é escrito pelo trigger no banco, não aqui: assim vale para
      // qualquer caminho de escrita, não só para esta tela.
      const { error } = await (supabase as any)
        .from('atendimento_demandas')
        .update(campos)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['atendimento'] })
      qc.invalidateQueries({ queryKey: keys.demanda(vars.id) })
    },
  })
}

export function useExcluirDemanda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('atendimento_demandas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atendimento'] }),
  })
}

// ─── Comentários e histórico ─────────────────────────────────────────────────

export interface Comentario {
  id: string
  texto: string
  created_at: string
  autor_id: string | null
  autor?: { nome: string | null } | null
}

export function useComentarios(demandaId: string | undefined) {
  return useQuery({
    queryKey: keys.comentarios(demandaId ?? ''),
    queryFn: async (): Promise<Comentario[]> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_comentarios')
        .select('id, texto, created_at, autor_id, autor:users!atendimento_comentarios_autor_id_fkey(nome)')
        .eq('demanda_id', demandaId)
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(demandaId),
  })
}

export function useComentar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ demandaId, texto }: { demandaId: string; texto: string }) => {
      // autor_id vai explícito: a RLS exige autor_id = auth.uid() no INSERT.
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await (supabase as any).from('atendimento_comentarios').insert({
        demanda_id: demandaId,
        texto,
        autor_id: auth.user?.id,
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: keys.comentarios(vars.demandaId) }),
  })
}

export interface EventoHistorico {
  id: string
  campo: string
  valor_de: string | null
  valor_para: string | null
  created_at: string
  autor?: { nome: string | null } | null
}

export function useHistoricoDemanda(demandaId: string | undefined) {
  return useQuery({
    queryKey: keys.historico(demandaId ?? ''),
    queryFn: async (): Promise<EventoHistorico[]> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_historico')
        .select('id, campo, valor_de, valor_para, created_at, autor:users!atendimento_historico_autor_id_fkey(nome)')
        .eq('demanda_id', demandaId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(demandaId),
  })
}

// ─── Painel operacional ──────────────────────────────────────────────────────

export interface MetricasAtendimento {
  abertas: number
  atrasadas: number
  venceHoje: number
  venceEstaSemana: number
  aguardandoAprovacao: number
  comAjustes: number
  concluidasNoMes: number
  porEtapa: Array<{ etapa: string; cor: string; total: number }>
  porResponsavel: Array<{ nome: string; total: number }>
}

/**
 * Métricas do painel. Calculadas no cliente sobre as demandas do tenant — o
 * volume aqui é de dezenas por mês, não de milhões, então uma RPC dedicada
 * seria complexidade sem ganho. Se um dia a lista crescer, vira view no banco.
 */
export function useMetricasAtendimento() {
  const { data: demandas, isLoading, isError } = useDemandas({ situacao: 'todas' })

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const fimDaSemana = new Date(hoje)
  fimDaSemana.setDate(hoje.getDate() + 7)
  const inicioDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  const lista = demandas ?? []
  const abertas = lista.filter((d) => !d.concluida_em)

  const prazoDe = (d: Demanda) => (d.prazo ? new Date(`${d.prazo}T00:00:00`) : null)

  const porEtapa = new Map<string, { cor: string; total: number }>()
  abertas.forEach((d) => {
    const nome = d.etapa?.nome ?? 'Sem etapa'
    const atual = porEtapa.get(nome) ?? { cor: d.etapa?.cor ?? 'slate', total: 0 }
    porEtapa.set(nome, { ...atual, total: atual.total + 1 })
  })

  const porResponsavel = new Map<string, number>()
  abertas.forEach((d) => {
    const nome = d.responsavel?.nome ?? 'Sem responsável'
    porResponsavel.set(nome, (porResponsavel.get(nome) ?? 0) + 1)
  })

  const metricas: MetricasAtendimento = {
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => {
      const p = prazoDe(d)
      return p !== null && p < hoje
    }).length,
    venceHoje: abertas.filter((d) => prazoDe(d)?.getTime() === hoje.getTime()).length,
    venceEstaSemana: abertas.filter((d) => {
      const p = prazoDe(d)
      return p !== null && p >= hoje && p <= fimDaSemana
    }).length,
    aguardandoAprovacao: abertas.filter((d) => d.aprovacao === 'aguardando').length,
    comAjustes: abertas.filter((d) => d.aprovacao === 'ajustes').length,
    concluidasNoMes: lista.filter(
      (d) => d.concluida_em && new Date(d.concluida_em) >= inicioDoMes,
    ).length,
    porEtapa: [...porEtapa.entries()].map(([etapa, v]) => ({ etapa, cor: v.cor, total: v.total })),
    porResponsavel: [...porResponsavel.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total),
  }

  return { metricas, demandas: lista, isLoading, isError }
}
