import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Catálogo de produtos da empresa (tabela `products` com client_id NULL).
 * É a lista que alimenta os seletores de produto em contratos, vendas e
 * modelos de contrato. Não confundir com os produtos POR CLIENTE
 * (client_id preenchido), que vivem no Portal de Entregas.
 */
export interface ProdutoCatalogo {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  criado_em: string
  /** Quantos contratos apontam para este produto (por id ou pelo nome legado). */
  contratos: number
}

export const produtoCatalogoKeys = {
  all: ['produtos-catalogo'] as const,
}

/** Lista o catálogo (ativos e inativos) já com a contagem de contratos de cada um. */
export function useProdutosCatalogo() {
  return useQuery({
    queryKey: produtoCatalogoKeys.all,
    queryFn: async () => {
      const [produtosRes, contratosRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, nome, descricao, ativo, criado_em')
          .is('client_id', null)
          .order('nome'),
        supabase.from('contratos').select('produto_id, produto_nome'),
      ])
      if (produtosRes.error) throw produtosRes.error
      if (contratosRes.error) throw contratosRes.error

      // Contratos antigos (importados do Notion) podem ter só o nome do produto,
      // sem produto_id — por isso contamos pelos dois caminhos.
      const porId = new Map<string, number>()
      const porNome = new Map<string, number>()
      for (const c of contratosRes.data ?? []) {
        const id = (c as { produto_id: string | null }).produto_id
        const nome = (c as { produto_nome: string | null }).produto_nome
        if (id) porId.set(id, (porId.get(id) ?? 0) + 1)
        else if (nome) {
          const chave = nome.trim().toLowerCase()
          porNome.set(chave, (porNome.get(chave) ?? 0) + 1)
        }
      }

      const produtos = (produtosRes.data ?? []) as Array<Omit<ProdutoCatalogo, 'contratos'>>
      return produtos.map<ProdutoCatalogo>((p) => ({
        ...p,
        contratos: (porId.get(p.id) ?? 0) + (porNome.get(p.nome.trim().toLowerCase()) ?? 0),
      }))
    },
  })
}

/** Cria um produto do catálogo (client_id NULL). O tenant_id entra por trigger. */
export function useCriarProdutoCatalogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nome: string; descricao?: string | null }) => {
      const { data, error } = await supabase
        .from('products')
        .insert({ client_id: null, nome: input.nome.trim(), descricao: input.descricao?.trim() || null })
        .select('id, nome, descricao, ativo, criado_em')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: produtoCatalogoKeys.all })
      qc.invalidateQueries({ queryKey: ['produtos-list-comissoes'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

/**
 * Atualiza nome, descrição ou o status ativo/inativo.
 * Não existe exclusão de propósito: contratos antigos apontam para o produto,
 * então desativar é o caminho seguro (some dos seletores, histórico intacto).
 */
export function useAtualizarProdutoCatalogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; descricao?: string | null; ativo?: boolean }) => {
      const patch: Record<string, unknown> = {}
      if (input.nome !== undefined) patch.nome = input.nome.trim()
      if (input.descricao !== undefined) patch.descricao = input.descricao?.trim() || null
      if (input.ativo !== undefined) patch.ativo = input.ativo
      const { error } = await supabase.from('products').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: produtoCatalogoKeys.all })
      qc.invalidateQueries({ queryKey: ['produtos-list-comissoes'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
