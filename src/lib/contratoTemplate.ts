/**
 * Modelo de contrato: campos automáticos ({{...}}) e preenchimento com os dados
 * reais do cliente/venda. Usado no gerador de contrato do onboarding.
 */

export interface Parcela {
  data?: string | null
  valor?: number | null
  forma?: string | null
  plataforma?: string | null
  sinal?: string | null
}

export interface DadosContrato {
  cliente_nome?: string | null
  empresa?: string | null
  cpf_cnpj?: string | null
  email?: string | null
  whatsapp?: string | null
  instagram?: string | null
  endereco?: string | null
  produto_nome?: string | null
  valor_total?: number | null
  num_parcelas?: number | null
  valor_parcela?: number | null
  entrada?: number | null
  forma_pagamento?: string | null
  data_fechamento?: string | null
  estrategista?: string | null
  vendedor?: string | null
  /** Plano de pagamento (parcelas do lead) — usado na tabela do contrato. */
  parcelas?: Parcela[]
}

/** Campos disponíveis pra inserir no modelo (usados nos botões da tela de modelos). */
export const VARIAVEIS: { chave: string; label: string }[] = [
  { chave: 'cliente_nome', label: 'Nome do cliente' },
  { chave: 'empresa', label: 'Empresa / Razão social' },
  { chave: 'cpf_cnpj', label: 'CPF / CNPJ' },
  { chave: 'email', label: 'E-mail' },
  { chave: 'whatsapp', label: 'WhatsApp' },
  { chave: 'instagram', label: 'Instagram' },
  { chave: 'endereco', label: 'Endereço' },
  { chave: 'produto_nome', label: 'Produto' },
  { chave: 'valor_total', label: 'Valor total' },
  { chave: 'num_parcelas', label: 'Nº de parcelas' },
  { chave: 'valor_parcela', label: 'Valor da parcela' },
  { chave: 'entrada', label: 'Entrada' },
  { chave: 'forma_pagamento', label: 'Forma de pagamento' },
  { chave: 'data_fechamento', label: 'Data de assinatura' },
  { chave: 'data_hoje', label: 'Data de hoje' },
  { chave: 'data_extenso', label: 'Data por extenso' },
  { chave: 'estrategista', label: 'Estrategista' },
  { chave: 'vendedor', label: 'Vendedor' },
]

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return ''
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
function dataExtenso(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/** Constrói o mapa {chave → valor formatado} a partir dos dados. */
export function montarValores(d: DadosContrato): Record<string, string> {
  const hoje = new Date()
  return {
    cliente_nome: d.cliente_nome ?? '',
    empresa: d.empresa ?? '',
    cpf_cnpj: d.cpf_cnpj ?? '',
    email: d.email ?? '',
    whatsapp: d.whatsapp ?? '',
    instagram: d.instagram ?? '',
    endereco: d.endereco ?? '',
    produto_nome: d.produto_nome ?? '',
    valor_total: fmtBRL(d.valor_total),
    num_parcelas: d.num_parcelas != null ? String(d.num_parcelas) : '',
    valor_parcela: fmtBRL(d.valor_parcela),
    entrada: fmtBRL(d.entrada),
    forma_pagamento: d.forma_pagamento ?? '',
    data_fechamento: fmtData(d.data_fechamento),
    data_hoje: fmtData(hoje.toISOString()),
    data_extenso: dataExtenso(hoje),
    estrategista: d.estrategista ?? '',
    vendedor: d.vendedor ?? '',
  }
}

/** Troca {{campo}} pelos valores reais. Campos desconhecidos ficam como estão. */
export function preencherModelo(template: string, d: DadosContrato): string {
  const vals = montarValores(d)
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, chave: string) =>
    Object.prototype.hasOwnProperty.call(vals, chave) ? vals[chave] : m,
  )
}

/**
 * Dados pro docxtemplater: os campos escalares + o array `parcelas` já formatado
 * (usado no loop {#parcelas} da tabela de pagamentos).
 */
export function montarDadosDocx(d: DadosContrato): Record<string, unknown> {
  const parcelas = d.parcelas ?? []
  // Escalares numerados por linha da tabela: {venc1}/{valor1}/{plat1}/{forma1}...
  const numerados: Record<string, string> = {}
  parcelas.forEach((p, i) => {
    const n = i + 1
    numerados[`venc${n}`] = fmtData(p.data)
    // sem "R$" — a célula da tabela já tem o prefixo "R$ "
    numerados[`valor${n}`] = p.valor != null ? Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
    numerados[`plat${n}`] = p.plataforma ?? ''
    numerados[`forma${n}`] = p.forma ?? ''
    numerados[`desc${n}`] = p.sinal ?? ''
  })
  // Também expõe o array `parcelas` (caso algum modelo use loop {#parcelas}).
  const arr = parcelas.map((p, i) => ({
    n: i + 1,
    venc: fmtData(p.data),
    valor: p.valor != null ? fmtBRL(p.valor) : '',
    forma: p.forma ?? '',
    plataforma: p.plataforma ?? '',
    desc: p.sinal ?? '',
  }))
  return { ...montarValores(d), ...numerados, parcelas: arr }
}
