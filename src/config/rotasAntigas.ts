/**
 * Endereços antigos → endereços novos (auditoria 01, §4 e riscos R1–R4).
 *
 * Por que isto existe: links antigos não somem. Eles estão em mensagens de
 * WhatsApp já enviadas (`/automacoes-wa/alertas`, `/automacoes-wa/vinculos`),
 * em notificações gravadas no banco (`/comissoes/vendas-pendentes`), em push
 * do celular (`/chat?id=…`) e nos favoritos das pessoas. Por isso estes
 * redirecionamentos são PERMANENTES: nunca remover uma linha daqui.
 *
 * Regra de ouro (R1): o `<Navigate to="…">` simples descarta a parte depois
 * do "?" e do "#". Aqui o destino sempre leva junto a busca (`?contato=…`) e a
 * âncora (`#…`) do endereço original, e traduz os pedaços variáveis (`:id`).
 */

type Regra = {
  /** Caminho antigo. Aceita um único parâmetro `:x` no fim ou `*` (resto). */
  de: string
  /** Caminho novo. Pode usar `:x`/`*` e pode trazer busca própria (`?aba=…`). */
  para: string
}

const REGRAS: Regra[] = [
  // Tickets (antes "Atendimento › Demandas")
  { de: '/atendimento', para: '/' },
  { de: '/atendimento/demandas', para: '/tickets' },
  { de: '/atendimento/demandas/:id', para: '/tickets/:id' },
  { de: '/atendimento/kanban', para: '/tickets/quadro' },
  { de: '/atendimento/sentimento', para: '/tickets/analise' },
  { de: '/atendimento/config', para: '/tickets/configurar' },

  // Conversas (antes "OMNXChat")
  { de: '/chat', para: '/conversas' },
  { de: '/chat/inbox', para: '/conversas' },
  { de: '/chat/kanban', para: '/conversas/quadro' },
  { de: '/chat/contatos', para: '/conversas/contatos' },
  { de: '/chat/anotacoes', para: '/conversas/anotacoes' },
  { de: '/chat/config', para: '/conversas/configurar' },
  { de: '/chat/instancias', para: '/conversas/configurar?aba=instancias' },
  { de: '/chat/acessos', para: '/conversas/configurar?aba=acessos' },
  { de: '/chat/departamentos', para: '/conversas/filas' },
  { de: '/chat/reunioes', para: '/conversas/reunioes' },
  { de: '/chat/relatorio-semanal', para: '/tickets/analise' },
  // Qualquer outra tela do Chat vai para o endereço equivalente; se não
  // existir, cai na página "Não encontramos essa tela".
  { de: '/chat/*', para: '/conversas/*' },

  // Íris (antes "Automações WhatsApp")
  { de: '/automacoes-wa', para: '/ia/comecar' },
  { de: '/automacoes-wa/inicio', para: '/ia/comecar' },
  { de: '/automacoes-wa/iris', para: '/ia' },
  { de: '/automacoes-wa/assistente', para: '/ia' },
  { de: '/automacoes-wa/relatorio', para: '/ia/aviso-diario' },
  { de: '/automacoes-wa/gestores', para: '/ia/aviso-diario' },
  { de: '/automacoes-wa/resumo', para: '/ia/resumo-semanal' },
  { de: '/automacoes-wa/reunioes', para: '/ia/reunioes' },
  { de: '/automacoes-wa/agendamento', para: '/ia/reunioes' },
  { de: '/automacoes-wa/alertas', para: '/ia/alertas' },
  { de: '/automacoes-wa/tempo-resposta', para: '/ia/tempo-resposta' },
  { de: '/automacoes-wa/historico', para: '/ia/historico' },
  { de: '/automacoes-wa/conexao', para: '/ia/conexao' },
  { de: '/automacoes-wa/vinculos', para: '/clientes/grupos' },
  // Aba desconhecida: o comportamento antigo era abrir os primeiros passos.
  { de: '/automacoes-wa/*', para: '/ia/comecar' },

  // Outros
  { de: '/comissoes/vendas-pendentes', para: '/contratos/onboarding' },
  { de: '/usuarios', para: '/colaboradores' },
  { de: '/contratos/modelos', para: '/contratos/produtos' },
]

/** Prefixos que o App.tsx precisa rotear para o redirecionador. */
export const CAMINHOS_ANTIGOS = Array.from(new Set(REGRAS.map((r) => r.de)))

function semBarraFinal(caminho: string): string {
  return caminho.length > 1 && caminho.endsWith('/') ? caminho.replace(/\/+$/, '') : caminho
}

function casar(de: string, caminho: string): { ok: boolean; valor?: string } {
  if (de.endsWith('/*')) {
    const base = de.slice(0, -2)
    if (!caminho.startsWith(`${base}/`)) return { ok: false }
    const resto = caminho.slice(base.length + 1)
    return resto ? { ok: true, valor: resto } : { ok: false }
  }
  const partes = de.split('/')
  const ultima = partes[partes.length - 1]
  if (ultima.startsWith(':')) {
    const base = partes.slice(0, -1).join('/')
    if (!caminho.startsWith(`${base}/`)) return { ok: false }
    const valor = caminho.slice(base.length + 1)
    if (!valor || valor.includes('/')) return { ok: false }
    return { ok: true, valor }
  }
  return { ok: caminho === de }
}

/** Ordem de preferência: regra exata > regra com `:param` > regra com `*`. */
function peso(r: Regra): number {
  if (r.de.endsWith('/*')) return 2
  if (r.de.includes('/:')) return 1
  return 0
}
const REGRAS_ORDENADAS = [...REGRAS].sort((a, b) => peso(a) - peso(b))

/**
 * Traduz um endereço antigo. Retorna `null` quando o caminho não é antigo.
 * `search` e `hash` vêm do `useLocation()` (com "?" e "#" ou vazios).
 */
export function traduzirRotaAntiga(pathname: string, search = '', hash = ''): string | null {
  const caminho = semBarraFinal(pathname)
  for (const regra of REGRAS_ORDENADAS) {
    const m = casar(regra.de, caminho)
    if (!m.ok) continue
    const [destinoCru, buscaDestino = ''] = regra.para.split('?')
    const destino = m.valor !== undefined
      ? destinoCru.replace(/(:[a-z]+|\*)$/i, m.valor)
      : destinoCru
    // Busca do endereço original + busca fixa do destino (o destino ganha
    // em conflito, ex.: `aba=` de /chat/acessos).
    const original = search.startsWith('?') ? search.slice(1) : search
    let busca = original
    if (buscaDestino) {
      const params = new URLSearchParams(original)
      new URLSearchParams(buscaDestino).forEach((v, k) => params.set(k, v))
      busca = params.toString()
    }
    const ancora = hash && hash !== '#' ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
    return `${destino}${busca ? `?${busca}` : ''}${ancora}`
  }
  return null
}
