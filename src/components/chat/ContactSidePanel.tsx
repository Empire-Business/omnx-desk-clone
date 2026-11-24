import { tenantDaSessao } from '@/lib/authTenant'
import { useEffect, useState, useCallback } from 'react'
import { X, Phone, Building, RefreshCw, Info, Link2, UserPlus, Loader2, Users, ShieldCheck, FileText, ImageIcon, Mic, Film, Download, ArrowLeft, ChevronDown } from 'lucide-react'
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
import { ListaTicketsDoCliente } from './TicketsDoCliente'
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

      const { data: novoContrato } = await supabase.from('contratos').insert({ ...({
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
      }), tenant_id: await tenantDaSessao() }).select('id').single()
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
              await supabase.from('contrato_anexos').insert({ ...({
                contrato_id: novoContratoId,
                nome_original: comp.nome_original,
                storage_path: storagePath,
                mime_type: comp.mime_type ?? null,
                tamanho_bytes: comp.tamanho_bytes ?? null,
                categoria: 'comprovante_entrada',
              }), tenant_id: await tenantDaSessao() })
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
            await supabase.from('contrato_anexos').insert({ ...({
              contrato_id: novoContratoId,
              nome_original: file.name,
              storage_path: storagePath,
              mime_type: file.type,
              tamanho_bytes: file.size,
              categoria: 'contrato',
            }), tenant_id: await tenantDaSessao() })
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
    <div className="relative flex h-full w-full min-w-0 flex-col bg-card overflow-hidden">
      {/* Cabeçalho: no celular é a 3ª etapa (lista → conversa → detalhes), com "voltar" */}
      <div className="safe-area-top flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1.5 md:px-4 md:py-2">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-icon md:hidden"
          aria-label="Voltar para a conversa"
          title="Voltar"
        >
          <ArrowLeft aria-hidden />
        </button>
        <h3 className="t-h5 m-0 min-w-0 flex-1 truncate">Detalhes do contato</h3>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-icon btn-sm hidden md:inline-flex"
          aria-label="Fechar detalhes do contato"
          title="Fechar"
        >
          <X aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain safe-area-bottom">
        {/* Contact info */}
        <div className="px-4 py-5 space-y-4">
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
                <div className="av !h-16 !w-16 text-xl" data-h="0" aria-hidden>
                  {(contact.nome ?? formatPhone(contact.numero_whatsapp)).slice(0, 2).toUpperCase()}
                </div>
              )}
              {/* Refresh photo button */}
              <button
                type="button"
                onClick={() => fetchPicMutation.mutate(contact.id)}
                disabled={fetchPicMutation.isPending}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card ring-hairline text-muted-foreground hover:text-foreground hover:bg-accent transition-[opacity,background-color] duration-fast opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 focus-ds"
                title="Atualizar foto de perfil"
                aria-label="Atualizar foto de perfil"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', fetchPicMutation.isPending && 'animate-spin')} aria-hidden />
              </button>
            </div>
            <div className="text-center min-w-0 max-w-full">
              <p className="text-[15px] font-[650] text-foreground break-words">
                {linkedClient?.nome ?? contact.nome ?? 'Sem nome'}
              </p>
              {linkedClient?.nome && contact.nome && contact.nome !== linkedClient.nome && (
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{contact.nome}</p>
              )}
              {fetchPicMutation.isPending && (
                <p className="text-[12px] text-muted-foreground mt-0.5">Buscando foto…</p>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2.5 rounded-lg bg-bg-1 ring-hairline px-3 py-2.5">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <span className="mono text-sm text-foreground">{formatPhone(contact.numero_whatsapp)}</span>
          </div>

        </div>

        {vendaData && !linkedClient && !linkingClient && (
          <div className="mx-4 mb-4 rounded-lg bg-primary-light px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_14%,transparent)]">
            <p className="text-[12.5px] font-semibold text-link">Venda encontrada</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
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
        <div className="border-t border-stroke-weak px-4 py-4">
          <h4 className="text-[12px] font-[650] tracking-[.02em] text-muted-foreground mb-2.5">
            Cliente
          </h4>

          {/* Current linked client info */}
          {linkedClient && !linkingClient && (
            <div className="relative rounded-lg bg-card ring-hairline p-3 space-y-1">
              {canAssign && (
                <button
                  type="button"
                  onClick={() => setLinkingClient(true)}
                  className="btn btn-ghost btn-icon btn-sm absolute top-1.5 right-1.5"
                  title="Alterar cliente"
                  aria-label="Alterar cliente vinculado"
                >
                  <Link2 aria-hidden />
                </button>
              )}
              <div className="flex items-center gap-2 pr-9">
                <Building className="h-4 w-4 text-link shrink-0" aria-hidden />
                <span className="text-sm font-semibold text-foreground truncate">{linkedClient.nome}</span>
              </div>
              {linkedClient.email && (
                <p className="text-[12.5px] text-muted-foreground pl-6 truncate">{linkedClient.email}</p>
              )}
              {linkedClient.telefone && (
                <p className="mono text-[12px] text-muted-foreground pl-6">{linkedClient.telefone}</p>
              )}
              {linkedClient.segmento && (
                <span className="tag ml-6 mt-1">
                  {linkedClient.segmento}
                </span>
              )}
            </div>
          )}

          {!linkedClient && !linkingClient && (
            <div className="space-y-2">
              <p className="text-[13px] text-muted-foreground">Nenhum cliente vinculado.</p>
              {canAssign && (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLinkingClient(true)}
                    className="btn btn-secondary w-full"
                  >
                    <Link2 aria-hidden />
                    Vincular cliente existente
                  </button>
                  {!showCreateForm && (
                    <button
                      type="button"
                      onClick={handleExtractClientData}
                      disabled={extracting}
                      aria-busy={extracting}
                      className="btn btn-iris w-full"
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Lendo a conversa com IA…
                        </>
                      ) : (
                        <>
                          <UserPlus aria-hidden />
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
            <div className="space-y-1.5">
              <input
                autoFocus
                type="text"
                placeholder="Buscar cliente ou contrato…"
                aria-label="Buscar cliente"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="input"
              />
              <div className="max-h-[min(12rem,40dvh)] overflow-y-auto rounded-lg bg-card ring-hairline">
                <button
                  type="button"
                  className="w-full min-h-11 sm:min-h-9 px-3 py-2 text-left text-[13px] text-muted-foreground hover:bg-accent transition-colors duration-fast"
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
                      type="button"
                      key={c.id}
                      disabled={updateContact.isPending}
                      className="w-full min-h-11 sm:min-h-9 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent transition-colors duration-fast disabled:opacity-50"
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
                  <p className="px-3 py-2 text-[13px] text-muted-foreground">Nenhum cliente encontrado.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setLinkingClient(false); setClientSearch('') }}
                className="btn btn-ghost btn-sm"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Tickets do cliente vinculado */}
        <ListaTicketsDoCliente clienteId={contact.client_id} />

        {/* Mídia & Documentos */}
        <MediaSection conversationId={currentConversationId} />

        {/* Detalhes do WhatsApp (link discreto) */}
        {instanceId && (
          <div className="border-t border-stroke-weak px-4 py-3">
            <button
              type="button"
              onClick={() => {
                chatDetailsMutation.mutate(
                  { instance_id: instanceId, number: contact.numero_whatsapp },
                  { onSuccess: (data) => setDetailsData(data) },
                )
              }}
              disabled={chatDetailsMutation.isPending}
              className="btn btn-ghost btn-sm w-full text-muted-foreground"
            >
              <Info aria-hidden />
              {chatDetailsMutation.isPending ? 'Carregando…' : 'Ver detalhes do WhatsApp'}
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
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <UserPlus className="h-4 w-4 shrink-0 text-link" aria-hidden />
              <h3 className="t-h5 m-0 truncate">Cadastrar novo cliente</h3>
            </div>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setExtractedData(null) }}
              className="btn btn-ghost btn-icon btn-sm"
              aria-label="Fechar cadastro"
            >
              <X aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
    <div className="border-t border-stroke-weak px-4 py-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full min-h-9 flex items-center justify-between mb-1.5 rounded-md focus-ds"
      >
        <h4 className="text-[12px] font-[650] tracking-[.02em] text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Membros
          {members.length > 0 && <span className="count">{members.length}</span>}
        </h4>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-fast', expanded && 'rotate-180')} aria-hidden />
      </button>

      {expanded && (
        <>
          {isLoading ? (
            <div className="space-y-2 py-1" aria-busy="true" aria-label="Carregando membros">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5 px-2">
                  <div className="sk h-7 w-7 rounded-full" />
                  <div className="sk h-3 flex-1 max-w-[60%]" />
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-1">
              Nenhum membro encontrado. Reabra o painel para atualizar.
            </p>
          ) : (
            <div className="space-y-0.5">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent transition-colors duration-fast">
                  <div className="av !h-7 !w-7 text-[11px]" data-h="0" aria-hidden>
                    {(member.nome ?? member.numero_whatsapp).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {member.nome ?? formatPhone(member.numero_whatsapp)}
                    </p>
                    {member.nome && (
                      <p className="mono text-[11.5px] text-muted-foreground truncate">
                        {formatPhone(member.numero_whatsapp)}
                      </p>
                    )}
                  </div>
                  {(member.is_admin || member.is_super_admin) && (
                    <span title={member.is_super_admin ? 'Administrador principal' : 'Administrador'}><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-link" aria-label={member.is_super_admin ? 'Administrador principal' : 'Administrador'} /></span>
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
    <div className="border-t border-stroke-weak px-4 py-4">
      <h4 className="text-[12px] font-[650] tracking-[.02em] text-muted-foreground mb-2.5">
        Mídia e arquivos
      </h4>
      <div className="seg mb-2 w-full" role="group" aria-label="Tipo de mídia">
        {MEDIA_TABS.map(tab => {
          const Icon = tab.icon
          const count = grouped[tab.key]?.length ?? 0
          const active = activeTab === tab.key
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              disabled={count === 0}
              aria-pressed={active}
              aria-label={`${tab.label}: ${count}`}
              className="!flex-1 justify-center disabled:opacity-40"
              title={tab.label}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="mono text-[12px]">{count}</span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground text-center py-3">Nenhum item nesta categoria</p>
      ) : activeTab === 'imagem' ? (
        <div className="grid grid-cols-3 gap-1">
          {items.slice(0, 9).map(m => (
            <a
              key={m.id}
              href={m.media_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-square rounded-md overflow-hidden bg-bg-2 hover:opacity-80 transition-opacity duration-fast focus-ds"
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
              className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-accent transition-colors duration-fast focus-ds"
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
        <p className="text-[12px] text-muted-foreground text-center mt-2">
          +{items.length - (activeTab === 'imagem' ? 9 : 8)} a mais
        </p>
      )}
    </div>
  )
}

