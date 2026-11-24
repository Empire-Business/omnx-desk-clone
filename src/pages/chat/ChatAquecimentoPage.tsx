import { useEffect, useState } from 'react'
import { Flame, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useInstances } from '@/hooks/useChat'
import {
  useWarmupGroups,
  useUpdateWarmupGroup,
  useWarmupLogs,
  useWarmupCountToday,
  type WarmupGroup,
} from '@/hooks/useWarmup'

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function GroupCard({ group }: { group: WarmupGroup }) {
  const update = useUpdateWarmupGroup()
  const { data: logs = [] } = useWarmupLogs(group.id)
  const { data: countToday = 0 } = useWarmupCountToday(group.id)
  const { data: instances = [] } = useInstances()

  const [form, setForm] = useState({
    intervalo_min_seg: group.intervalo_min_seg,
    intervalo_max_seg: group.intervalo_max_seg,
    horario_inicio: group.horario_inicio.substring(0, 5),
    horario_fim: group.horario_fim.substring(0, 5),
    instance_ids: group.instance_ids,
    frases: group.frases.join('\n'),
    usar_ia: group.usar_ia,
    tema: group.tema,
    personalidades: group.personalidades ?? {},
  })

  useEffect(() => {
    setForm({
      intervalo_min_seg: group.intervalo_min_seg,
      intervalo_max_seg: group.intervalo_max_seg,
      horario_inicio: group.horario_inicio.substring(0, 5),
      horario_fim: group.horario_fim.substring(0, 5),
      instance_ids: group.instance_ids,
      frases: group.frases.join('\n'),
      usar_ia: group.usar_ia,
      tema: group.tema,
      personalidades: group.personalidades ?? {},
    })
  }, [group.id])

  function toggleAtivo() {
    update.mutate({ id: group.id, ativo: !group.ativo })
  }

  function toggleInstance(instanceId: string) {
    setForm((f) => ({
      ...f,
      instance_ids: f.instance_ids.includes(instanceId)
        ? f.instance_ids.filter((i) => i !== instanceId)
        : [...f.instance_ids, instanceId],
    }))
  }

  function handleSave() {
    const frasesArr = form.frases
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    update.mutate({
      id: group.id,
      intervalo_min_seg: Math.max(60, form.intervalo_min_seg),
      intervalo_max_seg: Math.max(form.intervalo_min_seg + 60, form.intervalo_max_seg),
      horario_inicio: form.horario_inicio,
      horario_fim: form.horario_fim,
      instance_ids: form.instance_ids,
      frases: frasesArr,
      usar_ia: form.usar_ia,
      tema: form.tema,
      personalidades: form.personalidades,
    })
  }

  const minMin = Math.round(form.intervalo_min_seg / 60)
  const maxMin = Math.round(form.intervalo_max_seg / 60)

  return (
    <div className="rounded-xl bg-card ring-hairline p-4 sm:p-5 space-y-5 animate-row-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground flex items-center gap-2">
            <Flame className={cn('h-4 w-4', group.ativo ? 'text-warning' : 'text-muted-foreground')} />
            {group.nome}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
            {group.wa_chatid}
          </p>
        </div>
        <button
          onClick={toggleAtivo}
          role="switch"
          aria-checked={group.ativo}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
            group.ativo ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition duration-200',
              group.ativo ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
        <div className="rounded-lg bg-bg-1 ring-hairline p-2.5 sm:p-3">
          <p className="mono text-xl sm:text-2xl font-semibold text-foreground">{countToday}</p>
          <p className="text-xs text-muted-foreground">Hoje</p>
        </div>
        <div className="rounded-lg bg-bg-1 ring-hairline p-2.5 sm:p-3">
          <p className="mono text-xl sm:text-2xl font-semibold text-foreground">{group.instance_ids.length}</p>
          <p className="text-xs text-muted-foreground">Chips</p>
        </div>
        <div className="rounded-lg bg-bg-1 ring-hairline p-2.5 sm:p-3">
          <p className="mono text-xl sm:text-2xl font-semibold text-foreground">{group.frases.length}</p>
          <p className="text-xs text-muted-foreground">Frases</p>
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Última: {formatDateTime(group.ultima_mensagem_em)}</p>
        <p>Próxima: {formatDateTime(group.proxima_mensagem_em)}</p>
      </div>

      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-bg-1 ring-hairline px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Usar IA pra gerar mensagens
            </p>
            <p className="text-xs text-muted-foreground">
              Mensagens dinâmicas com personalidade. Cai pra frases fixas se a IA falhar.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.usar_ia}
            onClick={() => setForm((f) => ({ ...f, usar_ia: !f.usar_ia }))}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              form.usar_ia ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition duration-200',
                form.usar_ia ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {form.usar_ia && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Tema das conversas
            </label>
            <input
              value={form.tema}
              onChange={(e) => setForm((f) => ({ ...f, tema: e.target.value }))}
              placeholder="Ex: futebol brasileiro, principalmente Vasco da Gama"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm max-sm:min-h-11 focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--primary-glow)]"
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Chips participantes
          </label>
          <div className="flex flex-wrap gap-2">
            {instances.map((inst) => {
              const selected = form.instance_ids.includes(inst.instance_id)
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => toggleInstance(inst.instance_id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-input bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {inst.nome}
                </button>
              )
            })}
          </div>
        </div>

        {form.usar_ia && form.instance_ids.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Personalidade de cada chip
            </label>
            {form.instance_ids.map((iid) => (
              <div key={iid} className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground">{iid}</p>
                <input
                  value={form.personalidades[iid] ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      personalidades: { ...f.personalidades, [iid]: e.target.value },
                    }))
                  }
                  placeholder="Ex: vascaíno apaixonado, usa emojis, gosta de discutir táticas"
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm max-sm:min-h-11 focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--primary-glow)]"
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Intervalo mín (min): {minMin}
            </label>
            <input
              type="range"
              min={1}
              max={60}
              value={minMin}
              onChange={(e) =>
                setForm((f) => ({ ...f, intervalo_min_seg: Number(e.target.value) * 60 }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Intervalo máx (min): {maxMin}
            </label>
            <input
              type="range"
              min={2}
              max={120}
              value={maxMin}
              onChange={(e) =>
                setForm((f) => ({ ...f, intervalo_max_seg: Number(e.target.value) * 60 }))
              }
              className="w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Início</label>
            <input
              type="time"
              value={form.horario_inicio}
              onChange={(e) => setForm((f) => ({ ...f, horario_inicio: e.target.value }))}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm max-sm:min-h-11 focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--primary-glow)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Fim</label>
            <input
              type="time"
              value={form.horario_fim}
              onChange={(e) => setForm((f) => ({ ...f, horario_fim: e.target.value }))}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm max-sm:min-h-11 focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--primary-glow)]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Frases (uma por linha)
          </label>
          <textarea
            value={form.frases}
            onChange={(e) => setForm((f) => ({ ...f, frases: e.target.value }))}
            rows={8}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm max-sm:min-h-11 focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_var(--primary-glow)] font-mono"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity"
          >
            {update.isPending ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      <div className="pt-3 border-t border-border">
        <p className="mb-2 text-sm font-medium text-foreground">Últimos envios</p>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum envio ainda.</p>
        ) : (
          <ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start gap-2 text-xs">
                {log.sucesso ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success mt-0.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-danger mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate">{log.mensagem}</p>
                  <p className="text-muted-foreground">
                    {log.instance_id} · {formatDateTime(log.enviado_em)}
                  </p>
                  {!log.sucesso && log.uazapi_response && (
                    <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-danger-light/50 p-1.5 font-mono text-[11px] text-danger">
                      {JSON.stringify(log.uazapi_response, null, 2).substring(0, 300)}
                    </pre>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function ChatAquecimentoPage() {
  const { data: groups = [], isLoading } = useWarmupGroups()

  return (
    <PageContainer respiro largura="larga">
      <PageHeader
        title="Aquecimento de número"
        count={groups.length || undefined}
        description="Números da empresa conversam entre si num grupo para esquentar números novos e reduzir o risco de bloqueio."
      />

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando grupos">
          {[0, 1].map((i) => (
            <div key={i} className="grid gap-4 rounded-xl bg-card ring-hairline p-5">
              <div className="sk h-4 w-40" />
              <div className="grid grid-cols-3 gap-2"><div className="sk h-16 rounded-lg" /><div className="sk h-16 rounded-lg" /><div className="sk h-16 rounded-lg" /></div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="Nenhum grupo de aquecimento"
          description="Ainda não há grupo de aquecimento. Peça para a equipe técnica criar um."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
