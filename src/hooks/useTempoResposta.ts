import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  conferirPainelTempoResposta, type AcaoTempoResposta, type EscopoTempoResposta,
} from '@/lib/tempoResposta'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const chaveTempoResposta = (escopo: EscopoTempoResposta) => ['tempo-resposta', escopo.actorId, escopo.tenantId] as const

export function erroTempoResposta(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Não foi possível concluir. Tente novamente.'
}

async function conferirSessao(actorId: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  if (error || data.session?.user.id !== actorId) throw new Error('Sua sessão mudou. Entre novamente para continuar.')
}

async function tenantAtual(actorId: string): Promise<string> {
  await conferirSessao(actorId)
  const { data, error } = await supabase.rpc('get_user_tenant_id')
  await conferirSessao(actorId)
  if (error || typeof data !== 'string' || !UUID.test(data)) throw new Error('Não foi possível confirmar seu acesso ao painel.')
  return data
}

/** AuthContext legado não expõe tenant; consultamos a função do próprio usuário. */
export function useEscopoTempoResposta() {
  const { user, loading } = useAuth()
  const actorId = user?.id
  const consulta = useQuery({
    queryKey: ['tempo-resposta-escopo', actorId],
    enabled: !loading && !!actorId,
    queryFn: async (): Promise<EscopoTempoResposta> => {
      if (!actorId) throw new Error('Entre novamente para acessar o painel.')
      return { actorId, tenantId: await tenantAtual(actorId) }
    },
    gcTime: 0, staleTime: 0, retry: false, refetchInterval: 30_000,
  })
  return { ...consulta, data: !actorId || consulta.isError ? undefined : consulta.data }
}

async function pedir(escopo: EscopoTempoResposta, body: Record<string, unknown>): Promise<unknown> {
  await conferirSessao(escopo.actorId)
  const { data, error } = await supabase.functions.invoke('tempo-resposta-admin', { body })
  await conferirSessao(escopo.actorId)
  if (error) {
    const context = (error as { context?: unknown }).context
    const status = context instanceof Response ? context.status : null
    // Nunca mostrar mensagens SQL/stack retornadas pelo serviço.
    if (status === 404) throw new Error('O monitor ainda não está disponível nesta versão. A publicação pode estar pendente.')
    if (status === 401 || status === 403) throw new Error('Seu acesso ao monitor não foi confirmado. Entre novamente ou procure um administrador.')
    if (status === 409) throw new Error('Os dados mudaram enquanto você editava. Confira a versão atual antes de tentar salvar novamente.')
    if (status === 400 || status === 422) throw new Error('Não foi possível salvar. Confira os campos, o calendário e os vínculos atuais.')
    throw new Error('Não foi possível conectar ao monitor. Tente atualizar em alguns instantes.')
  }
  if (!data || (data as { ok?: boolean }).ok !== true) throw new Error('A operação não foi confirmada. Atualize o painel antes de tentar novamente.')
  return data
}

export function usePainelTempoResposta(escopo: EscopoTempoResposta, cursor: string | null) {
  const consulta = useQuery({
    queryKey: [...chaveTempoResposta(escopo), 'painel', cursor],
    queryFn: async () => conferirPainelTempoResposta(await pedir(escopo, { acao: 'painel', ...(cursor ? { cursor } : {}) }), escopo),
    gcTime: 0, staleTime: 0, retry: false, refetchInterval: 30_000,
  })
  // Erro de atualização pode significar revogação: não exibir o último corpo.
  return { ...consulta, data: consulta.isError ? undefined : consulta.data }
}

export function useAcaoTempoResposta(escopo: EscopoTempoResposta) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [...chaveTempoResposta(escopo), 'acao'],
    mutationFn: async (acao: AcaoTempoResposta) => {
      if (await tenantAtual(escopo.actorId) !== escopo.tenantId) throw new Error('Seu workspace mudou. Atualize a página antes de salvar.')
      await pedir(escopo, acao)
      if (await tenantAtual(escopo.actorId) !== escopo.tenantId) throw new Error('Seu workspace mudou. Confira o resultado no painel atualizado.')
    },
    retry: false,
    onSuccess: async () => { await client.invalidateQueries({ queryKey: chaveTempoResposta(escopo) }) },
    onError: () => { void client.invalidateQueries({ queryKey: chaveTempoResposta(escopo) }) },
  })
}
