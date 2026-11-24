import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { CircleHelp, LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import { useInboxUnreadConversationCount } from '@/hooks/useChat'
import { useUnreadCount } from '@/hooks/useNotifications'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { ITENS_BARRA_INFERIOR, ITENS_MAIS, itemAtivo, type ContadorNav } from '@/config/navegacao'
import { PainelInferior, LinhaPainel } from '@/components/ui/PainelInferior'
import { useAjuda } from '@/components/ajuda/ajudaContexto'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  /**
   * `true` (padrão): presa ao rodapé da tela, por cima do conteúdo (o `main`
   * reserva o espaço). `false`: no fluxo do layout — usado em Conversas, que
   * ocupa a altura total e não pode ter nada por cima do campo de mensagem.
   */
  fixa?: boolean
}

/**
 * Barra inferior do celular: Início, Conversas, Tickets, Contratos e "Mais".
 * Aparece em TODA tela abaixo de 768 px (`md:hidden`) — o mesmo ponto em que a
 * barra lateral some. Antes ela sumia em 640 px e deixava a faixa 640–767 px
 * sem nenhum menu.
 */
export function BottomNav({ fixa = true }: BottomNavProps) {
  const { pathname } = useLocation()
  const { pode } = useAcessoNavegacao()
  const contadores = useContadores()
  const [maisAberto, setMaisAberto] = useState(false)

  const itens = ITENS_BARRA_INFERIOR.filter((i) => pode(i.acesso))
  const maisAtivo = ITENS_MAIS.some((i) => itemAtivo(i, pathname))

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className={cn(
          // DS `.bnav`: 64 px, cartão 94% com desfoque leve, borda fina em cima, área segura.
          'md:hidden z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-[8px]',
          fixa ? 'fixed inset-x-0 bottom-0' : 'shrink-0',
        )}
      >
        <div className="flex h-16 items-stretch">
          {itens.map((item) => {
            const ativo = itemAtivo(item, pathname)
            const n = item.contador ? contadores[item.contador] : 0
            return (
              <NavLink
                key={item.id}
                to={item.rota}
                aria-current={ativo ? 'page' : undefined}
                className={cn(CLASSE_BOTAO, ativo ? CLASSE_ATIVO : CLASSE_INATIVO)}
              >
                <span className="relative">
                  <item.icone className={cn(CLASSE_ICONE, ativo && '-translate-y-px')} aria-hidden />
                  {n > 0 && (
                    <span className="count is-primary absolute -top-1.5 left-[calc(50%+6px)] h-4 min-w-4 px-1 text-[10px] shadow-[0_0_0_2px_var(--card)]">
                      {n > 99 ? '99+' : n}
                      <span className="sr-only"> não lidas</span>
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1 text-[11px] font-semibold">{item.rotulo}</span>
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            aria-haspopup="dialog"
            aria-expanded={maisAberto}
            aria-current={maisAtivo ? 'page' : undefined}
            className={cn(CLASSE_BOTAO, maisAtivo ? CLASSE_ATIVO : CLASSE_INATIVO)}
          >
            <span className="relative">
              <Menu className={cn(CLASSE_ICONE, maisAtivo && '-translate-y-px')} aria-hidden />
              {contadores.notificacoes > 0 && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive shadow-[0_0_0_2px_var(--card)]" aria-hidden />
              )}
            </span>
            <span className="text-[11px] font-semibold">Mais{contadores.notificacoes > 0 && <span className="sr-only"> (há notificações não lidas)</span>}</span>
          </button>
        </div>
      </nav>

      <PainelMais aberto={maisAberto} onFechar={() => setMaisAberto(false)} contadores={contadores} />
    </>
  )
}

// DS `.bnav button`: alvo ≥ 48 px, ícone 21 px, rótulo 11 px 600; ativo em
// azul com um traço de 2 px no topo e o ícone subindo 1 px.
const CLASSE_BOTAO = cn(
  'group relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] transition-colors duration-fast ease-std',
  'focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]',
)
const CLASSE_ATIVO =
  'text-link before:absolute before:inset-x-[30%] before:top-0 before:h-0.5 before:rounded-b-sm before:bg-primary before:content-[""]'
const CLASSE_INATIVO = 'text-muted-foreground hover:text-foreground'
const CLASSE_ICONE = 'h-[21px] w-[21px] transition-transform duration-base ease-out group-active:scale-90'

function useContadores(): Record<ContadorNav, number> {
  const conversas = useInboxUnreadConversationCount()
  const { data: notificacoes = 0 } = useUnreadCount()
  return { conversas, notificacoes }
}

/** Painel "Mais": o resto do menu, com as MESMAS regras da barra lateral. */
function PainelMais({
  aberto,
  onFechar,
  contadores,
}: {
  aberto: boolean
  onFechar: () => void
  contadores: Record<ContadorNav, number>
}) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { pode } = useAcessoNavegacao()
  const { abrirMenu } = useAjuda()

  const itens = ITENS_MAIS.filter((i) => pode(i.acesso))
  const ir = (rota: string) => { onFechar(); navigate(rota) }
  const nome = user?.nome ?? user?.email?.split('@')[0] ?? 'Você'

  return (
    <PainelInferior aberto={aberto} onFechar={onFechar} titulo="Mais opções" descricao={nome}>
      {aberto && (
        <div className="space-y-0.5">
          {itens.map((item) => (
            <LinhaPainel
              key={item.id}
              icone={item.icone}
              rotulo={item.rotulo}
              descricao={item.descricao}
              contador={item.contador ? contadores[item.contador] : undefined}
              onClick={() => ir(item.rota)}
            />
          ))}
          <LinhaPainel
            icone={CircleHelp}
            rotulo="Ajuda"
            descricao="Perguntar à Íris, reportar um problema ou abrir o manual."
            onClick={() => { onFechar(); abrirMenu() }}
          />
          <div className="my-1 border-t border-border" />
          <LinhaPainel
            icone={theme === 'dark' ? Sun : Moon}
            rotulo={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            onClick={toggleTheme}
          />
          <LinhaPainel
            icone={LogOut}
            rotulo="Sair"
            destrutivo
            onClick={() => {
              onFechar()
              void signOut().then(() => navigate('/login')).catch(() => {})
            }}
          />
        </div>
      )}
    </PainelInferior>
  )
}
