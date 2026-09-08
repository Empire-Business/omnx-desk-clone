import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useComments, useAddComment, approvalKeys } from '@/hooks/useApproval'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERFIL_LABELS: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  agente: 'Agente',
  atendimento: 'Atendimento',
  estrategista: 'Estrategista',
  cliente: 'Cliente',
}

function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'agora'
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60)
    return `há ${mins}min`
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600)
    return `há ${hours}h`
  }
  if (diffSec < 2592000) {
    const days = Math.floor(diffSec / 86400)
    return `há ${days} dia${days !== 1 ? 's' : ''}`
  }
  const months = Math.floor(diffSec / 2592000)
  return `há ${months} ${months !== 1 ? 'meses' : 'mês'}`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommentsPanelProps {
  deliveryId: string
  versionId?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommentsPanel({ deliveryId, versionId }: CommentsPanelProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState('')
  const listEndRef = useRef<HTMLDivElement>(null)

  const { data: comments, isLoading } = useComments(deliveryId)
  const addComment = useAddComment()

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('comments:' + deliveryId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_comments',
          filter: 'delivery_id=eq.' + deliveryId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: approvalKeys.comments(deliveryId) })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [deliveryId, queryClient])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function handleSubmit() {
    if (!texto.trim() || !user) return
    const draft = texto.trim()
    setTexto('')
    await addComment.mutateAsync({
      deliveryId,
      versionId,
      userId: user.id,
      texto: draft,
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="glass-card flex flex-col p-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Comentários</h3>
        </div>
        <span className="text-2xs text-muted-foreground italic">
          Comentários internos — não visíveis ao cliente
        </span>
      </div>

      {/* Comment list */}
      <div className="flex-1 space-y-3 overflow-y-auto max-h-96 pr-1">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-full shrink-0 shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 rounded shimmer" />
                  <div className="h-8 w-full rounded shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && (!comments || comments.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum comentário ainda. Seja o primeiro a comentar.
          </p>
        )}

        {comments && comments.map(comment => {
          const nome = comment.users?.nome ?? 'Usuário'
          const perfil = comment.users?.perfil ?? ''
          const initials = getInitials(nome)
          const perfilLabel = PERFIL_LABELS[perfil] ?? perfil

          return (
            <div key={comment.id} className="flex gap-3">
              {/* Avatar */}
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  'bg-gradient-to-br from-primary/30 to-primary/60 text-primary-foreground',
                  'text-2xs font-bold select-none',
                )}
                aria-label={nome}
              >
                {initials}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {nome}
                  </span>
                  {perfilLabel && (
                    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground">
                      {perfilLabel}
                    </span>
                  )}
                  <span className="text-2xs text-muted-foreground ml-auto whitespace-nowrap">
                    {relativeTime(comment.criado_em)}
                  </span>
                </div>
                <p className="text-sm text-foreground break-words whitespace-pre-wrap">
                  {comment.texto}
                </p>
              </div>
            </div>
          )
        })}

        <div ref={listEndRef} />
      </div>

      {/* Input */}
      {user && (
        <div className="flex items-end gap-2 border-t border-border pt-4">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Escreva um comentário… (Enter para enviar)"
            className={cn(
              'flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
            )}
          />
          <button
            onClick={handleSubmit}
            disabled={!texto.trim() || addComment.isPending}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              'gradient-primary text-primary-foreground',
              'hover:opacity-90 transition-opacity disabled:opacity-40',
            )}
            aria-label="Enviar comentário"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}

      {addComment.error && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">
          {addComment.error instanceof Error ? addComment.error.message : 'Erro ao enviar comentário.'}
        </p>
      )}
    </div>
  )
}
