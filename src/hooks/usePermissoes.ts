import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { regraPermiteAcao } from '@/lib/permissoes'
import { tenantDaSessao } from '@/lib/authTenant'

/**
 * Permissões por app (Fase 2 do roadmap de modularização).
 *
 * Substitui, aos poucos, o gate espalhado por `users.perfil` / `acesso_contratos`.
 * As telas que usam este hook seguem a matriz: ausência de regra nega acesso.
 * Admin e a liberação individual de contratos são exceções explícitas.
 *
 * Um "recurso" pode ser um app (`chat`, `contratos`) ou uma sub-área
 * (`contratos.onboarding`). A ação é `ver`, `editar` ou `admin`, em escada:
 * quem pode `admin` pode `editar` e `ver`.
 */
export type AcaoPermissao = 'ver' | 'editar' | 'admin'

interface RegraPermissao {
  perfil: string
  recurso: string
  acao: AcaoPermissao
}

export function usePermissoesRegras() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['permissoes-app', user?.id ?? 'anon', user?.perfil ?? 'anon'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissoes_app')
        .select('perfil, recurso, acao')
        .eq('perfil', user!.perfil)
      if (error) throw error
      return (data ?? []) as RegraPermissao[]
    },
    enabled: Boolean(user?.perfil),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * `can('contratos', 'editar')` — pergunta se o usuário logado pode agir no recurso.
 *
 * Regras de borda, todas deliberadas:
 * - **admin sempre pode.** É o fail-safe que impede um seed errado trancar o dono.
 * - **`acesso_contratos` continua valendo.** É uma liberação por PESSOA, não por
 *   perfil, então não cabe na tabela — quem tinha o bool não pode perder acesso.
 * - Regras ausentes ou com falha não concedem acesso. `carregando` permite
 *   que o consumidor apresente a espera sem oferecer ações ainda não autorizadas.
 */
export function usePermissoes() {
  const { user } = useAuth()
  const { data: regras, isLoading, isError } = usePermissoesRegras()

  const can = useCallback(
    (recurso: string, acao: AcaoPermissao = 'ver'): boolean => {
      if (!user) return false
      if (user.perfil === 'admin') return true

      // Liberação individual do módulo Contratos (legado, por pessoa). Nunca concede
      // 'admin': Produtos e Tags sempre foram exclusivos de admin, e o bool não pode
      // virar uma porta para eles.
      if (acao !== 'admin' && recurso.startsWith('contratos') && user.acesso_contratos) {
        return true
      }

      if (isLoading || isError || !regras) return false

      const naMatriz = regras.some(
        (r) => (r.recurso === recurso || r.recurso === '*') && regraPermiteAcao(r.acao, acao),
      )

      return naMatriz
    },
    [user, regras, isLoading, isError],
  )

  return { can, carregando: isLoading }
}

// ─── Administração da matriz (tela /admin) ─────────────────────────────────────

/** Perfis editáveis na matriz. `admin` fica fora: tem curinga e não se mexe. */
export const PERFIS_EDITAVEIS = [
  'gerente',
  'estrategista',
  'atendimento',
  'admin_cobranca',
  'agente_chat',
  'agente_cobranca',
  'cliente',
] as const

/** Recursos que a matriz expõe, com rótulo amigável. */
export const RECURSOS = [
  { chave: 'dashboard', label: 'Dashboard' },
  { chave: 'chat', label: 'Conversas' },
  { chave: 'atendimento', label: 'Tickets' },
  { chave: 'automacoes-wa', label: 'Íris' },
  { chave: 'contratos', label: 'Contratos' },
  { chave: 'contratos.onboarding', label: 'Contratos — Vendas novas' },
  { chave: 'cobranca', label: 'Cobrança' },
  { chave: 'clientes', label: 'Clientes' },
  // Estes dois não são "abre a tela?", e sim "enxerga o de todo mundo?".
  // Antes viviam como `admin || gerente` no código; viraram regra editável.
  { chave: 'clientes.carteira', label: 'Clientes — ver a carteira inteira' },
  { chave: 'clientes.atribuir', label: 'Clientes — atribuir responsável' },
  { chave: 'chat.carteira', label: 'Conversas — ver todas as conversas' },
  { chave: 'colaboradores', label: 'Colaboradores' },
  { chave: 'departamentos', label: 'Departamentos' },
  { chave: 'configuracoes', label: 'Configurações da conta' },
  { chave: 'apps', label: 'Módulos ligados' },
  { chave: 'reportes', label: 'Problemas relatados' },
  { chave: 'auditoria', label: 'Auditoria' },
  { chave: 'disparo', label: 'Disparo por tag (CRM)' },
  { chave: 'portal', label: 'Portal do cliente' },
] as const

/** Todas as regras do tenant — só admin consegue ler tudo e escrever (RLS). */
export function useTodasPermissoes() {
  return useQuery({
    queryKey: ['permissoes-app', 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissoes_app')
        .select('id, perfil, recurso, acao')
        .order('perfil')
      if (error) throw error
      return (data ?? []) as Array<RegraPermissao & { id: string }>
    },
  })
}

/**
 * Define a ação de um par (perfil, recurso). `acao = null` remove o acesso.
 * Guarda uma linha por par: trocar de 'ver' para 'editar' substitui, não acumula.
 */
export function useDefinirPermissao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { perfil: string; recurso: string; acao: AcaoPermissao | null }) => {
      const tenantId = await tenantDaSessao()
      const { error: errDel } = await supabase
        .from('permissoes_app')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('perfil', input.perfil)
        .eq('recurso', input.recurso)
      if (errDel) throw errDel

      if (input.acao) {
        const { error } = await supabase
          .from('permissoes_app')
          .insert({ tenant_id: tenantId, perfil: input.perfil, recurso: input.recurso, acao: input.acao })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes-app'] }),
  })
}
