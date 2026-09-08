import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SUPABASE_URL } from '@/integrations/supabase/client'
import { useMyInstanceIds } from '@/hooks/useUsers'
import { useAuth } from '@/contexts/AuthContext'

// ─── Auth helper: returns current access token (no refresh to avoid race conditions) ─

async function getFreshToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data?.session?.access_token) {
    // Check if token is still valid (with 60s buffer)
    const expiresAt = data.session.expires_at ?? 0
    if (expiresAt * 1000 > Date.now() + 60_000) {
      return data.session.access_token
    }
    // Token expired or about to expire — try refresh
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (error) console.warn('Token refresh failed:', error.message)
    if (refreshed?.session?.access_token) return refreshed.session.access_token
    // Fallback: return expired token anyway (verify_jwt:false functions still validate internally)
    return data.session.access_token
  }

  // No cached session at all
  const { data: refreshed } = await supabase.auth.refreshSession()
  if (refreshed?.session?.access_token) return refreshed.session.access_token

  throw new Error('Sessão expirada. Faça login novamente.')
}

// ─── Local domain types ───────────────────────────────────────────────────────

export interface WaInstance {
  id: string
  nome: string
  numero_whatsapp: string | null
  instance_id: string
  status: 'conectado' | 'desconectado' | 'aguardando_qr' | 'banido'
  categoria: 'suporte' | 'financeiro' | 'entrega' | null
  cor: string | null
  ativo: boolean
  criado_em: string
  ocultar_grupos: boolean
}

export interface ChatDepartment {
  id: string
  nome: string
  instance_id: string | null
  distribuicao: string
  sla_primeira_resposta_minutos: number
  sla_resolucao_horas: number
  mensagem_boas_vindas: string | null
  ativo: boolean
  horario_inicio: string | null
  horario_fim: string | null
  dias_atendimento: number[] | null
  mensagem_fora_horario: string | null
  modulo_acesso: string | null
}

export interface DeptInstanceAssignment {
  id: string
  department_id: string
  instance_id: string
  whatsapp_instances: Pick<WaInstance, 'id' | 'nome' | 'numero_whatsapp' | 'instance_id' | 'categoria' | 'cor' | 'ocultar_grupos'> | null
}

export interface ChatContact {
  id: string
  instance_id: string
  numero_whatsapp: string
  nome: string | null
  foto_url: string | null
  client_id: string | null
  group_size: number | null
}

export interface ChatConversation {
  id: string
  instance_id: string
  contact_id: string
  department_id: string | null
  agente_id: string | null
  status: 'aberta' | 'em_atendimento' | 'aguardando' | 'encerrada'
  protocolo: string
  criado_em: string
  atualizado_em: string
  sla_primeira_resposta_violado: boolean
  sla_resolucao_violado: boolean
  primeira_resposta_em: string | null
  encerrada_em: string | null
  sentimento: 'positivo' | 'neutro' | 'negativo' | null
  is_group: boolean
  silenciado: boolean
  arquivada: boolean
  resumo_ia: string | null
  automacao_pausada_ate: string | null
  aguardando_resposta: boolean
  ultima_msg_cliente_em: string | null
}

export interface MessageReaction {
  emoji: string
  from: string
  from_me: boolean
}

export interface ChatMessage {
  id: string
  conversation_id: string
  message_id_wpp?: string | null
  tipo: string
  conteudo: string | null
  media_url: string | null
  enviado_por_agente: boolean
  enviado_por_ia: boolean
  agente_id: string | null
  agente?: { id: string; nome: string; perfil?: string } | null
  lida: boolean
  status_envio?: string | null
  reactions?: MessageReaction[]
  fonte_envio?: string | null
  reply_to_id?: string | null
  replied_message?: {
    id: string
    conteudo: string | null
    tipo: string
    enviado_por_agente: boolean
    enviado_por_ia: boolean
    agente?: { id: string; nome: string } | null
  } | null
  criado_em: string
}

export interface QuickReply {
  id: string
  titulo: string
  conteudo: string
  atalho: string | null
  categoria: string
  criado_em: string
}

export interface ChatCsat {
  id: string
  conversation_id: string
  contact_id: string
  nota: number | null
  comentario: string | null
  enviado_em: string
  respondido_em: string | null
}

export interface ConversationWithContact extends ChatConversation {
  chat_contacts: ChatContact
  chat_departments: ChatDepartment | null
  whatsapp_instances: Pick<WaInstance, 'id' | 'nome' | 'numero_whatsapp' | 'instance_id' | 'categoria' | 'cor' | 'ocultar_grupos'> | null
  users: { id: string; nome: string } | null
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const chatKeys = {
  all: ['chat'] as const,
  instances: () => ['chat', 'instances'] as const,
  instance: (id: string) => ['chat', 'instances', id] as const,
  departments: (instanceId?: string) => ['chat', 'departments', instanceId ?? 'all'] as const,
  contacts: (filter?: { search?: string; tag?: string }) =>
    ['chat', 'contacts', filter ?? {}] as const,
  conversations: (filter?: { status?: string; agente_id?: string; department_id?: string; instance_ids?: string[] | null; current_user_id?: string | null }) =>
    ['chat', 'conversations', filter ?? {}] as const,
  conversation: (id: string) => ['chat', 'conversations', id] as const,
  messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
  csat: () => ['chat', 'csat'] as const,
  contactClientLinks: () => ['chat', 'contact-client-links'] as const,
}

// ─── Instances ────────────────────────────────────────────────────────────────

/** Fetch instances — filtered by user's assigned instances (admin/gerente see all) */
export function useInstances(allowedInstanceIds?: string[] | null) {
  return useQuery({
    queryKey: [...chatKeys.instances(), allowedInstanceIds ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('whatsapp_instances')
        .select('*')
        .order('nome')

      // If allowedInstanceIds is an array (non-admin), filter
      if (Array.isArray(allowedInstanceIds) && allowedInstanceIds.length > 0) {
        query = query.in('id', allowedInstanceIds)
      } else if (Array.isArray(allowedInstanceIds) && allowedInstanceIds.length === 0) {
        // User has no instances assigned — return empty
        return [] as WaInstance[]
      }
      // null = admin, no filter

      const { data, error } = await query
      if (error) throw error
      return data as WaInstance[]
    },
  })
}

export function useInstance(id: string) {
  return useQuery({
    queryKey: chatKeys.instance(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as WaInstance
    },
    enabled: Boolean(id),
  })
}

// ─── Departments ──────────────────────────────────────────────────────────────

export function useDepartments(instanceId?: string) {
  return useQuery({
    queryKey: chatKeys.departments(instanceId),
    queryFn: async () => {
      let query = supabase.from('chat_departments').select('*').order('nome')
      if (instanceId) {
        query = query.eq('instance_id', instanceId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as ChatDepartment[]
    },
  })
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function useConversations(filter?: {
  status?: string
  agente_id?: string
  department_id?: string
  instance_ids?: string[] | null
  current_user_id?: string | null
  sem_agente?: boolean
  /** Quando true, NÃO esconde grupos de instâncias com ocultar_grupos (usado na aba "Todos"). */
  incluir_grupos_ocultos?: boolean
}) {
  return useQuery({
    queryKey: chatKeys.conversations(filter),
    queryFn: async () => {
      const selectClause = '*, chat_contacts(*), chat_departments(id,nome), whatsapp_instances(id,nome,numero_whatsapp,instance_id,categoria,cor,ocultar_grupos), users!chat_conversations_agente_id_fkey(id,nome,perfil)'

      let query = supabase
        .from('chat_conversations')
        .select(selectClause)
        .order('atualizado_em', { ascending: false })

      if (filter?.status) {
        query = query.eq('status', filter.status)
      }
      if (filter?.agente_id) {
        query = query.eq('agente_id', filter.agente_id)
      }
      if (filter?.sem_agente) {
        query = query.is('agente_id', null)
      }
      if (filter?.department_id) {
        query = query.eq('department_id', filter.department_id)
      }

      // For instance-filtered users: use .or() to also include conversations assigned to them
      const hasInstanceFilter = Array.isArray(filter?.instance_ids)
      const userId = filter?.current_user_id

      if (hasInstanceFilter) {
        if (filter!.instance_ids!.length === 0 && !userId) return [] as ConversationWithContact[]

        const conditions: string[] = []
        if (filter!.instance_ids!.length > 0) {
          conditions.push(`instance_id.in.(${filter!.instance_ids!.join(',')})`)
        }
        if (userId) {
          conditions.push(`agente_id.eq.${userId}`)
        }
        if (conditions.length > 0) {
          query = query.or(conditions.join(','))
        }
      }

      // RLS handles client filtering for estrategista — no frontend filter needed

      const { data, error } = await query
      if (error) throw error

      // Esconde grupos de instâncias com ocultar_grupos = true,
      // exceto quando a aba "Todos" pede explicitamente para incluí-los.
      if (filter?.incluir_grupos_ocultos) {
        return data as ConversationWithContact[]
      }
      const filtered = (data as ConversationWithContact[]).filter(c =>
        !c.is_group || !c.whatsapp_instances?.ocultar_grupos
      )
      return filtered
    },
  })
}

/** Fetch all contact↔client links from the junction table (supports groups with multiple clients) */
export function useContactClientLinks() {
  return useQuery({
    queryKey: chatKeys.contactClientLinks(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_contact_clients')
        .select('contact_id, client_id')
      if (error) throw error
      // Build a Map: contact_id → client_id[]
      const map = new Map<string, string[]>()
      for (const row of data) {
        const arr = map.get(row.contact_id)
        if (arr) arr.push(row.client_id)
        else map.set(row.contact_id, [row.client_id])
      }
      return map
    },
  })
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*, chat_contacts(*), chat_departments(id,nome), whatsapp_instances(id,nome,numero_whatsapp,instance_id,categoria,cor), users!chat_conversations_agente_id_fkey(id,nome), chat_messages(*, agente:users!chat_messages_agente_id_fkey(id, nome, perfil))')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as ConversationWithContact & { chat_messages: ChatMessage[] }
    },
    enabled: Boolean(id),
  })
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: chatKeys.messages(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, agente:users!chat_messages_agente_id_fkey(id, nome, perfil)')
        .eq('conversation_id', conversationId)
        .order('criado_em', { ascending: true })
      if (error) throw error

      // Hydrate replied_message from the same result set (self-reference)
      const messagesById = new Map((data as ChatMessage[]).map(m => [m.id, m]))
      for (const msg of data as ChatMessage[]) {
        if (msg.reply_to_id) {
          const parent = messagesById.get(msg.reply_to_id)
          if (parent) {
            msg.replied_message = {
              id: parent.id,
              conteudo: parent.conteudo,
              tipo: parent.tipo,
              enviado_por_agente: parent.enviado_por_agente,
              enviado_por_ia: parent.enviado_por_ia,
              agente: parent.agente ? { id: parent.agente.id, nome: parent.agente.nome } : null,
            }
          }
        }
      }

      return data as ChatMessage[]
    },
    enabled: Boolean(conversationId),
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAssignConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, agente_id }: { id: string; agente_id: string }) => {
      // Fetch current conversation to check if primeira_resposta_em is set
      const { data: current } = await supabase
        .from('chat_conversations')
        .select('primeira_resposta_em')
        .eq('id', id)
        .single()

      const updatePayload: Record<string, unknown> = {
        agente_id,
        status: 'em_atendimento',
        atualizado_em: new Date().toISOString(),
      }

      if (!current?.primeira_resposta_em) {
        updatePayload.primeira_resposta_em = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('chat_conversations')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()
      if (error) {
        console.error('[AssignConversation] Erro ao atribuir:', error)
        throw error
      }
      return data as ChatConversation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
    onError: (err) => {
      console.error('[AssignConversation] Mutation failed:', err)
    },
  })
}

