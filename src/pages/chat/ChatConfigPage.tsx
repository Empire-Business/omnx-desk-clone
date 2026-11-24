import { useSearchParams } from 'react-router-dom'
import { Flame, KeyRound, Smartphone } from 'lucide-react'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import ChatInstanciasPage from './ChatInstanciasPage'
import ChatAcessosPage from './ChatAcessosPage'
import ChatAquecimentoPage from './ChatAquecimentoPage'

type Tab = 'instancias' | 'acessos' | 'aquecimento'
const TABS: { value: Tab; label: string; icone: typeof Smartphone }[] = [
  { value: 'instancias', label: 'Números de WhatsApp', icone: Smartphone },
  { value: 'acessos', label: 'Quem vê cada número', icone: KeyRound },
  { value: 'aquecimento', label: 'Aquecimento de número', icone: Flame },
]

const ehAba = (v: string | null): v is Tab => TABS.some((t) => t.value === v)

/**
 * Números e acessos do WhatsApp. A aba fica na URL (`?aba=acessos`), para dar
 * para mandar o link direto e para os endereços antigos `/chat/instancias` e
 * `/chat/acessos` caírem na aba certa (auditoria 01, R16).
 *
 * As abas são as `AbasRolaveis` do DS (rolam de lado no celular, com a ativa
 * sempre à vista) e ficam presas no topo enquanto o conteúdo rola.
 */
export default function ChatConfigPage() {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('aba')
  const tab: Tab = ehAba(pedida) ? pedida : 'instancias'
  const setTab = (t: Tab) => {
    const novo = new URLSearchParams(params)
    novo.set('aba', t)
    setParams(novo, { replace: true })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-background px-2 sm:px-4 md:px-6">
        <AbasRolaveis
          rotulo="Números e acessos"
          className="[&>.tabs]:border-b-0"
          itens={TABS.map((t) => ({
            id: t.value,
            rotulo: t.label,
            icone: t.icone,
            ativo: tab === t.value,
            onClick: () => setTab(t.value),
          }))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'instancias' && <ChatInstanciasPage />}
        {tab === 'acessos' && <ChatAcessosPage />}
        {tab === 'aquecimento' && <ChatAquecimentoPage />}
      </div>
    </div>
  )
}
