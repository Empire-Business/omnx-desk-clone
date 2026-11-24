// Os nomes são comparados por inteiro: títulos livres e registros históricos
// (por exemplo, um curso chamado "Stories High Ticket") não são alterados.
// "campanha" aqui é o tipo de pedido de marketing; a campanha de disparo em massa
// de WhatsApp (src/pages/disparo) não passa por este filtro.
const FORMATOS_APOSENTADOS = new Set([
  'reel', 'reels', 'carrossel', 'carrosseis', 'carousel', 'carousels', 'story', 'stories',
  'post', 'posts', 'post unico', 'post feed', 'post_feed', 'feed', 'campanha', 'campanhas',
])

export function formatoAposentado(formato: string): boolean {
  const nome = formato.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return FORMATOS_APOSENTADOS.has(nome)
}

/** Filtra somente escolhas; nunca use para filtrar registros de demandas. */
export function tiposSelecionaveisAtendimento<T extends { id: string; nome: string; ativo: boolean }>(
  tipos: readonly T[],
  tipoAtualId?: string | null,
): T[] {
  // Na edição, o tipo já associado continua visível, inclusive quando inativo.
  return tipos.filter((tipo) => tipo.id === tipoAtualId || (tipo.ativo && !formatoAposentado(tipo.nome)))
}
