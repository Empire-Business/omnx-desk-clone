import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { IdentidadeEquipeTela } from '@/lib/equipeIdentidades'

/**
 * WhatsApp pessoal da equipe (equipe_identidades). Só admin/gerente com
 * Automações WhatsApp (admin) lê/escreve (RLS). O front nunca recebe o número
 * inteiro: a coluna lida é telefone_fim (4 últimos dígitos).
 *
 * Migration: 20261027120000_chat_autoria.sql
 */

// equipe_identidades ainda não está nos tipos gerados do Supabase.
const semTipos = () => supabase as unknown as SupabaseClient

const chave = ['equipe-identidades'] as const

function tabelaAusente(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

/** null = tabela ainda não existe (migration não aplicada). */
export function useEquipeIdentidades() {
  return useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await semTipos().from('equipe_identidades')
        .select('id, user_id, instance_uuid, telefone_fim, nome_exibicao, origem, ativo, lid_aprendido_em')
        .order('created_at', { ascending: true })
      if (error) { if (tabelaAusente(error)) return null; throw error }
      return (data ?? []) as IdentidadeEquipeTela[]
    },
  })
}

export function useSalvarIdentidadeEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { user_id: string; telefone: string }) => {
      const { error } = await semTipos().from('equipe_identidades')
        .insert({ user_id: input.user_id, telefone_norm: input.telefone, ativo: true })
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('Esse WhatsApp já está cadastrado.')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  })
}

export function useAlterarIdentidadeEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await semTipos().from('equipe_identidades').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  })
}

export function useExcluirIdentidadeEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await semTipos().from('equipe_identidades').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  })
}