export function usePauseAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number | null }) => {
      const automacao_pausada_ate = minutes
        ? new Date(Date.now() + minutes * 60_000).toISOString()
        : null
      const { data, error } = await supabase
        .from('chat_conversations')
        .update({ automacao_pausada_ate })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
  })
}

export function useCloseConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .update({
          status: 'encerrada',
          encerrada_em: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ChatConversation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      conversation_id,
      conteudo,
      tipo = 'texto',
      media_url,
      reply_to_id,
    }: {
      conversation_id: string
      conteudo: string
      tipo?: string
      media_url?: string
      reply_to_id?: string
    }) => {
      const supabaseUrl = SUPABASE_URL
      const token = await getFreshToken()

      const response = await fetch(`${supabaseUrl}/functions/v1/uazapi-send-message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id, conteudo, tipo, media_url, reply_to_id }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`Falha ao enviar mensagem: ${errorBody}`)
      }

      return response.json()
    },
    onMutate: async (variables) => {
      // Cancelar refetch em andamento
      await queryClient.cancelQueries({
        queryKey: chatKeys.messages(variables.conversation_id),
      })

      // Snapshot dos dados anteriores
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(
        chatKeys.messages(variables.conversation_id)
      )

      // Criar mensagem otimista
      const tempId = `temp-${Date.now()}`
      const optimisticMessage: ChatMessage = {
        id: tempId,
        conversation_id: variables.conversation_id,
        tipo: variables.tipo ?? 'texto',
        conteudo: variables.conteudo,
        media_url: variables.media_url ?? null,
        enviado_por_agente: true,
        enviado_por_ia: false,
        agente_id: user?.id ?? null,
        lida: true,
        status_envio: 'enviando',
        reply_to_id: variables.reply_to_id ?? null,
        criado_em: new Date().toISOString(),
      }

      // Atualizar cache com a mensagem otimista
      queryClient.setQueryData(
        chatKeys.messages(variables.conversation_id),
        (old?: ChatMessage[]) => (old ? [...old, optimisticMessage] : [optimisticMessage])
      )

      return { previousMessages }
    },
    onSuccess: (_data, variables) => {
      // Refetch para garantir dados atualizados com ID real
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(variables.conversation_id),
      })
    },
    onError: (_error, variables, context) => {
      // Restaurar dados anteriores em caso de erro
      if (context?.previousMessages) {
        queryClient.setQueryData(
          chatKeys.messages(variables.conversation_id),
          context.previousMessages
        )
      }
    },
  })
}

// ─── Quick Replies ───────────────────────────────────────────────────────────

export function useQuickReplies() {
  return useQuery({
    queryKey: ['chat', 'quick-replies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_quick_replies')
        .select('*')
        .order('categoria')
        .order('titulo')
      if (error) throw error
      return data as QuickReply[]
    },
  })
}

// ─── Internal Notes ──────────────────────────────────────────────────────────

export function useAddInternalNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      conversation_id,
      conteudo,
      agente_id,
    }: {
      conversation_id: string
      conteudo: string
      agente_id: string
    }) => {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id,
          tipo: 'nota_interna',
          conteudo,
          enviado_por_agente: true,
          enviado_por_ia: false,
          agente_id,
          lida: true,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(variables.conversation_id),
      })
    },
  })
}

export function useUpdateNoteContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, conteudo, conversation_id }: { id: string; conteudo: string; conversation_id: string }) => {
      const { error } = await supabase
        .from('chat_messages')
        .update({ conteudo })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// ─── Contact Conversations (side panel) ──────────────────────────────────────

export function useContactConversations(contactId: string) {
  return useQuery({
    queryKey: ['chat', 'contact-conversations', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id, protocolo, status, criado_em, encerrada_em')
        .eq('contact_id', contactId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: Boolean(contactId),
  })
}

// ─── Toggle Mute ─────────────────────────────────────────────────────────────

export function useToggleMute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, silenciado }: { id: string; silenciado: boolean }) => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .update({ silenciado: !silenciado })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ChatConversation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
  })
}

// ─── Conversation User Prefs (arquivada por usuário) ─────────────────────────

export interface ConvUserPref {
  conversation_id: string
  arquivada: boolean
  fixado: boolean
}

export function useConversationUserPrefs() {
  return useQuery({
    queryKey: ['chat', 'user-prefs'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return [] as ConvUserPref[]
      const { data, error } = await supabase
        .from('chat_conversation_user_prefs')
        .select('conversation_id, arquivada, fixado')
        .eq('user_id', user.id)
      if (error) throw error
      return (data ?? []) as ConvUserPref[]
    },
  })
}

export function useToggleArquivada() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, arquivada }: { id: string; arquivada: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('chat_conversation_user_prefs')
        .upsert(
          { user_id: user.id, conversation_id: id, arquivada: !arquivada },
          { onConflict: 'user_id,conversation_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'user-prefs'] })
    },
  })
}

/** Fixar/desafixar conversa no topo da lista (preferência por usuário) */
export function useToggleFixado() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fixado }: { id: string; fixado: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('chat_conversation_user_prefs')
        .upsert(
          { user_id: user.id, conversation_id: id, fixado: !fixado },
          { onConflict: 'user_id,conversation_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'user-prefs'] })
    },
  })
}

// ─── Change Conversation Instance ────────────────────────────────────────────

export function useChangeInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversation_id, new_instance_id }: { conversation_id: string; new_instance_id: string }) => {
      // 1. Get current conversation to find the contact number
      const { data: conv, error: convErr } = await supabase
        .from('chat_conversations')
        .select('contact_id, chat_contacts(numero_whatsapp, nome)')
        .eq('id', conversation_id)
        .single()
      if (convErr) throw convErr

      const contact = conv.chat_contacts as { numero_whatsapp: string; nome: string | null } | null
      if (!contact) throw new Error('Contato não encontrado')

      // 2. Upsert contact for the new instance
      const { data: newContact, error: contactErr } = await supabase
        .from('chat_contacts')
        .upsert(
          { instance_id: new_instance_id, numero_whatsapp: contact.numero_whatsapp, nome: contact.nome },
          { onConflict: 'instance_id,numero_whatsapp' },
        )
        .select()
        .single()
      if (contactErr) throw contactErr

      // 3. Update conversation to new instance + new contact
      const { data, error } = await supabase
        .from('chat_conversations')
        .update({ instance_id: new_instance_id, contact_id: newContact.id })
        .eq('id', conversation_id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(variables.conversation_id) })
    },
  })
}

// ─── Upload media to Supabase Storage ────────────────────────────────────────

export async function uploadChatMedia(file: File, conversationId: string) {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${conversationId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('chat-media')
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(data.path)
  return urlData.publicUrl
}

// ─── Group Members ───────────────────────────────────────────────────────────

export interface GroupMember {
  id: string
  contact_id: string
  numero_whatsapp: string
  nome: string | null
  is_admin: boolean
  is_super_admin: boolean
}

export function useGroupMembers(contactId: string | undefined) {
  return useQuery({
    queryKey: ['group_members', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_group_members')
        .select('*')
        .eq('contact_id', contactId!)
        .order('is_admin', { ascending: false })
        .order('nome', { ascending: true, nullsFirst: false })
      if (error) throw error
      const members = (data ?? []) as GroupMember[]

      // Enrich members without names from chat_contacts
      const withoutName = members.filter((m) => !m.nome)
      if (withoutName.length > 0) {
        const numbers = withoutName.map((m) => m.numero_whatsapp)
        const { data: contacts } = await supabase
          .from('chat_contacts')
          .select('numero_whatsapp, nome')
          .in('numero_whatsapp', numbers)
          .not('nome', 'is', null)
        if (contacts && contacts.length > 0) {
          const nameMap = new Map(contacts.map((c) => [c.numero_whatsapp, c.nome as string]))
          return members.map((m) => ({
            ...m,
            nome: m.nome ?? nameMap.get(m.numero_whatsapp) ?? null,
          }))
        }
      }
      return members
    },
    enabled: Boolean(contactId),
    staleTime: 1000 * 60 * 5,
  })
}

// ─── Fetch Profile Picture ──────────────────────────────────────────────────

export function useFetchProfilePic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contactId: string) => {
      const token = await getFreshToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-profile-pic`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contact_id: contactId }),
      })
      if (!res.ok) throw new Error('Falha ao buscar foto')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
  })
}

