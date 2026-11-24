import type { TablesUpdate } from '@/integrations/supabase/types'
import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Tag {
  id: string
  nome: string
  cor: string
  descricao?: string | null
}

// Paleta de cores para novas tags — tons legíveis em tema claro e escuro.
export const TAG_PALETTE = [
  '#2563eb', '#059669', '#7c3aed', '#d97706',
  '#dc2626', '#0891b2', '#4f46e5', '#db2777',
  '#0d9488', '#ca8a04', '#9333ea', '#e11d48',
]

/** Cor determinística a partir do nome (mesma tag → mesma cor). */
export function corParaTag(nome: string): string {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}

export interface TagComUso extends Tag {
  uso: number
}

const tagKeys = {
  all: ['tags'] as const,
  comUso: ['tags', 'com-uso'] as const,
  doContrato: (contratoId: string) => ['contrato-tags', contratoId] as const,
}

/** Catálogo completo de tags (ordenado por nome). */
export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, nome, cor, descricao')
        .order('nome')
      if (error) throw error
      return data as Tag[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Tags de um contrato específico. */
export function useContratoTags(contratoId: string | undefined) {
  return useQuery({
    queryKey: tagKeys.doContrato(contratoId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contrato_tags')
        .select('tags(id, nome, cor, descricao)')
        .eq('contrato_id', contratoId!)
      if (error) throw error
      return ((data ?? []) as Array<{ tags: Tag | null }>)
        .map((r) => r.tags)
        .filter((t): t is Tag => Boolean(t))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },
    enabled: Boolean(contratoId),
  })
}

/**
 * Cria uma tag no catálogo. Se já existir uma com o mesmo nome
 * (case-insensitive), retorna a existente em vez de duplicar.
 */
export function useCriarTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nome, cor }: { nome: string; cor?: string }): Promise<Tag> => {
      const nomeLimpo = nome.trim()
      // Já existe? (o índice único é por lower(nome))
      const { data: existente } = await supabase
        .from('tags')
        .select('id, nome, cor')
        .ilike('nome', nomeLimpo)
        .maybeSingle()
      if (existente) return existente as Tag

      const { data, error } = await supabase
        .from('tags')
        .insert({ ...({ nome: nomeLimpo, cor: cor ?? corParaTag(nomeLimpo) }), tenant_id: await tenantDaSessao() })
        .select('id, nome, cor')
        .single()
      if (error) throw error
      return data as Tag
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  })
}

/** Vincula uma tag a um contrato (idempotente). */
export function useAplicarTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contratoId, tagId }: { contratoId: string; tagId: string }) => {
      const { error } = await supabase
        .from('contrato_tags')
        .upsert({ ...({ contrato_id: contratoId, tag_id: tagId }), tenant_id: await tenantDaSessao() }, { onConflict: 'contrato_id,tag_id' })
      if (error) throw error
    },
    onSuccess: (_d, { contratoId }) => {
      qc.invalidateQueries({ queryKey: tagKeys.doContrato(contratoId) })
      qc.invalidateQueries({ queryKey: ['comissoes', 'contratos'] })
    },
  })
}

/** Aplica uma tag a vários contratos de uma vez (idempotente). */
export function useAplicarTagEmMassa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contratoIds, tagId }: { contratoIds: string[]; tagId: string }) => {
      if (contratoIds.length === 0) return
      const tenant_id = await tenantDaSessao()
      const rows = contratoIds.map((contrato_id) => ({ contrato_id, tag_id: tagId, tenant_id }))
      const { error } = await supabase
        .from('contrato_tags')
        .upsert(rows, { onConflict: 'contrato_id,tag_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contrato-tags'] })
      qc.invalidateQueries({ queryKey: tagKeys.comUso })
      qc.invalidateQueries({ queryKey: ['comissoes', 'contratos'] })
    },
  })
}

/** Remove uma tag de um contrato. */
export function useRemoverTagDoContrato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contratoId, tagId }: { contratoId: string; tagId: string }) => {
      const { error } = await supabase
        .from('contrato_tags')
        .delete()
        .eq('contrato_id', contratoId)
        .eq('tag_id', tagId)
      if (error) throw error
    },
    onSuccess: (_d, { contratoId }) => {
      qc.invalidateQueries({ queryKey: tagKeys.doContrato(contratoId) })
      qc.invalidateQueries({ queryKey: ['comissoes', 'contratos'] })
    },
  })
}

/** Catálogo de tags com a contagem de contratos que usam cada uma. */
export function useTagsComUso() {
  return useQuery({
    queryKey: tagKeys.comUso,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, nome, cor, descricao, contrato_tags(count)')
        .order('nome')
      if (error) throw error
      return ((data ?? []) as Array<Tag & { contrato_tags: Array<{ count: number }> }>).map((t) => ({
        id: t.id,
        nome: t.nome,
        cor: t.cor,
        descricao: t.descricao ?? null,
        uso: t.contrato_tags?.[0]?.count ?? 0,
      })) as TagComUso[]
    },
  })
}

/** Renomeia e/ou muda a cor de uma tag do catálogo. */
export function useAtualizarTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nome, cor, descricao }: { id: string; nome?: string; cor?: string; descricao?: string | null }) => {
      const patch: TablesUpdate<'tags'> = {}
      if (nome !== undefined) patch.nome = nome.trim()
      if (cor !== undefined) patch.cor = cor
      if (descricao !== undefined) patch.descricao = descricao?.trim() || null
      const { error } = await supabase.from('tags').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.all })
      qc.invalidateQueries({ queryKey: ['contrato-tags'] })
      qc.invalidateQueries({ queryKey: ['comissoes', 'contratos'] })
    },
  })
}

/** Exclui uma tag do catálogo (remove de todos os contratos por cascade). */
export function useDeletarTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.all })
      qc.invalidateQueries({ queryKey: ['contrato-tags'] })
      qc.invalidateQueries({ queryKey: ['comissoes', 'contratos'] })
    },
  })
}
