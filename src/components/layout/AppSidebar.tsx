import { Link, useLocation } from 'react-router-dom'
import {
  ChevronDown,
  CircleHelp,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useInboxUnreadConversationCount } from '@/hooks/useChat'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { useSaasHubs } from '@/hooks/useSaasHubs'
import { createSaasSwitchUrl } from '@/lib/saasHubs'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { ITENS_PRINCIPAIS, ITEM_AJUSTES, itemAtivo, type ItemNav } from '@/config/navegacao'
import { useAjuda } from '@/components/ajuda/ajudaContexto'
import { OmnxBrandBand } from './OmnxBrandBand'

// Fonte da palavra do produto no seletor de hub: a família do DS (Archivo).
const HUB_FONT = 'var(--font-display)'

interface AppSidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

/**
 * Barra lateral (computador, ≥ 768 px). Itens e regras vêm de
 * `config/navegacao.ts` — a mesma fonte da barra inferior e do painel "Mais".
 * Itens em blocos como no OMNX Clients; Ajustes e Ajuda no rodapé.
 */
export function AppSidebar({ collapsed: collapsedProp, onToggleCollapsed }: AppSidebarProps) {
  const location = useLocation()
  const { pode } = useAcessoNavegacao()
  const { abrirMenu } = useAjuda()
  const chatUnread = useInboxUnreadConversationCount()
  const { hubs: saasHubs, loading: saasHubsLoading } = useSaasHubs()

  // Estado interno se não controlado por fora
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = collapsedProp ?? internalCollapsed
  const handleToggleCollapsed = onToggleCollapsed ?? (() => setInternalCollapsed((c) => !c))

  // Popover de troca de hub
  const [hubOpen, setHubOpen] = useState(false)
  const hubRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hubOpen) return
    const onDown = (e: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(e.target as Node)) setHubOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHubOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [hubOpen])

  const itens = ITENS_PRINCIPAIS.filter((i) => pode(i.acesso))
  const contador = (item: ItemNav) => (item.contador === 'conversas' ? chatUnread : 0)

  return (
    <aside
      aria-label="Menu principal"
      className={cn(
        // DS `.sb`: 224 px expandida, 60 px recolhida; fundo da barra lateral e borda fina.
        'tema-marinho sticky top-0 z-30 flex h-dvh shrink-0 flex-col gap-0.5 overflow-hidden border-r border-sidebar-border bg-sidebar px-2.5 py-3 text-sidebar-foreground',
        'transition-[width] duration-slow ease-out',
        collapsed ? 'w-[60px] px-2' : 'w-[var(--sidebar-width)]',
      )}
    >
      {/* Marca + recolher (DS `.sb-brand`) */}
      <div className={cn('mb-1.5 flex items-center gap-2', collapsed && 'flex-col gap-2')}>
        <OmnxBrandBand collapsed={collapsed} className={collapsed ? undefined : 'flex-1'} />
        <button
          type="button"
          onClick={handleToggleCollapsed}
          className="btn btn-ghost btn-icon btn-sm shrink-0 text-fg-4"
          aria-label={collapsed ? 'Abrir menu' : 'Recolher menu'}
          title={collapsed ? 'Abrir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        </button>
      </div>

      {/* Plataforma (DS `.sb-org`) */}
      <div className="relative mb-2.5" ref={hubRef}>
        <button
          type="button"
          onClick={() => setHubOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={hubOpen}
          aria-label="Trocar plataforma"
          title={collapsed ? 'Trocar plataforma' : undefined}
          className={cn(
            'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-sidebar-border bg-card px-2 text-left text-[13px] font-semibold text-foreground',
            'transition-colors duration-fast ease-std hover:border-stroke-default focus-ds',
            collapsed && 'justify-center px-0',
          )}
        >
          <span className="av sq av-sm shrink-0" data-h="0" aria-hidden>D</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold uppercase leading-none tracking-[0.07em] text-fg-4">Plataforma</span>
                <span className="mt-0.5 block truncate leading-none" style={{ fontFamily: HUB_FONT, fontStretch: '108%' }}>Desk</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
        </button>

        {hubOpen && (
          <div
            role="menu"
            className={cn(
              // DS `.menu`: popover com anel + sombra "flutua".
              'absolute z-50 w-60 rounded-lg bg-popover p-1.5 text-popover-foreground shadow-[var(--elev-pop),var(--ring-1)] animate-fade-in-up',
              collapsed ? 'left-full top-0 ml-2' : 'left-0 top-full mt-1',
            )}
          >
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-4">Trocar plataforma</p>
            {saasHubs.map((hub) => {
              const isCurrent = hub.skill_slug === 'omnx-desk-saas'
              return (
                <button
                  key={hub.skill_slug}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setHubOpen(false)
                    if (isCurrent) return
                    void supabase.auth.getSession().then(async ({ data }) => {
                      const accessToken = data.session?.access_token
                      if (!accessToken) return
                      const url = await createSaasSwitchUrl(hub.skill_slug, accessToken).catch(() => null)
                      if (url) window.location.assign(url)
                    })
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-fast hover:bg-accent focus-ds"
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-extrabold ${hub.badgeClass}`}>
                    {hub.label.charAt(0)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13.5px] font-semibold leading-none text-foreground" style={{ fontFamily: HUB_FONT, fontStretch: '108%' }}>
                      {hub.label}
                    </span>
                    <span className="mt-1 truncate text-xs leading-tight text-muted-foreground">{hub.platform_name}</span>
                  </span>
                  {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-link" aria-label="Atual" />}
                </button>
              )
            })}
            {saasHubsLoading && <p className="px-2 py-2 text-xs text-muted-foreground">Carregando plataformas…</p>}
            {!saasHubsLoading && saasHubs.length === 1 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma outra plataforma disponível.</p>
            )}
          </div>
        )}
      </div>

      {/* Itens principais */}
      <nav className={cn('sidebar-scroll -mx-1 flex-1 overflow-y-auto px-1', collapsed && 'overflow-x-hidden')}>
        <ul className="flex flex-col gap-0.5">
          {itens.map((item, indice) => (
            <li key={item.id} className={cn(indice > 0 && blocoDe(item) !== blocoDe(itens[indice - 1]) && 'cume-nav-bloco')}>
              <ItemLateral
                item={item}
                ativo={itemAtivo(item, location.pathname)}
                collapsed={collapsed}
                contador={contador(item)}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Rodapé (DS `.sb-foot`): Ajustes, Ajuda, notificações, tema e você */}
      <div className="mt-auto border-t border-sidebar-border pt-2">
        <ul className="flex flex-col gap-0.5">
          <li>
            <ItemLateral item={ITEM_AJUSTES} ativo={itemAtivo(ITEM_AJUSTES, location.pathname)} collapsed={collapsed} contador={0} />
          </li>
          <li>
            <button
              type="button"
              onClick={abrirMenu}
              aria-haspopup="dialog"
              title={collapsed ? 'Ajuda' : undefined}
              className={cn(CLASSE_ITEM, collapsed ? 'justify-center px-0' : 'pl-3 pr-2.5', CLASSE_ITEM_INATIVO)}
            >
              <CircleHelp className="h-[17px] w-[17px] shrink-0 text-iris-fg" aria-hidden />
              {collapsed ? <span className="sr-only">Ajuda</span> : <span className="flex-1 truncate text-left">Ajuda</span>}
            </button>
          </li>
        </ul>
      </div>
    </aside>
  )
}

// Cume: o menu do clients separa os itens em blocos por uma linha fina
// (Clientes · Atendimento · Agenda · Financeiro · Análise).
// Só aparência: a ordem e as rotas continuam as de config/navegacao.ts.
// O bloco vem do item visível anterior, então a linha não some quando um item
// do começo do bloco está escondido para a pessoa (ex.: app Chat desligado).
const BLOCO: Record<string, string> = {
  inicio: 'inicio', clientes: 'clientes',
  conversas: 'atendimento', tickets: 'atendimento', ia: 'atendimento',
  agenda: 'agenda', aulas: 'agenda', contratos: 'financeiro', relatorios: 'analise', pesquisas: 'analise',
}
const blocoDe = (item: ItemNav) => BLOCO[item.id] ?? item.id

// DS `.sb-item`: 34 px, raio 6, 13,5 px 550; ícone 17 px em --fg-4.
const CLASSE_ITEM =
  'group relative flex h-[34px] w-full items-center gap-2.5 whitespace-nowrap rounded-md text-[13.5px] transition-colors duration-fast ease-std focus-ds'
const CLASSE_ITEM_INATIVO =
  'font-[550] text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'

function ItemLateral({
  item,
  ativo,
  collapsed,
  contador,
}: {
  item: ItemNav
  ativo: boolean
  collapsed: boolean
  contador: number
}) {
  const temContador = contador > 0
  return (
    <Link
      to={item.rota}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        CLASSE_ITEM,
        collapsed ? 'justify-center px-0' : 'pl-3 pr-2.5',
        ativo
          ? 'bg-sidebar-accent font-[650] text-sidebar-accent-foreground'
          : CLASSE_ITEM_INATIVO,
      )}
      title={collapsed ? item.rotulo : undefined}
    >
      {/* Item ativo: o corte diagonal do X do logo à esquerda (DS). */}
      {ativo && (
        <span
          className="slash absolute left-0.5 top-[11px] h-3 w-[7px]"
          aria-hidden
        />
      )}
      <item.icone
        className={cn(
          'h-[17px] w-[17px] shrink-0 transition-colors duration-fast',
          ativo ? 'text-link' : 'text-fg-4 group-hover:text-sidebar-accent-foreground',
        )}
        aria-hidden
      />
      {collapsed ? <span className="sr-only">{item.rotulo}</span> : <span className="flex-1 truncate">{item.rotulo}</span>}
      {!collapsed && temContador && (
        <span className="count is-primary">
          {contador > 99 ? '99+' : contador}
          <span className="sr-only"> não lidas</span>
        </span>
      )}
      {collapsed && temContador && (
        <span className="absolute right-2.5 top-1.5 h-[7px] w-[7px] rounded-full bg-primary shadow-[0_0_0_2px_var(--sidebar)]">
          <span className="sr-only">{contador > 99 ? '99+' : contador} não lidas</span>
        </span>
      )}
    </Link>
  )
}
