import { useNavigate } from 'react-router-dom'
import { GraduationCap, BookOpen } from 'lucide-react'
import { useTrilhas, useMyProgress } from '@/hooks/useTrilhas'
import type { LearningPath } from '@/hooks/useTrilhas'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

// ─── Progress helpers ─────────────────────────────────────────────────────────

function usePathProgress(path: LearningPath, progressMap: Set<string>) {
  const modules = (path as unknown as { learning_modules?: Array<{ learning_lessons?: Array<{ id: string }> }> }).learning_modules
  if (!modules) return { completed: 0, total: 0, pct: 0 }

  let total = 0
  let completed = 0
  for (const mod of modules) {
    for (const lesson of mod.learning_lessons ?? []) {
      total++
      if (progressMap.has(lesson.id)) completed++
    }
  }
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return { completed, total, pct }
}

// ─── Path Card ────────────────────────────────────────────────────────────────

interface PathCardProps {
  path: LearningPath
  progressMap: Set<string>
  onAccess: () => void
}

function PathCard({ path, progressMap, onAccess }: PathCardProps) {
  const { pct } = usePathProgress(path, progressMap)

  const gradients = [
    'from-primary/30 to-accent/20',
    'from-accent/30 to-primary/20',
    'from-warning/30 to-primary/20',
    'from-info/30 to-accent/20',
  ]
  const gradientIdx = path.titulo.charCodeAt(0) % gradients.length

  return (
    <div className="glass-card entity-card-hover flex flex-col overflow-hidden">
      {/* Thumbnail */}
      {path.thumbnail_url ? (
        <img
          src={path.thumbnail_url}
          alt={path.titulo}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className={`h-36 w-full bg-gradient-to-br ${gradients[gradientIdx]} flex items-center justify-center`}>
          <GraduationCap className="h-12 w-12 text-primary/60" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4 gap-3">
        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {path.titulo}
        </h3>

        {/* Description */}
        {path.descricao && (
          <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
            {path.descricao}
          </p>
        )}

        {/* Progress bar */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">Seu progresso</span>
            <span className="text-2xs font-medium text-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Action */}
        <button
          onClick={onAccess}
          className="mt-1 w-full rounded-lg border border-primary/30 bg-primary/5 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
        >
          Acessar trilha
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PortalTrilhasPage() {
  const navigate = useNavigate()

  const { data: paths, isLoading } = useTrilhas('cliente')
  const { data: progressList } = useMyProgress()

  const progressMap = new Set(
    (progressList ?? []).filter(p => p.concluido).map(p => p.lesson_id),
  )

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <PageHeader
        title="Trilhas de Aprendizado"
        description="Conteúdos exclusivos preparados para você"
      />

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card h-64 shimmer" />
          ))}
        </div>
      ) : !paths || paths.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhuma trilha disponível"
          description="Ainda não há trilhas publicadas para você. Volte em breve!"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paths.map((path, i) => (
            <div key={path.id} className="stagger-enter" style={{ animationDelay: `${i * 40}ms` }}>
              <PathCard
                path={path}
                progressMap={progressMap}
                onAccess={() => navigate(`/portal/trilhas/${path.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
