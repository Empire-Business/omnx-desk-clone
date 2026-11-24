import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useIsMobile, useIsTablet } from '@/hooks/useMediaQuery'
import { useInboxUnreadConversationCount, useRealtimeUnread, useConversations, useContactClientLinks } from '@/hooks/useChat'
import { useMyClientIds } from '@/hooks/useUsers'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { useMenuRecolhido } from '@/hooks/useMenuRecolhido'
import { ABAS_CONVERSAS, itemAtivo } from '@/config/navegacao'
import { AjudaProvider, BotaoAjudaEmbutido } from '@/components/ajuda/PontoDeAjuda'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { AppSidebar } from './AppSidebar'
import { BottomNav } from './BottomNav'
import { BarraSuperior } from './BarraSuperior'
import type { ContextoCascaConversas } from './cascaConversas'

/**
 * Casca de Conversas (rotas `/conversas/*`).
 *
 * Antes era uma "segunda casca" com menu próprio que trocava a barra lateral
 * inteira — e, no celular, a gaveta desse menu nunca abria (nenhum botão a
 * chamava). Agora:
 * - a barra lateral é a MESMA do resto do sistema (computador);
 * - as seções de Conversas ficam numa faixa de abas no topo, sempre visível;
 * - no celular a barra inferior aparece aqui também, no fluxo da página (não
 *   por cima), para nunca cobrir o campo de mensagem — e some enquanto uma
 *   conversa está aberta, para sobrar altura para ler e digitar (o "voltar"
 *   do cabeçalho da conversa leva à lista, e a barra volta);
 * - a ajuda fica no topo, nunca flutuando sobre a conversa.
 *
 * O que continua EXCLUSIVO desta casca (R6): som e tempo real de mensagens não
 * lidas, com o filtro de carteira por perfil. Fora de /conversas nada disso toca.
 */
export function ChatLayout() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const { pathname } = useLocation()
  const { pode } = useAcessoNavegacao()
  const inboxUnreadConvCount = useInboxUnreadConversationCount()

  const { data: myClientIds } = useMyClientIds()
  const { data: conversations = [] } = useConversations()
  const { data: contactClientLinks } = useContactClientLinks()
  const isEstrategista = user?.perfil === 'estrategista' || user?.perfil === 'gerente'
  const isAtendimento = user?.perfil === 'atendimento'

  // Conversa aberta (pela URL) não toca som.
  const [searchParams] = useSearchParams()
  const activeConversationId = searchParams.get('id')

  const mutedSetRef = useRef(new Set<string>())
  const allowedSoundRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    mutedSetRef.current.clear()
    for (const c of conversations) {
      if (c.silenciado) mutedSetRef.current.add(c.id)
    }
  }, [conversations])

  useEffect(() => {
    if (isAtendimento) {
      const allowed = new Set<string>()
      for (const c of conversations) {
        if (c.agente_id === user?.id || (!c.agente_id && c.status === 'aberta')) {
          allowed.add(c.id)
        }
      }
      allowedSoundRef.current = allowed
      return
    }

    if (!isEstrategista || !Array.isArray(myClientIds)) {
      allowedSoundRef.current = null
      return
    }
    const allowed = new Set<string>()
    for (const c of conversations) {
      if (c.agente_id === user?.id) { allowed.add(c.id); continue }
      const contactId = c.chat_contacts?.id
      const singleClientId = c.chat_contacts?.client_id
      const fromJunction = contactId ? contactClientLinks?.get(contactId) : undefined
      const clientIds = (fromJunction && fromJunction.length > 0) ? fromJunction : (singleClientId ? [singleClientId] : [])
      if (clientIds.some(cid => myClientIds.includes(cid))) {
        allowed.add(c.id)
      }
    }
    allowedSoundRef.current = allowed
  }, [conversations, isEstrategista, isAtendimento, myClientIds, contactClientLinks, user?.id])

  useRealtimeUnread({ muted: mutedSetRef.current, allowedConversationIds: allowedSoundRef.current, activeConversationId })

  // Barra lateral: no tablet (768–1023 px) começa recolhida, para sobrar
  // espaço para lista + conversa (auditoria 03, G15).
  const [recolhido, alternarRecolhido] = useMenuRecolhido()
  const [abertoNoTablet, setAbertoNoTablet] = useState(false)
  const recolhidoEfetivo = isTablet ? !abertoNoTablet : recolhido
  const alternar = isTablet ? () => setAbertoNoTablet((v) => !v) : alternarRecolhido

  const abas = ABAS_CONVERSAS.filter((a) => pode(a.acesso))

  // Conversa aberta em tela cheia no celular (avisada pela caixa de entrada).
  const [conversaAberta, setConversaAberta] = useState(false)
  const contextoCasca: ContextoCascaConversas = { marcarConversaAberta: setConversaAberta }

  return (
    <AjudaProvider>
      <div className="cume-frame flex h-dvh overflow-hidden text-foreground" style={{ '--sidebar-w': isMobile ? '0px' : recolhidoEfetivo ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' } as CSSProperties}>
        {!isMobile && <AppSidebar collapsed={recolhidoEfetivo} onToggleCollapsed={alternar} />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BarraSuperior />
        <div className="cume-sheet flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="safe-area-top flex shrink-0 items-end gap-1 border-b border-border bg-card px-2 md:px-3">
            {/* Mesmas abas roláveis do resto do app (DS): rolam de lado no
                celular, com esmaecimento nas bordas e a ativa sempre à vista. */}
            <AbasRolaveis
              rotulo="Seções de Conversas"
              className="flex-1 [&>.tabs]:border-b-0"
              itens={abas.map((aba) => ({
                id: aba.id,
                para: aba.rota,
                fim: aba.exato,
                ativo: itemAtivo(aba, pathname),
                rotulo: aba.rotulo,
                icone: aba.icone,
                contador: aba.contador === 'conversas' ? inboxUnreadConvCount : 0,
              }))}
            />
            <BotaoAjudaEmbutido className="mb-0.5 self-center" />
          </header>

          {/* Rolagem própria por padrão (auditoria 03, G5): páginas como Filas e
              Contatos não tinham rolagem e o conteúdo ficava cortado. A caixa
              de entrada e o quadro ocupam a altura toda e rolam por dentro. */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet context={contextoCasca} />
          </main>

          {!(isMobile && conversaAberta) && <BottomNav fixa={false} />}
        </div>
        </div>
      </div>
    </AjudaProvider>
  )
}