export function useFetchProfilePicBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contactIds: string[]) => {
      const token = await getFreshToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-profile-pic`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contact_ids: contactIds }),
      })
      if (!res.ok) throw new Error('Falha ao buscar fotos')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
    },
  })
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function useRealtimeMessages(conversationId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`chat_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Para INSERT: injeta a mensagem imediatamente no cache (sem round-trip)
          // Isso garante que a mensagem aparece ao mesmo tempo que o som toca
          if (payload.eventType === 'INSERT') {
            const newMsg = { ...(payload.new as ChatMessage), agente: null, replied_message: null }
            queryClient.setQueryData<ChatMessage[]>(
              chatKeys.messages(conversationId),
              (old) => {
                if (!old) return [newMsg]
                if (old.some((m) => m.id === newMsg.id)) return old
                return [...old, newMsg]
              },
            )
          }
          // Refetch em background para sincronizar joins (agente, etc.)
          queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}

// ─── Transfer Conversation ───────────────────────────────────────────────────

export function useTransferConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      agente_id,
      department_id,
    }: {
      id: string
      agente_id?: string | null
      department_id?: string | null
    }) => {
      const update: Record<string, unknown> = {
        atualizado_em: new Date().toISOString(),
      }
      if (agente_id !== undefined) update.agente_id = agente_id
      if (department_id !== undefined) update.department_id = department_id

      // Se tem agente → em_atendimento; se não tem agente → aberta (volta pra fila)
      if (agente_id) {
        update.status = 'em_atendimento'
      } else if (agente_id === null) {
        update.status = 'aberta'
      }

      const { data, error } = await supabase
        .from('chat_conversations')
        .update(update)
        .eq('id', id)
        .select()
        .single()
      if (error) {
        console.error('[TransferConversation] Erro ao transferir:', error)
        throw error
      }
      return data as ChatConversation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
    onError: (err) => {
      console.error('[TransferConversation] Mutation failed:', err)
    },
  })
}

// ─── Start Outbound Conversation ─────────────────────────────────────────────

// Nono dígito brasileiro: o número pode existir com o 9 (13 díg) ou sem (12 díg).
// Geramos as duas variações para reaproveitar o contato existente e não duplicar.
function waNumberVariants(numero: string): string[] {
  const d = numero.replace(/\D/g, '')
  const set = new Set<string>()
  if (d) set.add(d)
  if (d.startsWith('55') && d.length >= 12) {
    const ddd = d.slice(2, 4)
    const local = d.slice(4)
    if (local.length === 9 && local.startsWith('9')) {
      set.add(`55${ddd}${local.slice(1)}`) // sem o nono dígito
    } else if (local.length === 8) {
      set.add(`55${ddd}9${local}`) // com o nono dígito
    }
  }
  return [...set]
}

