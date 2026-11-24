import { useState, type CSSProperties } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { BottomNav } from './BottomNav'
import { BarraSuperior } from './BarraSuperior'
import { AjudaProvider, BotaoAjudaFlutuante } from '@/components/ajuda/PontoDeAjuda'
import { useIsMobile, useIsTablet } from '@/hooks/useMediaQuery'
import { useMenuRecolhido } from '@/hooks/useMenuRecolhido'

/**
 * Casca principal. Regra de tela única para os dois menus (antes eram 768 px
 * para a barra lateral e 640 px para a inferior — e a faixa entre os dois
 * ficava sem menu nenhum):
 * - ≥ 768 px: barra lateral;
 * - < 768 px: barra inferior com "Mais".
 */
export function AppLayout() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [recolhido, alternarRecolhido] = useMenuRecolhido()

  // Tablet (768–1023 px): a barra lateral começa recolhida, como em Conversas.
  // Aberta, ela ocupa 224 px e sobrariam só ~480 px para a tela a 768 px —
  // grades e tabelas ficavam espremidas. A pessoa ainda pode abrir pelo botão.
  const [abertoNoTablet, setAbertoNoTablet] = useState(false)
  const recolhidoEfetivo = isTablet ? !abertoNoTablet : recolhido
  const alternar = isTablet ? () => setAbertoNoTablet((v) => !v) : alternarRecolhido

  // Largura da barra lateral para camadas fixas (toast) saberem onde começar.
  const larguraLateral = isMobile ? '0px' : recolhidoEfetivo ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)'

  return (
    <AjudaProvider>
      {/* Sem fundo próprio: deixa aparecer o fundo do DS (luz + grade sutil) do body. */}
      <div
        className="cume-frame safe-area-top relative flex min-h-dvh text-foreground"
        style={{ '--sidebar-w': larguraLateral } as CSSProperties}
      >
        {!isMobile && <AppSidebar collapsed={recolhidoEfetivo} onToggleCollapsed={alternar} />}

        {/* Margens do DS: 16 · 24 · 32 · 40 px. No celular o rodapé reserva a
            barra inferior (64 px + área segura) e o botão de ajuda (52 px);
            no computador, só o botão de ajuda no canto. */}
        <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior />
        <main className="cume-sheet min-w-0 flex-1 overflow-y-auto px-4 pt-4 sm:px-6 sm:pt-6 md:px-8 2xl:px-10 pb-[calc(var(--bnav-h)+var(--safe-b)+5.5rem)] md:pb-24">
          <Outlet />
          <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
            <a href="/manual" className="inline-flex min-h-11 items-center underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline md:min-h-0">Manual de uso</a>
            <Link to="/seguranca" className="inline-flex min-h-11 items-center underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline md:min-h-0">Segurança, privacidade e IA</Link>
          </footer>
        </main>
        </div>

        <BottomNav />
        <BotaoAjudaFlutuante />
      </div>
    </AjudaProvider>
  )
}
