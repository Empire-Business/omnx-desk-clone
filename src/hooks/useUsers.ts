import { tenantDaSessao } from '@/lib/authTenant'
import { mensagemErroCriarUsuario } from '@/lib/adminUserError'
import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { carregarResponsaveis, decidirResponsavel, podeRepetirPedidoResponsavel, type PedidoResponsavel, type TransporteResponsaveis } from '@/lib/responsaveisCliente'
import type { User, UserProfile, ClientAssignment, UserInstanceAssignment, InstanceCategoria, ChatDepartmentRow } from '@/types/database'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const userKeys = {
  all: ['users'] as const,
  list: () => ['users', 'list'] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
  assignments: () => ['users', 'assignments'] as const,
  instanceAssignments: (userId?: string) => ['users', 'instance-assignments', userId ?? 'all'] as const,
}

// ---------------------------------------------------------------------------
// Joined type returned by useAssignments
// ---------------------------------------------------------------------------
export interface AssignmentWithRelations extends ClientAssignment {
  users: Pick<User, 'id' | 'nome' | 'perfil'> | null
  clients: { id: string; nome: string } | null
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Fetch all users ordered by nome */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('nome')
      if (error) throw error
      return data as User[]
    },
  })
}

/** Fetch a single user by id */
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as User
    },
    enabled: Boolean(id),
  })
}

/** Mutation to update a user's nome, perfil, or ativo */
export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string
      nome?: string
      perfil?: UserProfile
      ativo?: boolean
      department_id?: string | null
      /** Liberação individual do módulo Contratos (não vem do perfil). */
      acesso_contratos?: boolean
      inativacao_motivo?: string | null
      inativacao_em?: string | null
      inativacao_por?: string | null
    }) => {
      const { data, error } = await supabase
        .from('users')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as User
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data.id) })
    },
  })
}

/** Mutation to create a user via the admin-create-user edge function.
 *  Cria o auth.users + public.users (via trigger handle_new_user) com e-mail já
 *  confirmado e senha aleatória que ninguém vê. A função devolve um link de
 *  definição de senha (`definir_senha_url`) para o admin repassar ao colaborador.
 *  Apenas admin/gerente podem chamar. */
