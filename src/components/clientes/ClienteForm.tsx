import { useState } from 'react'
import type { FormEvent } from 'react'
import { User, Building2, Phone, Sparkles, Package, FileSignature, X, Check } from 'lucide-react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { useCreateCliente, useUpdateCliente } from '@/hooks/useClientes'
import { useProdutosList } from '@/hooks/useComissoes'
import type { Client } from '@/types/database'

export interface ClienteFormExtras {
  clicksignUrl?: string | null
  clicksignFile?: File | null
  produtoIds?: string[]
  produtoNomes?: string[]
}

interface ClienteFormProps {
  initial?: Partial<Client>
  onClose: () => void
  onCreated?: (client: Client, extras?: ClienteFormExtras) => void
  /** Mostra campo "Contrato assinado (Clicksign)" — URL ou arquivo */
  showClicksignField?: boolean
  initialProdutoIds?: string[]
}

const SEGMENTO_OPTIONS = [
  'Advocacia', 'Arquitetura & Design', 'Automotivo', 'Beleza & Estética',
  'Consultoria', 'Contabilidade', 'E-commerce', 'Educação', 'Energia Solar',
  'Engenharia', 'Finanças', 'Franquias', 'Gastronomia', 'Imobiliário',
  'Marketing Digital', 'Moda & Vestuário', 'Odontologia', 'Pet',
  'Saúde & Medicina', 'Tecnologia', 'Turismo', 'Varejo', 'Outro',
]

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all'
const labelClass = 'block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5'

