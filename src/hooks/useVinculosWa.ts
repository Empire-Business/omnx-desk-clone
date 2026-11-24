import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  lerCanais, type AcaoVinculo, type ClienteBusca, type ExecucaoVinculos, type FiltroVinculos, type TipoCanalWa,
} from '@/lib/automacoesWaVinculos'

/**
 * Aba "Vínculos" (Automações WhatsApp): de qual cliente é cada grupo / conversa.
 *
 * Tudo passa pelo banco (migration 20261027110000_cliente_canais.sql):
 *   vinculos_listar / vinculos_decidir / vinculos_buscar_clientes — só
 *   admin/gerente que administra o app (o banco confere de novo);
 *   wa-vinculos-sugerir — botão "Recalcular sugestões".
 * O front nunca escreve em cliente_canais direto e nunca recebe telefone inteiro.
 */

// RPCs e tabelas novas ainda não estão nos tipos gerados (types.ts).
const semTipos = () => supabase as unknown as SupabaseClient

export const keysVinculos = {
  base: ['automacoes-wa', 'vinculos'] as const,
  lista: (filtro: FiltroVinculos, tipo: TipoCanalWa | null) => ['automacoes-wa', 'vinculos', 'lista', filtro, tipo ?? 'todos'] as const,
  busca: (texto: string) => ['automacoes-wa', 'vinculos', 'busca', texto] as const,
  execucao: ['automacoes-wa', 'vinculos', 'execucao'] as const,
}

const ERRO_SERVIDOR = 'Não foi possível falar com o servidor. Tente de novo.'

/** Canais da empresa (grupos e privados, todos os números juntos). */
export function useVinculos(filtro: FiltroVinculos, tipo: TipoCanalWa | null, habilitado = true) {
  return useQuery({
    queryKey: keysVinculos.lista(filtro, tipo),
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await semTipos().rpc('vinculos_listar', {
        p_dias: 30, p_filtro: filtro, p_tipo: tipo, p_limite: 300,
      })
      if (error) throw error
      return lerCanais(data)
    },
  })
}

export interface DecisaoVinculo {
  contato_id: string
  acao: AcaoVinculo
  client_id?: string | null
}

/** Aceitar / outro cliente / interno / não é cliente / desfazer. Vale para todos os números. */
export function useDecidirVinculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: DecisaoVinculo) => {
      const { error } = await semTipos().rpc('vinculos_decidir', {
        p_contato_id: d.contato_id, p_acao: d.acao, p_client_id: d.client_id ?? null,
      })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keysVinculos.base }),
  })
}

/** Clientes por nome / empresa / razão social (mínimo 2 letras). */
export function useBuscarClientesVinculo(texto: string, habilitado = true) {
  const t = texto.trim()
  return useQuery({
    queryKey: keysVinculos.busca(t),
    enabled: habilitado && t.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await semTipos().rpc('vinculos_buscar_clientes', { p_texto: t, p_limite: 20 })
      if (error) throw error
      return ((data ?? []) as ClienteBusca[]).map((c) => ({ ...c, empresa: c.empresa ?? null }))
    },
  })
}

/** Quando as sugestões foram atualizadas pela última vez (cron ou botão). */
export function useUltimaExecucaoVinculos(habilitado = true) {
  return useQuery({
    queryKey: keysVinculos.execucao,
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await semTipos().from('vinculos_execucoes')
        .select('criado_em, origem, resultado')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle()
      if (error) return null // tabela ainda não criada: só não mostra a data
      return (data ?? null) as ExecucaoVinculos | null
    },
  })
}

export interface RespostaRecalcular {
  ok: boolean
  error?: string
  gravados?: number
  confirmados?: number
  removidos?: number
  contagem?: Record<string, number>
}

/** Botão "Recalcular sugestões" (1 vez por minuto; o servidor confere). */
export function useRecalcularVinculos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<RespostaRecalcular> => {
      const { data, error } = await supabase.functions.invoke('wa-vinculos-sugerir', { body: {} })
      if (error) {
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const corpo = (await ctx.json()) as RespostaRecalcular
            if (corpo && typeof corpo === 'object') return { ...corpo, ok: false }
          } catch {
            // cai no erro genérico abaixo
          }
        }
        return { ok: false, error: ERRO_SERVIDOR }
      }
      return (data ?? { ok: false, error: ERRO_SERVIDOR }) as RespostaRecalcular
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keysVinculos.base }),
  })
}
