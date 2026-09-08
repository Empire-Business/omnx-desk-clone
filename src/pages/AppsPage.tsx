import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, FileText, Headphones, Banknote, ExternalLink, Blocks, Loader2, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'
import { useAppModules, useToggleAppModule, type AppModule } from '@/hooks/useAppModules'

// Mapeia o nome do ícone (string vinda do banco) para o componente lucide.
const ICONS: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Headphones,
  Banknote,
  ExternalLink,
}

export function AppsPage() {
  const { user } = useAuth()
  const { can, carregando } = usePermissoes()
  // Fase 2: quem administra a Loja de Apps vem da matriz, nao do perfil fixo.
  if (!carregando && !can('apps', 'admin')) return <Navigate to="/" replace />

  return <AppsBoard />
}

function AppsBoard() {
  const { data: apps, isLoading, isError } = useAppModules()
  const toggle = useToggleAppModule()
  const [pendingOff, setPendingOff] = useState<AppModule | null>(null)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)

  const handleToggle = (app: AppModule) => {
    // Desligar pede confirmação (esconde o app de todos os usuários da instalação).
    if (app.enabled) {
      setPendingOff(app)
      return
    }
    aplicar(app.slug, true)
  }

  const aplicar = (slug: string, enabled: boolean) => {
    setSavingSlug(slug)
    toggle.mutate(
      { slug, enabled },
      { onSettled: () => setSavingSlug(null) },
    )
  }

  // Só a camada 'app' aparece: é o que se liga e desliga no dia a dia.
  // 'nucleo' é a base do sistema e não é opcional; 'arquivado' (Cobrança,
  // Portal) fica fora de uso e fora da tela — as linhas seguem no banco com
  // enabled = false, então as rotas continuam bloqueadas e nenhum dado sumiu.
  // Para religar um arquivado hoje é preciso mexer no banco, de propósito:
  // não é operação de rotina.
  const disponiveis = (apps ?? []).filter((a) => a.categoria === 'app')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apps"
        description="Ative ou desative os aplicativos desta instalação. Apps desativados somem do menu e não podem ser acessados por URL. Nenhum dado é apagado — reativar restaura tudo."
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando apps…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Não foi possível carregar os apps. Verifique se a migration de
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">app_modules</code>
          foi aplicada. Enquanto isso, todos os apps continuam visíveis (fail-open).
        </div>
      )}

      {!isLoading && !isError && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {disponiveis.map((app) => (
            <AppCard
              key={app.slug}
              app={app}
              saving={savingSlug === app.slug}
              onToggle={() => handleToggle(app)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingOff !== null}
        onClose={() => setPendingOff(null)}
        onConfirm={() => {
          if (pendingOff) aplicar(pendingOff.slug, false)
          setPendingOff(null)
        }}
        title={`Desativar ${pendingOff?.nome ?? ''}?`}
        description="O app vai sumir do menu e ficar inacessível para todos os usuários desta instalação. Nenhum dado é apagado — você pode reativar a qualquer momento."
        confirmLabel="Desativar app"
      />
    </div>
  )
}

function AppCard({
  app,
  saving,
  onToggle,
}: {
  app: AppModule
  saving: boolean
  onToggle: () => void
}) {
  const Icon = (app.icone && ICONS[app.icone]) || Blocks

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <div className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
        app.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-foreground">{app.nome}</h3>
          {app.enabled ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Ativo
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Desativado
            </span>
          )}
        </div>
        {app.descricao && (
          <p className="mt-0.5 text-sm text-muted-foreground">{app.descricao}</p>
        )}
      </div>

      <ToggleSwitch
        checked={app.enabled}
        disabled={saving}
        onChange={onToggle}
        label={`${app.enabled ? 'Desativar' : 'Ativar'} ${app.nome}`}
      />
    </li>
  )
}

/** Toggle acessível simples (o projeto não tem Switch no kit de UI). */
function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
