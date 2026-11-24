// Token da UAZAPI de cada número de WhatsApp, guardado no cofre do banco (Vault).
// A tela só sabe SE há token salvo; o valor nunca volta para o navegador.
// RPCs: migrações 20261109120000 (números do Chat, whatsapp_instances) e
// 20261109121000 (números de Cobrança, cobranca_instances).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** De qual tela é o número: Chat (whatsapp_instances) ou Cobrança (cobranca_instances). */
export type TipoNumeroUazapi = 'chat' | 'cobranca'

const RPC = {
  chat: { lista: 'uazapi_numeros_com_token', salvar: 'salvar_uazapi_token_numero' },
  cobranca: { lista: 'uazapi_cobranca_com_token', salvar: 'salvar_uazapi_token_cobranca' },
} as const

const chave = (tipo: TipoNumeroUazapi) => ['chat', 'uazapi-tokens', tipo] as const

/** Ids dos números da empresa (da tabela do `tipo`) que têm token salvo no cofre. */
export function useNumerosComToken(habilitado = true, tipo: TipoNumeroUazapi = 'chat') {
  return useQuery({
    queryKey: chave(tipo),
    enabled: habilitado,
    queryFn: async (): Promise<Set<string>> => {
      const nome = RPC[tipo].lista
      const { data, error } = await supabase.rpc(nome as never)
      // Banco sem a migração ainda: trata como "nenhum token salvo".
      if (error) return new Set()
      const lista = Array.isArray(data) ? (data as unknown[]) : []
      return new Set(lista.map((v) => (typeof v === 'string' ? v : String((v as Record<string, unknown>)?.[nome] ?? ''))).filter(Boolean))
    },
  })
}

/** Salva, troca ou (com token vazio) remove o token de um número. Só administrador. */
export function useSalvarTokenNumero(tipo: TipoNumeroUazapi = 'chat') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ instanciaId, token }: { instanciaId: string; token: string }) => {
      const { error } = await supabase.rpc(RPC[tipo].salvar as never, {
        p_instance: instanciaId,
        p_token: token.trim(),
      } as never)
      if (error) throw new Error(error.message)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chave(tipo) }),
  })
}
