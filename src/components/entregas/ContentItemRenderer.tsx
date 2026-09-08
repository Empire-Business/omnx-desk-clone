import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DeliveryContentItem } from '@/types/database'

interface ContentItemRendererProps {
  item: DeliveryContentItem
  className?: string
}

function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be')
}

function isVimeoUrl(url: string): boolean {
  return url.includes('vimeo.com')
}

function getYouTubeEmbedUrl(url: string): string {
  // Handles youtu.be/ID and youtube.com/watch?v=ID and youtube.com/embed/ID
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/)
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`

  const watchMatch = url.match(/[?&]v=([^&]+)/)
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`

  const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/)
  if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`

  return url
}

function getVimeoEmbedUrl(url: string): string {
  const match = url.match(/vimeo\.com\/(\d+)/)
  if (match) return `https://player.vimeo.com/video/${match[1]}`
  return url
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf')
}

function ImageItem({ item }: { item: DeliveryContentItem }) {
  return (
    <div className="space-y-2">
      <img
        src={item.url ?? ''}
        alt={item.nome ?? 'Imagem'}
        className="max-h-64 w-full rounded-lg object-cover"
      />
      {item.url && (
        <a
          href={item.url}
          download={item.nome ?? true}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          <DownloadIcon />
          Baixar
        </a>
      )}
    </div>
  )
}

function VideoItem({ item }: { item: DeliveryContentItem }) {
  const url = item.url ?? ''

  if (isYouTubeUrl(url)) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg">
        <iframe
          src={getYouTubeEmbedUrl(url)}
          title={item.nome ?? 'Vídeo YouTube'}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  if (isVimeoUrl(url)) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg">
        <iframe
          src={getVimeoEmbedUrl(url)}
          title={item.nome ?? 'Vídeo Vimeo'}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      controls
      src={url}
      className="w-full rounded-lg"
    >
      Seu navegador não suporta a reprodução de vídeos.
    </video>
  )
}

function DocumentoItem({ item }: { item: DeliveryContentItem }) {
  const url = item.url ?? ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-light text-info">
          <DocumentIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{item.nome ?? 'Documento'}</p>
          {item.tamanho != null && (
            <p className="text-xs text-muted-foreground">{formatFileSize(item.tamanho)}</p>
          )}
        </div>
        {url && (
          <a
            href={url}
            download={item.nome ?? true}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <DownloadIcon />
            Baixar
          </a>
        )}
      </div>
      {url && isPdfUrl(url) && (
        <iframe
          src={url}
          title={item.nome ?? 'PDF'}
          className="h-96 w-full rounded-lg border border-border"
        />
      )}
    </div>
  )
}

function LinkItem({ item }: { item: DeliveryContentItem }) {
  const url = item.url ?? ''

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
        <ExternalLinkIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{item.nome ?? 'Link externo'}</p>
        <p className="truncate text-sm text-foreground">{url}</p>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <ExternalLinkIcon />
          Abrir
        </a>
      )}
    </div>
  )
}

function TextoItem({ item }: { item: DeliveryContentItem }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(item.texto ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — silently fail
    }
  }

  return (
    <div className="space-y-2">
      {item.nome && (
        <p className="text-xs font-medium text-muted-foreground">{item.nome}</p>
      )}
      <div className="relative">
        <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-foreground font-mono leading-relaxed">
          {item.texto}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'absolute right-2 top-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
            copied
              ? 'bg-success-light text-success'
              : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted border border-border'
          )}
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

export function ContentItemRenderer({ item, className }: ContentItemRendererProps) {
  function renderContent() {
    switch (item.tipo) {
      case 'imagem':
        return <ImageItem item={item} />
      case 'video':
        return <VideoItem item={item} />
      case 'documento':
        return <DocumentoItem item={item} />
      case 'link':
        return <LinkItem item={item} />
      case 'texto':
        return <TextoItem item={item} />
      default:
        return (
          <p className="text-sm text-muted-foreground">Tipo de conteúdo desconhecido.</p>
        )
    }
  }

  return (
    <div className={cn('glass-card p-3', className)}>
      {renderContent()}
    </div>
  )
}

// ─── Inline icon helpers (no external lib dependency) ───────────────────────

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