export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      nome: string
      email: string
      perfil: UserProfile
      department_id?: string | null
    }) => {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: input,
      })
      if (error || data?.error) throw new Error(await mensagemErroCriarUsuario(error, data))
      return data as {
        id: string
        email: string
        nome: string
        perfil: UserProfile
        definir_senha_url: string | null
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

/** Fetch all client_assignments with joined user and client info */
export function useAssignments() {
  return useQuery({
    queryKey: userKeys.assignments(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_assignments')
        .select('*, users(id, nome, perfil), clients(id, nome)')
        .eq('ativo', true)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as AssignmentWithRelations[]
    },
  })
}

/** Outros painéis usam o mesmo executor; a troca completa fica no cliente. */
export function useCreateAssignment() {
  const queryClient = useQueryClient()
  const pendentes = useRef(new Map<string, PedidoResponsavel>())
  return useMutation({
    mutationFn: async (input: { client_id: string; user_id: string; tipo: 'estrategista' | 'atendimento'; ativo?: boolean }) => {
      if (input.ativo === false) throw new Error('Use Encerrar vínculo no cadastro do cliente.')
      const chave = `${input.client_id}:${input.user_id}:${input.tipo}`
      let pedido = pendentes.current.get(chave)
      if (!pedido) {
        const c = await carregarResponsaveis(supabase as unknown as TransporteResponsaveis, input.client_id)
        pedido = { clientId: input.client_id, acao: 'adicionar', tipo: input.tipo, assignmentId: null,
          userId: input.user_id, revisao: c.revisao, idempotencia: crypto.randomUUID(),
          motivo: 'Pessoa adicionada pelo controle de acesso da equipe.' }
        pendentes.current.set(chave, pedido)
      }
      try {
        const r = await decidirResponsavel(supabase as unknown as TransporteResponsaveis, pedido)
        pendentes.current.delete(chave)
        return r
      } catch (erro) {
        if (!podeRepetirPedidoResponsavel(erro)) pendentes.current.delete(chave)
        throw erro
      }
    },
    onSuccess: () => Promise.all(['users', 'clients', 'client-responsaveis', 'chat', 'automacoes-wa', 'dashboard-data'].map((chave) => queryClient.invalidateQueries({ queryKey: [chave] }))),
  })
}

/** Encerra membership atual com snapshot histórico, sem apagar a trilha. */
export function useDeleteAssignment() {
  const queryClient = useQueryClient()
  const pendentes = useRef(new Map<string, PedidoResponsavel>())
  return useMutation({
    mutationFn: async (id: string) => {
      let pedido = pendentes.current.get(id)
      if (!pedido) {
        const r = await supabase.from('client_assignments').select('client_id,tipo').eq('id', id).maybeSingle()
        if (r.error || !r.data) throw new Error('O vínculo mudou. Atualize os dados antes de encerrar.')
        const c = await carregarResponsaveis(supabase as unknown as TransporteResponsaveis, r.data.client_id)
        pedido = { clientId: r.data.client_id, acao: 'encerrar', tipo: r.data.tipo as 'estrategista' | 'atendimento',
          assignmentId: id, userId: null, revisao: c.revisao, idempotencia: crypto.randomUUID(),
          motivo: 'Vínculo encerrado pelo controle de acesso da equipe.' }
        pendentes.current.set(id, pedido)
      }
      try {
        const r = await decidirResponsavel(supabase as unknown as TransporteResponsaveis, pedido)
        pendentes.current.delete(id)
        return r
      } catch (erro) {
        if (!podeRepetirPedidoResponsavel(erro)) pendentes.current.delete(id)
        throw erro
      }
    },
    onSuccess: () => Promise.all(['users', 'clients', 'client-responsaveis', 'chat', 'automacoes-wa', 'dashboard-data'].map((chave) => queryClient.invalidateQueries({ queryKey: [chave] }))),
  })
}

// ---------------------------------------------------------------------------
// Instance Assignments — link users to WhatsApp instances
// ---------------------------------------------------------------------------

export interface InstanceAssignmentWithRelations extends UserInstanceAssignment {
  users: Pick<User, 'id' | 'nome' | 'perfil'> | null
  whatsapp_instances: { id: string; nome: string; instance_id: string; numero_whatsapp: string | null; categoria: InstanceCategoria | null } | null
}

/** Fetch all instance assignments (admin view) or for a specific user */
export function useInstanceAssignments(userId?: string) {
  return useQuery({
    queryKey: userKeys.instanceAssignments(userId),
    queryFn: async () => {
      let query = supabase
        .from('user_instance_assignments')
        .select('*, users(id, nome, perfil), whatsapp_instances(id, nome, instance_id, numero_whatsapp, categoria)')
        .order('criado_em', { ascending: false })
      if (userId) {
        query = query.eq('user_id', userId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as InstanceAssignmentWithRelations[]
    },
  })
}

/** Shared hook to get current user's profile (avoids duplicate fetches) */
export function useMyProfile() {
  return useQuery({
    queryKey: ['users', 'my-profile'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Sua sessão não está disponível. Entre novamente.')
      const { data, error } = await supabase
        .from('users')
        .select('id, perfil')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data as { id: string; perfil: UserProfile }
    },
  })
}

/** Get instance IDs the current user has access to (profile-aware) */
export function useMyInstanceIds() {
  const profileQuery = useMyProfile()
  const profile = profileQuery.data
  return useQuery({
    queryKey: ['users', 'my-instance-ids', profile?.id, profile?.perfil, profileQuery.isError],
    queryFn: async () => {
      if (profileQuery.isError) throw profileQuery.error
      if (!profile) return []

      // admin see everything
      if (profile.perfil === 'admin') {
        return null // null = no filter
      }

      // estrategista: no instance filter (filtered by client_ids instead)
      if (profile.perfil === 'estrategista') {
        return null
      }

      // gerente: see all instances (supervisor role)
      if (profile.perfil === 'gerente') {
        return null
      }

      // atendimento: instances from department assignments + direct assignments
      if (profile.perfil === 'atendimento') {
        const instanceIds = new Set<string>()

        // From departments
        const { data: deptAgents, error: deptError } = await supabase
          .from('chat_department_agents')
          .select('department_id')
          .eq('user_id', profile.id)
        if (deptError) throw deptError
        if (deptAgents?.length) {
          const deptIds = deptAgents.flatMap(d => d.department_id === null ? [] : [d.department_id])
          const { data: deptInstances, error: instancesError } = await supabase
            .from('department_instance_assignments')
            .select('instance_id')
            .in('department_id', deptIds)
          if (instancesError) throw instancesError
          deptInstances?.forEach(d => instanceIds.add(d.instance_id))
        }

        // From direct assignments
        const { data: directInstances, error: directError } = await supabase
          .from('user_instance_assignments')
          .select('instance_id')
          .eq('user_id', profile.id)
        if (directError) throw directError
        directInstances?.forEach(d => instanceIds.add(d.instance_id))

        return instanceIds.size > 0 ? Array.from(instanceIds) : []
      }

      // others: assigned instances only
      const { data, error } = await supabase
        .from('user_instance_assignments')
        .select('instance_id')
        .eq('user_id', profile.id)
      if (error) throw error
      return data.map(d => d.instance_id)
    },
    enabled: !profileQuery.isPending,
  })
}

/** Create an instance assignment */
export function useCreateInstanceAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { user_id: string; instance_id: string }) => {
      const { data, error } = await supabase
        .from('user_instance_assignments')
        .insert({ ...(input), tenant_id: await tenantDaSessao() })
        .select()
        .single()
      if (error) throw error
      return data as UserInstanceAssignment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

/** Get client IDs the current user has access to (profile-aware) */
export function useMyClientIds() {
  const { data: profile } = useMyProfile()
  return useQuery({
    queryKey: ['users', 'my-client-ids', profile?.perfil],
    queryFn: async () => {
      if (!profile) return []

      // admin sees everything
      if (profile.perfil === 'admin') {
        return null
      }

      // gerente: return their specific client assignments (for "Meus clientes" tab)
      if (profile.perfil === 'gerente') {
        const { data, error } = await supabase
          .from('client_assignments')
          .select('client_id')
          .eq('user_id', profile.id)
          .eq('ativo', true)
        if (error) throw error
        return data.map(d => d.client_id)
      }

      // atendimento: filtered by dept/instance, not by client
      if (profile.perfil === 'atendimento') {
        return null
      }

      // estrategista: only clients assigned to them
      if (profile.perfil === 'estrategista') {
        const { data, error } = await supabase
          .from('client_assignments')
          .select('client_id')
          .eq('user_id', profile.id)
          .eq('ativo', true)
        if (error) throw error
        return data.map(d => d.client_id)
      }

      return null
    },
    enabled: Boolean(profile),
  })
}

/** Delete an instance assignment */
export function useDeleteInstanceAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_instance_assignments')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Departments with managers
// ---------------------------------------------------------------------------

export interface DepartmentWithManager extends ChatDepartmentRow {
  gerente: Pick<User, 'id' | 'nome' | 'email'> | null
  membros: User[]
}

/** Fetch all departments with their gerente and members */
export function useDepartmentsWithManagers() {
  return useQuery({
    queryKey: ['departments', 'with-managers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_departments')
        .select('*, gerente:gerente_id(id, nome, email)')
        .order('nome')
      if (error) throw error
      return data as (ChatDepartmentRow & { gerente: Pick<User, 'id' | 'nome' | 'email'> | null })[]
    },
  })
}

/** Update a user's department */
export function useUpdateUserDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, departmentId }: { userId: string; departmentId: string | null }) => {
      const { data, error } = await supabase
        .from('users')
        .update({ department_id: departmentId })
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error
      return data as User
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

/** Set gerente of a department */
export function useSetDepartmentGerente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ departmentId, gerenteId }: { departmentId: string; gerenteId: string | null }) => {
      const { error } = await supabase
        .from('chat_departments')
        .update({ gerente_id: gerenteId })
        .eq('id', departmentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}