export function useStartConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      instance_id,
      numero_whatsapp,
      nome,
      conteudo,
      agente_id,
    }: {
      instance_id: string
      numero_whatsapp: string
      nome?: string
      conteudo: string
      agente_id?: string
    }) => {
      // Sanitize: keep only digits (DDI já tratado no chamador)
      const normalizedNumber = numero_whatsapp.replace(/\D/g, '')

      // 1. Resolve contact — considera o nono dígito (com/sem 9) para não duplicar
      const variants = waNumberVariants(normalizedNumber)
      let contact: { id: string; [k: string]: unknown } | null = null
      const { data: existing } = await supabase
        .from('chat_contacts')
        .select('*')
        .eq('instance_id', instance_id)
        .in('numero_whatsapp', variants)
        .order('criado_em', { ascending: true })
        .limit(1)
      if (existing && existing.length > 0) {
        contact = existing[0]
      } else {
        const { data: created, error: contactErr } = await supabase
          .from('chat_contacts')
          .upsert(
            { instance_id, numero_whatsapp: normalizedNumber, nome: nome ?? null },
            { onConflict: 'instance_id,numero_whatsapp' },
          )
          .select()
          .single()
        if (contactErr) throw contactErr
        contact = created
      }
      if (!contact) throw new Error('Não foi possível resolver o contato.')

      // 2. Check for existing active conversation with this contact
      const { data: existingConvs } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('contact_id', contact.id)
        .in('status', ['aberta', 'em_atendimento', 'aguardando'])
        .order('atualizado_em', { ascending: false })
        .limit(1)

      let conversation: ChatConversation

      if (existingConvs && existingConvs.length > 0) {
        // Reuse existing active conversation
        const existing = existingConvs[0]
        const updatePayload: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
        if (existing.status !== 'em_atendimento') updatePayload.status = 'em_atendimento'
        if (agente_id && !existing.agente_id) updatePayload.agente_id = agente_id
        if (Object.keys(updatePayload).length > 1) {
          const { data: updated, error: upErr } = await supabase
            .from('chat_conversations')
            .update(updatePayload)
            .eq('id', existing.id)
            .select()
            .single()
          if (upErr) throw upErr
          conversation = updated as ChatConversation
        } else {
          conversation = existing as ChatConversation
        }
      } else {
        // No active conversation — create new one
        const insertPayload: Record<string, unknown> = { instance_id, contact_id: contact.id, status: 'em_atendimento' }
        if (agente_id) insertPayload.agente_id = agente_id
        const { data: newConv, error: convErr } = await supabase
          .from('chat_conversations')
          .insert(insertPayload)
          .select()
          .single()
        if (convErr) throw convErr
        conversation = newConv as ChatConversation
      }

      // 3. Send message via edge function
      const supabaseUrl = SUPABASE_URL
      const token = await getFreshToken()

      const sendRes = await fetch(`${supabaseUrl}/functions/v1/uazapi-send-message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversation.id,
          conteudo,
          tipo: 'texto',
        }),
      })
      if (!sendRes.ok) {
        const errBody = await sendRes.json().catch(() => ({}))
        throw new Error(errBody?.error ?? `Falha ao enviar mensagem (${sendRes.status})`)
      }

      return conversation
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversation.id) })
    },
  })
}

// ─── Update Conversation Status (Kanban drag) ───────────────────────────────

export function useUpdateConversationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: ChatConversation['status']
    }) => {
      const update: Record<string, unknown> = {
        status,
        atualizado_em: new Date().toISOString(),
      }
      if (status === 'encerrada') {
        update.encerrada_em = new Date().toISOString()
      }
      const { data, error } = await supabase
        .from('chat_conversations')
        .update(update)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ChatConversation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
  })
}

// ─── Instance CRUD ────────────────────────────────────────────────────────────

export function useCreateInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      nome: string
      instance_id: string
      cor?: string | null
      ocultar_grupos?: boolean
    }) => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as WaInstance
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.instances() })
    },
  })
}

export function useUpdateInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<WaInstance> & { id: string }) => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as WaInstance
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.instances() })
      queryClient.invalidateQueries({ queryKey: chatKeys.instance(data.id) })
    },
  })
}

export function useDeleteInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whatsapp_instances').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.instances() })
    },
  })
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export function useContacts(filter?: { search?: string; tag?: string }) {
  return useQuery({
    queryKey: chatKeys.contacts(filter),
    queryFn: async () => {
      let query = supabase
        .from('chat_contacts')
        .select('*, clients:client_id(id, nome)')
        .order('nome', { ascending: true })

      if (filter?.search) {
        query = query.or(
          `nome.ilike.%${filter.search}%,numero_whatsapp.ilike.%${filter.search}%`,
        )
      }
      if (filter?.tag) {
        query = query.contains('tags', [filter.tag])
      }

      // RLS handles client filtering for estrategista — no frontend filter needed

      const { data, error } = await query
      if (error) throw error
      return data as (ChatContact & {
        tags?: string[]
        notas?: string
        criado_em?: string
        clients?: { id: string; nome: string } | null
      })[]
    },
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string
      nome?: string | null
      notas?: string | null
      tags?: string[]
      client_id?: string | null
    }) => {
      const { data, error } = await supabase
        .from('chat_contacts')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      // Sync junction table when client_id changes
      if ('client_id' in input) {
        if (input.client_id) {
          await supabase
            .from('chat_contact_clients')
            .upsert({ contact_id: id, client_id: input.client_id }, { onConflict: 'contact_id,client_id' })
        } else {
          // Removed client link — delete all junction entries for this contact
          await supabase
            .from('chat_contact_clients')
            .delete()
            .eq('contact_id', id)
        }
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
      queryClient.invalidateQueries({ queryKey: chatKeys.contactClientLinks() })
    },
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      instance_id: string
      numero_whatsapp: string
      nome?: string | null
      tags?: string[]
      notas?: string | null
    }) => {
      const { data, error } = await supabase
        .from('chat_contacts')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
    },
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chat_contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
    },
  })
}

export function useBulkDeleteContacts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('chat_contacts').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
    },
  })
}

export function useBulkUpdateContactTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, tags, action }: { ids: string[]; tags: string[]; action: 'add' | 'remove' }) => {
      // Fetch current contacts to merge tags
      const { data: contacts, error: fetchError } = await supabase
        .from('chat_contacts')
        .select('id, tags')
        .in('id', ids)
      if (fetchError) throw fetchError

      const updates = (contacts ?? []).map(c => {
        const current: string[] = c.tags ?? []
        const newTags = action === 'add'
          ? [...new Set([...current, ...tags])]
          : current.filter(t => !tags.includes(t))
        return supabase.from('chat_contacts').update({ tags: newTags }).eq('id', c.id)
      })
      await Promise.all(updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
    },
  })
}

/** Bulk update contacts' client_id (for linking contacts to a client) */
export function useBulkUpdateContactClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, client_id }: { ids: string[]; client_id: string | null }) => {
      const { error } = await supabase
        .from('chat_contacts')
        .update({ client_id })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] })
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
  })
}

// ─── Department CRUD ──────────────────────────────────────────────────────────

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<ChatDepartment, 'id'>) => {
      const { data, error } = await supabase
        .from('chat_departments')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as ChatDepartment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.departments() })
    },
  })
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ChatDepartment> & { id: string }) => {
      const { data, error } = await supabase
        .from('chat_departments')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ChatDepartment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.departments() })
    },
  })
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chat_departments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.departments() })
    },
  })
}

// ─── Department Instance Assignments ──────────────────────────────────────────

export function useDeptInstanceAssignments(departmentId?: string) {
  return useQuery({
    queryKey: ['chat', 'dept-instances', departmentId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('department_instance_assignments')
        .select('*, whatsapp_instances(id, nome, numero_whatsapp, instance_id, categoria, cor)')
        .order('criado_em', { ascending: false })
      if (departmentId) {
        query = query.eq('department_id', departmentId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as DeptInstanceAssignment[]
    },
  })
}

export function useAddDeptInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { department_id: string; instance_id: string }) => {
      const { data, error } = await supabase
        .from('department_instance_assignments')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-instances'] })
    },
  })
}

export function useRemoveDeptInstance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('department_instance_assignments')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-instances'] })
    },
  })
}

// ─── Department Agents ────────────────────────────────────────────────────────

export interface DeptAgentAssignment {
  id: string
  department_id: string
  user_id: string
  is_gerente: boolean
  criado_em: string
  users: { id: string; nome: string; perfil: string } | null
  chat_departments: { id: string; nome: string } | null
}

export function useDeptAgentAssignments(departmentId?: string) {
  return useQuery({
    queryKey: ['chat', 'dept-agents', departmentId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('chat_department_agents')
        .select('*, users(id, nome, perfil), chat_departments(id, nome)')
        .order('criado_em', { ascending: false })
      if (departmentId) {
        query = query.eq('department_id', departmentId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as DeptAgentAssignment[]
    },
  })
}

/** Fetch dept assignments for a specific user */
export function useDeptAgentAssignmentsByUser(userId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-agents-by-user', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_department_agents')
        .select('*, chat_departments(id, nome)')
        .eq('user_id', userId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as DeptAgentAssignment[]
    },
    enabled: Boolean(userId),
  })
}

export function useAddDeptAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { department_id: string; user_id: string; is_gerente?: boolean }) => {
      const { data, error } = await supabase
        .from('chat_department_agents')
        .upsert({ is_gerente: false, ...input }, { onConflict: 'department_id,user_id', ignoreDuplicates: true })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-agents'] })
    },
  })
}

export function useRemoveDeptAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('chat_department_agents')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-agents'] })
    },
  })
}

// ─── Dept Team Chat ──────────────────────────────────────────────────────────

export interface DeptTeamMessage {
  id: string
  department_id: string
  user_id: string
  conteudo: string
  criado_em: string
  users: { id: string; nome: string } | null
}

export function useDeptTeamMessages(deptId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-team-messages', deptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dept_team_messages' as never)
        .select('*, users(id, nome)')
        .eq('department_id', deptId)
        .order('criado_em', { ascending: true })
        .limit(200)
      if (error) throw error
      return data as DeptTeamMessage[]
    },
    enabled: Boolean(deptId),
  })
}

export function useSendDeptTeamMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ department_id, user_id, conteudo }: { department_id: string; user_id: string; conteudo: string }) => {
      const { data, error } = await supabase
        .from('dept_team_messages' as never)
        .insert({ department_id, user_id, conteudo })
        .select('*, users(id, nome)')
        .single()
      if (error) throw error
      return data as DeptTeamMessage
    },
    onSuccess: (msg: DeptTeamMessage) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-team-messages', msg.department_id] })
    },
  })
}

export function useRealtimeDeptTeamMessages(deptId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled || !deptId) return
    const channel = supabase
      .channel(`dept-team-${deptId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dept_team_messages',
        filter: `department_id=eq.${deptId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['chat', 'dept-team-messages', deptId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [deptId, enabled, queryClient])
}

// ─── Dept-specific dashboard hooks ───────────────────────────────────────────

/** Conversas sem agente no departamento (fila de espera) */
export function useDeptQueue(deptId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-queue', deptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*, chat_contacts(id, nome, numero_whatsapp, foto_url)')
        .eq('department_id', deptId)
        .is('agente_id', null)
        .neq('status', 'encerrada')
        .order('criado_em', { ascending: true })
      if (error) throw error
      return data as (ChatConversation & { chat_contacts: { id: string; nome: string | null; numero_whatsapp: string; foto_url: string | null } })[]
    },
    enabled: Boolean(deptId),
  })
}

/** Gera resumo IA para uma conversa e retorna o texto */
export function useSummarizeForQueue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const token = await getFreshToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ia-summarize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error')
        console.error('[IA Summarize] Error:', res.status, errText)
        throw new Error(`Falha ao resumir: ${res.status}`)
      }
      return res.json() as Promise<{ resumo: string; topico: string; pontos_chave: string[]; acoes_pendentes: string[] }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-queue'] })
      queryClient.invalidateQueries({ queryKey: ['chat', 'dept-active-convs'] })
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    },
    onError: (err) => {
      console.error('[IA Summarize] Mutation failed:', err)
    },
  })
}

/** Conversas com SLA violado no departamento */
export function useDeptSlaViolations(deptId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-sla-violations', deptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*, chat_contacts(id, nome, numero_whatsapp), users!chat_conversations_agente_id_fkey(id, nome)')
        .eq('department_id', deptId)
        .neq('status', 'encerrada')
        .or('sla_primeira_resposta_violado.eq.true,sla_resolucao_violado.eq.true')
        .order('criado_em', { ascending: true })
      if (error) throw error
      return data as (ChatConversation & {
        chat_contacts: { id: string; nome: string | null; numero_whatsapp: string }
        users: { id: string; nome: string } | null
      })[]
    },
    enabled: Boolean(deptId),
  })
}

/** Conversas encerradas hoje no departamento */
export function useDeptClosedToday(deptId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-closed-today', deptId],
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count, error } = await supabase
        .from('chat_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', deptId)
        .eq('status', 'encerrada')
        .gte('encerrada_em', today.toISOString())
      if (error) throw error
      return count ?? 0
    },
    enabled: Boolean(deptId),
  })
}

/** CSAT médio do departamento */
export function useDeptCsatAvg(deptId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-csat-avg', deptId],
    queryFn: async () => {
      // Get conversation IDs of this dept that have CSAT
      const { data: convIds } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('department_id', deptId)
      if (!convIds?.length) return null
      const ids = convIds.map(c => c.id)
      const { data, error } = await supabase
        .from('chat_csat')
        .select('nota')
        .in('conversation_id', ids)
        .not('nota', 'is', null)
      if (error) throw error
      if (!data?.length) return null
      const avg = data.reduce((s, r) => s + (r.nota ?? 0), 0) / data.length
      return Math.round(avg * 10) / 10
    },
    enabled: Boolean(deptId),
  })
}

/** Client assignments for a list of user IDs (Estrategista dept) */
export function useDeptClientAssignments(userIds: string[]) {
  return useQuery({
    queryKey: ['chat', 'dept-client-assignments', userIds.sort().join(',')],
    queryFn: async () => {
      if (!userIds.length) return []
      const { data, error } = await supabase
        .from('client_assignments')
        .select('*, users(id, nome), clients(id, nome, ativo)')
        .in('user_id', userIds)
        .eq('ativo', true)
      if (error) throw error
      return data as {
        id: string; user_id: string; client_id: string; tipo: string
        users: { id: string; nome: string } | null
        clients: { id: string; nome: string; ativo: boolean } | null
      }[]
    },
    enabled: userIds.length > 0,
  })
}

/** Entregas aguardando aprovação por responsáveis do departamento */
export function useDeptPendingDeliveries(userIds: string[]) {
  return useQuery({
    queryKey: ['chat', 'dept-pending-deliveries', userIds.sort().join(',')],
    queryFn: async () => {
      if (!userIds.length) return []
      const { data, error } = await supabase
        .from('deliveries')
        .select('*, clients(id, nome), deliverables(id, nome, tipo), users(id, nome)')
        .in('responsavel_id', userIds)
        .eq('status', 'aguardando_aprovacao')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as {
        id: string; titulo: string; status: string; prazo: string | null; criado_em: string
        clients: { id: string; nome: string } | null
        deliverables: { id: string; nome: string; tipo: string } | null
        users: { id: string; nome: string } | null
      }[]
    },
    enabled: userIds.length > 0,
  })
}

/** NPS médio dos clientes vinculados aos usuários do departamento */
export function useDeptNpsAvg(clientIds: string[]) {
  return useQuery({
    queryKey: ['chat', 'dept-nps-avg', clientIds.sort().join(',')],
    queryFn: async () => {
      if (!clientIds.length) return null
      const { data: surveys } = await supabase
        .from('nps_surveys')
        .select('id')
        .in('client_id', clientIds)
      if (!surveys?.length) return null
      const surveyIds = surveys.map(s => s.id)
      const { data, error } = await supabase
        .from('nps_responses')
        .select('nota')
        .in('survey_id', surveyIds)
        .not('nota', 'is', null)
      if (error) throw error
      if (!data?.length) return null
      const avg = data.reduce((s, r) => s + (r.nota ?? 0), 0) / data.length
      return Math.round(avg * 10) / 10
    },
    enabled: clientIds.length > 0,
  })
}

// ─── Module Access (sidebar visibility based on dept assignments) ─────────────

/** Returns set of sidebar modules the current user can access.
 *  admin → all modules. Others → modules from their dept's modulo_acesso. */
export function useMyModules() {
  return useQuery({
    queryKey: ['chat', 'my-modules'],
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return new Set<string>()

      const { data: profile } = await supabase
        .from('users')
        .select('perfil')
        .eq('id', authUser.id)
        .single()

      if (!profile) return new Set<string>()
      if (profile.perfil === 'admin' || profile.perfil === 'gerente') return new Set<string>(['all'])

      // For other profiles: check their dept assignments → modulo_acesso
      const { data } = await supabase
        .from('chat_department_agents')
        .select('chat_departments(modulo_acesso)')
        .eq('user_id', authUser.id)

      const modules = new Set<string>()
      for (const row of data ?? []) {
        const m = (row as { chat_departments: { modulo_acesso: string | null } | null }).chat_departments?.modulo_acesso
        if (m) modules.add(m)
      }
      return modules
    },
  })
}

// ─── Department Member Metrics ───────────────────────────────────────────────

export interface DeptMemberMetric {
  department_id: string
  user_id: string
  user_nome: string
  user_perfil: string
  is_gerente: boolean
  msgs_hoje: number
  msgs_semana: number
  conversas_abertas: number
}

export function useDeptMemberMetrics(departmentId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-member-metrics', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dept_member_metrics' as never)
        .select('*')
        .eq('department_id', departmentId)
      if (error) throw error
      return data as DeptMemberMetric[]
    },
    enabled: Boolean(departmentId),
  })
}

export function useDeptActiveConversations(departmentId: string) {
  return useQuery({
    queryKey: ['chat', 'dept-active-convs', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*, chat_contacts(id, nome, numero_whatsapp, foto_url), users(id, nome)')
        .eq('department_id', departmentId)
        .in('status', ['aberta', 'em_atendimento', 'aguardando'])
        .order('atualizado_em', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as (ChatConversation & {
        chat_contacts: { id: string; nome: string | null; numero_whatsapp: string; foto_url: string | null }
        users: { id: string; nome: string } | null
      })[]
    },
    enabled: Boolean(departmentId),
  })
}

// ─── IA Suggest Reply ─────────────────────────────────────────────────────────

export function useIaSuggestReply() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const token = await getFreshToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ia-suggest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      })
      if (!res.ok) throw new Error('Falha ao gerar sugestões')
      return res.json()
    },
  })
}

// ─── IA Summarize Conversation ────────────────────────────────────────────────

export function useIaSummarizeConversation() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const token = await getFreshToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ia-summarize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      })
      if (!res.ok) throw new Error('Falha ao resumir')
      return res.json()
    },
  })
}

// ─── CSAT (Customer Satisfaction) ─────────────────────────────────────────────

export function useCsatResults() {
  return useQuery({
    queryKey: chatKeys.csat(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_csat')
        .select('*, chat_contacts(nome, numero_whatsapp)')
        .order('enviado_em', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as (ChatCsat & { chat_contacts: { nome: string | null; numero_whatsapp: string } })[]
    },
  })
}

export function useCsatMetrics() {
  return useQuery({
    queryKey: [...chatKeys.csat(), 'metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_csat')
        .select('nota, respondido_em')
      if (error) throw error

      const all = data as { nota: number | null; respondido_em: string | null }[]
      const total = all.length
      const responded = all.filter(r => r.nota !== null)
      const totalResponses = responded.length
      const average = totalResponses > 0
        ? responded.reduce((sum, r) => sum + (r.nota ?? 0), 0) / totalResponses
        : 0
      const responseRate = total > 0 ? Math.round((totalResponses / total) * 100) : 0

      // Distribution by score (1-5)
      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const r of responded) {
        if (r.nota && r.nota >= 1 && r.nota <= 5) {
          distribution[r.nota]++
        }
      }

      // NPS equivalent: (promoters% - detractors%)
      // 4-5 = promoters, 3 = passive, 1-2 = detractors
      const promoters = distribution[4] + distribution[5]
      const detractors = distribution[1] + distribution[2]
      const nps = totalResponses > 0
        ? Math.round(((promoters - detractors) / totalResponses) * 100)
        : 0

      return { average, totalResponses, responseRate, distribution, nps, totalSent: total }
    },
  })
}

export function useCsatByConversation(conversationId: string) {
  return useQuery({
    queryKey: [...chatKeys.csat(), conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_csat')
        .select('id')
        .eq('conversation_id', conversationId)
        .limit(1)
      if (error) throw error
      return data.length > 0
    },
    enabled: Boolean(conversationId),
  })
}

export function useSendCsat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      conversation_id,
      contact_id,
    }: {
      conversation_id: string
      contact_id: string
    }) => {
      // 1. Insert CSAT record
      const { data, error } = await supabase
        .from('chat_csat')
        .insert({
          conversation_id,
          contact_id,
          enviado_em: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error

      // 2. Send CSAT message via edge function
      const supabaseUrl = SUPABASE_URL
      const token = await getFreshToken()

      const csatMessage =
        'Olá! Como você avalia nosso atendimento? Responda com uma nota de 1 a 5 (1=Péssimo, 5=Excelente)'

      await fetch(`${supabaseUrl}/functions/v1/uazapi-send-message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id,
          conteudo: csatMessage,
          tipo: 'texto',
        }),
      })

      return data as ChatCsat
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.csat() })
    },
  })
}

