import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  User,
  Phone,
  MessageSquare,
  FileText,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Building2,
  AlertCircle,
} from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import {
  useInstances,
  useStartConversation,
  useCheckNumbers,
  useContacts,
} from '@/hooks/useChat'
import { useTemplates } from '@/hooks/useTemplates'
import { useClientes } from '@/hooks/useClientes'
import { useAuth } from '@/contexts/AuthContext'
import { useMyInstanceIds } from '@/hooks/useUsers'

// ─── Phone helpers ───────────────────────────────────────────────────────────

function cleanPhone(val: string) {
  return val.replace(/\D/g, '')
}

function hasPlusPrefix(val: string) {
  return val.trim().startsWith('+')
}

/** Normaliza número: prepende 55 apenas se for claramente BR (sem DDI explícito). */
function normalizePhone(raw: string): string {
  const digits = cleanPhone(raw)
  if (!digits) return digits
  if (hasPlusPrefix(raw)) return digits
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  return digits
}

/** Live mask: formato BR para números nacionais; formato livre para internacionais. */
function maskPhoneInput(raw: string): string {
  const digits = cleanPhone(raw)
  if (!digits) return ''
  const isInternational = hasPlusPrefix(raw) && !digits.startsWith('55')
  if (isInternational) return `+${digits}`
  const d = normalizePhone(raw)
  if (d.length <= 2) return `+${d}`
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9, 13)}`
}

// ─── Category labels ─────────────────────────────────────────────────────────

const CATEGORIA_LABELS: Record<string, string> = {
  saudacao: 'Saudação',
  encerramento: 'Encerramento',
  csat: 'CSAT',
  informativo: 'Informativo',
  cobranca: 'Cobrança',
  outro: 'Outro',
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'contact' | 'message'

interface NewConversationDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: (conversationId: string) => void
  initialNome?: string
  initialWhatsapp?: string
  initialMensagem?: string
}

export function NewConversationDialog({
  open,
  onClose,
  onCreated,
  initialNome,
  initialWhatsapp,
  initialMensagem,
}: NewConversationDialogProps) {
  const { user } = useAuth()
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: instances = [] } = useInstances(myInstanceIds)
  const startMutation = useStartConversation()
  const checkNumbersMutation = useCheckNumbers()
  const { data: templates = [] } = useTemplates()
  const { data: allContacts = [] } = useContacts()
  const { data: allClientes = [] } = useClientes()

  // ─── State ───────────────────────────────────────────────────────────────

  const [step, setStep] = useState<Step>('contact')
  const [instanceId, setInstanceId] = useState('')
  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [numberStatus, setNumberStatus] = useState<
    'idle' | 'checking' | 'valid' | 'invalid'
  >('idle')
  const [contactSearch, setContactSearch] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [successAnim, setSuccessAnim] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ─── Derived ─────────────────────────────────────────────────────────────

  const activeInstances = instances.filter((i) => i.ativo)
  const selectedInstance = activeInstances.find((i) => i.id === instanceId)

  // Auto-select when only 1 instance
  useEffect(() => {
    if (activeInstances.length === 1 && !instanceId) {
      setInstanceId(activeInstances[0].id)
    }
  }, [activeInstances, instanceId])

  // Unified search: chat_contacts + clients
  type SearchResult = {
    id: string
    nome: string | null
    numero: string
    source: 'contact' | 'client'
    instanceId?: string
  }

  const filteredResults = useMemo<SearchResult[]>(() => {
    if (!contactSearch.trim()) return []
    const q = contactSearch.toLowerCase()
    const results: SearchResult[] = []
    const seenNumbers = new Set<string>()

    // 1. Chat contacts
    for (const c of allContacts) {
      const matchSearch =
        c.nome?.toLowerCase().includes(q) || c.numero_whatsapp.includes(q)
      const matchInstance = instanceId ? c.instance_id === instanceId : true
      if (matchSearch && matchInstance) {
        const clean = normalizePhone(c.numero_whatsapp)
        seenNumbers.add(clean)
        results.push({
          id: c.id,
          nome: c.nome,
          numero: c.numero_whatsapp,
          source: 'contact',
          instanceId: c.instance_id,
        })
      }
    }

    // 2. Clients (telefone or whatsapp field)
    for (const cl of allClientes) {
      const phones = [cl.whatsapp, cl.telefone].filter(Boolean) as string[]
      const matchName = cl.nome?.toLowerCase().includes(q)
      const matchPhone = phones.some((p) => cleanPhone(p).includes(q) || p.includes(q))

      if (matchName || matchPhone) {
        // Pick best phone: prefer whatsapp, fallback telefone
        const bestPhone = cl.whatsapp || cl.telefone
        if (!bestPhone) continue
        const clean = normalizePhone(bestPhone)
        if (seenNumbers.has(clean)) continue // skip duplicate
        seenNumbers.add(clean)
        results.push({
          id: cl.id,
          nome: cl.nome,
          numero: bestPhone,
          source: 'client',
        })
      }
    }

    return results.slice(0, 10)
  }, [allContacts, allClientes, contactSearch, instanceId])


  // Active templates only
  const activeTemplates = useMemo(
    () => templates.filter((t) => t.ativo),
    [templates],
  )

  // ─── Auto-verify number (debounced) ──────────────────────────────────────

  const doCheckNumber = useCallback(
    (phoneRaw: string) => {
      const clean = normalizePhone(phoneRaw)
      if (!instanceId || clean.length < 10 || !selectedInstance) return

      setNumberStatus('checking')
      checkNumbersMutation.mutate(
        { instance_id: selectedInstance.instance_id, numbers: [clean] },
        {
          onSuccess: (data) => {
            const results = data?.results ?? data ?? []
            const found =
              Array.isArray(results) &&
              results.length > 0 &&
              results[0]?.exists !== false
            setNumberStatus(found ? 'valid' : 'invalid')
          },
          onError: () => setNumberStatus('idle'),
        },
      )
    },
    [instanceId, selectedInstance, checkNumbersMutation],
  )

  useEffect(() => {
    const clean = normalizePhone(numero)
    if (clean.length < 10) {
      if (numberStatus !== 'idle') setNumberStatus('idle')
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doCheckNumber(numero), 800)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [numero, doCheckNumber])

  // ─── Reset on close / pre-fill on open ──────────────────────────────────

  useEffect(() => {
    if (!open) {
      setStep('contact')
      setInstanceId(activeInstances.length === 1 ? activeInstances[0]?.id ?? '' : '')
      setNumero('')
      setNome('')
      setMensagem('')
      setNumberStatus('idle')
      setContactSearch('')
      setShowTemplates(false)
      setSuccessAnim(false)
    } else if (initialWhatsapp) {
      // Pre-fill from props (e.g. client detail page)
      setNumero(maskPhoneInput(initialWhatsapp))
      setNome(initialNome ?? '')
      if (initialMensagem) setMensagem(initialMensagem)
      // Só pula pra etapa de mensagem se o número estiver ok E já houver instância
      // (ou só existir uma, que é auto-selecionada). Com várias instâncias, mantém
      // na etapa de contato pra o usuário escolher — senão o botão trava sem explicação.
      const temInstancia = Boolean(instanceId) || activeInstances.length === 1
      if (temInstancia && cleanPhone(initialWhatsapp).length >= 10) {
        setTimeout(() => setStep('message'), 150)
      }
    } else if (initialNome) {
      setNome(initialNome)
    }
  }, [open])

  // Focus search input when opened
  useEffect(() => {
    if (open && step === 'contact') {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [open, step])

  // ─── Handlers ────────────────────────────────────────────────────────────

  function selectResult(result: SearchResult) {
    setNumero(maskPhoneInput(result.numero))
    setNome(result.nome ?? '')
    setContactSearch('')
    // Auto-set instance if contact has one
    if (result.instanceId && !instanceId) {
      const inst = activeInstances.find((i) => i.id === result.instanceId)
      if (inst) setInstanceId(inst.id)
    }
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setNumero(maskPhoneInput(raw))
  }

  function selectTemplate(conteudo: string) {
    setMensagem(conteudo)
    setShowTemplates(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanNumber = normalizePhone(numero)
    if (!instanceId || !cleanNumber || !mensagem.trim()) return

    setSubmitError('')
    startMutation.mutate(
      {
        instance_id: instanceId,
        numero_whatsapp: cleanNumber,
        nome: nome.trim() || undefined,
        conteudo: mensagem.trim(),
        agente_id: user?.id,
      },
      {
        onSuccess: (conversation) => {
          setSuccessAnim(true)
          setTimeout(() => {
            onCreated?.(conversation.id)
            onClose()
          }, 600)
        },
        onError: (err) => {
          setSubmitError(err instanceof Error ? err.message : 'Erro ao iniciar conversa. Tente novamente.')
        },
      },
    )
  }

  const canAdvance = instanceId && normalizePhone(numero).length >= 10
  const canSubmit = canAdvance && mensagem.trim().length > 0

  // Motivo de o botão estar bloqueado, pra mostrar um aviso claro ao usuário.
  const motivoBloqueio = !instanceId
    ? 'Selecione a instância de WhatsApp na etapa "Contato".'
    : normalizePhone(numero).length < 10
      ? 'Informe um número de WhatsApp válido (com DDD).'
      : mensagem.trim().length === 0
        ? 'Digite a primeira mensagem para iniciar a conversa.'
        : ''

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal open={open} onClose={onClose} title="Nova conversa" size="md">
      {/* Success overlay */}
      {successAnim && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/95 rounded-2xl animate-fade-in">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle className="h-8 w-8 text-green-500 animate-scale-in" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            Conversa iniciada com sucesso!
          </p>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => setStep('contact')}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            step === 'contact'
              ? 'bg-accent/15 text-accent'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          <User className="h-3 w-3" />
          Contato
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <button
          type="button"
          onClick={() => canAdvance && setStep('message')}
          disabled={!canAdvance}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            step === 'message'
              ? 'bg-accent/15 text-accent'
              : 'bg-muted text-muted-foreground',
            !canAdvance && 'opacity-40 cursor-not-allowed',
          )}
        >
          <MessageSquare className="h-3 w-3" />
          Mensagem
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ═══ STEP 1: Contact ═══ */}
        {step === 'contact' && (
          <div className="space-y-4 animate-fade-in">
            {/* Instance select (hidden if only 1) */}
            {activeInstances.length > 1 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Instância WhatsApp
                </label>
                <select
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  required
                  className={cn(
                    'w-full rounded-lg border border-input bg-background px-3 py-2',
                    'text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  )}
                >
                  <option value="">Selecione...</option>
                  {activeInstances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.nome}{' '}
                      {inst.numero_whatsapp ? `(${formatPhone(inst.numero_whatsapp)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Single instance indicator */}
            {activeInstances.length === 1 && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">
                  {activeInstances[0].nome}
                </span>
                {activeInstances[0].numero_whatsapp && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatPhone(activeInstances[0].numero_whatsapp)}
                  </span>
                )}
              </div>
            )}

            {/* Contact search */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Buscar contato existente
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Digite nome ou número..."
                  className={cn(
                    'w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2',
                    'text-sm placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  )}
                />
              </div>

              {/* Unified results dropdown (contacts + clients) */}
              {filteredResults.length > 0 && (
                <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                  {filteredResults.map((r) => (
                    <button
                      key={`${r.source}-${r.id}`}
                      type="button"
                      onClick={() => selectResult(r)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors first:rounded-t-lg last:rounded-b-lg"
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          r.source === 'client'
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-accent/10 text-accent',
                        )}
                      >
                        {r.source === 'client' ? (
                          <Building2 className="h-3.5 w-3.5" />
                        ) : (
                          <User className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {r.nome || 'Sem nome'}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {formatPhone(r.numero)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium',
                          r.source === 'client'
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {r.source === 'client' ? 'Cliente' : 'Contato'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {contactSearch.trim() && filteredResults.length === 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Nenhum contato ou cliente encontrado — digite o número abaixo
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground">
                  ou digite o número
                </span>
              </div>
            </div>

            {/* Phone number with mask */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Número WhatsApp
              </label>
              <input
                type="text"
                value={numero}
                onChange={handlePhoneChange}
                placeholder="+55 (21) 99999-9999"
                required
                className={cn(
                  'w-full rounded-lg border bg-background px-3 py-2 font-mono',
                  'text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                  numberStatus === 'valid' && 'border-green-500/50',
                  numberStatus === 'invalid' && 'border-red-500/50',
                  numberStatus !== 'valid' &&
                    numberStatus !== 'invalid' &&
                    'border-input',
                )}
              />
              <div className="flex items-center gap-2 mt-1 min-h-[18px]">
                {numberStatus === 'checking' && (
                  <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verificando no
                    WhatsApp...
                  </span>
                )}
                {numberStatus === 'valid' && (
                  <span className="flex items-center gap-1 text-2xs text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3 w-3" /> Número encontrado no WhatsApp
                  </span>
                )}
                {numberStatus === 'invalid' && (
                  <span className="flex items-center gap-1 text-2xs text-red-500">
                    <XCircle className="h-3 w-3" /> Número não encontrado no WhatsApp
                  </span>
                )}
                {numberStatus === 'idle' && cleanPhone(numero).length > 0 && (
                  <span className="text-2xs text-muted-foreground">
                    +código do país + DDD + número
                  </span>
                )}
              </div>
            </div>

            {/* Contact name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Nome do contato{' '}
                <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="João Silva"
                className={cn(
                  'w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                )}
              />
            </div>

            {/* Next button */}
            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setStep('message')}
                disabled={!canAdvance}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-40 transition-opacity"
              >
                Próximo
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: Message ═══ */}
        {step === 'message' && (
          <div className="space-y-4 animate-fade-in">
            {/* Contact summary */}
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {nome || 'Número novo'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {numero}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep('contact')}
                className="flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
              >
                <ChevronLeft className="h-3 w-3" />
                Alterar
              </button>
            </div>

            {/* Template selector */}
            {activeTemplates.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    showTemplates
                      ? 'border-accent/30 bg-accent/5 text-accent'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-input',
                  )}
                >
                  <FileText className="h-4 w-4" />
                  <span className="flex-1 text-left">Usar template de mensagem</span>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 transition-transform',
                      showTemplates && 'rotate-90',
                    )}
                  />
                </button>

                {showTemplates && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                    {activeTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTemplate(t.conteudo)}
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors border-b border-border last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {t.nome}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
                            {CATEGORIA_LABELS[t.categoria] ?? t.categoria}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {t.conteudo}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Message */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Primeira mensagem
              </label>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Olá! Tudo bem?"
                required
                rows={4}
                autoFocus
                className={cn(
                  'w-full rounded-lg border border-input bg-background px-3 py-2 resize-none',
                  'text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                )}
              />
            </div>

            {/* Error */}
            {submitError && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {submitError}
              </p>
            )}

            {/* Aviso do que falta pra habilitar o botão */}
            {!canSubmit && motivoBloqueio && (
              <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {motivoBloqueio}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setStep('contact')}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || startMutation.isPending}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-40 transition-opacity"
                >
                  {startMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Iniciar conversa
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
