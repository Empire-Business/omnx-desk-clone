import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SUPABASE_URL } from '@/integrations/supabase/client'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface CobrancaInstance {
  id: string
  nome: string
  instance_id: string
  numero_whatsapp: string | null
  status: string
  envios_hora_max: number
  intervalo_min_segundos: number
  intervalo_max_segundos: number
  horario_inicio: string
  horario_fim: string
  ativo: boolean
}

export interface CobrancaRegua {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  criado_em: string
}

export interface CobrancaReguaPasso {
  id: string
  regua_id: string
  ordem: number
  dias_apos_anterior: number
  mensagem_template: string
  usar_ia_variacao: boolean
}

export interface CobrancaReguaWithPassos extends CobrancaRegua {
  cobranca_regua_passos: CobrancaReguaPasso[]
}

export interface CobrancaDevedor {
  id: string
  instance_id: string
  regua_id: string | null
  nome: string
  numero_whatsapp: string
  valor_divida: number | null
  descricao_divida: string | null
  data_vencimento: string | null
  status: 'ativa' | 'pausada' | 'encerrada' | 'pago'
  passo_atual: number
  proximo_envio_em: string | null
  criado_em: string
}

export interface CobrancaSend {
  id: string
  devedor_id: string
  passo: number
  mensagem_enviada: string
  status_envio: string
  enviado_em: string
}

export interface CobrancaDevedorWithSends extends CobrancaDevedor {
  cobranca_sends: CobrancaSend[]
}

// ----------------------------------------------------------------
// Query key factory
// ----------------------------------------------------------------

export const cobrancaKeys = {
  all: ['cobranca'] as const,
  instances: () => ['cobranca', 'instances'] as const,
  instance: (id: string) => ['cobranca', 'instances', id] as const,
  reguas: () => ['cobranca', 'reguas'] as const,
  regua: (id: string) => ['cobranca', 'reguas', id] as const,
  devedores: (filter?: { status?: string; instance_id?: string }) =>
    ['cobranca', 'devedores', filter ?? {}] as const,
  devedor: (id: string) => ['cobranca', 'devedores', id] as const,
}

// ----------------------------------------------------------------
// Hooks — Instances
// ----------------------------------------------------------------

export function useCobrancaInstances() {
  return useQuery({
    queryKey: cobrancaKeys.instances(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_instances')
        .select('*')
        .order('nome')
      if (error) throw error
      return data as CobrancaInstance[]
    },
  })
}

export function useCreateInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<CobrancaInstance, 'id'>) => {
      const { data, error } = await supabase
        .from('cobranca_instances')
        .insert({ ...input, tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as CobrancaInstance
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.instances() })
    },
  })
}

export function useUpdateInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CobrancaInstance> & { id: string }) => {
      const { data, error } = await supabase
        .from('cobranca_instances')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CobrancaInstance
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.instances() })
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.instance(data.id) })
    },
  })
}

// ----------------------------------------------------------------
// Hooks — Réguas
// ----------------------------------------------------------------

export function useCobrancaReguas() {
  return useQuery({
    queryKey: cobrancaKeys.reguas(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_reguas')
        .select('*, cobranca_regua_passos(*)')
        .order('nome')
      if (error) throw error
      return data as CobrancaReguaWithPassos[]
    },
  })
}

export function useCobrancaRegua(id: string) {
  return useQuery({
    queryKey: cobrancaKeys.regua(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_reguas')
        .select('*, cobranca_regua_passos(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as CobrancaReguaWithPassos
    },
    enabled: Boolean(id),
  })
}

export function useCreateRegua() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nome: string; descricao?: string }) => {
      const { data, error } = await supabase
        .from('cobranca_reguas')
        .insert({ ...input, tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as CobrancaRegua
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.reguas() })
    },
  })
}

export function useCreatePasso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      regua_id: string
      ordem: number
      dias_apos_anterior: number
      mensagem_template: string
      usar_ia_variacao: boolean
    }) => {
      const { data, error } = await supabase
        .from('cobranca_regua_passos')
        .insert({ ...input, tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as CobrancaReguaPasso
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.reguas() })
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.regua(data.regua_id) })
    },
  })
}

export function useDeletePasso() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, regua_id }: { id: string; regua_id: string }) => {
      const { error } = await supabase
        .from('cobranca_regua_passos')
        .delete()
        .eq('id', id)
      if (error) throw error
      return { id, regua_id }
    },
    onSuccess: ({ regua_id }) => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.reguas() })
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.regua(regua_id) })
    },
  })
}

// ----------------------------------------------------------------
// Hooks — Devedores
// ----------------------------------------------------------------

export function useDevedores(filter?: { status?: string; instance_id?: string }) {
  return useQuery({
    queryKey: cobrancaKeys.devedores(filter),
    queryFn: async () => {
      let query = supabase
        .from('cobranca_devedores')
        .select('*')
        .order('proximo_envio_em', { ascending: true, nullsFirst: false })

      if (filter?.status) {
        query = query.eq('status', filter.status)
      }
      if (filter?.instance_id) {
        query = query.eq('instance_id', filter.instance_id)
      }

      const { data, error } = await query
      if (error) throw error
      return data as CobrancaDevedor[]
    },
  })
}

