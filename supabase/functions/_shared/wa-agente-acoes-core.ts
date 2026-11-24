// Núcleo puro. A identidade vem do pedido real no servidor; o modelo só sugere
// ação/alvo/valor. Executar e gerar recibo são responsabilidades da RPC.
import { sha256EntradaAcaoChat } from './wa-agente-entrada-integridade.ts'

export const TTL_PROPOSTA_ACAO_MS = 5 * 60_000
export type AcaoChat =
  | { acao: 'cliente_ativo'; alvo: string; novo: { ativo: boolean } }
  | { acao: 'vincular_contrato_cliente'; alvo: string; novo: { cliente_id: string } }
  | { acao: 'cliente_estrategista'; alvo: string; novo: { itens: ItemAtribuicaoChat[] } }

export interface ItemAtribuicaoChat {
  cliente_id: string
  user_id: string
  assignment_id: string | null
  expected_revision: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODIGO = /^[0-9A-F]{8}$/
function objeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function chaves(v: Record<string, unknown>, esperadas: string[]): boolean {
  return Object.keys(v).length === esperadas.length && esperadas.every((k) => Object.hasOwn(v, k))
}

/** Rejeita campos extras (inclusive ator, tenant, escopo e conteúdo financeiro). */
export function validarAcaoChat(v: unknown): AcaoChat | null {
  if (!objeto(v) || !chaves(v, ['acao', 'alvo', 'novo']) || typeof v.alvo !== 'string' || !UUID.test(v.alvo) || !objeto(v.novo)) return null
  if (v.acao === 'cliente_ativo' && chaves(v.novo, ['ativo']) && typeof v.novo.ativo === 'boolean') {
    return { acao: v.acao, alvo: v.alvo, novo: { ativo: v.novo.ativo } }
  }
  if (v.acao === 'vincular_contrato_cliente' && chaves(v.novo, ['cliente_id']) && typeof v.novo.cliente_id === 'string' && UUID.test(v.novo.cliente_id)) {
    return { acao: v.acao, alvo: v.alvo, novo: { cliente_id: v.novo.cliente_id } }
  }
  if (v.acao === 'cliente_estrategista' && chaves(v.novo, ['itens']) && Array.isArray(v.novo.itens)
    && v.novo.itens.length >= 1 && v.novo.itens.length <= 10) {
    const itens: ItemAtribuicaoChat[] = []
    for (const item of v.novo.itens) {
      if (!objeto(item) || !chaves(item, ['cliente_id', 'user_id', 'assignment_id', 'expected_revision'])
        || typeof item.cliente_id !== 'string' || !UUID.test(item.cliente_id)
        || typeof item.user_id !== 'string' || !UUID.test(item.user_id)
        || !(item.assignment_id === null || (typeof item.assignment_id === 'string' && UUID.test(item.assignment_id)))
        || !Number.isSafeInteger(item.expected_revision) || Number(item.expected_revision) < 0) return null
      itens.push(item as unknown as ItemAtribuicaoChat)
    }
    if (new Set(itens.map(i => i.cliente_id)).size !== itens.length || itens[0].cliente_id !== v.alvo) return null
    return { acao: v.acao, alvo: v.alvo, novo: { itens } }
  }
  return null
}

/** Obrigatoriamente montada pelo adapter com a mensagem deste pedido, antes de
 * lerPergunta/IA. null em encaminhada significa que a fonte não registra isso;
 * os campos persistidos atuais não permitem provar ausência de encaminhamento. */
export interface MensagemOriginalAcaoChat {
  fonte: 'pedido_original_servidor'
  texto: string
  ehGrupo: boolean
  gatilho: string
  tipo: string
  replyToId: string | null
  agrupada: boolean
  quantidadeMensagens: number
  encaminhada: boolean | null
  autorConferido: boolean
  integridadeConferida: boolean
}

/** Digest vem do enqueue autenticado; calcular a partir do Chat editável para
 * preencher hashEsperado eliminaria esta proteção. Ausente não tem fallback. */
export async function conferirIntegridadeEntradaAcaoChat(textoSemPrefixo: string, hashEsperado: string | null): Promise<boolean> {
  if (typeof textoSemPrefixo !== 'string' || typeof hashEsperado !== 'string' || !/^[0-9a-f]{64}$/.test(hashEsperado)) return false
  return await sha256EntradaAcaoChat(textoSemPrefixo) === hashEsperado
}

/** Nunca recebe texto do modelo, histórico, transcrição ou pergunta concatenada.
 * Remove somente o prefixo único que o webhook acrescenta no grupo. */
export function lerConfirmacaoAcaoChat(mensagemOriginalServer: MensagemOriginalAcaoChat): string | null {
  const m = mensagemOriginalServer
  if (!m || m.fonte !== 'pedido_original_servidor' || typeof m.texto !== 'string' || m.autorConferido !== true || m.integridadeConferida !== true
    || m.agrupada !== false || m.quantidadeMensagens !== 1 || m.encaminhada === true
    || ![false, null].includes(m.encaminhada) || m.tipo !== 'texto' || m.replyToId !== null
    || !['nome', 'mencao'].includes(m.gatilho) || m.ehGrupo !== true) return null
  const texto = m.texto.replace(/^\[[^\]\r\n]{1,100}\] /, '')
  const match = /^(?:[ÍI]ris, )?CONFIRMAR ([0-9A-F]{8})$/i.exec(texto)
  // JS $ aceita uma quebra final; comparação integral fecha essa exceção.
  return match && match[0] === texto ? match[1].toUpperCase() : null
}

