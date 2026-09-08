import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function PortalLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 backdrop-blur-xl px-6">
        {/* Logo */}
        <span className="font-display text-xl font-semibold tracking-[0.22em] uppercase text-foreground select-none">
          EMPIRE<span className="text-accent">.</span>
        </span>

        {/* User area */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground hidden sm:block">
            {user?.nome ?? user?.email}
          </span>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Sair"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3 text-center">
        <p className="text-2xs text-muted-foreground">Empire Zap © {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
