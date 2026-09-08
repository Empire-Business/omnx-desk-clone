import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Modelos de contrato (.docx) por produto — gerador automático.
 * Um produto pode ter várias variantes (ex.: Anual / Semestral / Recorrente).
 * O arquivo .docx fica no banco em base64 (arquivo_b64); se vazio, usa o
 * modelo-base empacotado em public/modelos-contrato/{arquivo_nome}.
 * Escrita só admin (RLS no banco).
 */
export interface ContratoModelo {
  id: string
  produto_id: string | null
  variante: string | null
  titulo: string | null
  arquivo_nome: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

const tabela = () => supabase.from('contrato_modelos')

const queryKey = ['contratos', 'modelos'] as const

/** Lista os modelos SEM o arquivo (leve) — pra listar e escolher variante. */
export function useContratoModelos() {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await tabela()
        .select('id, produto_id, variante, titulo, arquivo_nome, ativo, criado_em, atualizado_em')
        .order('titulo')
      if (error) throw error
      return (data ?? []) as ContratoModelo[]
    },
  })
}

/** Carrega o arquivo (base64) de um modelo específico — só na hora de gerar. */
export async function carregarModeloArquivo(id: string): Promise<{ arquivo_b64: string | null; arquivo_nome: string | null }> {
  const { data, error } = await tabela().select('arquivo_b64, arquivo_nome').eq('id', id).single()
  if (error) throw error
  return data as { arquivo_b64: string | null; arquivo_nome: string | null }
}

export function useUpsertModelo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      produto_id: string | null
      variante: string | null
      titulo: string | null
      arquivo_nome: string
      arquivo_b64: string
    }) => {
      if (input.id) {
        const { error } = await tabela()
          .update({
            variante: input.variante,
            titulo: input.titulo,
            arquivo_nome: input.arquivo_nome,
            arquivo_b64: input.arquivo_b64,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await tabela().insert({
          produto_id: input.produto_id,
          variante: input.variante,
          titulo: input.titulo,
          arquivo_nome: input.arquivo_nome,
          arquivo_b64: input.arquivo_b64,
        })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}

export function useDeleteModelo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabela().delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}

/** Modelos aplicáveis a um produto: os do produto + os globais (produto_id NULL). */
export function modelosDoProduto(modelos: ContratoModelo[] | undefined, produtoId: string | null): ContratoModelo[] {
  if (!modelos) return []
  const doProduto = modelos.filter((m) => m.ativo && m.produto_id === produtoId)
  const globais = modelos.filter((m) => m.ativo && m.produto_id == null)
  return doProduto.length > 0 ? doProduto : globais
}
