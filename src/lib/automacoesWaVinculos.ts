/**
 * Aba "Vínculos" do app Automações WhatsApp — tipos e regras puras da tela.
 *
 * Cada linha é um CANAL: um grupo de WhatsApp (o mesmo grupo em todos os números
 * da empresa) ou uma conversa privada (o mesmo telefone em todos os números).
 * Ligar o canal a um cliente faz a análise de satisfação, o relatório e a Íris
 * enxergarem essa conversa. O banco (RPCs vinculos_*, migration
 * 20261027110000_cliente_canais.sql) é quem decide e grava; aqui só montamos os
 * textos simples para quem não é técnico.
 */

export type TipoCanalWa = 'grupo' | 'privado'
export type DecisaoCanal = 'confirmado' | 'interno' | 'nao_cliente'
export type OrigemCanal = 'legado' | 'mesmo_jid' | 'telefone' | 'nome_grupo' | 'nome_membro' | 'manual'
export type FiltroVinculos = 'ativos' | 'pendentes' | 'todos'
export type AcaoVinculo = 'aceitar' | 'trocar' | 'adicionar' | 'rejeitar' | 'interno' | 'nao_cliente' | 'reabrir'

/** Só códigos e contagens (o servidor nunca manda nome, telefone ou texto aqui). */
export interface EvidenciasVinculo {
  nome_grupo?: 'completo' | 'primeiro_ultimo' | 'empresa' | 'razao_social' | 'instagram'
  fonte?: 'cadastro' | 'contrato'
  membro_com_nome_do_cliente?: number
  telefone?: 'unico' | 'ambiguo'
  instancias?: number
  contatos?: number
  contrato_vigente?: boolean
  ambiguo?: boolean
  /** Alguém da equipe ligou no Chat, mas a decisão precisa de revisão. */
  pedido_chat?: boolean
}

export interface ClienteVinculado {
  id: string
  nome: string
  origem: OrigemCanal
  /** Uma pessoa confirmou (aceitou a sugestão ou escolheu). */
  revisado: boolean
}

export interface SugestaoVinculo {
  id: string
  nome: string
  origem: OrigemCanal
  score: number | null
  evidencias: EvidenciasVinculo
}

/** Uma linha de vinculos_listar. */
export interface CanalVinculo {
  /** Um contato qualquer do canal (o mais recente) — é por ele que se decide. */
  contato_id: string
  tipo: TipoCanalWa
  nome: string
  /** Só nos privados: os 4 últimos dígitos do telefone. */
  final_telefone: string | null
  msgs_30d: number
  ultima_msg_em: string | null
  instancias: number
  instancias_nomes: string[]
  /** O canal está num número com "Ocultar grupos" ligado (a equipe não vê no Chat). */
  ocultar_grupos: boolean
  /** Quais números do canal estão com "Ocultar grupos" ligado. */
  instancias_ocultas: string[]
  /** Grupo interno do relatório / assistente: não pode ser de cliente. */
  restrito: boolean
  decisao: DecisaoCanal | null
  clientes: ClienteVinculado[]
  sugestoes: SugestaoVinculo[]
  rejeitados: number
}

export interface ClienteBusca {
  id: string
  nome: string
  empresa: string | null
  ativo: boolean
  vigente: boolean
}

export interface ExecucaoVinculos {
  criado_em: string
  origem: 'cron' | 'manual'
  resultado: Record<string, number>
}

// ---------------------------------------------------------------------------
// Leitura segura da resposta da RPC
// ---------------------------------------------------------------------------

const ORIGENS: readonly OrigemCanal[] = ['legado', 'mesmo_jid', 'telefone', 'nome_grupo', 'nome_membro', 'manual']
const DECISOES: readonly DecisaoCanal[] = ['confirmado', 'interno', 'nao_cliente']