function nome(v: string): string {
  // deno-lint-ignore no-control-regex
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Registro sem nome'
}

export type PreviaAcaoChat =
  | { acao: 'cliente_ativo'; alvo_nome: string; antes: { ativo: boolean }; depois: { ativo: boolean } }
  | { acao: 'vincular_contrato_cliente'; alvo_nome: string; antes: { cliente_id: null }; depois: { cliente_id: string; cliente_nome: string } }
  | { acao: 'cliente_estrategista'; alvo_nome: string
      antes: { itens: { cliente_id: string; cliente_nome: string; assignment_id: string | null; estrategista_id: string | null; estrategista_nome: string | null; revisao: number }[] }
      depois: { itens: { cliente_id: string; cliente_nome: string; user_id: string; estrategista_nome: string }[] } }

function descreverPrevia(p: PreviaAcaoChat): string {
  if (p.acao === 'cliente_estrategista') {
    if (!Array.isArray(p.antes.itens) || !Array.isArray(p.depois.itens) || p.antes.itens.length < 1
      || p.antes.itens.length > 10 || p.antes.itens.length !== p.depois.itens.length) throw new Error('Prévia inválida.')
    const vistos = new Set<string>()
    const linhas = p.depois.itens.map((d, i) => {
      const a = p.antes.itens[i]
      if (!a || !UUID.test(d.cliente_id) || vistos.has(d.cliente_id) || d.cliente_id !== a.cliente_id
        || !UUID.test(d.user_id) || typeof d.cliente_nome !== 'string' || d.cliente_nome !== a.cliente_nome
        || typeof d.estrategista_nome !== 'string' || !d.estrategista_nome.trim()
        || !(a.estrategista_nome === null || typeof a.estrategista_nome === 'string')
        || !Number.isSafeInteger(a.revisao) || a.revisao < 0) throw new Error('Prévia inválida.')
      vistos.add(d.cliente_id)
      return `• ${nome(d.cliente_nome)}: ${a.estrategista_nome === null ? 'sem estrategista operacional' : nome(a.estrategista_nome)} → ${nome(d.estrategista_nome)}`
    })
    return `Responsáveis operacionais (${linhas.length}):\n${linhas.join('\n')}\n\nA operação aplica a lista inteira. Contratos e comissões permanecem como estão.`
  }
  if (p.acao === 'cliente_ativo') {
    if (typeof p.antes.ativo !== 'boolean' || typeof p.depois.ativo !== 'boolean' || p.antes.ativo === p.depois.ativo) throw new Error('Prévia inválida.')
    return `Cliente: ${nome(p.alvo_nome)}\nAntes: ${p.antes.ativo ? 'ativo' : 'inativo'}\nDepois: ${p.depois.ativo ? 'ativo' : 'inativo'}`
  }
  if (p.acao !== 'vincular_contrato_cliente' || p.antes.cliente_id !== null || !UUID.test(p.depois.cliente_id)) throw new Error('Prévia inválida.')
  return `Contrato: ${nome(p.alvo_nome)}\nAntes: sem cliente vinculado\nDepois: ${nome(p.depois.cliente_nome)}`
}

/** Usa exclusivamente a prévia persistida devolvida pela RPC. */
export function formatarPreviaAcaoChat(p: PreviaAcaoChat & { codigo: string; expira_em: string }, agora: Date): string {
  const fim = Date.parse(p.expira_em)
  const prazo = fim - agora.getTime()
  if (!CODIGO.test(p.codigo) || !Number.isFinite(prazo) || prazo <= 0 || prazo > TTL_PROPOSTA_ACAO_MS) throw new Error('Proposta expirada ou inválida.')
  return `${descreverPrevia(p)}\n\nPara executar, envie uma nova mensagem neste mesmo chat: Íris, confirmar ${p.codigo}\nCódigo válido por até 5 minutos. Nada foi alterado ainda.`
}

/** Simulação retorna somente texto: não cria código executável nem grava proposta. */
export function prepararSimulacaoAcaoChat(p: PreviaAcaoChat): string {
  return `Simulação — nenhuma alteração será gravada.\n\n${descreverPrevia(p)}`
}

export interface ReciboAcaoChat {
  proposta_id: string
  pedido_confirmacao_id: string
  executada_em: string
  estado: 'executada'
  previa: PreviaAcaoChat
}

/** Confirma sucesso somente a partir do recibo transacional do executor. */
export function formatarReciboAcaoChat(r: ReciboAcaoChat): string {
  if (r.estado !== 'executada' || !UUID.test(r.proposta_id) || !UUID.test(r.pedido_confirmacao_id) || !Number.isFinite(Date.parse(r.executada_em))) throw new Error('Recibo inválido.')
  return `Alteração concluída.\n\n${descreverPrevia(r.previa)}\n\nRecibo: ${r.proposta_id}`
}