// ─── UAZAPI Actions (Edge Function) ─────────────────────────────────────────

async function callUazapiAction(action: string, instance_id: string, params: Record<string, unknown> = {}) {
  const token = await getFreshToken()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/uazapi-actions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, instance_id, ...params }),
  })
  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`UAZAPI action failed: ${errorBody}`)
  }
  return res.json()
}

// 1. React to message (sends to WhatsApp + persists locally)
export function useReactToMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ instance_id, number, message_id, emoji, conversation_id }: {
      instance_id: string; number: string; message_id: string; emoji: string; conversation_id: string
    }) => {
      // Send reaction to WhatsApp via UAZAPI
      const result = await callUazapiAction('react', instance_id, { number, message_id, emoji })

      // Persist reaction locally in DB
      const { data: msg } = await supabase
        .from('chat_messages')
        .select('reactions')
        .eq('message_id_wpp', message_id)
        .single()

      const existing: MessageReaction[] = (msg?.reactions as MessageReaction[]) ?? []

      let updated: MessageReaction[]
      if (!emoji) {
        // Remove own reaction
        updated = existing.filter(r => !r.from_me)
      } else {
        // Replace own reaction (remove old, add new)
        updated = existing.filter(r => !r.from_me)
        updated.push({ emoji, from: number, from_me: true })
      }

      await supabase
        .from('chat_messages')
        .update({ reactions: updated })
        .eq('message_id_wpp', message_id)

      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// 2. Edit sent message
export function useEditMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ instance_id, message_id, text, conversation_id }: {
      instance_id: string; message_id: string; text: string; conversation_id: string
    }) => {
      const result = await callUazapiAction('edit_message', instance_id, { message_id, text })
      // Update local DB content
      await supabase
        .from('chat_messages')
        .update({ conteudo: text })
        .eq('message_id_wpp', message_id)
      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// 3. Delete message for everyone
export function useDeleteMessageWpp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ instance_id, message_id, conversation_id }: {
      instance_id: string; message_id: string; conversation_id: string
    }) => {
      const result = await callUazapiAction('delete_message', instance_id, { message_id })
      // Mark as deleted in local DB — clear media so it renders as deleted text
      await supabase
        .from('chat_messages')
        .update({ conteudo: 'Mensagem apagada', tipo: 'texto', media_url: null })
        .eq('message_id_wpp', message_id)
      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// 4. Mark messages as read (blue ticks)
export function useMarkRead() {
  return useMutation({
    mutationFn: async ({ instance_id, number }: {
      instance_id: string; number: string
    }) => callUazapiAction('mark_read', instance_id, { number }),
  })
}

// 5. Send interactive menu
export function useSendMenu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ instance_id, conversation_id, number, type, text, choices, footerText, listButton, selectableCount, imageButton }: {
      instance_id: string; conversation_id: string; number: string
      type: 'button' | 'list' | 'poll' | 'carousel'
      text: string; choices: string[]
      footerText?: string; listButton?: string; selectableCount?: number; imageButton?: string
    }) => {
      const params: Record<string, unknown> = { number, type, text, choices }
      if (footerText) params.footerText = footerText
      if (listButton) params.listButton = listButton
      if (selectableCount !== undefined) params.selectableCount = selectableCount
      if (imageButton) params.imageButton = imageButton
      return callUazapiAction('send_menu', instance_id, params)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// 6. Send vCard contact
export function useSendContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ instance_id, conversation_id, number, fullName, phoneNumber, organization, email, url }: {
      instance_id: string; conversation_id: string; number: string
      fullName: string; phoneNumber: string
      organization?: string; email?: string; url?: string
    }) => {
      const params: Record<string, unknown> = { number, fullName, phoneNumber }
      if (organization) params.organization = organization
      if (email) params.email = email
      if (url) params.url = url
      return callUazapiAction('send_contact', instance_id, params)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// 7. Send location
export function useSendLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ instance_id, conversation_id, number, latitude, longitude, name, address }: {
      instance_id: string; conversation_id: string; number: string
      latitude: number; longitude: number
      name?: string; address?: string
    }) => {
      const params: Record<string, unknown> = { number, latitude, longitude }
      if (name) params.name = name
      if (address) params.address = address
      return callUazapiAction('send_location', instance_id, params)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(variables.conversation_id) })
    },
  })
}

