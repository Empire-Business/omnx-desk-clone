import type { Aprovacao, Demanda, Prioridade } from '@/hooks/useAtendimento'

/**
 * Rótulos e cores do app Atendimento, num lugar só.
 *
 * A interface do cliente nunca mostra o valor cru do banco (`nao_enviado`,
 * `media`): quem opera lê português, não enum.
 */

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const CLASSE_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'bg-muted text-muted-foreground',
  media: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  alta: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  urgente: 'bg-destructive/10 text-destructive',
}

export const ROTULO_APROVACAO: Record<Aprovacao, string> = {
  nao_enviado: 'Não enviado ao cliente',
  aguardando: 'Aguardando o cliente',
  aprovado: 'Aprovado pelo cliente',
  ajustes: 'Cliente pediu ajustes',
}

export const CLASSE_APROVACAO: Record<Aprovacao, string> = {
  nao_enviado: 'bg-muted text-muted-foreground',
  aguardando: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  aprovado: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ajustes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

/** Cor da etapa → classes. Uma etapa criada com cor desconhecida cai em slate. */
export const CLASSE_ETAPA: Record<string, string> = {
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
}

export const CORES_ETAPA = Object.keys(CLASSE_ETAPA)

export function classeEtapa(cor: string | undefined): string {
  return CLASSE_ETAPA[cor ?? 'slate'] ?? CLASSE_ETAPA.slate
}

/**
 * Situação do prazo de uma demanda ainda aberta.
 * Demanda concluída não tem prazo "atrasado" — o trabalho já saiu.
 */
export type SituacaoPrazo = 'sem_prazo' | 'atrasada' | 'hoje' | 'em_dia' | 'concluida'

export function situacaoPrazo(demanda: Pick<Demanda, 'prazo' | 'concluida_em'>): SituacaoPrazo {
  if (demanda.concluida_em) return 'concluida'
  if (!demanda.prazo) return 'sem_prazo'

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const prazo = new Date(`${demanda.prazo}T00:00:00`)

  if (prazo < hoje) return 'atrasada'
  if (prazo.getTime() === hoje.getTime()) return 'hoje'
  return 'em_dia'
}

export function textoPrazo(demanda: Pick<Demanda, 'prazo' | 'concluida_em'>): string {
  const situacao = situacaoPrazo(demanda)
  if (situacao === 'concluida') return 'Concluída'
  if (situacao === 'sem_prazo') return 'Sem prazo'

  const prazo = new Date(`${demanda.prazo}T00:00:00`)
  const formatado = prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  if (situacao === 'hoje') return 'Vence hoje'
  if (situacao === 'atrasada') {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const dias = Math.round((hoje.getTime() - prazo.getTime()) / 86_400_000)
    return dias === 1 ? 'Atrasada 1 dia' : `Atrasada ${dias} dias`
  }
  return `Vence ${formatado}`
}

export const CLASSE_PRAZO: Record<SituacaoPrazo, string> = {
  atrasada: 'text-destructive font-medium',
  hoje: 'text-amber-600 dark:text-amber-400 font-medium',
  em_dia: 'text-muted-foreground',
  sem_prazo: 'text-muted-foreground',
  concluida: 'text-emerald-600 dark:text-emerald-400',
}

/** Formata data/hora curta em pt-BR (usado no histórico e nos comentários). */
export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
