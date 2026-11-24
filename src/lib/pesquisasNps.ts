/**
 * Regras puras da tela Pesquisas NPS da equipe (/relatorios/pesquisas).
 *
 * Uma campanha é uma linha de `nps_surveys` (sempre de um cliente). As
 * respostas ficam em `nps_responses`. Sem Supabase aqui, para os testes.
 */

export type FaixaNps = 'promotor' | 'neutro' | 'detrator'

export type PlacarNps = {
  /** (promotores − detratores) ÷ total × 100, arredondado. `null` sem respostas. */
  nps: number | null
  /** Média das notas com uma casa. `null` sem respostas. */
  media: number | null
  promotores: number
  neutros: number
  detratores: number
  total: number
}

/** Mesma régua do relatório NPS: 9–10 promotor, 7–8 neutro, 0–6 detrator. */
export function faixaNps(nota: number): FaixaNps {
  if (nota >= 9) return 'promotor'
  if (nota >= 7) return 'neutro'
  return 'detrator'
}

export const ROTULO_FAIXA: Record<FaixaNps, string> = {
  promotor: 'Promotor',
  neutro: 'Neutro',
  detrator: 'Detrator',
}

export function placarNps(notas: readonly number[]): PlacarNps {
  const validas = notas.filter((n) => Number.isFinite(n) && n >= 0 && n <= 10)
  const total = validas.length
  if (!total) return { nps: null, media: null, promotores: 0, neutros: 0, detratores: 0, total: 0 }
  let promotores = 0
  let neutros = 0
  let detratores = 0
  for (const n of validas) {
    const faixa = faixaNps(n)
    if (faixa === 'promotor') promotores++
    else if (faixa === 'neutro') neutros++
    else detratores++
  }
  const soma = validas.reduce((a, n) => a + n, 0)
  return {
    nps: Math.round(((promotores - detratores) / total) * 100),
    media: Math.round((soma / total) * 10) / 10,
    promotores,
    neutros,
    detratores,
    total,
  }
}

/** Classificação usual do NPS (zona), para o texto ao lado do número. */
export function zonaNps(nps: number | null): string {
  if (nps === null) return 'Sem respostas ainda'
  if (nps >= 75) return 'Excelência'
  if (nps >= 50) return 'Qualidade'
  if (nps >= 0) return 'Aperfeiçoamento'
  return 'Crítica'
}

/**
 * Situação da campanha pelas respostas que a equipe consegue ler. Não usa
 * `respondido_em`: quem responde no portal não tem permissão de atualizar a
 * pesquisa, então essa data pode ficar vazia mesmo com resposta gravada.
 */
export function situacaoCampanha(respostas: number): 'respondida' | 'aguardando' {
  return respostas > 0 ? 'respondida' : 'aguardando'
}

/** Só admin cria campanha: a política `admin_manage_nps_surveys` da RLS. */
export function podeCriarCampanha(perfil: string | null | undefined): boolean {
  return perfil === 'admin'
}

/** Endereço que o cliente abre para responder (rota do portal). */
export function linkPesquisa(origem: string, surveyId: string): string {
  return `${origem.replace(/\/+$/, '')}/portal/nps/${encodeURIComponent(surveyId)}`
}

export type ClienteOpcao = { id: string; nome: string }

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Clientes do seletor da campanha, por nome, filtrados pela busca (sem acento e sem caixa). */
export function clientesParaCampanha<T extends ClienteOpcao>(clientes: readonly T[], busca = ''): T[] {
  const alvo = normalizar(busca)
  return clientes
    .filter((c) => !alvo || normalizar(c.nome).includes(alvo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}

export function validarCampanha(clienteId: string, clientes: readonly ClienteOpcao[]): string | undefined {
  if (!clienteId) return 'Escolha o cliente que vai responder.'
  if (!clientes.some((c) => c.id === clienteId)) return 'Esse cliente não está mais na lista. Escolha outro.'
  return undefined
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

/** O item mais novo por `criado_em` (ISO), sem depender da ordem do embed. */
export function maisRecente<T extends { criado_em: string }>(itens: readonly T[]): T | undefined {
  return itens.reduce<T | undefined>((novo, i) => (!novo || i.criado_em > novo.criado_em ? i : novo), undefined)
}