// 8. Manage WhatsApp labels on a chat
export function useManageLabels() {
  return useMutation({
    mutationFn: async ({ instance_id, number, labelids, add_labelid, remove_labelid }: {
      instance_id: string; number: string
      labelids?: string[]; add_labelid?: string; remove_labelid?: string
    }) => {
      const params: Record<string, unknown> = { number }
      if (labelids) params.labelids = labelids
      if (add_labelid) params.add_labelid = add_labelid
      if (remove_labelid) params.remove_labelid = remove_labelid
      return callUazapiAction('manage_labels', instance_id, params)
    },
  })
}

// 9. List WhatsApp labels
export function useWhatsAppLabels(instanceId: string) {
  return useQuery({
    queryKey: ['chat', 'wpp-labels', instanceId],
    queryFn: async () => {
      const token = await getFreshToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/uazapi-actions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_labels', instance_id: instanceId }),
      })
      if (!res.ok) throw new Error('Failed to fetch labels')
      return res.json()
    },
    enabled: Boolean(instanceId),
  })
}

// 10. Archive/unarchive chat
export function useArchiveChat() {
  return useMutation({
    mutationFn: async ({ instance_id, number, archive }: {
      instance_id: string; number: string; archive: boolean
    }) => callUazapiAction('archive_chat', instance_id, { number, archive }),
  })
}

