import { useState } from 'react'
import { Video, Calendar, Zap, Users, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { generateRoomName, getMeetUrl } from '@/lib/livekit'

interface NewMeetingDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

type Mode = 'now' | 'schedule'

export function NewMeetingDialog({ open, onClose, onCreated }: NewMeetingDialogProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<Mode>('now')
  const [title, setTitle] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000)
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [duration, setDuration] = useState(30)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setMode('now')
    setTitle('')
    setGuestName('')
    setGuestPhone('')
    setDuration(30)
    setError(null)
  }

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const roomName = generateRoomName()
      const hostName = user?.nome || undefined
      const hostUrl = getMeetUrl(roomName, { role: 'host', name: hostName })
      const guestUrl = getMeetUrl(roomName, { role: 'guest', name: guestName || undefined })

      const finalTitle = title.trim() || (mode === 'now'
        ? `Reunião — ${new Date().toLocaleString('pt-BR')}`
        : `Reunião agendada — ${new Date(scheduledAt).toLocaleString('pt-BR')}`)

      const { error: insertErr } = await supabase.from('meetings').insert({
        title: finalTitle,
        meeting_type: mode === 'schedule' ? 'scheduled' : 'sales_call',
        status: 'scheduled',
        livekit_room_name: roomName,
        meeting_link: guestUrl,
        recording_status: 'pending',
        created_by: user?.id || null,
        scheduled_at: mode === 'schedule' ? new Date(scheduledAt).toISOString() : null,
        scheduled_duration_min: mode === 'schedule' ? duration : null,
        guest_name: guestName.trim() || null,
        guest_phone: guestPhone.trim() || null,
      } as never)

      if (insertErr) throw insertErr

      onCreated?.()
      reset()
      onClose()

      if (mode === 'now') {
        window.open(hostUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar reunião')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Nova reunião" size="md">
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2">
          <ModeOption
            active={mode === 'now'}
            icon={<Zap className="h-5 w-5" />}
            title="Iniciar agora"
            desc="Cria a sala e entra na hora"
            onClick={() => setMode('now')}
          />
          <ModeOption
            active={mode === 'schedule'}
            icon={<Calendar className="h-5 w-5" />}
            title="Agendar"
            desc="Escolhe data e hora"
            onClick={() => setMode('schedule')}
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Título <span className="text-muted-foreground/60">(opcional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === 'now' ? 'Reunião rápida' : 'Apresentação de proposta'}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Schedule fields */}
        {mode === 'schedule' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Data e hora
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Duração
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hora</option>
                <option value={90}>1h 30min</option>
                <option value={120}>2 horas</option>
              </select>
            </div>
          </div>
        )}

        {/* Participant */}
        <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Users className="h-3.5 w-3.5" />
            Convidado (opcional)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Nome"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="WhatsApp (opcional)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-full bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={() => { reset(); onClose() }}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all cursor-pointer',
              'bg-primary text-primary-foreground hover:bg-primary-hover shadow-md',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {creating ? 'Criando...' : mode === 'now' ? 'Criar e entrar' : 'Agendar reunião'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ModeOption({
  active, icon, title, desc, onClick,
}: { active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all cursor-pointer',
        active
          ? 'border-accent bg-accent/5'
          : 'border-border bg-background hover:border-accent/40',
      )}
    >
      <span className={cn('p-1.5 rounded-lg', active ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground')}>
        {icon}
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </button>
  )
}
