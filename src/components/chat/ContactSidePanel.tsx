import { useEffect, useState, useCallback } from 'react'
import { X, Phone, Building, RefreshCw, Info, Link2, UserPlus, Sparkles, Loader2, Users, ShieldCheck, FileText, ImageIcon, Mic, Film, Download } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SUPABASE_URL } from '@/integrations/supabase/client'
import { cn, formatPhone } from '@/lib/utils'
import { useFetchProfilePic, useChatDetails, useUpdateContact, useGroupMembers, useMessages } from '@/hooks/useChat'
import { useClientes } from '@/hooks/useClientes'
import { useMyClientIds } from '@/hooks/useUsers'
import { useAuth } from '@/contexts/AuthContext'
import type { ChatContact, ChatMessage } from '@/hooks/useChat'
import type { Client } from '@/types/database'
import { ChatDetailsOverlay } from './ChatActionsMenu'
import { ClienteForm, type ClienteFormExtras } from '@/components/clientes/ClienteForm'
import { type VendaPendente, getComprovanteUrl } from '@/hooks/useVendasPendentes'

interface ContactSidePanelProps {
  contact: ChatContact
  currentConversationId: string
  instanceId?: string
  automacaoPausadaAte?: string | null
  isGroup?: boolean
  onClose: () => void
  onSelectConversation?: (id: string) => void
}

const MEDIA_TYPES = ['imagem', 'image', 'video', 'audio', 'documento', 'document', 'sticker'] as const

function useLinkedClient(clientId: string | null) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, nome, email, telefone, segmento')
        .eq('id', clientId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: Boolean(clientId),
  })
}