const texto = (v: unknown, padrao = ''): string => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const origem = (v: unknown): OrigemCanal => (ORIGENS.includes(v as OrigemCanal) ? (v as OrigemCanal) : 'manual')
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Linhas cruas de vinculos_listar → CanalVinculo (campos estranhos viram padrão). */
export function lerCanais(linhas: unknown): CanalVinculo[] {
  return lista(linhas).map((bruto): CanalVinculo => {
    const r = objeto(bruto)
    return {
      contato_id: texto(r.contato_id),
      tipo: r.tipo === 'grupo' ? 'grupo' : 'privado',
      nome: texto(r.nome, 'Sem nome'),
      final_telefone: typeof r.final_telefone === 'string' ? r.final_telefone.slice(-4) : null,
      msgs_30d: numero(r.msgs_30d),
      ultima_msg_em: typeof r.ultima_msg_em === 'string' ? r.ultima_msg_em : null,
      instancias: numero(r.instancias),
      instancias_nomes: lista(r.instancias_nomes).filter((n): n is string => typeof n === 'string'),
      ocultar_grupos: r.ocultar_grupos === true,
      instancias_ocultas: lista(r.instancias_ocultas).filter((n): n is string => typeof n === 'string'),
      restrito: r.restrito === true,
      decisao: DECISOES.includes(r.decisao as DecisaoCanal) ? (r.decisao as DecisaoCanal) : null,
      clientes: lista(r.clientes).map((c) => {
        const o = objeto(c)
        return { id: texto(o.id), nome: texto(o.nome, 'Cliente sem nome'), origem: origem(o.origem), revisado: o.revisado === true }
      }),
      sugestoes: lista(r.sugestoes).map((c) => {
        const o = objeto(c)
        return {
          id: texto(o.id), nome: texto(o.nome, 'Cliente sem nome'), origem: origem(o.origem),
          score: o.score === null || o.score === undefined ? null : numero(o.score),
          evidencias: objeto(o.evidencias) as EvidenciasVinculo,
        }
      }),
      rejeitados: numero(r.rejeitados),
    }
  }).filter((c) => c.contato_id)
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export type SituacaoCanal = 'interno_sistema' | 'cliente' | 'interno' | 'nao_cliente' | 'sugestao' | 'pendente'

export function situacaoCanal(c: Pick<CanalVinculo, 'restrito' | 'decisao' | 'clientes' | 'sugestoes'>): SituacaoCanal {
  if (c.restrito) return 'interno_sistema'
  if (c.decisao === 'interno') return 'interno'
  if (c.decisao === 'nao_cliente') return 'nao_cliente'
  if (c.decisao === 'confirmado' || c.clientes.length > 0) return 'cliente'
  return c.sugestoes.length > 0 ? 'sugestao' : 'pendente'
}

/** "Grupo" / "Conversa privada · final 4321". Nunca o telefone inteiro. */
export function rotuloTipoCanal(c: Pick<CanalVinculo, 'tipo' | 'final_telefone'>): string {
  if (c.tipo === 'grupo') return 'Grupo'
  return c.final_telefone ? `Conversa privada · final ${c.final_telefone.slice(-4)}` : 'Conversa privada'
}

/** "23 mensagens nos últimos 30 dias" / "Nenhuma mensagem nos últimos 30 dias". */
export function textoMensagens(n: number): string {
  if (n <= 0) return 'Nenhuma mensagem nos últimos 30 dias'
  return n === 1 ? '1 mensagem nos últimos 30 dias' : `${n.toLocaleString('pt-BR')} mensagens nos últimos 30 dias`
}

/** "em 2 números (Comercial e Suporte)". Um número só → ''. */
export function textoInstancias(c: Pick<CanalVinculo, 'instancias' | 'instancias_nomes'>): string {
  if (c.instancias <= 1) return ''
  const nomes = c.instancias_nomes.slice(0, 3)
  const lista = nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return nomes.length > 0 ? `em ${c.instancias} números (${lista})` : `em ${c.instancias} números`
}

/** De onde veio um vínculo confirmado, em uma frase curta. */
export function rotuloOrigem(o: OrigemCanal, revisado: boolean): string {
  switch (o) {
    case 'legado': return 'já estava ligado no Chat'
    case 'mesmo_jid': return 'já estava ligado em outro número'
    case 'telefone': return 'mesmo telefone do cadastro'
    case 'nome_grupo':
    case 'nome_membro': return revisado ? 'sugestão aceita por uma pessoa' : 'pela sugestão automática'
    case 'manual': return 'escolhido por uma pessoa'
  }
}

/**
 * Por que o sistema sugeriu este cliente, em português simples
 * (ex.: "o nome do grupo contém o nome do cliente").
 */
export function frasesEvidencia(ev: EvidenciasVinculo, o?: OrigemCanal): string[] {
  const f: string[] = []
  const doContrato = ev.fonte === 'contrato' ? ' (como está no contrato)' : ''
  switch (ev.nome_grupo) {
    case 'completo': f.push(`O nome do grupo contém o nome do cliente${doContrato}`); break
    case 'primeiro_ultimo': f.push(`O nome do grupo tem o primeiro e o último nome do cliente${doContrato}`); break
    case 'empresa': f.push(`O nome do grupo contém o nome da empresa do cliente${doContrato}`); break
    case 'razao_social': f.push('O nome do grupo contém a razão social do cliente'); break
    case 'instagram': f.push(`O nome do grupo contém o @ do Instagram do cliente${doContrato}`); break
  }
  const membros = Number(ev.membro_com_nome_do_cliente) || 0
  if (membros === 1) f.push('Uma pessoa do grupo tem o mesmo nome do cliente')
  else if (membros > 1) f.push(`${membros} pessoas do grupo têm o mesmo nome do cliente`)
  if (ev.telefone === 'unico') f.push('O telefone é o mesmo do cadastro do cliente')
  if (ev.telefone === 'ambiguo') f.push('O telefone aparece no cadastro de mais de um cliente')
  if (o === 'mesmo_jid') f.push('O mesmo grupo já estava ligado a este cliente em outro número')
  if (o === 'legado') f.push('Já estava ligado a este cliente no Chat')
  if (ev.pedido_chat) f.push('Alguém da equipe ligou esta conversa a este cliente no Chat')
  if (ev.contrato_vigente) f.push('Cliente com contrato em andamento')
  if (ev.ambiguo && ev.telefone !== 'ambiguo') f.push('Há mais de um cliente parecido: confira antes de aceitar')
  return f
}

/** Força da sugestão para o selo: "forte" (≥ 0,75), "média" (≥ 0,6) ou "fraca". */
export function forcaSugestao(score: number | null): 'forte' | 'media' | 'fraca' {
  const s = Number(score) || 0
  if (s >= 0.75) return 'forte'
  if (s >= 0.6) return 'media'
  return 'fraca'
}

/** Números com "Ocultar grupos" ligado que aparecem na lista (sem repetir). */
export function numerosComGruposOcultos(canais: readonly CanalVinculo[]): string[] {
  const nomes = new Set<string>()
  for (const c of canais) {
    if (c.tipo !== 'grupo' || !c.ocultar_grupos) continue
    for (const n of c.instancias_ocultas) nomes.add(n)
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Contagens do topo da tela. */
export function resumoCanais(canais: readonly CanalVinculo[]): { total: number; semDecisao: number; comSugestao: number; clientes: number } {
  let semDecisao = 0
  let comSugestao = 0
  let clientes = 0
  for (const c of canais) {
    const s = situacaoCanal(c)
    if (s === 'sugestao') { comSugestao++; semDecisao++ }
    else if (s === 'pendente') semDecisao++
    else if (s === 'cliente') clientes++
  }
  return { total: canais.length, semDecisao, comSugestao, clientes }
}
