import { carregarClientesContratos, type ClienteContrato } from '@/lib/contratoClientes'
import type { TablesUpdate } from '@/integrations/supabase/types'
import { tenantDaSessao } from '@/lib/authTenant'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invalidarClientesAposContrato } from '@/lib/clienteContratoCache'
import type { Tag } from '@/hooks/useTags'

export type StatusComissao = 'prevista' | 'aprovada' | 'paga' | 'cancelada' | 'postergada'
export type StatusExtrato = 'rascunho' | 'aprovado' | 'pago'

// Parcela de pagamento do contrato — mesmo formato da venda do onboarding
// (vendas_pendentes.pagamentos), pra poder fluir do onboarding pro contrato.
export type ContratoPagamento = {
  data: string
  valor: number
  forma: string
  plataforma: string
  sinal: string
}

/** Valida o JSON persistido antes de usá-lo no cronograma financeiro. */
function lerPagamentos(valor: unknown): ContratoPagamento[] {
  if (valor == null) return []
  if (!Array.isArray(valor)) throw new Error('O cronograma de pagamentos do contrato está inválido.')
  return valor.map(item => {
    if (!item || typeof item !== 'object' || typeof item.valor !== 'number' || !Number.isFinite(item.valor)) {
      throw new Error('O cronograma de pagamentos do contrato contém um valor inválido.')
    }
    return {
      data: typeof item.data === 'string' ? item.data : '',
      valor: item.valor,
      forma: typeof item.forma === 'string' ? item.forma : '',
      plataforma: typeof item.plataforma === 'string' ? item.plataforma : '',
      sinal: typeof item.sinal === 'string' ? item.sinal : '',
    }
  })
}

export interface Contrato {
  clientes?: ClienteContrato[]
  id: string
  cliente_id: string | null
  cliente_nome: string
  produto_id: string | null
  produto_nome: string | null
  estrategista_id: string | null
  estrategista_nome_raw: string | null
  /** Data principal de exibição. Historicamente mistura assinatura e pagamento. */
  data_fechamento: string
  /** Quando o contrato foi assinado — preenchida pelo gatilho do Clicksign. */
  data_assinatura: string | null
  /**
   * Quando a entrada foi paga. Acompanha o cronograma (sinal "Entrada"), mas uma
   * edição manual na tela é preservada. É a ordenação padrão da lista de contratos.
   */
  data_pagamento: string | null
  valor_total: number
  valor_parcela: number | null
  num_parcelas: number
  percentual_aplicado: number
  vencimento: string | null
  /** Prazo confirmado; independente de vencimentos financeiros. */
  vigencia_fim?: string | null
  vigencia_motivo?: string | null
  status: 'rascunho' | 'ativo' | 'pausado' | 'cancelado' | 'concluido'
  status_secundario: string | null
  observacoes: string | null
  // Pagamento feito por terceiro (contrato no nome de um, pago por outro)
  pagador_diferente: boolean
  pagador_nome: string | null
  pagador_cpf_cnpj: string | null
  pagador_relacao: string | null
  pagador_observacao: string | null
  pagamentos: ContratoPagamento[]
  notion_page_id: string | null
  notion_numero: string | null
  notion_ultima_edicao: string | null
  whatsapp: string | null
  email: string | null
  cpf_cnpj: string | null
  empresa: string | null
  endereco: string | null
  instagram: string | null
  nicho: string | null
  posicionamento: string | null
  resumo: string | null
  faturamento: string | null
  fat_bruto: number | null
  entrada: number | null
  pg_entrada: string | null
  forma_pagamento: string | null
  link_clicksign: string | null
  plano_dias: number | null
  semanas: number | null
  renovacao: string | null
  vendedor: string | null
  treinador: string | null
  bonus: string | null
  venda_interna: boolean | null
  venda_diretoria: boolean | null
  seguidores_inicio: number | null
  seguidores_fim: number | null
  crescimento_seguidores: number | null
  videos_postados: number | null
  entregas_no_prazo: number | null
  entregas_totais: number | null
  nps_vip: string | null
  importado_em: string | null
  criado_em: string
  atualizado_em: string
  // Preenchido só na listagem (useContratos) via join com contrato_tags.
  // Não é coluna de `contratos` — nunca deve ir num update/patch.
  tags?: Tag[]
}

