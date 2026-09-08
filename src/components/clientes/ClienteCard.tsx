import { useState } from 'react'
import { Instagram, MessageSquare, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Client } from '@/types/database'

interface ClienteCardProps {
  client: Client
  onClick: () => void
  /** Foto do perfil do Instagram (vem de social_snapshots) */
  avatarUrl?: string | null
}

function getInitials(nome: string) {
  return nome
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function cleanName(nome: string) {
  return nome.replace(/\s*\[MERGED\]\s*/gi, '').trim()
}

function normalizeIg(ig: string | null | undefined) {
  if (!ig) return null
  let h = ig.trim()
  const m = h.match(/instagram\.com\/([^/?#]+)/i)
  if (m) h = m[1]
  return h.replace(/^@+/, '').replace(/\/+$/, '') || null
}

function formatPhone(raw: string | null | undefined) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return raw
  // Brasil: +55 (DD) 9XXXX-XXXX
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const cc = digits.slice(0, 2)
    const dd = digits.slice(2, 4)
    const rest = digits.slice(4)
    const half = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4)
    const tail = rest.slice(half.length)
    return `+${cc} (${dd}) ${half}-${tail}`
  }
  return raw
}

export function ClienteCard({ client, onClick, avatarUrl }: ClienteCardProps) {
  const nomeLimpo = cleanName(client.nome)
  const initials = getInitials(nomeLimpo)
  const ig = normalizeIg(client.instagram)
  const phone = formatPhone(client.whatsapp ?? client.telefone)
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = !!avatarUrl && !imgFailed

  return (
    <button
      onClick={onClick}
      className="glass-card entity-card-hover group w-full text-left p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        {showImage ? (
          <img
            src={avatarUrl!}
            alt={nomeLimpo}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-10 w-10 shrink-0 rounded-lg object-cover border border-border"
          />
        ) : (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
              client.ativo ? 'bg-primary-muted text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            {initials || '?'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-foreground truncate leading-tight">
              {nomeLimpo}
            </p>
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                client.ativo ? 'bg-success' : 'bg-muted-foreground/40',
              )}
              aria-label={client.ativo ? 'Ativo' : 'Inativo'}
            />
          </div>

          {(client.empresa || client.segmento) && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate flex items-center gap-1">
              {client.empresa && (
                <>
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{client.empresa}</span>
                </>
              )}
              {client.empresa && client.segmento && <span className="text-muted-foreground/40">·</span>}
              {client.segmento && <span className="truncate">{client.segmento}</span>}
            </p>
          )}
        </div>
      </div>

      {(phone || ig) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {phone && (
            <span className="inline-flex items-center gap-1 truncate">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="truncate font-mono text-2xs">{phone}</span>
            </span>
          )}
          {ig && (
            <span className="inline-flex items-center gap-1 truncate">
              <Instagram className="h-3 w-3 shrink-0 text-pink-500" />
              <span className="truncate">@{ig}</span>
            </span>
          )}
        </div>
      )}
    </button>
  )
}
