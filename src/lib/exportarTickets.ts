import { ROTULO_PRIORIDADE } from '@/lib/atendimento'
import { ROTULO_STATUS_TICKET, type StatusTicket } from '@/lib/ticketStatus'
import type { Demanda } from '@/hooks/useAtendimento'

/**
 * Exportação da lista de tickets em CSV — como a exportação de relatórios do
 * OMNX Clients. Sai exatamente o que está na tela (mesmos filtros e ordem):
 * quem não vê um ticket não o exporta.
 */
export interface TicketParaExportar {
  demanda: Demanda
  status: StatusTicket
}

export const COLUNAS_EXPORTACAO = [
  'Número', 'Título', 'Cliente', 'Responsável', 'Status', 'Etapa', 'Prioridade', 'Prazo', 'Criado em', 'Concluído em',
] as const

type LinhaExportacao = Record<(typeof COLUNAS_EXPORTACAO)[number], string>

/** dd/mm/aaaa; datas sem hora (prazo) não passam pelo fuso. */
function data(valor: string | null | undefined): string {
  if (!valor) return ''
  const so = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00`) : new Date(valor)
  if (Number.isNaN(so.getTime())) return ''
  return so.toLocaleDateString('pt-BR')
}

/**
 * Texto que veio do cliente (título do WhatsApp) não pode virar fórmula no
 * Excel: "=", "+", "-", "@" no começo ganham um apóstrofo.
 */
export function textoSeguro(valor: string | null | undefined): string {
  if (!valor) return ''
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
}

export function linhasParaExportar(tickets: TicketParaExportar[]): LinhaExportacao[] {
  return tickets.map(({ demanda: d, status }) => ({
    'Número': d.codigo,
    'Título': textoSeguro(d.titulo),
    'Cliente': textoSeguro(d.cliente?.nome),
    'Responsável': textoSeguro(d.responsavel?.nome),
    'Status': ROTULO_STATUS_TICKET[status],
    'Etapa': textoSeguro(d.etapa?.nome),
    'Prioridade': ROTULO_PRIORIDADE[d.prioridade] ?? d.prioridade,
    'Prazo': data(d.prazo),
    'Criado em': data(d.created_at),
    'Concluído em': data(d.concluida_em),
  }))
}

export function nomeArquivoTickets(agora: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `tickets-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}.csv`
}
