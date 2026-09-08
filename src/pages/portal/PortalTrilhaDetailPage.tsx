import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  PlayCircle,
  FileText,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  Circle,
  BookOpen,
  Clock,
} from 'lucide-react'
import { useTrilha, useMyProgress, useMarkLessonComplete } from '@/hooks/useTrilhas'
import type { LearningLesson, LearningModuleWithLessons } from '@/hooks/useTrilhas'
import { PageHeader } from '@/components/ui/PageHeader'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isYouTube(url: string) {
  return /youtube\.com|youtu\.be/.test(url)
}

function isVimeo(url: string) {
  return /vimeo\.com/.test(url)
}

function getYouTubeEmbedUrl(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return match ? `https://www.youtube.com/embed/${match[1]}` : url
}

function getVimeoEmbedUrl(url: string) {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? `https://player.vimeo.com/video/${match[1]}` : url
}

function getLessonIcon(tipo: LearningLesson['tipo']) {
  switch (tipo) {
    case 'video': return PlayCircle
    case 'link': return ExternalLink
    default: return FileText
  }
}

// ─── Lesson Viewer ────────────────────────────────────────────────────────────

interface LessonViewerProps {
  lesson: LearningLesson
  concluido: boolean
  onMarkComplete: () => void
  isMarkingComplete: boolean
}