export function ClienteForm({ initial, onClose, onCreated, showClicksignField, initialProdutoIds }: ClienteFormProps) {
  const isEdit = Boolean(initial?.id)
  const { data: produtos } = useProdutosList()
  const create = useCreateCliente()
  const update = useUpdateCliente()
  const mutation = isEdit ? update : create

  const [clicksignMode, setClicksignMode] = useState<'url' | 'file'>('url')
  const [clicksignUrl, setClicksignUrl] = useState('')
  const [clicksignFile, setClicksignFile] = useState<File | null>(null)
  const [produtosSelecionados, setProdutosSelecionados] = useState<string[]>(initialProdutoIds ?? [])

  const [form, setForm] = useState(() => ({
    nome: initial?.nome ?? '',
    razao_social: initial?.razao_social ?? '',
    cnpj: initial?.cnpj ?? '',
    email: initial?.email ?? '',
    telefone: initial?.telefone ?? '',
    whatsapp: initial?.whatsapp ?? '',
    segmento: initial?.segmento ?? '',
    customSegmento: '',
    nicho: initial?.nicho ?? '',
    empresa: initial?.empresa ?? '',
    instagram: initial?.instagram ?? '',
    endereco: initial?.endereco ?? '',
    faturamento: initial?.faturamento ?? '',
    posicionamento: initial?.posicionamento ?? '',
    notas: initial?.notas ?? '',
  }))

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleProduto(id: string) {
    setProdutosSelecionados(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    )
  }

  function normalizePhoneForSave(raw: string): string {
    if (!raw) return ''
    return raw.startsWith('+') ? raw.slice(1).replace(/\D/g, '') : raw.replace(/\D/g, '')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { customSegmento, ...rest } = form
    const finalForm = {
      ...rest,
      telefone: normalizePhoneForSave(rest.telefone),
      whatsapp: normalizePhoneForSave(rest.whatsapp),
      segmento: rest.segmento === 'Outro' ? customSegmento : rest.segmento,
    }
    // Em edição, vazio é uma remoção explícita; omitir preservaria o valor antigo.
    const payload = Object.fromEntries(Object.entries(finalForm)
      .filter(([, v]) => isEdit || v !== '')
      .map(([key, value]) => [key, isEdit && value === '' ? null : value]))
    if (isEdit && initial?.id) {
      await update.mutateAsync({ id: initial.id, ...payload })
    } else {
      const created = await create.mutateAsync(payload as { nome: string })
      const produtoNomes = produtosSelecionados
        .map(id => produtos?.find(p => p.id === id)?.nome)
        .filter((n): n is string => Boolean(n))
      const extras: ClienteFormExtras = {
        produtoIds: produtosSelecionados.length ? produtosSelecionados : undefined,
        produtoNomes: produtoNomes.length ? produtoNomes : undefined,
        ...(showClicksignField ? {
          clicksignUrl: clicksignMode === 'url' && clicksignUrl.trim() ? clicksignUrl.trim() : null,
          clicksignFile: clicksignMode === 'file' ? clicksignFile : null,
        } : {}),
      }
      onCreated?.(created, extras)
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75dvh] overflow-y-auto pr-1 -mr-1">
      <Section title="Dados básicos" icon={<User className="h-3.5 w-3.5" />}>
        <div className="sm:col-span-2">
          <label className={labelClass}>Nome *</label>
          <input required className={inputClass} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome do cliente" />
        </div>
        <div>
          <label className={labelClass}>Empresa</label>
          <input className={inputClass} value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Nome da empresa" />
        </div>
        <div>
          <label className={labelClass}>Razão Social</label>
          <input className={inputClass} value={form.razao_social} onChange={e => set('razao_social', e.target.value)} placeholder="Razão social" />
        </div>
        <div>
          <label className={labelClass}>CPF / CNPJ</label>
          <input className={inputClass} value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0000-00" />
        </div>
        <div>
          <label className={labelClass}>Segmento</label>
          <select
            className={inputClass}
            value={SEGMENTO_OPTIONS.includes(form.segmento) || form.segmento === 'Outro' ? form.segmento : form.segmento ? 'Outro' : ''}
            onChange={e => {
              const val = e.target.value
              if (val === 'Outro') set('segmento', 'Outro')
              else setForm(prev => ({ ...prev, segmento: val, customSegmento: '' }))
            }}
          >
            <option value="">Selecione...</option>
            {SEGMENTO_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(form.segmento === 'Outro' || (form.segmento && !SEGMENTO_OPTIONS.includes(form.segmento))) && (
            <input
              className={`${inputClass} mt-2`}
              value={form.segmento === 'Outro' ? form.customSegmento : form.segmento}
              onChange={e => {
                if (form.segmento === 'Outro') set('customSegmento', e.target.value)
                else set('segmento', e.target.value)
              }}
              placeholder="Digite o segmento..."
            />
          )}
        </div>
      </Section>

      <Section title="Contato" icon={<Phone className="h-3.5 w-3.5" />}>
        <div>
          <label className={labelClass}>WhatsApp</label>
          <PhoneInput
            international
            defaultCountry="BR"
            countryOptionsOrder={['BR', '|', 'US', 'PT', 'AR', 'CL', 'CO', 'MX', 'PY', 'UY', 'PE', 'ES', 'GB', 'CA', '...']}
            value={form.whatsapp ? (form.whatsapp.startsWith('+') ? form.whatsapp : `+${form.whatsapp}`) : undefined}
            onChange={(v) => set('whatsapp', v ?? '')}
            placeholder="(11) 91234-5678"
            className="phone-input-omnx"
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} placeholder="contato@empresa.com" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Instagram</label>
          <input className={inputClass} value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@usuario ou URL" />
        </div>
      </Section>

      {!isEdit && onCreated && (
        <Section title="Produtos comprados" icon={<Package className="h-3.5 w-3.5" />}>
          <div className="sm:col-span-2 space-y-2">
            {!produtos || produtos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum produto ativo no catálogo.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {produtos.map(p => {
                  const ativo = produtosSelecionados.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProduto(p.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        ativo
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                          : 'border border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {ativo && <Check className="h-3 w-3" />}
                      {p.nome}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Você pode selecionar mais de um.</p>
          </div>
        </Section>
      )}

      <Section title="Detalhes" icon={<Building2 className="h-3.5 w-3.5" />}>
        <div>
          <label className={labelClass}>Nicho</label>
          <input className={inputClass} value={form.nicho} onChange={e => set('nicho', e.target.value)} placeholder="Nicho de atuação" />
        </div>
        <div>
          <label className={labelClass}>Faturamento</label>
          <input className={inputClass} value={form.faturamento} onChange={e => set('faturamento', e.target.value)} placeholder="Faturamento mensal/anual" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Endereço</label>
          <input className={inputClass} value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Endereço completo" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Posicionamento</label>
          <input className={inputClass} value={form.posicionamento} onChange={e => set('posicionamento', e.target.value)} placeholder="Posicionamento de marca" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Notas / Resumo</label>
          <textarea className={`${inputClass} resize-none`} rows={3} value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Observações gerais sobre o cliente..." />
        </div>
      </Section>

      {showClicksignField && !isEdit && (
        <div className="rounded-xl border border-border bg-card/40 p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
              <FileSignature className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Contrato assinado (Clicksign)</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Adicione aqui o contrato assinado pelo cliente.</p>
            </div>
          </div>

          <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setClicksignMode('url')}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${clicksignMode === 'url' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Link / URL
            </button>
            <button
              type="button"
              onClick={() => setClicksignMode('file')}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${clicksignMode === 'file' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Arquivo
            </button>
          </div>

          {clicksignMode === 'url' ? (
            <input
              type="url"
              className={inputClass}
              placeholder="https://app.clicksign.com/..."
              value={clicksignUrl}
              onChange={e => setClicksignUrl(e.target.value)}
            />
          ) : (
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background/50 p-6 cursor-pointer hover:bg-muted/50 transition-colors">
              <FileSignature className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {clicksignFile ? `${clicksignFile.name} · ${Math.round(clicksignFile.size / 1024)} KB` : 'Selecionar arquivo (PDF ou imagem)'}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={e => setClicksignFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {mutation.error && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Erro ao salvar'}
        </p>
      )}

      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-gradient-to-t from-card via-card to-transparent flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4 inline -mt-0.5 mr-1" /> Cancelar
        </button>
        <button type="submit" disabled={mutation.isPending}
          className="gradient-primary rounded-lg px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" />
          {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar cliente'}
        </button>
      </div>
    </form>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
  )
}
