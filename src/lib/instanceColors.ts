const NAMED_COLORS: Record<string, string> = {
  verde: '#22c55e',
  azul: '#3b82f6',
  roxo: '#a855f7',
  rosa: '#ec4899',
  vermelho: '#ef4444',
  laranja: '#f97316',
  amarelo: '#eab308',
  ciano: '#06b6d4',
  cinza: '#6b7280',
}

export function instanceCorHex(cor: string | null | undefined): string {
  if (!cor) return '#6b7280'
  if (cor.startsWith('#')) return cor
  return NAMED_COLORS[cor.toLowerCase()] ?? '#6b7280'
}