export function useDevedor(id: string) {
  return useQuery({
    queryKey: cobrancaKeys.devedor(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_devedores')
        .select('*, cobranca_sends(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as CobrancaDevedorWithSends
    },
    enabled: Boolean(id),
  })
}

export function useCreateDevedor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      instance_id: string
      regua_id?: string
      nome: string
      numero_whatsapp: string
      valor_divida?: number
      descricao_divida?: string
      data_vencimento?: string
    }) => {
      const proximoEnvio = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('cobranca_devedores')
        .insert({ ...input, proximo_envio_em: proximoEnvio, tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as CobrancaDevedor
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cobranca', 'devedores'] })
    },
  })
}

export function useUpdateDevedorStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: CobrancaDevedor['status']
    }) => {
      const { data, error } = await supabase
        .from('cobranca_devedores')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CobrancaDevedor
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cobranca', 'devedores'] })
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.devedor(data.id) })
    },
  })
}

export function useImportDevedores() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rows,
      instance_id,
      regua_id,
    }: {
      rows: Array<{
        nome: string
        numero_whatsapp: string
        valor_divida?: number
        descricao_divida?: string
        data_vencimento?: string
      }>
      instance_id: string
      regua_id: string
    }) => {
      const proximoEnvio = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const tenant_id = await tenantDaSessao()
      const inserts = rows.map((r) => ({
        tenant_id,
        instance_id,
        regua_id,
        nome: r.nome,
        numero_whatsapp: r.numero_whatsapp,
        valor_divida: r.valor_divida ?? null,
        descricao_divida: r.descricao_divida ?? null,
        data_vencimento: r.data_vencimento ?? null,
        proximo_envio_em: proximoEnvio,
      }))
      const { data, error } = await supabase
        .from('cobranca_devedores')
        .insert(inserts)
        .select()
      if (error) throw error
      return { count: (data ?? []).length }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cobranca', 'devedores'] })
    },
  })
}

// ----------------------------------------------------------------
// Hooks — Sends
// ----------------------------------------------------------------

export interface CobrancaSendWithDevedor extends CobrancaSend {
  cobranca_devedores: { nome: string; numero_whatsapp: string } | null
}

export const cobrancaSendsKey = () => ['cobranca', 'sends'] as const

export function useCobrancaSends() {
  return useQuery({
    queryKey: cobrancaSendsKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobranca_sends')
        .select('*, cobranca_devedores(nome, numero_whatsapp)')
        .order('enviado_em', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as CobrancaSendWithDevedor[]
    },
  })
}

// ----------------------------------------------------------------
// Hooks — Manual Send
// ----------------------------------------------------------------

export function useManualSend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (devedorId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cobranca-scheduler`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ devedor_id: devedorId }),
      })
      if (!res.ok) throw new Error('Falha ao enviar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cobranca', 'devedores'] })
      queryClient.invalidateQueries({ queryKey: cobrancaSendsKey() })
    },
  })
}

// ----------------------------------------------------------------
// Hooks — Send Metrics
// ----------------------------------------------------------------

export function useCobrancaSendMetrics() {
  return useQuery({
    queryKey: ['cobranca', 'send-metrics'] as const,
    queryFn: async () => {
      // Get sends from today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: todaySends, error } = await supabase
        .from('cobranca_sends')
        .select('status_envio')
        .gte('enviado_em', todayStart.toISOString())

      if (error) throw error

      const enviadosHoje = (todaySends ?? []).filter(s => s.status_envio === 'enviado').length
      const falhasHoje = (todaySends ?? []).filter(s => s.status_envio === 'falha').length
      const totalHoje = (todaySends ?? []).length

      // Get total sends (all time) for taxa stats
      const { count: totalEnviados } = await supabase
        .from('cobranca_sends')
        .select('*', { count: 'exact', head: true })
        .eq('status_envio', 'enviado')

      const { count: totalFalhas } = await supabase
        .from('cobranca_sends')
        .select('*', { count: 'exact', head: true })
        .eq('status_envio', 'falha')

      return {
        enviadosHoje,
        falhasHoje,
        totalHoje,
        totalEnviados: totalEnviados ?? 0,
        totalFalhas: totalFalhas ?? 0,
      }
    },
  })
}

// ----------------------------------------------------------------
// Hooks — Delete / Update extras
// ----------------------------------------------------------------

export function useDeleteInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cobranca_instances')
        .delete()
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.instances() })
    },
  })
}

export function useUpdateRegua() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CobrancaRegua> & { id: string }) => {
      const { data, error } = await supabase
        .from('cobranca_reguas')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CobrancaRegua
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.reguas() })
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.regua(data.id) })
    },
  })
}

export function useDeleteRegua() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cobranca_reguas')
        .delete()
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cobrancaKeys.reguas() })
    },
  })
}
