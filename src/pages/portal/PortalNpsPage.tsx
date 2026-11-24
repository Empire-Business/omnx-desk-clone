import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Heart, Star } from 'lucide-react'
import { useNpsSurvey, useNpsResponses, useSubmitResponse } from '@/hooks/useNps'
import { cn } from '@/lib/utils'
import { BRAND } from '@/config/brand'

// ─── Confetti ────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  'bg-primary',
  'bg-success',
  'bg-warning',
  'bg-danger',
  'bg-info',
  'bg-accent',
]

const CONFETTI_COUNT = 30

interface ConfettiPiece {
  id: number
  color: string
  left: number
  delay: number
  duration: number
  size: number
}

function generateConfetti(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 1.5 + Math.random() * 1,
    size: 6 + Math.round(Math.random() * 6),
  }))
}

function Confetti() {
  const [pieces] = useState<ConfettiPiece[]>(generateConfetti)

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map(piece => (
        <span
          key={piece.id}
          className={cn('absolute top-0 rounded-sm opacity-0', piece.color)}
          style={{
            left: `${piece.left}%`,
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            animation: `confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ─── Thank you screen ─────────────────────────────────────────────────────────

interface ThankYouProps {
  nota: number
  isJustSubmitted?: boolean
}

function ThankYou({ nota, isJustSubmitted = false }: ThankYouProps) {
  return (
    <>
      {isJustSubmitted && <Confetti />}
      <div className="flex min-h-screen items-center justify-center bg-background p-3 sm:p-4 lg:p-6">
        <div className="glass-card w-full max-w-sm p-6 sm:p-8 lg:p-10 text-center space-y-4 sm:space-y-6 animate-fade-in-up">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <Heart className="h-10 w-10 text-success fill-success" />
            </span>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Obrigado pelo seu feedback!
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua opinião é muito importante para nós.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">Sua avaliação:</span>
            <span className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold',
              nota <= 6 ? 'bg-danger/10 text-danger' :
              nota <= 8 ? 'bg-warning/10 text-warning' :
              'bg-success/10 text-success'
            )}>
              {nota}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Empire Zap — Resultados que transformam
          </p>
        </div>
      </div>
    </>
  )
}

// ─── NPS Score buttons ────────────────────────────────────────────────────────

interface ScoreButtonsProps {
  selected: number | null
  onSelect: (score: number) => void
}

function ScoreButtons({ selected, onSelect }: ScoreButtonsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: 11 }, (_, i) => i).map(score => {
          const isSelected = selected === score
          return (
            <button
              key={score}
              type="button"
              onClick={() => onSelect(score)}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition-all duration-150',
                'border-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                isSelected
                  ? 'gradient-primary border-transparent text-primary-foreground scale-110 shadow-lg'
                  : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary-muted hover:scale-105'
              )}
              aria-label={`Nota ${score}`}
              aria-pressed={isSelected}
            >
              {score}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between px-1 text-xs text-muted-foreground">
        <span>Nada provável</span>
        <span>Muito provável</span>
      </div>
    </div>
  )
}

// ─── Survey form ──────────────────────────────────────────────────────────────

interface SurveyFormProps {
  surveyId: string
  onSubmitted: (nota: number) => void
}

function SurveyForm({ surveyId, onSubmitted }: SurveyFormProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const submitResponse = useSubmitResponse()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected === null) return
    await submitResponse.mutateAsync({
      survey_id: surveyId,
      nota: selected,
      comentario: comentario.trim() || undefined,
    })
    onSubmitted(selected)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2 text-center">
        <div className="flex justify-center">
          <Star className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground leading-snug">
          De 0 a 10, o quanto você recomendaria a{' '}
          <span className="text-primary">Empire Zap</span> para um amigo ou colega?
        </h1>
      </div>

      <ScoreButtons selected={selected} onSelect={setSelected} />

      <div className="space-y-1.5">
        <label htmlFor="comentario" className="text-sm font-medium text-foreground">
          Deixe um comentário <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="comentario"
          value={comentario}
          onChange={e => setComentario(e.target.value)}
          rows={3}
          placeholder="Conte-nos mais sobre sua experiência..."
          className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={selected === null || submitResponse.isPending}
        className="gradient-primary w-full rounded-lg py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitResponse.isPending ? 'Enviando...' : 'Enviar avaliação'}
      </button>

      {submitResponse.isError && (
        <p className="text-center text-sm text-danger">
          Ocorreu um erro. Por favor, tente novamente.
        </p>
      )}
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PortalNpsPage() {
  const { surveyId } = useParams<{ surveyId: string }>()
  const [submittedNota, setSubmittedNota] = useState<number | null>(null)

  const { data: survey, isLoading: loadingSurvey, isError: surveyError } = useNpsSurvey(surveyId ?? '')
  const { data: responses, isLoading: loadingResponses } = useNpsResponses(surveyId ?? '')

  const isLoading = loadingSurvey || loadingResponses

  // If user just submitted, show thank you with confetti
  useEffect(() => {
    if (submittedNota !== null) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [submittedNota])

  if (!surveyId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-3 sm:p-4 lg:p-6">
        <div className="glass-card max-w-sm p-6 sm:p-8 lg:p-10 text-center space-y-3 animate-fade-in">
          <p className="text-lg font-semibold text-foreground">Link inválido</p>
          <p className="text-sm text-muted-foreground">Esta pesquisa não foi encontrada.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-3 sm:p-4 lg:p-6">
        <div className="glass-card w-full max-w-md p-6 sm:p-8 lg:p-10 space-y-4 sm:space-y-6">
          <div className="h-8 w-48 mx-auto rounded bg-muted shimmer" />
          <div className="space-y-3">
            <div className="flex justify-center gap-2 flex-wrap">
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} className="h-11 w-11 rounded-full bg-muted shimmer" />
              ))}
            </div>
          </div>
          <div className="h-24 rounded-lg bg-muted shimmer" />
          <div className="h-12 rounded-lg bg-muted shimmer" />
        </div>
      </div>
    )
  }

  if (surveyError || !survey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-3 sm:p-4 lg:p-6">
        <div className="glass-card max-w-sm p-6 sm:p-8 lg:p-10 text-center space-y-3 animate-fade-in">
          <p className="text-lg font-semibold text-foreground">Pesquisa não encontrada</p>
          <p className="text-sm text-muted-foreground">
            Este link pode ter expirado ou ser inválido.
          </p>
        </div>
      </div>
    )
  }

  // Already responded (from DB or just submitted)
  const existingResponse = responses?.[0]

  if (submittedNota !== null) {
    return <ThankYou nota={submittedNota} isJustSubmitted />
  }

  if (survey.respondido_em && existingResponse) {
    return <ThankYou nota={existingResponse.nota} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background gradient-bg p-3 sm:p-4 lg:p-6">
      <div className="glass-card w-full max-w-md p-4 sm:p-6 lg:p-8 animate-fade-in-up">
        {survey.clients && (
          <p className="mb-6 text-center text-xs text-muted-foreground">
            Pesquisa de satisfação para{' '}
            <span className="font-medium text-foreground">{survey.clients.nome}</span>
          </p>
        )}

        <SurveyForm
          surveyId={survey.id}
          onSubmitted={nota => setSubmittedNota(nota)}
        />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by <span className="font-medium text-primary">{BRAND.appName}</span>
        </p>
      </div>
    </div>
  )
}
