import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  nome: string
  key_prefix: string
  permissoes: string[]
  criado_por: string | null
  ativo: boolean
  ultimo_uso: string | null
  expira_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface Webhook {
  id: string
  nome: string
  url: string
  secret: string
  eventos: string[]
  ativo: boolean
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export interface WebhookLog {
  id: string
  webhook_id: string
  evento: string
  payload: Record<string, unknown> | null
  status_code: number | null
  response_body: string | null
  duracao_ms: number | null
  sucesso: boolean
  criado_em: string
}

// ─── Query keys ──────────────────────────────────────────────────────────────

const apiKeyKeys = {
  all: ['api_keys'] as const,
  list: () => ['api_keys', 'list'] as const,
}

const webhookKeys = {
  all: ['webhooks'] as const,
  list: () => ['webhooks', 'list'] as const,
  logs: (id: string) => ['webhooks', 'logs', id] as const,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── API Keys hooks ──────────────────────────────────────────────────────────

export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        // Nunca traz key_hash para o navegador: a lista só precisa de metadados.
        .select('id, nome, key_prefix, permissoes, criado_por, ativo, ultimo_uso, expira_em, criado_em, atualizado_em')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as ApiKey[]
    },
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    // A chave completa só existe no retorno desta mutação (mostrada uma vez). gcTime 0 tira o
    // resultado do cache de mutações assim que a tela solta o observador; a lista de chaves
    // (useApiKeys) nunca contém a chave completa.
    gcTime: 0,
    mutationFn: async (params: {
      nome: string
      permissoes: string[]
      expira_em?: string | null
    }) => {
      const fullKey = `edk_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
      const keyHash = await hashKey(fullKey)
      const keyPrefix = fullKey.slice(0, 12)

      const { data, error } = await supabase
        .from('api_keys')
        .insert({ ...({
          nome: params.nome,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          permissoes: params.permissoes,
          expira_em: params.expira_em ?? null,
        }), tenant_id: await tenantDaSessao() })
        // colunas explícitas: o hash da chave nunca volta para o navegador
        .select('id, nome, key_prefix, permissoes, criado_por, ativo, ultimo_uso, expira_em, criado_em, atualizado_em')
        .single()

      if (error) throw error
      return { ...data, fullKey } as ApiKey & { fullKey: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeyKeys.all }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_keys')
        .update({ ativo: false, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeyKeys.all }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('api_keys').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeyKeys.all }),
  })
}

// ─── Webhooks hooks ──────────────────────────────────────────────────────────

export function useWebhooks() {
  return useQuery({
    queryKey: webhookKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as Webhook[]
    },
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { nome: string; url: string; eventos: string[] }) => {
      const secret = `whsec_${crypto.randomUUID().replace(/-/g, '')}`
      const { data, error } = await supabase
        .from('webhooks')
        .insert({ ...({
          nome: params.nome,
          url: params.url,
          secret,
          eventos: params.eventos,
        }), tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as Webhook
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: webhookKeys.all }),
  })
}

export function useUpdateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      nome?: string
      url?: string
      eventos?: string[]
    }) => {
      const { id, ...updates } = params
      const { error } = await supabase
        .from('webhooks')
        .update({ ...updates, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: webhookKeys.all }),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('webhooks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: webhookKeys.all }),
  })
}

export function useToggleWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('webhooks')
        .update({ ativo: !ativo, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: webhookKeys.all }),
  })
}

export function useWebhookLogs(webhookId: string) {
  return useQuery({
    queryKey: webhookKeys.logs(webhookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('criado_em', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as WebhookLog[]
    },
    enabled: !!webhookId,
  })
}
