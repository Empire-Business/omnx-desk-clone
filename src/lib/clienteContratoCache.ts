import type { QueryClient } from '@tanstack/react-query'

/** O banco recalcula clients.ativo junto com a alteração do contrato. */
export function invalidarClientesAposContrato(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['clients'] }),
    queryClient.invalidateQueries({ queryKey: ['clientes-list-comissoes'] }),
    queryClient.invalidateQueries({ queryKey: ['contrato-cliente-vinculo'] }),
    queryClient.invalidateQueries({ queryKey: ['automacoes-wa', 'vinculos'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-data'] }),
  ])
}