export interface Comissao {
  id: string
  contrato_id: string
  estrategista_id: string
  cliente_nome: string
  parcela_num: number
  total_parcelas: number
  mes_referencia: string
  valor_calculado: number
  valor_final: number
  status: StatusComissao
  postergada_para: string | null
  extrato_id: string | null
  observacoes_gestor: string | null
  eh_bonus: boolean
}

export interface ExtratoMensal {
  id: string
  estrategista_id: string
  estrategista_nome: string
  estrategista_doc: string | null
  mes_referencia: string
  total_bruto: number
  total_liquido: number
  status: StatusExtrato
  aprovado_em: string | null
  pago_em: string | null
}

export type TipoComissao = 'valor_fixo' | 'percentual' | 'valor_total'

export interface ProdutoComissao {
  produto_id: string
  tipo_comissao: TipoComissao
  valor_comissao_padrao: number
  percentual_padrao: number
  parcelas_padrao: number
  valor_bonus: number
  bonus_condicional: boolean
  observacoes: string | null
}

export interface Consultor {
  id: string
  nome: string
  email: string
  perfil: string
  tipo_consultor: 'comissao' | 'salario_fixo' | null
  salario_fixo_mensal: number | null
  cnpj_cpf: string | null
  ativo_comissoes: boolean
}

export interface AlertaEstrategista {
  estrategista_id: string
  estrategista_nome: string
  entregas_atrasadas: number
  chat_negativo: number
  ranking_pos: number | null
}

const k = {
  contratos: ['comissoes', 'contratos'] as const,
  comissoesMes: (mes: string) => ['comissoes', 'mes', mes] as const,
  comissoesEstrat: (estratId: string) => ['comissoes', 'estrat', estratId] as const,
  extratos: ['comissoes', 'extratos'] as const,
  extrato: (id: string) => ['comissoes', 'extrato', id] as const,
  produtos: ['comissoes', 'produtos'] as const,
  consultores: ['comissoes', 'consultores'] as const,
  alertas: ['comissoes', 'alertas'] as const,
}

export function useContratos() {
  return useQuery({
    queryKey: k.contratos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos')
        .select('*, contrato_tags(criado_em, tags(id, nome, cor, descricao))')
        .order('data_fechamento', { ascending: false })
      if (error) throw error
      // Achata contrato_tags[{tags}] em contrato.tags[] — ordenadas da mais antiga
      // para a mais recente (ordem de aplicação no contrato).
      return carregarClientesContratos(supabase, (data ?? []).map(
        ({ contrato_tags, ...c }) => ({
          ...c,
          pagamentos: lerPagamentos(c.pagamentos),
          tags: (contrato_tags ?? [])
            .filter(ct => Boolean(ct.tags))
            .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
            .map((ct) => ct.tags),
        }),
      ) as Contrato[])
    },
  })
}

/** Contratos de um cliente específico (tabela rica de Comissões). */
export function useContratosByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ['comissoes', 'contratos', 'by-cliente', clienteId] as const,
    queryFn: async () => {
      const vinculos = await supabase.from('contrato_clientes_atendidos').select('contrato_id').eq('cliente_id', clienteId!)
      if (vinculos.error) throw vinculos.error
      const ids = [...new Set((vinculos.data ?? []).flatMap(v => v.contrato_id ? [v.contrato_id] : []))]
      if (!ids.length) return []
      const { data, error } = await supabase
        .from('contratos')
        .select('*')
        .in('id', ids)
        .order('data_fechamento', { ascending: false })
      if (error) throw error
      return carregarClientesContratos(supabase, data.map(contrato => ({ ...contrato, pagamentos: lerPagamentos(contrato.pagamentos) })) as Contrato[])
    },
    enabled: Boolean(clienteId),
    staleTime: 2 * 60 * 1000,
  })
}

export function useContrato(id: string | undefined) {
  return useQuery({
    queryKey: ['comissoes', 'contrato', id],
    queryFn: async () => {
      if (!id) throw new Error('Contrato não informado.')
      const { data, error } = await supabase
        .from('contratos')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return (await carregarClientesContratos(supabase, [{ ...data, pagamentos: lerPagamentos(data.pagamentos) } as Contrato]))[0]
    },
    enabled: Boolean(id),
  })
}

export type NovoContratoInput = {
  cliente_id?: string | null
  cliente_nome: string
  produto_id?: string | null
  produto_nome?: string | null
  estrategista_id: string | null
  data_fechamento: string
  valor_total: number
  num_parcelas: number
  percentual_aplicado: number
  status: Contrato['status']
  observacoes?: string | null
} & Partial<Contrato>

