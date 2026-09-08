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
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <Video className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Reuniões</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Videochamadas de toda a equipe — admin vê tudo.'
              : 'Suas videochamadas com gravação automática e resumo por IA.'}
          </p>
        </div>
        <button
          onClick={() => setNewMeetingOpen(true)}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all cursor-pointer',
            'bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg',
          )}
        >
          <Plus className="h-4 w-4" />
          Nova reunião
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto opacity-60 hover:opacity-100 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit">
        {([
          { id: 'all', label: 'Todas', count: stats.total },
          { id: 'live', label: 'Ao vivo', count: stats.live },
          { id: 'scheduled', label: 'Agendadas', count: stats.scheduled },
          { id: 'completed', label: 'Concluídas', count: stats.completed },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
              filter === tab.id
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            <span className={cn(
              'rounded-full px-1.5 text-[10px] font-semibold',
              filter === tab.id ? 'bg-accent/20 text-accent' : 'bg-muted-foreground/10',
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Meetings list */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl border border-border bg-muted/30 animate-pulse" />
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

      <NewMeetingDialog
        open={newMeetingOpen}
        onClose={() => setNewMeetingOpen(false)}
        onCreated={loadMeetings}
      />

      {/* Helper panel */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-accent/5 to-primary/5 p-5 text-xs space-y-2">
        <p className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" /> Como testar
        </p>
        <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Clica em <strong className="text-foreground">"Nova reunião"</strong> — abre aba do host com câmera/mic</li>
          <li>Ativa o <strong className="text-foreground">blur de fundo</strong> com o botão de estrela na control bar</li>
          <li>Copia o link do convidado (🔗) e abre em outra aba anônima pra simular o cliente</li>
          <li>A gravação inicia automaticamente em segundos</li>
          <li>Encerra a sala → aparece botão <strong className="text-foreground">"Resumir com IA"</strong> nesta lista</li>
        </ol>
      </div>
      </div>
    </div>
  )
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, highlight = false,
}: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-2xl border p-4 transition-colors',
      highlight
        ? 'border-destructive/40 bg-destructive/5'
        : 'border-border bg-card',
    )}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span className={highlight ? 'text-destructive' : ''}>{icon}</span>
        <span className="uppercase tracking-wider font-medium">{label}</span>
        {highlight && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', highlight && 'text-destructive')}>
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
      'rounded-2xl border bg-card transition-all overflow-hidden',
      isLive ? 'border-destructive/40 shadow-lg' : 'border-border hover:border-accent/40',
    )}>
      <div className="p-4 flex items-start gap-4">
        {/* Icon/thumbnail */}
        <div className={cn(
          'h-12 w-12 shrink-0 rounded-xl flex items-center justify-center',
          isLive
            ? 'bg-destructive/10 text-destructive'
            : 'bg-primary-light text-accent',
        )}>
          {isLive ? <Radio className="h-5 w-5 animate-pulse" /> : <Video className="h-5 w-5" />}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-foreground truncate">{title}</h3>
            <StatusBadge meeting={meeting} />
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            {meeting.guest_name && (
              <span className="flex items-center gap-1 text-foreground font-medium">{meeting.guest_name}</span>
            )}
            {meeting.scheduled_at && meeting.status === 'scheduled' ? (
              <span className="flex items-center gap-1 text-primary">
                <Calendar className="h-3 w-3" />
                {new Date(meeting.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {meeting.scheduled_duration_min ? ` • ${meeting.scheduled_duration_min}min` : ''}
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {durationText}</span>
                <span>{new Date(meeting.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </>
            )}
            {typeof meeting.participants_count === 'number' && meeting.participants_count > 0 && (
              <span>{meeting.participants_count} participante{meeting.participants_count > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {meeting.recording_url && (
            <a
              href={meeting.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer"
              title="Ver gravação"
            >
              <Film className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Gravação</span>
            </a>
          )}
          <IconBtn onClick={onCopyLink} title="Compartilhar link" active={copied}>
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Share2 className="h-3.5 w-3.5" />}
          </IconBtn>
          <a
            href={getMeetUrl(meeting.livekit_room_name, { role: 'host' })}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
              'bg-primary text-primary-foreground hover:bg-primary-hover shadow-md',
            )}
            title="Entrar como host"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Entrar</span>
          </a>
          {isCompleted && (
            <IconBtn onClick={onToggleExpand} title={expanded ? 'Recolher' : 'Expandir'}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </IconBtn>
          )}
          <IconBtn onClick={onDelete} title="Excluir" danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && isCompleted && (
        <div className="border-t border-border bg-muted/30 p-4 space-y-3">
          {meeting.ai_summary ? (
            <>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider mb-1.5">
                  <Sparkles className="h-3 w-3" />
                  Resumo IA
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
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border bg-background" />
                        <div className="flex-1">
                          <span className="text-foreground">{a.task}</span>
                          {a.owner && <span className="ml-2 text-xs rounded-full bg-accent/10 text-accent px-2 py-0.5">{a.owner}</span>}
                          {a.due && <span className="ml-1.5 text-xs text-muted-foreground">• {a.due}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meeting.ai_generated_at && (
                <p className="text-[10px] text-muted-foreground">
                  Gerado em {new Date(meeting.ai_generated_at).toLocaleString('pt-BR')}
                </p>
              )}
              <TranscriptSection turns={meeting.transcriptions} />
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Gere automaticamente um resumo e lista de próximas ações com IA.
              </div>
              <button
                onClick={onGenerateAi}
                disabled={aiPending}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0',
                  'bg-primary text-primary-foreground hover:bg-primary-hover shadow-md',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiPending ? 'Gerando...' : 'Resumir com IA'}
              </button>
            </div>
          )}
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
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-accent transition-colors cursor-pointer"
      >
        <FileText className="h-3.5 w-3.5" />
        Transcrição ({turns.length} falas)
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-3 space-y-2">
            {turns.map((t, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold text-accent">{t.speaker}:</span>{' '}
                <span className="text-foreground">{t.text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={copyAll}
            className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer underline"
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

  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
        Ao vivo
      </span>
    )
  }
  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        <CheckCircle2 className="h-3 w-3" />
        Concluída
      </span>
    )
  }
  if (isScheduled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        <Calendar className="h-3 w-3" />
        Agendada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
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
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg border transition-all cursor-pointer',
        danger
          ? 'border-transparent text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
          : active
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border text-muted-foreground hover:border-accent/40 hover:bg-accent/5 hover:text-foreground',
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

  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
      <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center">
        <Video className="h-6 w-6 text-accent" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">{msg}</h3>
      <p className="text-sm text-muted-foreground mb-5">
        Crie uma nova reunião e compartilhe o link com quem quiser.
      </p>
      {filter === 'all' && (
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Criar primeira reunião
        </button>
      )}
    </div>
  )
}