function LessonViewer({ lesson, concluido, onMarkComplete, isMarkingComplete }: LessonViewerProps) {
  return (
    <div className="glass-card p-3 sm:p-4 lg:p-5 flex flex-col gap-3 sm:gap-4 lg:gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {lesson.tipo === 'video' ? 'Vídeo' : lesson.tipo === 'texto' ? 'Texto' : lesson.tipo === 'pdf' ? 'PDF' : 'Link externo'}
          </p>
          <h2 className="text-lg font-bold text-foreground">{lesson.titulo}</h2>
          {lesson.descricao && (
            <p className="mt-1 text-sm text-muted-foreground">{lesson.descricao}</p>
          )}
        </div>
        {lesson.duracao_minutos && (
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 shrink-0">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">{lesson.duracao_minutos} min</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1">
        {lesson.tipo === 'video' && lesson.conteudo_url && (
          <>
            {isYouTube(lesson.conteudo_url) || isVimeo(lesson.conteudo_url) ? (
              <div className="aspect-video w-full overflow-hidden rounded-lg">
                <iframe
                  src={
                    isYouTube(lesson.conteudo_url)
                      ? getYouTubeEmbedUrl(lesson.conteudo_url)
                      : getVimeoEmbedUrl(lesson.conteudo_url)
                  }
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={lesson.titulo}
                />
              </div>
            ) : (
              <video controls className="w-full rounded-lg" src={lesson.conteudo_url}>
                Seu navegador não suporta vídeo HTML5.
              </video>
            )}
          </>
        )}

        {lesson.tipo === 'texto' && (
          <div
            dangerouslySetInnerHTML={{ __html: lesson.conteudo_texto ?? '' }}
            className="prose prose-sm max-w-none text-foreground"
          />
        )}

        {lesson.tipo === 'pdf' && lesson.conteudo_url && (
          <iframe
            src={lesson.conteudo_url}
            className="w-full h-96 rounded-lg border border-border"
            title={lesson.titulo}
          />
        )}

        {lesson.tipo === 'link' && lesson.conteudo_url && (
          <a
            href={lesson.conteudo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 hover:bg-muted transition-colors group"
          >
            <div className="rounded-full bg-primary/10 p-2.5">
              <ExternalLink className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground group-hover:underline truncate">{lesson.titulo}</p>
              <p className="text-xs text-muted-foreground truncate">{lesson.conteudo_url}</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </a>
        )}
      </div>

      {/* Mark complete */}
      <div className="border-t border-border pt-4">
        {concluido ? (
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Aula concluída</span>
          </div>
        ) : (
          <button
            onClick={onMarkComplete}
            disabled={isMarkingComplete}
            className="gradient-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isMarkingComplete ? 'Salvando...' : 'Marcar como concluída'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Module Accordion Item ────────────────────────────────────────────────────

interface ModuleItemProps {
  module: LearningModuleWithLessons
  selectedLessonId: string | null
  progressMap: Set<string>
  onSelectLesson: (lesson: LearningLesson) => void
  defaultOpen?: boolean
}

function ModuleItem({ module, selectedLessonId, progressMap, onSelectLesson, defaultOpen = false }: ModuleItemProps) {
  const [open, setOpen] = useState(defaultOpen)

  const completedCount = module.learning_lessons.filter(l => progressMap.has(l.id)).length
  const total = module.learning_lessons.length

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 p-3.5 bg-card hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
          />
          <span className="text-sm font-semibold text-foreground truncate">{module.titulo}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {completedCount}/{total}
        </span>
      </button>

      {open && (
        <div className="divide-y divide-border/50 bg-card/50">
          {module.learning_lessons.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Nenhuma aula neste módulo.</p>
          ) : (
            module.learning_lessons.map(lesson => {
              const isDone = progressMap.has(lesson.id)
              const isSelected = selectedLessonId === lesson.id
              const Icon = getLessonIcon(lesson.tipo)

              return (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                    isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span
                    className={`flex-1 text-xs font-medium truncate ${
                      isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                    } ${isSelected ? 'text-primary' : ''}`}
                  >
                    {lesson.titulo}
                  </span>
                  {lesson.duracao_minutos && (
                    <span className="text-2xs text-muted-foreground shrink-0">
                      {lesson.duracao_minutos}m
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PortalTrilhaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: path, isLoading } = useTrilha(id ?? '')
  const { data: progressList } = useMyProgress()
  const markComplete = useMarkLessonComplete()

  const [selectedLesson, setSelectedLesson] = useState<LearningLesson | null>(null)

  const progressMap = new Set(
    (progressList ?? []).filter(p => p.concluido).map(p => p.lesson_id),
  )

  const allLessons = (path?.learning_modules ?? []).flatMap(m => m.learning_lessons)
  const totalLessons = allLessons.length
  const completedLessons = allLessons.filter(l => progressMap.has(l.id)).length
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="glass-card h-16 shimmer" />
        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
          <div className="glass-card h-96 shimmer" />
          <div className="col-span-2 glass-card h-96 shimmer" />
        </div>
      </div>
    )
  }

  if (!path) {
    return <div className="text-muted-foreground">Trilha não encontrada.</div>
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 animate-fade-in">
      <PageHeader
        title={path.titulo}
        description={path.descricao ?? undefined}
        breadcrumb={[
          { label: 'Trilhas', href: '/portal/trilhas' },
          { label: path.titulo },
        ]}
      />

      {/* Overall progress bar */}
      <div className="glass-card p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-0 mb-2">
          <span className="text-sm font-medium text-foreground">
            {completedLessons} de {totalLessons} aula{totalLessons !== 1 ? 's' : ''} concluída{completedLessons !== 1 ? 's' : ''}
          </span>
          <span className="text-sm font-bold text-primary">{pct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
        {/* Sidebar — modules */}
        <div className="flex flex-col gap-2 xl:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Módulos
          </h3>
          {path.learning_modules.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-10 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum módulo disponível.</p>
            </div>
          ) : (
            path.learning_modules.map((mod, i) => (
              <ModuleItem
                key={mod.id}
                module={mod}
                selectedLessonId={selectedLesson?.id ?? null}
                progressMap={progressMap}
                onSelectLesson={setSelectedLesson}
                defaultOpen={i === 0}
              />
            ))
          )}
        </div>

        {/* Main — lesson viewer */}
        <div className="xl:col-span-2">
          {selectedLesson ? (
            <LessonViewer
              lesson={selectedLesson}
              concluido={progressMap.has(selectedLesson.id)}
              onMarkComplete={() => markComplete.mutate(selectedLesson.id)}
              isMarkingComplete={markComplete.isPending}
            />
          ) : (
            <div className="glass-card flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 rounded-xl bg-muted p-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Selecione uma aula</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                Escolha uma aula no painel de módulos para começar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
