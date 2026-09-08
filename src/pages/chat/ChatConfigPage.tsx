import { useState } from 'react'
import { cn } from '@/lib/utils'
import ChatInstanciasPage from './ChatInstanciasPage'
import ChatAcessosPage from './ChatAcessosPage'
import ChatAquecimentoPage from './ChatAquecimentoPage'

type Tab = 'instancias' | 'acessos' | 'aquecimento'
const TABS: { value: Tab; label: string }[] = [
  { value: 'instancias', label: 'Instâncias' },
  { value: 'acessos', label: 'Acessos' },
  { value: 'aquecimento', label: 'Aquecimento' },
]

export default function ChatConfigPage() {
  const [tab, setTab] = useState<Tab>('instancias')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 border-b border-border px-4 shrink-0 bg-background">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'instancias' && <ChatInstanciasPage />}
        {tab === 'acessos' && <ChatAcessosPage />}
        {tab === 'aquecimento' && <ChatAquecimentoPage />}
      </div>
    </div>
  )
}
