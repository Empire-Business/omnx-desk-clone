import { useEffect, useRef, useState } from 'react'
import { Palette, Upload, Loader2, RotateCcw, Save, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { cn } from '@/lib/utils'

// Tela "Marca" — apenas admin. Edita o tenant atual do user logado.
// Campos: nome, primary_color (hex), logo_url claro, logo_dark_url,
//         favicon_url, custom_domain. Upload em bucket público "branding".

interface TenantRow {
  id: string
  name: string
  slug: string
  primary_color: string | null
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  custom_domain: string | null
}

const DEFAULT_PRIMARY = '#0B57D0'

export function BrandSection() {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [tenant, setTenant] = useState<TenantRow | null>(null)
  const [form, setForm] = useState<TenantRow | null>(null)
  const lightInputRef = useRef<HTMLInputElement>(null)
  const darkInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = can('configuracoes', 'admin')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!profile?.tenant_id) { setLoading(false); return }
      const { data } = await supabase
        .from('tenants')
        .select('id, name, slug, primary_color, logo_url, logo_dark_url, favicon_url, custom_domain')
        .eq('id', profile.tenant_id)
        .maybeSingle()
      if (cancelled) return
      const row = (data as TenantRow | null) ?? null
      setTenant(row)
      setForm(row)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user])

  async function uploadFile(kind: 'logo_url' | 'logo_dark_url' | 'favicon_url', file: File) {
    if (!tenant) return
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${tenant.id}/${kind}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('branding')
      .upload(path, file, { upsert: true })
    if (upErr) { console.error(upErr); return }
    const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`
    setForm(prev => (prev ? { ...prev, [kind]: url } : prev))
  }

  async function save() {
    if (!form || !tenant) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: form.name,
          primary_color: form.primary_color,
          logo_url: form.logo_url,
          logo_dark_url: form.logo_dark_url,
          favicon_url: form.favicon_url,
          custom_domain: form.custom_domain?.trim() || null,
        })
        .eq('id', tenant.id)
      if (error) throw error
      setTenant(form)
      setSavedAt(Date.now())
      queryClient.invalidateQueries({ queryKey: ['user-tenant'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-by-domain'] })
    } catch (err) {
      console.error('Falha ao salvar marca:', err)
    } finally {
      setSaving(false)
    }
  }

  async function restoreDefault() {
    if (!tenant) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          primary_color: null,
          logo_url: null,
          logo_dark_url: null,
          favicon_url: null,
        })
        .eq('id', tenant.id)
      if (error) throw error
      const cleared = { ...tenant, primary_color: null, logo_url: null, logo_dark_url: null, favicon_url: null }
      setTenant(cleared)
      setForm(cleared)
      queryClient.invalidateQueries({ queryKey: ['user-tenant'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-by-domain'] })
    } catch (err) {
      console.error('Falha ao restaurar padrão:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Marca</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Apenas administradores podem editar a identidade visual.
        </p>
      </div>
    )
  }

  if (!form || !tenant) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-muted-foreground">Nenhum tenant associado a este usuário.</p>
      </div>
    )
  }

  return (
    <div className="glass-card space-y-6 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Palette className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Marca</h2>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome da empresa</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cor primária</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form.primary_color || DEFAULT_PRIMARY}
            onChange={e => setForm({ ...form, primary_color: e.target.value })}
            className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-background"
          />
          <input
            type="text"
            value={form.primary_color || ''}
            placeholder={DEFAULT_PRIMARY}
            onChange={e => setForm({ ...form, primary_color: e.target.value })}
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LogoUpload
          label="Logo (modo claro)"
          url={form.logo_url}
          inputRef={lightInputRef}
          onPick={file => uploadFile('logo_url', file)}
          onClear={() => setForm({ ...form, logo_url: null })}
          accept="image/*"
        />
        <LogoUpload
          label="Logo (modo escuro)"
          url={form.logo_dark_url}
          inputRef={darkInputRef}
          onPick={file => uploadFile('logo_dark_url', file)}
          onClear={() => setForm({ ...form, logo_dark_url: null })}
          accept="image/*"
          darkPreview
        />
      </div>

      <LogoUpload
        label="Favicon"
        url={form.favicon_url}
        inputRef={faviconInputRef}
        onPick={file => uploadFile('favicon_url', file)}
        onClear={() => setForm({ ...form, favicon_url: null })}
        accept="image/x-icon,image/png,image/svg+xml"
      />

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Domínio próprio</label>
        <input
          type="text"
          value={form.custom_domain ?? ''}
          placeholder="app.suaempresa.com.br"
          onChange={e => setForm({ ...form, custom_domain: e.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p className="text-xs text-muted-foreground">
          No DNS do seu provedor, aponte um CNAME para <code className="rounded bg-muted px-1.5 py-0.5">cname.vercel-dns.com</code>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
        <button
          onClick={restoreDefault}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar padrão
        </button>
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check className="h-4 w-4" /> Salvo
          </span>
        )}
      </div>
    </div>
  )
}

function LogoUpload({
  label, url, inputRef, onPick, onClear, accept, darkPreview,
}: {
  label: string
  url: string | null
  inputRef: React.RefObject<HTMLInputElement>
  onPick: (file: File) => void | Promise<void>
  onClear: () => void
  accept: string
  darkPreview?: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className={cn(
        'flex items-center gap-3 rounded-lg border border-border p-3',
        darkPreview && 'bg-zinc-900'
      )}>
        <div className={cn(
          'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md',
          darkPreview ? 'bg-zinc-800' : 'bg-muted'
        )}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <Palette className={cn('h-6 w-6', darkPreview ? 'text-zinc-500' : 'text-muted-foreground')} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" />
            Enviar
          </button>
          {url && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Remover
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}
