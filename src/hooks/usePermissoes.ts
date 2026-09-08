import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Permissões por app (Fase 2 do roadmap de modularização).
 *
 * Substitui, aos poucos, o gate espalhado por `users.perfil` / `acesso_contratos`.
 * A migração é ADITIVA: enquanto uma tela não migrou, ela continua lendo o perfil
 * direto — e este hook mantém o comportamento antigo como rede de segurança.
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

/**
 * Recursos novos que convivem com o gate legado até a migration
 * `20260806130000` estar aplicada em todos os tenants. Ver `can()`.
 */
const RECURSOS_EM_TRANSICAO = new Set([
  'clientes.carteira',
  'chat.carteira',
  'clientes.atribuir',
])

/** Escada de ações: a chave cobre tudo que está na lista. */
const COBERTURA: Record<AcaoPermissao, AcaoPermissao[]> = {
  admin: ['admin', 'editar', 'ver'],
  editar: ['editar', 'ver'],
  ver: ['ver'],
}

export function usePermissoesRegras() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['permissoes-app', user?.perfil ?? 'anon'],
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
 * - **Enquanto as regras carregam, cai no gate legado**, para a tela não piscar
 *   "sem acesso" e depois liberar.
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

      // Sem resposta ainda (ou falha de rede): mantém o comportamento antigo.
      if (isLoading || isError || !regras) return gateLegado(user.perfil, recurso, acao)

      const aceitas = COBERTURA[acao]
      const naMatriz = regras.some(
        (r) => (r.recurso === recurso || r.recurso === '*') && aceitas.includes(r.acao),
      )

      // Recursos criados em 06/08/2026 que ainda podem não existir na matriz de
      // um tenant (migration não aplicada, tenant provisionado antes do seed
      // novo). Enquanto isso, valem os dois em OR — senão o front subiria antes
      // do banco e o gerente perderia a visão da carteira sem aviso. Sai daqui
      // quando `20260806130000` estiver aplicada em todos os tenants.
      if (!naMatriz && RECURSOS_EM_TRANSICAO.has(recurso)) {
        return gateLegado(user.perfil, recurso, acao)
      }

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
  { chave: 'chat', label: 'Chat' },
  { chave: 'atendimento', label: 'Atendimento' },
  { chave: 'contratos', label: 'Contratos' },
  { chave: 'contratos.onboarding', label: 'Contratos — Onboarding' },
  { chave: 'cobranca', label: 'Cobrança' },
  { chave: 'clientes', label: 'Clientes' },
  // Estes dois não são "abre a tela?", e sim "enxerga o de todo mundo?".
  // Antes viviam como `admin || gerente` no código; viraram regra editável.
  { chave: 'clientes.carteira', label: 'Clientes — ver a carteira inteira' },
  { chave: 'clientes.atribuir', label: 'Clientes — atribuir responsável' },
  { chave: 'chat.carteira', label: 'Chat — ver todas as conversas' },
  { chave: 'colaboradores', label: 'Colaboradores' },
  { chave: 'departamentos', label: 'Departamentos' },
  { chave: 'configuracoes', label: 'Configurações da conta' },
  { chave: 'apps', label: 'Loja de Apps' },
  { chave: 'reportes', label: 'Triagem de reportes' },
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
      const { error: errDel } = await supabase
        .from('permissoes_app')
        .delete()
        .eq('perfil', input.perfil)
        .eq('recurso', input.recurso)
      if (errDel) throw errDel

      if (input.acao) {
        const { error } = await supabase
          .from('permissoes_app')
          .insert({ perfil: input.perfil, recurso: input.recurso, acao: input.acao })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissoes-app'] }),
  })
}

/**
 * Gate anterior à Fase 2, mantido como fallback. Espelha o que `AppSidebar` e
 * `ContratosTabs` faziam antes — some quando a última tela migrar.
 */
function gateLegado(perfil: string, recurso: string, acao: AcaoPermissao): boolean {
  if (perfil === 'admin') return true
  // Fora do admin, nada era 'admin' antes (Produtos, Tags, Apps, Reportes).
  if (acao === 'admin') return false
  if (recurso.startsWith('contratos')) {
    if (perfil === 'gerente') return true
    // atendimento via só a aba Onboarding.
    return perfil === 'atendimento' && recurso === 'contratos.onboarding'
  }
  if (recurso === 'portal') return perfil === 'cliente'
  // Carteira inteira e atribuição de responsável eram `admin || gerente`. Sem
  // este recorte, o fallback ("qualquer um menos cliente") entregaria a carteira
  // de todo mundo ao estrategista nos segundos em que as regras carregam — um
  // vazamento de dados por causa de uma rede lenta.
  if (recurso === 'clientes.carteira') {
    // `atendimento` já via a lista inteira de clientes (useClientes).
    return perfil === 'gerente' || perfil === 'atendimento'
  }
  if (recurso === 'clientes.atribuir' || recurso === 'chat.carteira') {
    return perfil === 'gerente'
  }
  // Demais telas do núcleo eram visíveis a qualquer usuário logado.
  return perfil !== 'cliente'
}
