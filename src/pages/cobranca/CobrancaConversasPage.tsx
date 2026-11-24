import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useInstances } from '@/hooks/useChat'
import { useMyInstanceIds, useMyProfile } from '@/hooks/useUsers'
import { useIsAppEnabled } from '@/hooks/useAppModules'

/** O histórico financeiro usa as conversas reais do OMNX Chat. */
export function CobrancaConversasPage() {
  const profile = useMyProfile()
  const access = useMyInstanceIds()
  // Até confirmar permissões, uma lista vazia impede a consulta de todas as instâncias.
  const instances = useInstances(access.data === undefined ? [] : access.data)
  const { isAppEnabled } = useIsAppEnabled()
  const financeiro = (instances.data ?? []).filter(instance => instance.categoria === 'financeiro')
  const error = profile.isError || access.isError || instances.isError
  const loading = profile.isPending || access.isPending || instances.isPending

  return (
    <div className="space-y-4">
      <PageHeader title="Conversas financeiras" description="Consulte o histórico e responda aos contatos em Conversas." />
      {!isAppEnabled('chat') ? (
        <div role="status" className="rounded-xl border border-border p-5">
          O módulo Conversas está desligado nesta empresa. Solicite a ativação ao administrador para acessar as conversas.
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-danger/30 p-5 space-y-3">
          <p>Não foi possível verificar seus números do financeiro.</p>
          <button type="button" className="text-primary underline" onClick={() => { void profile.refetch(); void access.refetch(); void instances.refetch() }}>Tentar novamente</button>
        </div>
      ) : loading ? (
        <p role="status" className="text-muted-foreground">Carregando números do financeiro…</p>
      ) : financeiro.length === 0 ? (
        <div role="status" className="rounded-xl border border-border p-5 space-y-2">
          <p>Nenhum número do financeiro disponível para seu acesso.</p>
          <p className="text-sm text-muted-foreground">Peça ao administrador um número com a categoria Financeiro e acesso para sua equipe.</p>
          <Link to="/conversas/configurar?aba=instancias" className="inline-block text-primary underline">Ver números de WhatsApp</Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {financeiro.map(instance => (
            <Link key={instance.id} to={`/conversas?instancia=${encodeURIComponent(instance.id)}`} className="rounded-xl border border-border p-5 hover:bg-muted/40 flex gap-3 items-center">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div><p className="font-medium">{instance.nome}</p><p className="text-sm text-muted-foreground">{instance.numero_whatsapp || 'Abrir em Conversas'}</p></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
