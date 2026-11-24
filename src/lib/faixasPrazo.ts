/**
 * Faixas de prazo dos tickets em aberto — o equivalente à tela de prazos do
 * Acompanhamento do OMNX Clients (vencidas, hoje, em breve, no prazo, sem prazo).
 *
 * Só leitura: usa o `prazo` (data, sem hora) que o ticket já tem.
 */
export type FaixaPrazo = 'vencida' | 'hoje' | 'em_breve' | 'no_prazo' | 'sem_prazo'

export const ORDEM_FAIXAS: FaixaPrazo[] = ['vencida', 'hoje', 'em_breve', 'no_prazo', 'sem_prazo']

export const ROTULO_FAIXA: Record<FaixaPrazo, string> = {
  vencida: 'Vencidos',
  hoje: 'Vencem hoje',
  em_breve: 'Próximos 7 dias',
  no_prazo: 'No prazo',
  sem_prazo: 'Sem prazo',
}

const DIA = 86_400_000
const DIAS_EM_BREVE = 7

function inicioDoDia(d: Date): number {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c.getTime()
}

export function faixaDoPrazo(prazo: string | null | undefined, agora: Date): FaixaPrazo {
  if (!prazo) return 'sem_prazo'
  const data = new Date(`${prazo.slice(0, 10)}T00:00:00`).getTime()
  if (Number.isNaN(data)) return 'sem_prazo'
  const hoje = inicioDoDia(agora)
  if (data < hoje) return 'vencida'
  if (data === hoje) return 'hoje'
  if (data <= hoje + DIAS_EM_BREVE * DIA) return 'em_breve'
  return 'no_prazo'
}

/** Agrupa por faixa; dentro de cada faixa, o prazo mais próximo (ou mais vencido) vem primeiro. */
export function agruparPorFaixa<T>(
  itens: T[],
  prazoDe: (item: T) => string | null | undefined,
  agora: Date,
): Record<FaixaPrazo, T[]> {
  const grupos: Record<FaixaPrazo, T[]> = { vencida: [], hoje: [], em_breve: [], no_prazo: [], sem_prazo: [] }
  itens.forEach((item) => grupos[faixaDoPrazo(prazoDe(item), agora)].push(item))
  ORDEM_FAIXAS.forEach((f) => {
    if (f === 'sem_prazo') return
    grupos[f].sort((a, b) => String(prazoDe(a)).localeCompare(String(prazoDe(b))))
  })
  return grupos
}
