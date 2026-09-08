import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formata número de telefone para exibição legível.
 * Ex: "5521999545555" → "+55 (21) 99954-5555"
 *     "551151951461" → "+55 (11) 5195-1461"
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  // Remove tudo que não é dígito
  const digits = raw.replace(/\D/g, '')

  // Número BR com DDI (55) + DDD (2) + número (8 ou 9)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4)
    const number = digits.slice(4)
    if (number.length === 9) {
      return `+55 (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
    }
    // 8 dígitos (fixo)
    return `+55 (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`
  }

  // Fallback: adiciona + no início se tiver mais de 10 dígitos
  if (digits.length > 10) {
    return `+${digits}`
  }

  return raw
}
