import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// A tabela vendas_pendentes ainda não foi regenerada nos types do Supabase,
// então usamos um helper sem tipagem específica.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vp = () => (supabase as any).from('vendas_pendentes')


export interface VendaPendentePagamento {
  data: string
  valor: number
  forma: string
  plataforma: string
  sinal: string
}

export interface VendaPendenteComprovante {
  storage_path: string
  nome_original: string
  mime_type?: string
  tamanho_bytes?: number
}

export interface VendaPendenteEdicao {
  campo: string
  label: string
  antes: string | null
  depois: string | null
  em: string
  por_nome: string | null
}

export interface VendaPendente {
  id: string
  closer_nome: string
  closer_email: string
  cliente_nome: string
  cliente_razao_social: string | null
  cliente_cpf_cnpj: string | null
  cliente_email: string | null
  cliente_whatsapp: string
  cliente_instagram: string | null
  cliente_endereco: string | null
  cliente_cep: string | null
  cliente_logradouro: string | null
  cliente_numero: string | null
  cliente_complemento: string | null
  cliente_bairro: string | null
  cliente_municipio: string | null
  cliente_uf: string | null
  produto_id: string | null
  produto_nome: string | null
  valor_total_venda: number | null
  pagador_diferente: boolean
  pagador_nome: string | null
  pagador_cpf_cnpj: string | null
  pagador_relacao: string | null
  pagador_observacao: string | null
  pagamentos: VendaPendentePagamento[]
  comprovantes: VendaPendenteComprovante[]
  /** Nome do titular como aparece no extrato bancário (lido do comprovante, editável). */
  identificador_pagamento: string | null
  observacoes: string | null
  status: 'pendente' | 'em_atendimento' | 'concluida' | 'descartada'
  atendido_por: string | null
  atendido_em: string | null
  ghl_oportunidade_id: string | null
  ghl_pipeline_name: string | null
  sincronizado_em: string | null
  /** Mensagem da última tentativa de envio ao CRM que falhou; null quando deu certo. */
  sincronizacao_erro: string | null
  historico_edicoes: VendaPendenteEdicao[] | null
  criado_em: string
  atualizado_em: string
}

const key = ['vendas-pendentes'] as const

export function useVendasPendentes(status?: VendaPendente['status']) {
  return useQuery({
    queryKey: [...key, status ?? 'all'],
    queryFn: async () => {
      let q = vp().select('*').order('criado_em', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return data as VendaPendente[]
    },
  })
}

export function useUpdateVendaPendente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<VendaPendente> & { id: string }) => {
      const { id, ...rest } = patch
      const { data, error } = await vp()
        .update(rest)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as VendaPendente
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export async function getComprovanteUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('vendas-comprovantes')
    .createSignedUrl(storagePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}
