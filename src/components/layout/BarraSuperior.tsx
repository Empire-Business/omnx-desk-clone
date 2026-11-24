import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { ITENS_PRINCIPAIS } from '@/config/navegacao'
import { SidebarBottom } from './SidebarBottom'
import { BuscaGlobal } from './BuscaGlobal'

/**
 * Barra superior "Cume" (copiada do OMNX Clients): faixa de 60 px sobre a
 * moldura marinho, acima da folha clara. Só aparece a partir de 768 px.
 *
 * A caixa de busca é a `BuscaGlobal` (telas do menu + clientes, só leitura).
 * `busca` e `avisos` desligam a busca e o sino na barra: no app de Cobrança os
 * dois não existiam antes, então lá a barra vai sem eles.
 * O atalho de Conversas usa a rota e a regra de acesso que o menu já tem.
 */
export function BarraSuperior({ busca = true, avisos = true }: { busca?: boolean; avisos?: boolean } = {}) {
  const { pode } = useAcessoNavegacao()
  const conversas = ITENS_PRINCIPAIS.find((i) => i.id === 'conversas')
  return (
    <div className="cume-top">
      {busca && <BuscaGlobal />}
      <div className="cume-top-actions ml-auto">
        {conversas && pode(conversas.acesso) && (
          <Link to={conversas.rota} className="cume-top-link">
            <MessageSquare aria-hidden className="h-[17px] w-[17px]" />
            Chat
          </Link>
        )}
        {/* Avisos, menu do usuário e Sair: os mesmos componentes que ficavam no
            rodapé da barra lateral, agora no topo como no clients. */}
        <SidebarBottom placement="topo" hideUtils={!avisos} />
      </div>
    </div>
  )
}
