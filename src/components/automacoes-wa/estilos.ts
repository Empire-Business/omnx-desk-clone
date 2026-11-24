import type { AbaWa } from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import { rotaAbaIris } from '@/config/navegacao'

/** Estilos e utilidades compartilhados pelas abas do app Automações WhatsApp. */

/** Anel de foco visível só para quem navega pelo teclado (classe do design system). */
export const foco = 'focus-ds'

/** Campo de texto, número, hora ou lista (classe `input` do design system). */
export const campo = 'input'

export const botaoPrimario = 'btn btn-primary'
export const botaoSecundario = 'btn btn-secondary'
/** Ação discreta, com cara de link. */
export const botaoLink = cn(
  'inline-flex items-center gap-1 rounded text-sm font-medium text-link underline-offset-4 hover:underline',
  foco,
)

/** Endereço de uma aba da Íris (fonte: config/navegacao.ts). */
export const ROTA_ABA = (aba: AbaWa) => rotaAbaIris(aba)
/** "09:00:00" -> "09:00" (input type=time). */
export const hhmm = (t: string | null | undefined) => (t ?? '09:00').slice(0, 5)