export function useCreateContrato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tags: _tags, clientes: _clientes, ...input }: NovoContratoInput) => {
      const { data, error } = await supabase.from('contratos').insert({ ...(input), tenant_id: await tenantDaSessao() }).select().single()
      if (error) throw error
      return { ...data, pagamentos: lerPagamentos(data.pagamentos) } as Contrato
    },
    onSuccess: () => {
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['comissoes'] }),
        invalidarClientesAposContrato(qc),
      ])
    },
  })
}

export function useUpdateContrato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tags: _tags, clientes: _clientes, ...patch }: Partial<Contrato> & { id: string }) => {
      const { data, error } = await supabase.from('contratos').update(patch).eq('id', id).select().single()
      if (error) throw error
      return { ...data, pagamentos: lerPagamentos(data.pagamentos) } as Contrato
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['comissoes'] }),
      invalidarClientesAposContrato(qc),
    ]),
  })
}

export function useDeleteContrato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contratos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['comissoes'] }),
      invalidarClientesAposContrato(qc),
    ]),
  })
}

export function useComissoesDoMes(mes: string) {
  return useQuery({
    queryKey: k.comissoesMes(mes),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comissoes')
        .select('*')
        .eq('mes_referencia', mes)
        .order('estrategista_id')
      if (error) throw error
      return data as Comissao[]
    },
    enabled: Boolean(mes),
  })
}

export function useMinhasComissoes() {
  return useQuery({
    queryKey: ['comissoes', 'minhas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comissoes')
        .select('*')
        .order('mes_referencia', { ascending: false })
      if (error) throw error
      return data as Comissao[]
    },
  })
}

export function useUpdateComissao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Comissao> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const payload: TablesUpdate<'comissoes'> = { ...patch, editado_por: user?.id, editado_em: new Date().toISOString() }
      const { data, error } = await supabase.from('comissoes').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data as Comissao
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes'] }),
  })
}

export function useExtratos() {
  return useQuery({
    queryKey: k.extratos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extratos_mensais')
        .select('*')
        .order('mes_referencia', { ascending: false })
      if (error) throw error
      return data as ExtratoMensal[]
    },
  })
}

export function useExtrato(id: string) {
  return useQuery({
    queryKey: k.extrato(id),
    queryFn: async () => {
      const { data: extrato, error } = await supabase
        .from('extratos_mensais').select('*').eq('id', id).single()
      if (error) throw error
      const { data: itens, error: e2 } = await supabase
        .from('comissoes').select('*').eq('extrato_id', id).order('cliente_nome')
      if (e2) throw e2
      const { data: salfix, error: e3 } = await supabase
        .from('salario_fixo_itens').select('*').eq('extrato_id', id).order('ordem')
      if (e3) throw e3
      return { extrato: extrato as ExtratoMensal, itens: itens as Comissao[], salfix: salfix as Array<{ id: string; cliente_nome: string; descricao: string | null; valor: number }> }
    },
    enabled: Boolean(id),
  })
}

export function useAprovarExtrato() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ estrategista_id, mes }: { estrategista_id: string; mes: string }) => {
      const { data, error } = await supabase.rpc('aprovar_extrato_mes', {
        p_estrategista_id: estrategista_id,
        p_mes: mes,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes'] }),
  })
}

export function useMarcarExtratoPago() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('extratos_mensais')
        .update({ status: 'pago', pago_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes'] }),
  })
}

export function useProdutosComissao() {
  return useQuery({
    queryKey: k.produtos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos_comissao')
        .select('*, products(id, nome)')
      if (error) throw error
      return data as Array<ProdutoComissao & { products: { id: string; nome: string } | null }>
    },
  })
}

export function useUpsertProdutoComissao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProdutoComissao) => {
      const { data, error } = await supabase
        .from('produtos_comissao')
        .upsert({ ...({ ...input, atualizado_em: new Date().toISOString() }), tenant_id: await tenantDaSessao() })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k.produtos }),
  })
}

