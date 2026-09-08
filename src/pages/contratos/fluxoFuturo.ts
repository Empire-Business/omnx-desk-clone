/**
 * Fluxo de pagamento futuro — cálculo das parcelas a receber, mês a mês.
 *
 * Fonte de verdade: a lista `pagamentos` (cada item tem data + valor). Quando ela
 * não existe, deriva as parcelas de `data_fechamento` (assinatura) + `num_parcelas` +
 * `valor_parcela` — a 1ª parcela cai 1 mês após a assinatura e segue mês a mês.
 * "Futuro" = data >= hoje.
 *
 * IMPORTANTE: NÃO usamos `vencimento` como início do cronograma. No import do Notion,
 * `vencimento` veio como "assinatura + 12 meses" (data de renovação/fim do contrato),
 * então ancorar nele jogava todas as parcelas ~1 ano pra frente e o Recebíveis exibia
 * parcelas já vencidas como futuras.
 */

export interface ParcelaLike {
  data?: string
  valor?: number | string
  sinal?: string
}

export interface ContratoFluxo {
  id: string
  status?: string | null
  pagamentos?: ParcelaLike[] | null
  /** Data real da assinatura (Clicksign). Preferida quando existe. */
  data_assinatura?: string | null
  /** Data principal de exibição — usada quando não há `data_assinatura`. */
  data_fechamento?: string | null
  num_parcelas?: number | null
  valor_parcela?: number | null
}

export interface ParcelaFutura {
  contratoId: string
  mes: string // "YYYY-MM"
  data: string // "YYYY-MM-DD"
  valor: number
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Entrada/sinal não é parcela a receber — é pagamento à vista no fechamento. */
function ehEntrada(sinal?: string): boolean {
  const s = (sinal ?? '').toLowerCase()
  return s.includes('entrada') || s.includes('sinal')
}

/**
 * TODAS as parcelas do cronograma do contrato, sem corte de data — inclui as que
 * já venceram. Serve para a agenda diária, onde a pessoa também precisa olhar
 * para trás ("o que era para cair ontem?").
 */
export function parcelasDoContrato(c: ContratoFluxo): ParcelaFutura[] {
  const out: ParcelaFutura[] = []
  // Só contrato ATIVO tem valor a receber. Cancelado, pausado, concluído e rascunho
  // não entram no fluxo futuro.
  if ((c.status ?? 'ativo') !== 'ativo') return out
  const pags = Array.isArray(c.pagamentos) ? c.pagamentos : []

  if (pags.length > 0) {
    for (const p of pags) {
      if (ehEntrada(p.sinal)) continue // entrada não é parcela a receber
      const data = String(p.data ?? '').slice(0, 10)
      const valor = Number(p.valor) || 0
      if (data.length !== 10 || valor <= 0) continue
      out.push({ contratoId: c.id, mes: data.slice(0, 7), data, valor })
    }
    return out
  }

  // Fallback: deriva as parcelas mensais a partir da DATA DE ASSINATURA.
  // A 1ª parcela vence 1 mês após a assinatura (a entrada/sinal fica no fechamento).
  const assin = String(c.data_assinatura || c.data_fechamento || '').slice(0, 10)
  const n = Number(c.num_parcelas) || 0
  const vp = Number(c.valor_parcela) || 0
  if (assin.length === 10 && n > 1 && vp > 0) {
    const [y, m, d] = assin.split('-').map(Number)
    for (let k = 1; k <= n; k++) {
      const iso = ymd(new Date(y, m - 1 + k, d))
      out.push({ contratoId: c.id, mes: iso.slice(0, 7), data: iso, valor: vp })
    }
  }
  return out
}

/** Parcelas com vencimento >= hojeISO de um contrato. */
export function parcelasFuturasDoContrato(c: ContratoFluxo, hojeISO: string): ParcelaFutura[] {
  return parcelasDoContrato(c).filter((p) => p.data >= hojeISO)
}

/** Soma "n" dias a uma data "YYYY-MM-DD" (n pode ser negativo). */
export function somaDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}

/** Rótulo "sex, 08/08" a partir de "2026-08-08". */
export function rotuloDia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${dow}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Rótulo por extenso: "quinta-feira, 3 de setembro de 2026". */
export function rotuloDiaExtenso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export interface MesFluxo {
  mes: string
  label: string
  valor: number
  parcelas: number
  contratos: number
}

/** Rótulo "ago/26" a partir de "2026-08". */
export function rotuloMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const nome = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${nome}/${String(y).slice(2)}`
}

/**
 * Agrega parcelas futuras por mês, preenchendo meses sem parcela com zero
 * (intervalo contínuo do primeiro ao último mês com recebimento).
 */
export function agruparPorMes(parcelas: ParcelaFutura[]): MesFluxo[] {
  if (parcelas.length === 0) return []
  const porMes = new Map<string, { valor: number; parcelas: number; contratos: Set<string> }>()
  for (const p of parcelas) {
    const cur = porMes.get(p.mes) ?? { valor: 0, parcelas: 0, contratos: new Set<string>() }
    cur.valor += p.valor
    cur.parcelas += 1
    cur.contratos.add(p.contratoId)
    porMes.set(p.mes, cur)
  }

  const meses = Array.from(porMes.keys()).sort()
  const primeiro = meses[0]
  const ultimo = meses[meses.length - 1]
  const [y0, m0] = primeiro.split('-').map(Number)
  const [y1, m1] = ultimo.split('-').map(Number)

  const out: MesFluxo[] = []
  let y = y0
  let m = m0
  while (y < y1 || (y === y1 && m <= m1)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const agg = porMes.get(key)
    out.push({
      mes: key,
      label: rotuloMes(key),
      valor: agg?.valor ?? 0,
      parcelas: agg?.parcelas ?? 0,
      contratos: agg?.contratos.size ?? 0,
    })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}