// 11. Pin/unpin chat
export function usePinChat() {
  return useMutation({
    mutationFn: async ({ instance_id, number, pin }: {
      instance_id: string; number: string; pin: boolean
    }) => callUazapiAction('pin_chat', instance_id, { number, pin }),
  })
}

// 12. Mute chat
export function useMuteChat() {
  return useMutation({
    mutationFn: async ({ instance_id, number, hours }: {
      instance_id: string; number: string; hours: number
    }) => callUazapiAction('mute_chat', instance_id, { number, hours }),
  })
}

// 13. Block/unblock contact
export function useBlockContact() {
  return useMutation({
    mutationFn: async ({ instance_id, number, block }: {
      instance_id: string; number: string; block: boolean
    }) => callUazapiAction('block_contact', instance_id, { number, block }),
  })
}

// 14. Check numbers on WhatsApp
export function useCheckNumbers() {
  return useMutation({
    mutationFn: async ({ instance_id, numbers }: {
      instance_id: string; numbers: string[]
    }) => callUazapiAction('check_numbers', instance_id, { numbers }),
  })
}

// 15. Get full chat details
export function useChatDetails() {
  return useMutation({
    mutationFn: async ({ instance_id, number }: {
      instance_id: string; number: string
    }) => callUazapiAction('chat_details', instance_id, { number, preview: false }),
  })
}

// 16. Find messages with filters
export function useFindMessages() {
  return useMutation({
    mutationFn: async ({ instance_id, number, limit, offset, fromMe, messageType }: {
      instance_id: string; number?: string; limit?: number; offset?: number
      fromMe?: boolean; messageType?: string
    }) => {
      const params: Record<string, unknown> = {}
      if (number) params.number = number
      if (limit !== undefined) params.limit = limit
      if (offset !== undefined) params.offset = offset
      if (fromMe !== undefined) params.fromMe = fromMe
      if (messageType) params.messageType = messageType
      return callUazapiAction('find_messages', instance_id, params)
    },
  })
}

// 17. Find chats with filters
export function useFindChats() {
  return useMutation({
    mutationFn: async ({ instance_id, limit, offset, unread, archived }: {
      instance_id: string; limit?: number; offset?: number
      unread?: boolean; archived?: boolean
    }) => {
      const params: Record<string, unknown> = {}
      if (limit !== undefined) params.limit = limit
      if (offset !== undefined) params.offset = offset
      if (unread !== undefined) params.unread = unread
      if (archived !== undefined) params.archived = archived
      return callUazapiAction('find_chats', instance_id, params)
    },
  })
}

// 18. Update profile image
export function useUpdateProfileImage() {
  return useMutation({
    mutationFn: async ({ instance_id, image }: {
      instance_id: string; image: string
    }) => callUazapiAction('update_profile_image', instance_id, { image }),
  })
}

// ─── Unread Counts ──────────────────────────────────────────────────────────

export type UnreadCountMap = Record<string, number>

/** Fetch unread message counts per conversation — per-user via chat_message_reads, filtered by instance access */
export function useUnreadCounts(instanceIds?: string[] | null) {
  return useQuery({
    queryKey: ['chat', 'unread-counts', instanceIds],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {} as UnreadCountMap

      // If instanceIds is an empty array, user has no instance access → no unreads
      if (Array.isArray(instanceIds) && instanceIds.length === 0) return {} as UnreadCountMap

      const params: Record<string, unknown> = { p_user_id: user.id }
      // null = admin/estrategista (no filter), array = specific instances
      if (Array.isArray(instanceIds) && instanceIds.length > 0) {
        params.p_instance_ids = instanceIds
      }

      const { data, error } = await supabase.rpc('get_unread_counts_for_user', params)
      if (error) throw error

      const counts: UnreadCountMap = {}
      for (const row of data as { conversation_id: string; unread_count: number }[]) {
        counts[row.conversation_id] = row.unread_count
      }
      return counts
    },
    refetchInterval: 30000, // fallback polling every 30s
  })
}

/** Mark a conversation as read for the current user (per-user via chat_message_reads).
 *  Returns the previous last_read_at (used to render the "X novas mensagens" divider). */
export function useMarkMessagesAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string): Promise<string | null> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // Capture previous last_read_at BEFORE upserting (for unread divider)
      const { data: existing } = await supabase
        .from('chat_message_reads')
        .select('last_read_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()

      const previousLastReadAt: string | null = existing?.last_read_at ?? null

      // UPSERT into chat_message_reads — sets last_read_at = now()
      const { error } = await supabase
        .from('chat_message_reads')
        .upsert(
          { conversation_id: conversationId, user_id: user.id, last_read_at: new Date().toISOString() },
          { onConflict: 'conversation_id,user_id' },
        )
      if (error) throw error

      return previousLastReadAt
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread-counts'] })
    },
  })
}

/** Realtime listener for conversation list changes (assignment, status, new conversations) */
export function useRealtimeConversations() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('global_conversations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}

/**
 * Returns count of conversations (not messages) with unread messages,
 * filtered to "Meus Clientes" for estrategistas.
 * Used for sidebar badge.
 */
export function useInboxUnreadConversationCount() {
  const { data: myInstanceIds } = useMyInstanceIds()
  const { data: unreadCounts } = useUnreadCounts(myInstanceIds)
  const { data: contactClientLinks } = useContactClientLinks()
  const { data: conversations } = useConversations()

  // Lazy import to avoid circular — get user profile from auth
  const [profile, setProfile] = useState<{ perfil: string; id: string } | null>(null)
  const [myClientIds, setMyClientIds] = useState<string[] | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('users')
        .select('perfil')
        .eq('id', user.id)
        .single()
      if (data) {
        setProfile({ perfil: data.perfil, id: user.id })
        if (data.perfil === 'estrategista') {
          const { data: assignments } = await supabase
            .from('client_assignments')
            .select('client_id')
            .eq('user_id', user.id)
          setMyClientIds(assignments?.map(a => a.client_id) ?? [])
        }
      }
    })
  }, [])

  return useMemo(() => {
    if (!unreadCounts || !conversations) return 0

    const unreadConvIds = Object.entries(unreadCounts)
      .filter(([, count]) => count > 0)
      .map(([id]) => id)

    if (unreadConvIds.length === 0) return 0

    // For non-estrategistas, return total unread conversation count
    // For atendimento: count unread in "Meus" (assigned to me) + "Novos" (unassigned)
    if (profile?.perfil === 'atendimento') {
      let count = 0
      for (const convId of unreadConvIds) {
        const conv = conversations.find(c => c.id === convId)
        if (!conv) continue
        if (conv.agente_id === profile.id || (!conv.agente_id && conv.status === 'aberta')) count++
      }
      return count
    }

    if (!profile || profile.perfil !== 'estrategista' || !myClientIds) {
      return unreadConvIds.length
    }

    // For estrategistas, filter to "Meus Clientes" + conversations assigned to me
    let count = 0
    for (const convId of unreadConvIds) {
      const conv = conversations.find(c => c.id === convId)
      if (!conv) continue
      // Assigned to me directly
      if (conv.agente_id === profile.id) { count++; continue }
      if (!conv.chat_contacts) continue
      const contactId = conv.chat_contacts.id
      const singleClientId = conv.chat_contacts.client_id
      const fromJunction = contactClientLinks?.get(contactId)
      const clientIds = (fromJunction && fromJunction.length > 0)
        ? fromJunction
        : (singleClientId ? [singleClientId] : [])
      if (clientIds.some(cid => myClientIds.includes(cid))) {
        count++
      }
    }
    return count
  }, [unreadCounts, conversations, contactClientLinks, profile, myClientIds])
}

