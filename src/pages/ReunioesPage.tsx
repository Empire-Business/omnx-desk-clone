import { useEffect, useMemo, useState } from 'react'
import {
  Video, Plus, Share2, ExternalLink, Trash2, Radio, Clock,
  Sparkles, Check, AlertCircle, Film, CheckCircle2, Loader2, CalendarClock,
  ChevronDown, ChevronUp, X, Star, Calendar, FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { getMeetUrl } from '@/lib/livekit'
import { NewMeetingDialog } from '@/components/chat/NewMeetingDialog'
import { useAuth } from '@/contexts/AuthContext'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { EmptyState as EstadoVazio } from '@/components/ui/EmptyState'
import { RECURSOS } from '@/config/recursos'

// Sala de vídeo (LiveKit) e resumo por IA dependem de funções que só existem quando
// configuradas (src/config/recursos.ts). Desligadas, a lista de reuniões continua.
const VIDEO = RECURSOS.reuniaoVideo
const RESUMO_IA = RECURSOS.reuniaoResumoIa

interface ActionItem {
  task: string
  owner?: string | null
  due?: string | null
}

interface MeetingRow {
  id: string
  title: string | null
  livekit_room_name: string
  meeting_link: string | null
  recording_url: string | null
  recording_status: string | null
  status: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  duration_seconds: number | null
  participants_count: number | null
  scheduled_at: string | null
  scheduled_duration_min: number | null
  guest_name: string | null
  guest_phone: string | null
  ai_title: string | null
  ai_summary: string | null
  ai_action_items: ActionItem[] | null
  ai_generated_at: string | null
  transcriptions: TranscriptTurn[] | null
}

interface TranscriptTurn {
  speaker: string
  text: string
  timestamp: number
}

interface FeedbackRow {
  rating: number | null
  comment: string | null
  livekit_room_name: string
  created_at: string
}

type FilterTab = 'all' | 'live' | 'scheduled' | 'completed'

export default function ReunioesPage() {
  const { user } = useAuth()
  const isAdmin = user?.perfil === 'admin'
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [aiPendingId, setAiPendingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newMeetingOpen, setNewMeetingOpen] = useState(false)

  async function loadMeetings(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true)
    if (!user?.id) {
      setLoading(false)
      return
    }
    let meetQuery = supabase
      .from('meetings')
      .select('id, title, livekit_room_name, meeting_link, recording_url, recording_status, status, started_at, ended_at, created_at, duration_seconds, participants_count, scheduled_at, scheduled_duration_min, guest_name, guest_phone, ai_title, ai_summary, ai_action_items, ai_generated_at, transcriptions, created_by')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!isAdmin) meetQuery = meetQuery.eq('created_by', user.id)
    const [meetRes, feedRes] = await Promise.all([
      meetQuery,
      supabase
        .from('meeting_feedback')
        .select('rating, comment, livekit_room_name, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (meetRes.error) setError(meetRes.error.message)
    else {
      const newData = (meetRes.data as unknown as MeetingRow[]) || []
      setMeetings((prev) => {
        if (prev.length === newData.length && JSON.stringify(prev) === JSON.stringify(newData)) return prev
        return newData
      })
    }
    if (!feedRes.error) setFeedbacks((feedRes.data as unknown as FeedbackRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    loadMeetings()
    const interval = setInterval(() => loadMeetings({ silent: true }), 15000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin])

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta reunião do histórico? A gravação permanecerá no R2.')) return
    const { error: err } = await supabase.from('meetings').delete().eq('id', id)
    if (err) setError(err.message)
    else loadMeetings()
  }

  async function copyLink(m: MeetingRow) {
    const url = getMeetUrl(m.livekit_room_name, { role: 'guest' })
    await navigator.clipboard.writeText(url)
    setCopiedId(m.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function generateAiSummary(id: string) {
    if (!RESUMO_IA) return
    setAiPendingId(id)
    try {
      const { error: err } = await supabase.functions.invoke('meeting-ai-summary', {
        body: { meeting_id: id },
      })
      if (err) throw err
      await loadMeetings()
      setExpandedId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar resumo IA')
    } finally {
      setAiPendingId(null)
    }
  }

  const stats = useMemo(() => {
    const total = meetings.length
    const live = meetings.filter(m => m.status === 'active' || m.recording_status === 'recording').length
    const scheduled = meetings.filter(m => m.scheduled_at && m.status === 'scheduled').length
    const completed = meetings.filter(m => m.status === 'completed').length
    const recorded = meetings.filter(m => m.recording_url).length
    const totalSeconds = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0)
    const totalHours = (totalSeconds / 3600).toFixed(1)
    const rated = feedbacks.filter(f => f.rating !== null)
    const avgRating = rated.length > 0 ? rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length : 0
    return { total, live, scheduled, completed, recorded, totalHours, avgRating, feedbackCount: rated.length }
  }, [meetings, feedbacks])

  const filtered = useMemo(() => {
    if (filter === 'live') return meetings.filter(m => m.status === 'active' || m.recording_status === 'recording')
    if (filter === 'scheduled') return meetings.filter(m => m.scheduled_at && m.status === 'scheduled')
    if (filter === 'completed') return meetings.filter(m => m.status === 'completed')
    return meetings
  }, [meetings, filter])

  return (
    <PageContainer respiro>
      {/* Header */}
      <PageHeader
        title="Reuniões"
        count={stats.total}
        description={!VIDEO
          ? 'Reuniões marcadas com os clientes.'
          : isAdmin
            ? 'Videochamadas de toda a equipe — como administrador, você vê todas.'
            : RESUMO_IA
              ? 'Suas videochamadas, com gravação automática e resumo por IA.'
              : 'Suas videochamadas, com gravação automática.'}
        action={VIDEO ? (
          <button type="button" onClick={() => setNewMeetingOpen(true)} className="btn btn-primary">
            <Plus aria-hidden />
            Nova reunião
          </button>
        ) : undefined}
      />

      <div className="grid gap-4 sm:gap-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Total" value={stats.total.toString()} />
        <StatCard
          icon={<Radio className="h-4 w-4" />}
          label="Ao vivo"
          value={stats.live.toString()}
          highlight={stats.live > 0}
        />
        <StatCard icon={<Calendar className="h-4 w-4" />} label="Agendadas" value={stats.scheduled.toString()} />
        <StatCard icon={<Film className="h-4 w-4" />} label="Horas gravadas" value={`${stats.totalHours}h`} />
        <StatCard
          icon={<Star className="h-4 w-4" />}
          label={stats.feedbackCount > 0 ? `CSAT (${stats.feedbackCount})` : 'CSAT'}
          value={stats.feedbackCount > 0 ? `${stats.avgRating.toFixed(1)}★` : '—'}
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-light p-3 text-sm text-danger flex items-start gap-2 animate-band-in">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="btn btn-ghost btn-icon btn-sm -my-1 shrink-0 text-danger"
            aria-label="Fechar aviso"
          >
            <X aria-hidden />
          </button>
        </div>
      )}

      {/* Filter tabs — rolam de lado no celular (auditoria 03: w-fit estourava 375 px) */}
      <AbasRolaveis
        rotulo="Filtrar reuniões"
        itens={([
          { id: 'all', label: 'Todas', count: stats.total },
          { id: 'live', label: 'Ao vivo', count: stats.live },
          { id: 'scheduled', label: 'Agendadas', count: stats.scheduled },
          { id: 'completed', label: 'Concluídas', count: stats.completed },
        ] as const).map((tab) => ({
          id: tab.id,
          rotulo: tab.label,
          contador: tab.count,
          ativo: filter === tab.id,
          onClick: () => setFilter(tab.id),
        }))}
      />

      {/* Meetings list */}
      {loading ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Carregando reuniões">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl bg-card ring-hairline p-4">
              <div className="sk h-11 w-11 rounded-lg" />
              <div className="grid flex-1 gap-2"><div className="sk h-4 w-1/2" /><div className="sk h-3 w-1/3" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={() => setNewMeetingOpen(true)} filter={filter} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              expanded={expandedId === m.id}
              onToggleExpand={() => setExpandedId(expandedId === m.id ? null : m.id)}
              onDelete={() => handleDelete(m.id)}
              onCopyLink={() => copyLink(m)}
              onGenerateAi={() => generateAiSummary(m.id)}
              aiPending={aiPendingId === m.id}
              copied={copiedId === m.id}
            />
          ))}
        </div>
      )}

      {VIDEO && (
        <NewMeetingDialog
          open={newMeetingOpen}
          onClose={() => setNewMeetingOpen(false)}
          onCreated={loadMeetings}
        />
      )}

      {/* Helper panel */}
      {VIDEO && (
      <div className="rounded-xl bg-bg-1 ring-hairline p-4 sm:p-5 text-[13px] space-y-2">
        <p className="t-h5 m-0 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-link" aria-hidden /> Como testar
        </p>
        <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Clica em <strong className="text-foreground">"Nova reunião"</strong> — abre aba do host com câmera/mic</li>
          <li>Ativa o <strong className="text-foreground">blur de fundo</strong> com o botão de estrela na control bar</li>
          <li>Copia o link do convidado (🔗) e abre em outra aba anônima pra simular o cliente</li>
          <li>A gravação inicia automaticamente em segundos</li>
          {RESUMO_IA && (
            <li>Encerra a sala → aparece botão <strong className="text-foreground">"Resumir com IA"</strong> nesta lista</li>
          )}
        </ol>
      </div>
      )}
      </div>
    </PageContainer>
  )
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, highlight = false,
}: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'min-w-0 rounded-xl p-3 sm:p-4 transition-colors duration-base',
      highlight
        ? 'bg-danger-light shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--danger)_30%,transparent)]'
        : 'bg-card ring-hairline',
    )}>
      <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground mb-1">
        <span className={cn('shrink-0', highlight && 'text-danger')} aria-hidden>{icon}</span>
        <span className="truncate font-semibold">{label}</span>
        {highlight && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-danger animate-pulse" aria-hidden />}
      </div>
      <p className={cn('mono text-xl sm:text-2xl font-semibold', highlight && 'text-danger')}>
        {value}
      </p>
    </div>
  )
}

