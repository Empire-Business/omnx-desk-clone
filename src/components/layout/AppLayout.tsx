import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { BottomNav } from './BottomNav'
import { ReportarProblema } from '@/components/suporte/ReportarProblema'

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setSidebarCollapsed(true)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div className="safe-area-top relative flex min-h-screen bg-background">
      {/* Desktop: sticky sidebar inline */}
      {!isMobile && (
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((p) => !p)}
        />
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 lg:p-6 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-4 lg:pb-6">
        <Outlet />
      </main>

      <BottomNav />
      <ReportarProblema />
    </div>
  )
}
