import { useQuery } from '@tanstack/react-query'
import { buscarPrimeiroAcessoAberto } from '@/lib/primeiroAcesso'

/**
 * true só enquanto o app não tem nenhuma administradora (o banco decide).
 * Enquanto carrega ou com erro = false: o botão "Criar a primeira conta" só
 * aparece com a resposta do banco.
 */
export function usePrimeiroAcessoAberto(): boolean {
  const { data } = useQuery({
    queryKey: ['primeiro-acesso-aberto'],
    queryFn: buscarPrimeiroAcessoAberto,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  return data === true
}
