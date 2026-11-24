import { Navigate, useLocation } from 'react-router-dom'
import { traduzirRotaAntiga } from '@/config/rotasAntigas'

/**
 * Componente ÚNICO de redirecionamento de endereços antigos (R1).
 *
 * Usa o endereço inteiro da barra (caminho + "?busca" + "#âncora") e troca por
 * `replace`, para o "voltar" do navegador não cair de novo no endereço antigo.
 * Se, por engano, for montado num caminho sem regra, manda para o Início em
 * vez de mostrar tela branca.
 */
export function RedirecionamentoAntigo() {
  const { pathname, search, hash } = useLocation()
  const destino = traduzirRotaAntiga(pathname, search, hash) ?? '/'
  return <Navigate to={destino} replace />
}