export function ContactSidePanel({
  contact,
  currentConversationId,
  instanceId,
  isGroup = false,
  onClose,
}: ContactSidePanelProps) {
  const { data: linkedClient } = useLinkedClient(contact.client_id)
  const { data: allClients = [] } = useClientes()
  const { data: myClientIds } = useMyClientIds()
  const { user: authUser } = useAuth()

  // Filter clients dropdown: estrategista sees only their clients
  const availableClients = authUser?.perfil === 'estrategista' && Array.isArray(myClientIds)
    ? allClients.filter(c => myClientIds.includes(c.id))
    : allClients
  const updateContact = useUpdateContact()
  const fetchPicMutation = useFetchProfilePic()
  const chatDetailsMutation = useChatDetails()
  const [detailsData, setDetailsData] = useState<Record<string, unknown> | null>(null)
  const [linkingClient, setLinkingClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [imgFailed, setImgFailed] = useState(false)

  const canAssign = authUser && ['admin', 'gerente', 'atendimento', 'estrategista'].includes(authUser.perfil)
  const queryClient = useQueryClient()

  // Create client from chat
  const [extracting, setExtracting] = useState(false)
  const [extractedData, setExtractedData] = useState<Partial<Client> | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const [vendaData, setVendaData] = useState<VendaPendente | null>(null)

  useEffect(() => {
    if (!contact.numero_whatsapp || contact.client_id) return
    const digits = contact.numero_whatsapp.replace(/\D/g, '')
    ;(supabase as any)
      .from('vendas_pendentes')
      .select('*')
      .or(`cliente_whatsapp.eq.${digits},cliente_whatsapp.eq.+${digits}`)
      .in('status', ['pendente', 'em_atendimento', 'concluida'])
      .order('criado_em', { ascending: false })
      .limit(1)
      .then(({ data }: { data: VendaPendente[] | null }) => {
        if (data && data.length > 0) setVendaData(data[0])
      })
      .catch(() => {})
  }, [contact.id, contact.numero_whatsapp, contact.client_id])

  const handleExtractClientData = useCallback(async () => {
    if (vendaData) {
      const vendaEndereco = [
        [vendaData.cliente_logradouro, vendaData.cliente_numero].filter(Boolean).join(', '),
        vendaData.cliente_complemento,
        vendaData.cliente_bairro,
        [vendaData.cliente_municipio, vendaData.cliente_uf].filter(Boolean).join('/'),
        vendaData.cliente_cep,
      ].filter(Boolean).join(' · ') || vendaData.cliente_endereco || ''

      setExtractedData({
        nome: vendaData.cliente_nome,
        email: vendaData.cliente_email ?? '',
        whatsapp: contact.numero_whatsapp,
        cnpj: vendaData.cliente_cpf_cnpj ?? '',
        instagram: vendaData.cliente_instagram ?? '',
        razao_social: vendaData.cliente_razao_social ?? '',
        endereco: vendaEndereco,
        notas: vendaData.observacoes
          ? `Cliente do ${vendaData.produto_nome ?? 'produto'}. ${vendaData.observacoes}`
          : `Cliente do ${vendaData.produto_nome ?? 'produto'}. Contrato emitido via Clicksign e enviado para assinatura no email cadastrado.`,
      })
      setShowCreateForm(true)
      return
    }

    // Fallback: extração por IA
    setExtracting(true)
    try {
      let token: string | undefined
      const { data } = await supabase.auth.getSession()
      if (data?.session?.access_token) {
        token = data.session.access_token
      } else {
        const { data: refreshed } = await supabase.auth.refreshSession()
        token = refreshed?.session?.access_token
      }
      if (!token) throw new Error('Sessão expirada')
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/ia-extract-client-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversation_id: currentConversationId }),
        },
      )
      if (!res.ok) {
        const errBody = await res.text()
        console.error('ia-extract-client-data response:', res.status, errBody)
        throw new Error('Falha ao extrair dados')
      }
      const json = await res.json()
      setExtractedData(json.client_data)
      setShowCreateForm(true)
    } catch (err) {
      console.error('Extract client data error:', err)
    } finally {
      setExtracting(false)
    }
  }, [currentConversationId, vendaData, contact.numero_whatsapp])

  const handleClientCreated = useCallback(async (client: Client, extras?: ClienteFormExtras) => {
    updateContact.mutate({ id: contact.id, client_id: client.id })

    const ext = (extractedData ?? {}) as Record<string, string | undefined>
    let novoContratoId: string | null = null
    let linkClicksignFinal: string | null = null
    try {
      const produtoId = extras?.produtoIds?.[0] ?? vendaData?.produto_id ?? null
      const produtoNome = extras?.produtoNomes?.length
        ? extras.produtoNomes.join(', ')
        : vendaData?.produto_nome ?? null

      let fat_bruto: number | null = null
      let entrada: number | null = null
      let pg_entrada: string | null = null
      let num_parcelas_venda = 1
      let valor_parcela: number | null = null
      let forma_pagamento: string | null = null
      let vendedor: string | null = null
      let vencimento: string | null = null
      let enderecoVenda: string | null = null

      if (vendaData) {
        const pags = vendaData.pagamentos ?? []
        fat_bruto = vendaData.valor_total_venda
        const entradaPg = pags.find(p => (p.sinal ?? '').toLowerCase().includes('entrada'))
        const parcelasArr = pags.filter(p => (p.sinal ?? '').toLowerCase().includes('parcela'))
        if (entradaPg) {
          entrada = Number(entradaPg.valor)
          pg_entrada = entradaPg.data
          forma_pagamento = entradaPg.forma
        }
        if (parcelasArr.length > 0) {
          num_parcelas_venda = parcelasArr.length
          valor_parcela = Number(parcelasArr[0].valor)
          vencimento = parcelasArr[0].data ?? null
          if (!forma_pagamento) forma_pagamento = parcelasArr[0].forma
        } else if (!entradaPg && pags.length > 0) {
          num_parcelas_venda = pags.length
          valor_parcela = Number(pags[0].valor)
          forma_pagamento = pags[0].forma
        }
        // Sem valor de parcela explícito: deriva do total negociado (ex: venda à vista só com "Entrada")
        if (valor_parcela == null && fat_bruto != null && num_parcelas_venda > 0) {
          valor_parcela = fat_bruto / num_parcelas_venda
        }
        vendedor = vendaData.closer_nome
        // Endereço estruturado da venda em texto legível (o contrato tem um campo único)
        enderecoVenda = [
          [vendaData.cliente_logradouro, vendaData.cliente_numero].filter(Boolean).join(', '),
          vendaData.cliente_complemento,
          vendaData.cliente_bairro,
          [vendaData.cliente_municipio, vendaData.cliente_uf].filter(Boolean).join('/'),
          vendaData.cliente_cep,
        ].filter((x) => x && String(x).trim()).join(' · ') || vendaData.cliente_endereco
      }

      const { data: novoContrato } = await supabase.from('contratos').insert({
        cliente_id: client.id,
        cliente_nome: client.nome,
        status: 'rascunho',
        status_secundario: 'Não iniciado',
        data_fechamento: new Date().toISOString().slice(0, 10),
        valor_total: fat_bruto ?? 0,
        num_parcelas: num_parcelas_venda,
        percentual_aplicado: 0,
        produto_id: produtoId,
        produto_nome: produtoNome,
        email: client.email ?? ext.email ?? null,
        whatsapp: contact.numero_whatsapp ?? ext.whatsapp ?? null,
        cpf_cnpj: ext.cnpj ?? vendaData?.cliente_cpf_cnpj ?? null,
        empresa: ext.empresa ?? vendaData?.cliente_razao_social ?? null,
        endereco: ext.endereco ?? enderecoVenda ?? null,
        vencimento,
        instagram: ext.instagram ?? vendaData?.cliente_instagram ?? null,
        nicho: ext.nicho ?? null,
        observacoes: vendaData?.observacoes ?? ext.notas ?? null,
        fat_bruto,
        entrada,
        pg_entrada,
        valor_parcela,
        forma_pagamento,
        vendedor,
        // Lista completa de parcelas vinda do onboarding (com forma, plataforma e datas),
        // pra tabela de Pagamentos do contrato nascer preenchida — não só os campos achatados.
        pagamentos: (vendaData?.pagamentos ?? []).map((p) => ({
          data: (p.data ?? '').slice(0, 10),
          valor: Number(p.valor) || 0,
          forma: p.forma ?? '',
          plataforma: p.plataforma ?? '',
          sinal: p.sinal ?? '',
        })),
      }).select('id').single()
      novoContratoId = novoContrato?.id ?? null

      if (novoContratoId && vendaData?.comprovantes?.length) {
        for (const comp of vendaData.comprovantes) {
          try {
            const signedUrl = await getComprovanteUrl(comp.storage_path)
            const resp = await fetch(signedUrl)
            const blob = await resp.blob()
            const extName = comp.nome_original.split('.').pop() ?? 'jpg'
            const storagePath = `contratos/${novoContratoId}/${crypto.randomUUID()}.${extName}`
            const { error: upErr } = await supabase.storage
              .from('contratos-anexos')
              .upload(storagePath, blob, { contentType: comp.mime_type ?? 'image/jpeg', upsert: false })
            if (!upErr) {
              await supabase.from('contrato_anexos').insert({
                contrato_id: novoContratoId,
                nome_original: comp.nome_original,
                storage_path: storagePath,
                mime_type: comp.mime_type ?? null,
                tamanho_bytes: comp.tamanho_bytes ?? null,
                categoria: 'comprovante_entrada',
              })
            }
          } catch {
            // silencia erro de comprovante individual
          }
        }
      }

      if (novoContratoId && extras) {
        if (extras.clicksignUrl) {
          linkClicksignFinal = extras.clicksignUrl
        } else if (extras.clicksignFile) {
          const file = extras.clicksignFile
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const storagePath = `contratos/${novoContratoId}/${crypto.randomUUID()}-${safeName}`
          const { error: upErr } = await supabase.storage
            .from('contratos-anexos')
            .upload(storagePath, file, { contentType: file.type, upsert: false })
          if (!upErr) {
            await supabase.from('contrato_anexos').insert({
              contrato_id: novoContratoId,
              nome_original: file.name,
              storage_path: storagePath,
              mime_type: file.type,
              tamanho_bytes: file.size,
              categoria: 'contrato',
            })
            const { data: signed } = await supabase.storage
              .from('contratos-anexos')
              .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
            linkClicksignFinal = signed?.signedUrl ?? null
          } else {
            console.error('Falha ao subir arquivo Clicksign:', upErr.message)
          }
        }

        if (linkClicksignFinal) {
          // Contrato assinado (Clicksign anexado) → ativa automaticamente.
          // O e-mail de aviso ao Bruno é disparado por um trigger no banco quando
          // o link do Clicksign passa a existir — não precisa chamar aqui.
          await supabase.from('contratos')
            .update({ link_clicksign: linkClicksignFinal, status: 'ativo', status_secundario: 'ATIVO' })
            .eq('id', novoContratoId)
        }
      }

      if (novoContratoId) {
        if (typeof window !== 'undefined') {
          const ok = confirm(
            `Rascunho de contrato criado para ${client.nome}.\n\n` +
            `Quer abrir agora pra revisar?`,
          )
          if (ok) window.open(`/contratos/${novoContratoId}`, '_blank')
        }
      }
    } catch (err) {
      console.error('Erro ao criar rascunho de contrato:', err)
    }

    // Marca a venda como concluída ao criar o cliente
    if (vendaData?.id) {
      ;(supabase as any)
        .from('vendas_pendentes')
        .update({ status: 'concluida', atualizado_em: new Date().toISOString() })
        .eq('id', vendaData.id)
        .then(() => {})
        .catch(() => {})
    }

    setShowCreateForm(false)
    setExtractedData(null)
    queryClient.invalidateQueries({ queryKey: ['client'] })
    queryClient.invalidateQueries({ queryKey: ['comissoes'] })
    queryClient.invalidateQueries({ queryKey: ['vendas-pendentes'] })
  }, [contact.id, contact.numero_whatsapp, updateContact, queryClient, extractedData, vendaData])

  // Auto-fetch profile pic when contact has no photo
  useEffect(() => {
    if (!contact.foto_url && contact.id && !fetchPicMutation.isPending) {
      fetchPicMutation.mutate(contact.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id])

  return (
    <div className="relative flex w-full sm:w-80 shrink-0 flex-col border-l border-border bg-card/50 backdrop-blur-sm h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Detalhes do contato</h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact info */}
        <div className="px-3 sm:px-4 py-5 space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              {contact.foto_url && !imgFailed ? (
                <img
                  src={contact.foto_url}
                  alt={contact.nome ?? ''}
                  className="h-16 w-16 rounded-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-muted text-primary font-bold text-xl">
                  {(contact.nome ?? formatPhone(contact.numero_whatsapp)).slice(0, 2).toUpperCase()}
                </div>
              )}
              {/* Refresh photo button */}
              <button
                onClick={() => fetchPicMutation.mutate(contact.id)}
                disabled={fetchPicMutation.isPending}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                title="Atualizar foto de perfil"
              >
                <RefreshCw className={cn('h-3 w-3', fetchPicMutation.isPending && 'animate-spin')} />
              </button>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                {linkedClient?.nome ?? contact.nome ?? 'Sem nome'}
              </p>
              {linkedClient?.nome && contact.nome && contact.nome !== linkedClient.nome && (
                <p className="text-2xs text-muted-foreground mt-0.5">{contact.nome}</p>
              )}
              {fetchPicMutation.isPending && (
                <p className="text-2xs text-muted-foreground mt-0.5">Buscando foto...</p>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground tabular-nums">{formatPhone(contact.numero_whatsapp)}</span>
          </div>

        </div>

        {vendaData && !linkedClient && !linkingClient && (
          <div className="mx-3 sm:mx-4 mb-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-xs font-semibold text-primary">Venda encontrada</p>
            <p className="text-2xs text-muted-foreground mt-0.5 truncate">
              {vendaData.produto_nome ?? '—'}
              {vendaData.valor_total_venda != null && ` · R$ ${Number(vendaData.valor_total_venda).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </p>
          </div>
        )}

        {/* Group members */}
        {isGroup && (
          <GroupMembersSection contactId={contact.id} />
        )}

        {/* Linked client */}
        <div className="border-t border-border px-3 sm:px-4 py-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
            Cliente
          </h4>

          {/* Current linked client info */}
          {linkedClient && !linkingClient && (
            <div className="relative rounded-lg border border-border p-3 space-y-1">
              {canAssign && (
                <button
                  onClick={() => setLinkingClient(true)}
                  className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Alterar cliente"
                >
                  <Link2 className="h-3 w-3" />
                </button>
              )}
              <div className="flex items-center gap-2 pr-6">
                <Building className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">{linkedClient.nome}</span>
              </div>
              {linkedClient.email && (
                <p className="text-2xs text-muted-foreground pl-6 truncate">{linkedClient.email}</p>
              )}
              {linkedClient.telefone && (
                <p className="text-2xs text-muted-foreground pl-6">{linkedClient.telefone}</p>
              )}
              {linkedClient.segmento && (
                <span className="inline-block text-2xs bg-muted rounded-full px-2 py-0.5 text-muted-foreground ml-6 mt-1">
                  {linkedClient.segmento}
                </span>
              )}
            </div>
          )}

          {!linkedClient && !linkingClient && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Nenhum cliente vinculado.</p>
              {canAssign && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setLinkingClient(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Vincular cliente existente
                  </button>
                  {!showCreateForm && (
                    <button
                      onClick={handleExtractClientData}
                      disabled={extracting}
                      className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Extraindo dados com IA, aguarde…
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5" />
                          Cadastrar novo cliente
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Link client form */}
          {linkingClient && (
            <div className="space-y-1">
              <input
                autoFocus
                type="text"
                placeholder="Buscar cliente ou contrato..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                <button
                  className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    updateContact.mutate(
                      { id: contact.id, client_id: null },
                      { onSuccess: () => { setLinkingClient(false); setClientSearch('') } },
                    )
                  }}
                >
                  Sem cliente
                </button>
                {availableClients
                  .filter((c) => !clientSearch.trim() || c.nome.toLowerCase().includes(clientSearch.toLowerCase()))
                  .slice(0, 50)
                  .map((c) => (
                    <button
                      key={c.id}
                      disabled={updateContact.isPending}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-50"
                      onClick={() => {
                        updateContact.mutate(
                          { id: contact.id, client_id: c.id },
                          { onSuccess: () => { setLinkingClient(false); setClientSearch('') } },
                        )
                      }}
                    >
                      {c.nome}
                    </button>
                  ))}
                {availableClients.filter((c) => !clientSearch.trim() || c.nome.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                )}
              </div>
              <button
                onClick={() => { setLinkingClient(false); setClientSearch('') }}
                className="text-2xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Mídia & Documentos */}
        <MediaSection conversationId={currentConversationId} />

        {/* Detalhes do WhatsApp (link discreto) */}
        {instanceId && (
          <div className="border-t border-border px-3 sm:px-4 py-3">
            <button
              onClick={() => {
                chatDetailsMutation.mutate(
                  { instance_id: instanceId, number: contact.numero_whatsapp },
                  { onSuccess: (data) => setDetailsData(data) },
                )
              }}
              disabled={chatDetailsMutation.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-2xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Info className="h-3 w-3" />
              {chatDetailsMutation.isPending ? 'Carregando...' : 'Ver detalhes do WhatsApp'}
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp Details Overlay */}
      {detailsData && (
        <ChatDetailsOverlay details={detailsData} onClose={() => setDetailsData(null)} />
      )}

      {/* Create Client Form Overlay */}
      {showCreateForm && (
        <div className="absolute inset-0 z-20 flex flex-col bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Cadastrar novo cliente</h3>
            </div>
            <button
              onClick={() => { setShowCreateForm(false); setExtractedData(null) }}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ClienteForm
              initial={{
                ...(extractedData ?? {}),
                whatsapp: extractedData?.whatsapp || contact.numero_whatsapp || '',
              }}
              onClose={() => { setShowCreateForm(false); setExtractedData(null) }}
              onCreated={handleClientCreated}
              showClicksignField
              initialProdutoIds={vendaData?.produto_id ? [vendaData.produto_id] : undefined}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Group Members Section ─────────────────────────────────────────────────────

function GroupMembersSection({ contactId }: { contactId: string }) {
  const { data: members = [], isLoading } = useGroupMembers(contactId)
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border-t border-border px-3 sm:px-4 py-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between mb-2.5"
      >
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Membros {members.length > 0 && `(${members.length})`}
        </h4>
        <span className="text-2xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <>
          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando membros...
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              Nenhum membro encontrado. Reabra o painel para atualizar.
            </p>
          ) : (
            <div className="space-y-1">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary text-xs font-semibold">
                    {(member.nome ?? member.numero_whatsapp).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                      {member.nome ?? formatPhone(member.numero_whatsapp)}
                    </p>
                    {member.nome && (
                      <p className="text-2xs text-muted-foreground font-mono truncate">
                        {formatPhone(member.numero_whatsapp)}
                      </p>
                    )}
                  </div>
                  {(member.is_admin || member.is_super_admin) && (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" title={member.is_super_admin ? 'Super Admin' : 'Admin'} />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Media Section ─────────────────────────────────────────────────────────────

const MEDIA_TABS = [
  { key: 'imagem', label: 'Imagens', icon: ImageIcon, types: ['imagem', 'image', 'sticker'] },
  { key: 'video', label: 'Vídeos', icon: Film, types: ['video'] },
  { key: 'audio', label: 'Áudios', icon: Mic, types: ['audio'] },
  { key: 'documento', label: 'Documentos', icon: FileText, types: ['documento', 'document'] },
] as const

function MediaSection({ conversationId }: { conversationId: string }) {
  const { data: messages = [] } = useMessages(conversationId)
  const [activeTab, setActiveTab] = useState<typeof MEDIA_TABS[number]['key']>('imagem')

  const mediaMessages = (messages as ChatMessage[]).filter(
    m => m.media_url && MEDIA_TYPES.includes(m.tipo as typeof MEDIA_TYPES[number]),
  )

  if (mediaMessages.length === 0) return null

  const grouped = MEDIA_TABS.reduce<Record<string, ChatMessage[]>>((acc, tab) => {
    acc[tab.key] = mediaMessages.filter(m => (tab.types as readonly string[]).includes(m.tipo))
    return acc
  }, {})

  const items = grouped[activeTab] ?? []

  return (
    <div className="border-t border-border px-3 sm:px-4 py-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
        Mídia & arquivos
      </h4>
      <div className="flex gap-1 mb-2">
        {MEDIA_TABS.map(tab => {
          const Icon = tab.icon
          const count = grouped[tab.key]?.length ?? 0
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              disabled={count === 0}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-2xs font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent',
              )}
              title={tab.label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className="text-2xs text-muted-foreground text-center py-3">Nenhum item nesta categoria</p>
      ) : activeTab === 'imagem' ? (
        <div className="grid grid-cols-3 gap-1">
          {items.slice(0, 9).map(m => (
            <a
              key={m.id}
              href={m.media_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition-opacity"
            >
              <img src={m.media_url ?? ''} alt="" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 8).map(m => (
            <a
              key={m.id}
              href={m.media_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">
                {m.conteudo || new Date(m.criado_em).toLocaleDateString('pt-BR')}
              </span>
            </a>
          ))}
        </div>
      )}

      {items.length > (activeTab === 'imagem' ? 9 : 8) && (
        <p className="text-2xs text-muted-foreground text-center mt-2">
          +{items.length - (activeTab === 'imagem' ? 9 : 8)} a mais
        </p>
      )}
    </div>
  )
}