export function useCriarProdutoComissao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nome: string } & Omit<ProdutoComissao, 'produto_id'>) => {
      const nome = input.nome.trim()
      if (!nome) throw new Error('Informe o nome do produto.')

      // 1. Cria o produto de catálogo (client_id NULL)
      const { data: prod, error: errProd } = await supabase
        .from('products')
        .insert({ ...({ nome, descricao: 'Oferta comercial — catálogo', ativo: true }), tenant_id: await tenantDaSessao() })
        .select('id, nome')
        .single()
      if (errProd) {
        if (errProd.code === '23505') throw new Error('Já existe um produto com esse nome.')
        throw errProd
      }

      // 2. Cria a configuração de comissão vinculada
      const { error: errCfg } = await supabase.from('produtos_comissao').insert({ ...({
        produto_id: prod.id,
        tipo_comissao: input.tipo_comissao,
        valor_comissao_padrao: input.valor_comissao_padrao,
        percentual_padrao: input.percentual_padrao,
        parcelas_padrao: input.parcelas_padrao,
        valor_bonus: input.valor_bonus,
        bonus_condicional: input.bonus_condicional,
        observacoes: input.observacoes,
      }), tenant_id: await tenantDaSessao() })
      if (errCfg) throw errCfg

      return prod
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos-list-comissoes'] })
      qc.invalidateQueries({ queryKey: k.produtos })
    },
  })
}

export function useConsultores() {
  return useQuery({
    queryKey: k.consultores,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, nome, email, perfil, tipo_consultor, salario_fixo_mensal, cnpj_cpf, ativo_comissoes')
        .in('perfil', ['estrategista', 'admin', 'gerente'])
        .order('nome')
      if (error) throw error
      return data as Consultor[]
    },
  })
}

export function useUpdateConsultor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Consultor> & { id: string }) => {
      const { error } = await supabase.from('users').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k.consultores }),
  })
}

export function useAlertas() {
  return useQuery({
    queryKey: k.alertas,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_alertas_estrategista').select('*')
      if (error) throw error
      return data as AlertaEstrategista[]
    },
  })
}

// ============================================================
// Audit log
// ============================================================
export interface AuditEntry {
  id: string
  contrato_id: string
  operacao: 'INSERT' | 'UPDATE' | 'DELETE'
  campo: string | null
  valor_antigo: string | null
  valor_novo: string | null
  alterado_por: string | null
  alterado_em: string
  usuario: { nome: string } | null
}

export function useAuditContrato(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['comissoes', 'audit', contratoId],
    queryFn: async () => {
      if (!contratoId) throw new Error('Contrato não informado.')
      const { data, error } = await supabase
        .from('contratos_audit_log')
        .select('*, usuario:users(nome)')
        .eq('contrato_id', contratoId)
        .order('alterado_em', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as AuditEntry[]
    },
    enabled: Boolean(contratoId),
  })
}

// ============================================================
// Anexos
// ============================================================
export interface ContratoAnexo {
  id: string
  contrato_id: string
  nome_original: string
  storage_path: string
  mime_type: string | null
  tamanho_bytes: number | null
  categoria: 'contrato' | 'comprovante_entrada' | 'nota_fiscal' | 'outro'
  enviado_por: string | null
  enviado_em: string
}

export function useAnexos(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['comissoes', 'anexos', contratoId],
    queryFn: async () => {
      if (!contratoId) throw new Error('Contrato não informado.')
      const { data, error } = await supabase
        .from('contrato_anexos')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('enviado_em', { ascending: false })
      if (error) throw error
      return data as ContratoAnexo[]
    },
    enabled: Boolean(contratoId),
  })
}

export function useUploadAnexo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      contratoId, file, categoria,
    }: { contratoId: string; file: File; categoria: ContratoAnexo['categoria'] }) => {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `${contratoId}/${crypto.randomUUID()}.${ext}`
      const { error: e1 } = await supabase.storage.from('contratos-anexos').upload(path, file, {
        contentType: file.type, upsert: false,
      })
      if (e1) throw e1
      const { data: { user } } = await supabase.auth.getUser()
      const { error: e2 } = await supabase.from('contrato_anexos').insert({ ...({
        contrato_id: contratoId,
        nome_original: file.name,
        storage_path: path,
        mime_type: file.type,
        tamanho_bytes: file.size,
        categoria,
        enviado_por: user?.id,
      }), tenant_id: await tenantDaSessao() })
      if (e2) throw e2
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['comissoes', 'anexos', vars.contratoId] }),
  })
}

export function useDeleteAnexo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (anexo: ContratoAnexo) => {
      await supabase.storage.from('contratos-anexos').remove([anexo.storage_path])
      const { error } = await supabase.from('contrato_anexos').delete().eq('id', anexo.id)
      if (error) throw error
      return anexo
    },
    onSuccess: (anexo) => qc.invalidateQueries({ queryKey: ['comissoes', 'anexos', anexo.contrato_id] }),
  })
}

