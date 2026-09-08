import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ClientContactRow {
  id: string
  numero_whatsapp: string
  nome: string | null
  foto_url: string | null
  instance_id: string
  bloqueado?: boolean | null
}

/** Carrega chat_contacts agrupados por client_id pra todos clientes (uma query). */
export function useAllClientContacts() {
  return useQuery({
    queryKey: ['client-contacts', 'all'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_contacts')
        .select('id, numero_whatsapp, nome, foto_url, instance_id, bloqueado, client_id')
        .not('client_id', 'is', null)
      if (error) throw error
      const map = new Map<string, ClientContactRow[]>()
      for (const row of (data ?? []) as Array<ClientContactRow & { client_id: string }>) {
        const list = map.get(row.client_id) ?? []
        list.push(row)
        map.set(row.client_id, list)
      }
      return map
    },
  })
}

export const clientContactKeys = {
  byClient: (clientId: string) => ['client-contacts', clientId] as const,
}

export function useClientContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: clientContactKeys.byClient(clientId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_contacts')
        .select('id, numero_whatsapp, nome, foto_url, instance_id')
        .eq('client_id', clientId!)
        .order('nome', { nullsFirst: false })
      if (error) throw error
      return (data ?? []) as ClientContactRow[]
    },
    enabled: !!clientId,
  })
}