/** Global realtime listener for new messages — invalidates unread counts + plays sound */
export function useRealtimeUnread(options?: {
  muted?: Set<string>
  /** If set, only play sound for conversations in this set (e.g. "Meus Clientes") */
  allowedConversationIds?: Set<string> | null
  /** If true, skip sound entirely (used when sound is handled by a parent component) */
  disableSound?: boolean
  /** Skip sound for the currently open conversation (user is already reading it) */
  activeConversationId?: string | null
}) {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Unique channel name per hook instance to avoid conflicts between components
  const channelNameRef = useRef(`global_new_messages_${Math.random().toString(36).slice(2)}`)
  const disableSound = options?.disableSound ?? false

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    if (disableSound) return
    const unlock = () => {
      if (audioRef.current) return
      const a = new Audio('/notification.mp3')
      a.volume = 0.5
      // Play silently to unlock, then reset
      a.play().then(() => { a.pause(); a.currentTime = 0 }).catch(() => {})
      audioRef.current = a
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [disableSound])

  const playSound = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/notification.mp3')
      audioRef.current.volume = 0.5
    }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => {})
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const msg = payload.new as ChatMessage & { conversation_id: string }
          // Only care about incoming messages (not sent by agent/ia)
          if (msg.enviado_por_agente || msg.enviado_por_ia) return
          if (msg.tipo === 'nota_interna') return

          // Invalidate unread counts
          queryClient.invalidateQueries({ queryKey: ['chat', 'unread-counts'] })
          // Invalidate conversations list to update order
          queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] })

          // Auto-desarquivar: se esta conversa estava arquivada pelo usuário, remove o arquivamento
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return
            supabase
              .from('chat_conversation_user_prefs')
              .update({ arquivada: false })
              .eq('user_id', user.id)
              .eq('conversation_id', msg.conversation_id)
              .eq('arquivada', true)
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['chat', 'user-prefs'] })
              })
          })

          // Play sound: skip if disabled, muted, active conversation, or not in allowed set
          if (options?.disableSound) return
          if (options?.muted?.has(msg.conversation_id)) return
          if (options?.activeConversationId && msg.conversation_id === options.activeConversationId) return
          if (options?.allowedConversationIds && !options.allowedConversationIds.has(msg.conversation_id)) return
          playSound()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, playSound, options?.muted, options?.allowedConversationIds])
}

// ─── Client Alerts (Estrategista) ────────────────────────────────────────────

export interface ClientAlert {
  id: string
  client_id: string
  user_id: string
  titulo: string
  descricao: string | null
  data_alerta: string | null
  resolvido: boolean
  resolvido_em: string | null
  criado_em: string
  clients?: { id: string; nome: string } | null
}

export function useClientAlerts(userId: string) {
  return useQuery({
    queryKey: ['client-alerts', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_alerts')
        .select('*, clients(id, nome)')
        .eq('user_id', userId)
        .eq('resolvido', false)
        .order('data_alerta', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as ClientAlert[]
    },
    enabled: Boolean(userId),
  })
}

export function useCreateClientAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      client_id: string
      user_id: string
      titulo: string
      descricao?: string
      data_alerta?: string
    }) => {
      const { data, error } = await supabase
        .from('client_alerts')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['client-alerts', vars.user_id] })
    },
  })
}

export function useResolveClientAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('client_alerts')
        .update({ resolvido: true, resolvido_em: new Date().toISOString() })
        .eq('id', alertId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-alerts'] })
    },
  })
}

// ─── Client Last Contact (Estrategista) ──────────────────────────────────────

export function useClientLastContact(clientIds: string[]) {
  return useQuery({
    queryKey: ['client-last-contact', clientIds.sort().join(',')],
    queryFn: async () => {
      if (!clientIds.length) return {} as Record<string, string | null>
      const { data, error } = await supabase.rpc('get_client_last_contact', {
        p_client_ids: clientIds,
      })
      if (error) throw error
      const map: Record<string, string | null> = {}
      for (const row of data ?? []) {
        // Keep the most recent if duplicates
        if (!map[row.client_id] || (row.ultimo_contato && (!map[row.client_id] || row.ultimo_contato > map[row.client_id]!))) {
          map[row.client_id] = row.ultimo_contato
        }
      }
      return map
    },
    enabled: clientIds.length > 0,
  })
}

// ─── Agent TMA (Suporte) ────────────────────────────────────────────────────

export function useAgentTma(agentId: string, days: number = 7) {
  return useQuery({
    queryKey: ['agent-tma', agentId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_tma', {
        p_agent_id: agentId,
        p_days: days,
      })
      if (error) throw error
      const row = data?.[0]
      return {
        tmaMinutos: row?.tma_minutos ? Number(row.tma_minutos) : null,
        totalConversas: row?.total_conversas ? Number(row.total_conversas) : 0,
      }
    },
    enabled: Boolean(agentId),
  })
}

// ─── Conversations where a user participated (sent at least 1 message) ────────

export function useConversationsByParticipant(userId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-participant', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('conversation_id')
        .eq('agente_id', userId!)
        .eq('enviado_por_agente', true)
      if (error) throw error
      return new Set(data.map(r => r.conversation_id))
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  })
}

// ─── Typing Indicator (Broadcast) ────────────────────────────────────────────

export function useTypingIndicator(conversationId: string | null, myNome: string | null) {
  const [typingNames, setTypingNames] = useState<string[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`typing:${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { nome, typing } = payload as { nome: string; typing: boolean }
        if (nome === myNome) return
        const timers = timersRef.current
        if (timers.has(nome)) { clearTimeout(timers.get(nome)!); timers.delete(nome) }
        if (typing) {
          setTypingNames(prev => prev.includes(nome) ? prev : [...prev, nome])
          const t = setTimeout(() => {
            setTypingNames(prev => prev.filter(n => n !== nome))
            timers.delete(nome)
          }, 3500)
          timers.set(nome, t)
        } else {
          setTypingNames(prev => prev.filter(n => n !== nome))
        }
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current.clear()
      setTypingNames([])
      supabase.removeChannel(channel)
    }
  }, [conversationId, myNome])

  const sendTyping = useCallback((typing: boolean) => {
    if (!channelRef.current || !myNome) return
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { nome: myNome, typing } })
  }, [myNome])

  return { typingNames, sendTyping }
}

// ─── Search Messages ──────────────────────────────────────────────────────────

export function useSearchMessages(conversationId: string | null, query: string) {
  return useQuery({
    queryKey: ['chat', 'search-messages', conversationId, query],
    queryFn: async () => {
      if (!conversationId || query.trim().length < 2) return []
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, conteudo, tipo, criado_em, enviado_por_agente')
        .eq('conversation_id', conversationId)
        .ilike('conteudo', `%${query.trim()}%`)
        .neq('tipo', 'nota_interna')
        .order('criado_em', { ascending: true })
      if (error) throw error
      return (data ?? []) as { id: string; conteudo: string | null; tipo: string; criado_em: string; enviado_por_agente: boolean }[]
    },
    enabled: Boolean(conversationId) && query.trim().length >= 2,
    staleTime: 30_000,
  })
}