export async function getAnexoDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('contratos-anexos').createSignedUrl(storagePath, 60 * 5)
  if (error) throw error
  return data.signedUrl
}

// ============================================================
// Extrações de PDF via IA
// ============================================================
export interface PdfExtraction {
  id: string
  contrato_id: string
  anexo_id: string | null
  modelo: string
  dados_extraidos: Record<string, unknown>
  tokens_input: number | null
  tokens_output: number | null
  aplicado_em: string | null
  aplicado_por: string | null
  criado_em: string
}

export function usePdfExtractions(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['comissoes', 'pdf-extractions', contratoId],
    queryFn: async () => {
      if (!contratoId) throw new Error('Contrato não informado.')
      const { data, error } = await supabase
        .from('contrato_pdf_extractions')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data as PdfExtraction[]
    },
    enabled: Boolean(contratoId),
  })
}

export function useExtractPdf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contratoId, anexoId }: { contratoId: string; anexoId?: string }) => {
      const { data, error } = await supabase.functions.invoke('contrato-extract-pdf', {
        body: { contrato_id: contratoId, anexo_id: anexoId },
      })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { extraction_id: string; dados_extraidos: Record<string, unknown> }
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['comissoes', 'pdf-extractions', vars.contratoId] }),
  })
}

export function useApplyExtraction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ extractionId, contratoId, dados }: {
      extractionId: string; contratoId: string; dados: Record<string, unknown>
    }) => {
      // Aplica os campos não-nulos no contrato
      const patch: TablesUpdate<'contratos'> = {}
      const camposTexto = ['cliente_nome', 'empresa', 'cpf_cnpj', 'endereco', 'email', 'produto_nome', 'data_fechamento', 'vencimento', 'forma_pagamento', 'observacoes'] as const
      const camposNumero = ['valor_total', 'valor_parcela', 'num_parcelas', 'entrada', 'plano_dias'] as const
      for (const campo of camposTexto) {
        const valor = dados[campo]
        if (valor === undefined || valor === null || valor === '') continue
        if (typeof valor !== 'string') throw new Error('A extração contém um campo de texto inválido. Revise os dados.')
        patch[campo] = valor
      }
      for (const campo of camposNumero) {
        const valor = dados[campo]
        if (valor === undefined || valor === null || valor === '') continue
        if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error('A extração contém um valor numérico inválido. Revise os dados.')
        patch[campo] = valor
      }
      if (Object.keys(patch).length === 0) throw new Error('Não há campos válidos para aplicar.')
      const { data: { user } } = await supabase.auth.getUser()
      const { error: ec } = await supabase.from('contratos').update(patch).eq('id', contratoId)
      if (ec) throw ec
      const { error: ee } = await supabase.from('contrato_pdf_extractions').update({
        aplicado_em: new Date().toISOString(),
        aplicado_por: user?.id,
      }).eq('id', extractionId)
      if (ee) throw ee
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['comissoes', 'contrato', vars.contratoId] })
      qc.invalidateQueries({ queryKey: ['comissoes', 'pdf-extractions', vars.contratoId] })
    },
  })
}

// ============================================================
// Aliases de estrategistas
// ============================================================
export interface EstrategistaAlias {
  id: string
  alias_normalizado: string
  alias_original: string
  user_id: string
  criado_em: string
}

export function useAliases() {
  return useQuery({
    queryKey: ['comissoes', 'aliases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estrategista_aliases')
        .select('*, users!estrategista_aliases_user_id_fkey(nome)')
        .order('alias_original')
      if (error) throw error
      return data as Array<EstrategistaAlias & { users: { nome: string } | null }>
    },
  })
}

export function useCreateAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ alias_original, user_id }: { alias_original: string; user_id: string }) => {
      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
      const { error } = await supabase.from('estrategista_aliases').insert({ ...({
        alias_original,
        alias_normalizado: normalize(alias_original),
        user_id,
      }), tenant_id: await tenantDaSessao() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes', 'aliases'] }),
  })
}

export function useDeleteAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('estrategista_aliases').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comissoes', 'aliases'] }),
  })
}

export function useClientesList() {
  return useQuery({
    queryKey: ['clientes-list-comissoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, nome').order('nome')
      if (error) throw error
      return data as Array<{ id: string; nome: string }>
    },
  })
}

export function useProdutosList() {
  return useQuery({
    queryKey: ['produtos-list-comissoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, nome')
        .is('client_id', null)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data as Array<{ id: string; nome: string }>
    },
  })
}
