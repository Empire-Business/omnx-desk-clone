import type { Json } from '@/integrations/supabase/types'

export interface MessageReaction { emoji: string; from: string; from_me: boolean }

export function lerReacoes(value: Json | undefined): MessageReaction[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    return typeof item.emoji === 'string' && typeof item.from === 'string' && typeof item.from_me === 'boolean'
      ? [{ emoji: item.emoji, from: item.from, from_me: item.from_me }] : []
  })
}