// ─── MeetingCard ─────────────────────────────────────────────────────────────

function MeetingCard({
  meeting, expanded, onToggleExpand, onDelete, onCopyLink, onGenerateAi, aiPending, copied,
}: {
  meeting: MeetingRow
  expanded: boolean
  onToggleExpand: () => void
  onDelete: () => void
  onCopyLink: () => void
  onGenerateAi: () => void
  aiPending: boolean
  copied: boolean
}) {
  const isLive = meeting.status === 'active' || meeting.recording_status === 'recording'
  const isCompleted = meeting.status === 'completed'
  const title = meeting.ai_title || meeting.title || meeting.livekit_room_name

  const durationText = meeting.duration_seconds
    ? `${Math.floor(meeting.duration_seconds / 60)}min ${meeting.duration_seconds % 60}s`
    : '—'

  return (
    <div className={cn(
      'rounded-xl bg-card transition-[box-shadow] duration-base overflow-hidden animate-row-in',
      isLive
        ? 'shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--danger)_45%,transparent)]'
        : 'ring-hairline hover:shadow-pop',
    )}>
      {/* No celular as ações descem para uma linha própria (não espremem o título) */}
      <div className="p-3 sm:p-4 flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-4">
        {/* Icon/thumbnail */}
        <div className={cn(
          'h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-lg flex items-center justify-center',
          isLive
            ? 'bg-danger-light text-danger'
            : 'bg-primary-light text-link',
        )} aria-hidden>
          {isLive ? <Radio className="h-5 w-5 animate-pulse" /> : <Video className="h-5 w-5" />}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 basis-[calc(100%-3.25rem)] sm:basis-auto">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="m-0 min-w-0 truncate text-[15px] font-[650] text-foreground">{title}</h3>
            <StatusBadge meeting={meeting} />
          </div>
          <div className="text-[12.5px] text-muted-foreground flex items-center gap-x-3 gap-y-1 flex-wrap">
            {meeting.guest_name && (
              <span className="flex items-center gap-1 text-foreground font-medium">{meeting.guest_name}</span>
            )}
            {meeting.scheduled_at && meeting.status === 'scheduled' ? (
              <span className="mono flex items-center gap-1 text-link">
                <Calendar className="h-3 w-3" aria-hidden />
                {new Date(meeting.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {meeting.scheduled_duration_min ? ` • ${meeting.scheduled_duration_min}min` : ''}
              </span>
            ) : (
              <>
                <span className="mono flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /> {durationText}</span>
                <span className="mono">{new Date(meeting.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </>
            )}
            {typeof meeting.participants_count === 'number' && meeting.participants_count > 0 && (
              <span>{meeting.participants_count} participante{meeting.participants_count > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex w-full items-center justify-end gap-1 sm:w-auto shrink-0">
          {meeting.recording_url && (
            <a
              href={meeting.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              title="Ver gravação"
            >
              <Film aria-hidden />
              <span>Gravação</span>
            </a>
          )}
          {VIDEO && (
            <IconBtn onClick={onCopyLink} title={copied ? 'Link copiado' : 'Copiar link do convidado'} active={copied}>
              {copied ? <Check className="text-success" aria-hidden /> : <Share2 aria-hidden />}
            </IconBtn>
          )}
          {isCompleted && (
            <IconBtn onClick={onToggleExpand} title={expanded ? 'Recolher' : 'Ver resumo'}>
              {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            </IconBtn>
          )}
          <IconBtn onClick={onDelete} title="Excluir" danger>
            <Trash2 aria-hidden />
          </IconBtn>
          {VIDEO && (
            <a
              href={getMeetUrl(meeting.livekit_room_name, { role: 'host' })}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
              title="Entrar como anfitrião"
            >
              <ExternalLink aria-hidden />
              <span>Entrar</span>
            </a>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && isCompleted && (
        <div className="border-t border-border bg-bg-0 p-3 sm:p-4 space-y-3 animate-band-in">
          {meeting.ai_summary ? (
            <>
              <div>
                <div className="t-h6 flex items-center gap-1.5 !text-iris-fg mb-1.5">
                  <span className="iris-mark sm" aria-hidden />
                  Resumo pela IA
                </div>
                <p className="text-sm text-foreground leading-relaxed">{meeting.ai_summary}</p>
              </div>
              {meeting.ai_action_items && meeting.ai_action_items.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Próximas ações
                  </div>
                  <ul className="space-y-1.5">
                    {meeting.ai_action_items.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-stroke-default bg-card" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <span className="text-foreground">{a.task}</span>
                          {a.owner && <span className="tag tag-info ml-2">{a.owner}</span>}
                          {a.due && <span className="ml-1.5 text-xs text-muted-foreground">• {a.due}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meeting.ai_generated_at && (
                <p className="text-[11px] text-muted-foreground">
                  Gerado em {new Date(meeting.ai_generated_at).toLocaleString('pt-BR')}
                </p>
              )}
              <TranscriptSection turns={meeting.transcriptions} />
            </>
          ) : RESUMO_IA ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                Gere automaticamente um resumo e a lista de próximas ações com IA.
              </div>
              <button
                type="button"
                onClick={onGenerateAi}
                disabled={aiPending}
                aria-busy={aiPending}
                className="btn btn-iris shrink-0"
              >
                {aiPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {aiPending ? 'Gerando…' : 'Resumir com IA'}
              </button>
            </div>
          ) : null}
          {!meeting.ai_summary && <TranscriptSection turns={meeting.transcriptions} />}
        </div>
      )}
    </div>
  )
}

function TranscriptSection({ turns }: { turns: TranscriptTurn[] | null }) {
  const [open, setOpen] = useState(false)
  if (!turns || turns.length === 0) return null

  async function copyAll() {
    const text = turns!.map((t) => `${t.speaker}: ${t.text}`).join('\n')
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="btn btn-ghost btn-sm -ml-2"
      >
        <FileText aria-hidden />
        Transcrição ({turns.length} falas)
        {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="max-h-[min(20rem,50dvh)] overflow-y-auto rounded-lg bg-card ring-hairline p-3 space-y-2">
            {turns.map((t, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold text-link">{t.speaker}:</span>{' '}
                <span className="text-foreground">{t.text}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={copyAll}
            className="min-h-8 text-[12px] text-link hover:underline underline-offset-2 cursor-pointer"
          >
            Copiar transcrição completa
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ meeting }: { meeting: MeetingRow }) {
  const isLive = meeting.status === 'active' || meeting.recording_status === 'recording'
  const isCompleted = meeting.status === 'completed'
  const isScheduled = meeting.scheduled_at && meeting.status === 'scheduled'

  // Selos de status do DS (`.st[data-s]`): cor + forma do marcador.
  if (isLive) {
    return (
      <span className="st st-sm" data-s="atrasado">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden />
        Ao vivo
      </span>
    )
  }
  if (isCompleted) {
    return (
      <span className="st st-sm" data-s="resolvido">
        <span className="st-g" aria-hidden />
        Concluída
      </span>
    )
  }
  if (isScheduled) {
    return (
      <span className="st st-sm" data-s="aberto">
        <Calendar className="h-3 w-3" aria-hidden />
        Agendada
      </span>
    )
  }
  return (
    <span className="st st-sm" data-s="aguardando">
      <span className="st-g" aria-hidden />
      Pendente
    </span>
  )
}

function IconBtn({
  children, onClick, title, active = false, danger = false,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'btn btn-ghost btn-icon btn-sm',
        danger && 'hover:!bg-danger-light hover:!text-danger',
        active && '!bg-success-light',
      )}
    >
      {children}
    </button>
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate, filter }: { onCreate: () => void; filter: FilterTab }) {
  const msg =
    filter === 'live' ? 'Nenhuma reunião ao vivo no momento.' :
    filter === 'scheduled' ? 'Nenhuma reunião agendada.' :
    filter === 'completed' ? 'Nenhuma reunião concluída ainda.' :
    'Nenhuma reunião registrada ainda.'

  // Estado vazio do DS, com a próxima ação.
  return (
    <EstadoVazio
      icon={Video}
      title={msg}
      description={VIDEO ? 'Crie uma nova reunião e compartilhe o link com quem quiser.' : 'As reuniões marcadas com os clientes aparecem aqui.'}
      action={filter === 'all' && VIDEO ? (
        <button type="button" onClick={onCreate} className="btn btn-primary">
          <Plus aria-hidden />
          Criar primeira reunião
        </button>
      ) : undefined}
    />
  )
}
