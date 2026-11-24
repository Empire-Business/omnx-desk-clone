// Sugestões de vínculo CANAL → CLIENTE (grupos e conversas privadas do WhatsApp)
// — regras PURAS: sem banco, sem rede, sem Deno. Rodam igual na edge function
// wa-vinculos-sugerir e no Vitest (vinculo-sugestoes.test.ts).
//
// Canal = o que identifica a conversa em QUALQUER número (instância) da empresa:
//   grupo   → id do grupo sem "@g.us" (chat_contacts.numero_whatsapp);
//   privado → telefone só com dígitos, com o 9º dígito no celular BR (chaveTelefoneBR).
// MESMAS regras das funções SQL private.canal_tipo / canal_chave / canal_formas /
// tel_cmp_contato / tel_cmp_cadastro (migration 20261027110000_cliente_canais.sql).
// Mudou aqui → mude lá (e vice-versa).
//
// O que sai daqui (vira linha de cliente_canais pela RPC vinculos_gravar_sugestoes):
//   * DETERMINÍSTICO → 'confirmado':
//       - legado / mesmo_jid: algum contato do canal já está ligado ao cliente no
//         Chat (client_id ou chat_contact_clients) e o canal ainda não tem registro;
//       - telefone: o telefone do contato privado é de UM cliente só (cadastro ou
//         contrato), comparando DDD + 8 últimos dígitos.
//   * PELO NOME → sempre 'sugerido' (nome NUNCA confirma sozinho):
//       - nome do grupo contém o nome completo / empresa / razão social / @ do
//         Instagram do cliente (cadastro ou contrato), ou o 1º + último nome;
//       - participante do grupo com o mesmo nome do cliente.
// As evidências só têm códigos e contagens — nunca nome, telefone ou texto.
// A RPC confere de novo os determinísticos e não mexe em decisão humana.
import { chaveTelefoneBR } from './wa-telefone.ts'

export type TipoCanal = 'grupo' | 'privado'

export interface Canal {
  tipo: TipoCanal
  chave: string
}

/** Formatos de id de grupo do WhatsApp (sem "@g.us"). Contadores < 255. */
const GRUPO_ID = /^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})$/

const soDigitos = (s: string) => s.replace(/\D/g, '')

/** 'grupo' | 'privado' | null (LID, vazio, formato desconhecido). = private.canal_tipo. */
export function tipoCanal(numero: string | null | undefined, groupSize?: number | null): TipoCanal | null {
  let v = String(numero ?? '').trim().toLowerCase()
  if (!v || v.length > 80) return null
  if (v.endsWith('@g.us') || Number(groupSize ?? 0) > 0 || GRUPO_ID.test(v)) return 'grupo'
  if (v.includes('@')) {
    const servidor = v.split('@')[1] ?? ''
    if (servidor !== 's.whatsapp.net' && servidor !== 'c.us') return null
    v = (v.split('@')[0] ?? '').split(':')[0] ?? ''
  }
  const d = soDigitos(v)
  if (d.length > 15) return 'grupo'
  if (d.length >= 8) return 'privado'
  return null
}

/** Canal (tipo + chave canônica) de um contato do Chat. null = sem chave confiável. */
export function canalDoContato(numero: string | null | undefined, groupSize?: number | null): Canal | null {
  const tipo = tipoCanal(numero, groupSize)
  if (!tipo) return null
  let v = String(numero ?? '').trim().toLowerCase()
  if (tipo === 'grupo') {
    if (v.endsWith('@g.us')) v = v.slice(0, -'@g.us'.length)
    return v.length <= 60 && GRUPO_ID.test(v) ? { tipo, chave: v } : null
  }
  if (v.includes('@')) v = (v.split('@')[0] ?? '').split(':')[0] ?? ''
  const chave = chaveTelefoneBR(soDigitos(v))
  return chave ? { tipo, chave } : null
}

/** Como o canal pode estar gravado em chat_contacts.numero_whatsapp. = private.canal_formas. */
export function formasDoCanal(c: Canal): string[] {
  if (c.tipo === 'grupo') return [c.chave, `${c.chave}@g.us`]
  if (/^55[1-9][0-9]9[6-9][0-9]{7}$/.test(c.chave)) return [c.chave, `55${c.chave.slice(2, 4)}${c.chave.slice(5)}`]
  return [c.chave]
}

/** "grupo:<chave>" — identificador do canal na RPC (p_chaves). */
export const idCanal = (c: Canal) => `${c.tipo}:${c.chave}`

/**
 * Telefone de CONTATO (sempre com DDI) → chave de comparação.
 * BR → 'br' + DDD + 8 últimos dígitos (com ou sem o 9); outro país → 'x' + dígitos.
 * = private.tel_cmp_contato.
 */
export function telCmpContato(bruto: string | null | undefined): string | null {
  const d = soDigitos(String(bruto ?? ''))
  if (/^55[1-9][0-9][0-9]{8,9}$/.test(d)) return `br${d.slice(2, 4)}${d.slice(-8)}`
  if (d.length >= 8 && d.length <= 15) return `x${d}`
  return null
}

/**
 * Telefone DIGITADO no cadastro (cliente/contrato): aceita sem o 55. Sem DDD
 * (8–9 dígitos) não compara. = private.tel_cmp_cadastro.
 */
export function telCmpCadastro(bruto: string | null | undefined): string | null {
  const d = soDigitos(String(bruto ?? '')).replace(/^0+/, '')
  if (/^55[1-9][0-9][0-9]{8,9}$/.test(d)) return `br${d.slice(2, 4)}${d.slice(-8)}`
  if (/^[1-9][0-9][0-9]{8,9}$/.test(d)) return `br${d.slice(0, 2)}${d.slice(-8)}`
  if (d.length >= 12 && d.length <= 15) return `x${d}`
  return null
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

/** Sem acento, minúsculo, só [a-z0-9 ], espaços simples. */
export function normalizarNome(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Palavras que não identificam ninguém. */
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the'])
/** Sufixos de razão social. */
const SUFIXOS_EMPRESA = new Set(['ltda', 'me', 'epp', 'eireli', 'mei', 'sa', 's', 'a', 'cia', 'ss', 'limitada'])
/** Empresa de uma palavra só que é genérica demais para sugerir. */
const GENERICOS = new Set([
  'grupo', 'empresa', 'studio', 'estudio', 'clinica', 'loja', 'agencia', 'marketing', 'digital', 'consultoria',
  'servicos', 'comercio', 'store', 'oficial', 'brasil', 'equipe', 'time', 'suporte', 'vendas', 'financeiro',
  'mentoria', 'academia', 'escola', 'instituto', 'clientes', 'projeto', 'atendimento', 'empire',
])

/** @ do Instagram (de "@fulano", "instagram.com/fulano/", "fulano") → só [a-z0-9], ≥ 5. */
export function handleInstagram(bruto: string | null | undefined): string | null {
  let s = String(bruto ?? '').trim().toLowerCase()
  if (!s) return null
  const m = s.match(/instagram\.com\/([^/?#\s]+)/)
  if (m) s = m[1]
  s = s.replace(/^@+/, '').split(/[\s/?#]/)[0] ?? ''
  const h = s.replace(/[^a-z0-9]/g, '')
  return h.length >= 5 ? h : null
}

type Fonte = 'cadastro' | 'contrato'
export type NomeGrupoEvid = 'completo' | 'primeiro_ultimo' | 'empresa' | 'razao_social' | 'instagram'

/** Evidências gravadas (só códigos e contagens). Mesma lista de private.vinculo_evidencias_limpas. */
export interface Evidencias {
  nome_grupo?: NomeGrupoEvid
  fonte?: Fonte
  membro_com_nome_do_cliente?: number
  telefone?: 'unico' | 'ambiguo'
  instancias?: number
  contatos?: number
  contrato_vigente?: boolean
  ambiguo?: boolean
  /** Alguém ligou no Chat, mas sem poder decidir pelo canal todo (só o banco grava). */
  pedido_chat?: boolean
}

export interface ClienteEntrada {
  id: string
  nome: string | null
  empresa?: string | null
  razao_social?: string | null
  instagram?: string | null
  telefone?: string | null
  whatsapp?: string | null
  ativo?: boolean | null
}

export interface ContratoEntrada {
  cliente_id: string | null
  cliente_nome?: string | null
  empresa?: string | null
  instagram?: string | null
  whatsapp?: string | null
  status?: string | null
}

interface Frase {
  frase: string
  tokens: string[]
  fonte: Fonte
}

export interface ClienteIndice {
  id: string
  ativo: boolean
  vigente: boolean
  nomes: Frase[]
  empresas: (Frase & { tipo: 'empresa' | 'razao_social' })[]
  instagrams: { handle: string; fonte: Fonte }[]
  /** Nome completo e "1º + último" normalizados (para comparar com participantes). */
  nomesPessoa: Set<string>
}

/** Status de contrato que encerram o vínculo (mesma lista de wa-alertas.ts). */
const ENCERRADOS = new Set(['cancelado', 'concluido', 'encerrado', 'distrato', 'finalizado', 'rescindido'])

function frase(bruto: string | null | undefined, fonte: Fonte, tirarSufixo = false): Frase | null {
  let tokens = normalizarNome(bruto).split(' ').filter(Boolean)
  if (tirarSufixo) while (tokens.length > 1 && SUFIXOS_EMPRESA.has(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1)
  if (tokens.length === 0) return null
  return { frase: tokens.join(' '), tokens, fonte }
}

const significativos = (tokens: string[]) => tokens.filter((t) => !LIGACOES.has(t))

/** Clientes (com os nomes do cadastro e dos contratos) prontos para comparar. */
export function indexarClientes(clientes: readonly ClienteEntrada[], contratos: readonly ContratoEntrada[]): ClienteIndice[] {
  const porCliente = new Map<string, ContratoEntrada[]>()
  for (const c of contratos) {
    if (!c?.cliente_id) continue
    porCliente.set(c.cliente_id, [...(porCliente.get(c.cliente_id) ?? []), c])
  }
  const dedupe = <T extends { frase?: string; handle?: string }>(l: (T | null)[]) => {
    const vistos = new Set<string>()
    return l.filter((x): x is T => {
      if (!x) return false
      const k = x.frase ?? x.handle ?? ''
      if (!k || vistos.has(k)) return false
      vistos.add(k)
      return true
    })
  }
  return clientes.map((cl) => {
    const cts = porCliente.get(cl.id) ?? []
    const nomes = dedupe<Frase>([frase(cl.nome, 'cadastro'), ...cts.map((c) => frase(c.cliente_nome, 'contrato'))])
    const empresas = dedupe<Frase & { tipo: 'empresa' | 'razao_social' }>([
      ...[frase(cl.empresa, 'cadastro', true), ...cts.map((c) => frase(c.empresa, 'contrato', true))]
        .map((f) => (f ? { ...f, tipo: 'empresa' as const } : null)),
      ...[frase(cl.razao_social, 'cadastro', true)].map((f) => (f ? { ...f, tipo: 'razao_social' as const } : null)),
    ])
    const instagrams = dedupe<{ handle: string; fonte: Fonte }>([
      ...[cl.instagram].map((i) => { const h = handleInstagram(i); return h ? { handle: h, fonte: 'cadastro' as const } : null }),
      ...cts.map((c) => { const h = handleInstagram(c.instagram); return h ? { handle: h, fonte: 'contrato' as const } : null }),
    ])
    const nomesPessoa = new Set<string>()
    for (const n of nomes) {
      const sig = significativos(n.tokens)
      if (sig.length >= 2) {
        nomesPessoa.add(n.frase)
        nomesPessoa.add(`${sig[0]} ${sig[sig.length - 1]}`)
      }
    }
    return {
      id: cl.id,
      ativo: cl.ativo !== false,
      vigente: cts.some((c) => !ENCERRADOS.has(normalizarNome(c.status))),
      nomes,
      empresas,
      instagrams,
      nomesPessoa,
    }
  })
}

/** Telefone (chave de comparação) → clientes. Cadastro (telefone, whatsapp) e contrato (whatsapp). */
export function indexarTelefones(clientes: readonly ClienteEntrada[], contratos: readonly ContratoEntrada[]): Map<string, Set<string>> {
  const ids = new Set(clientes.map((c) => c.id))
  const mapa = new Map<string, Set<string>>()
  const por = (tel: string | null | undefined, id: string) => {
    const k = telCmpCadastro(tel)
    if (!k) return
    const s = mapa.get(k) ?? new Set<string>()
    s.add(id)
    mapa.set(k, s)
  }
  for (const c of clientes) { por(c.telefone, c.id); por(c.whatsapp, c.id) }
  for (const c of contratos) if (c.cliente_id && ids.has(c.cliente_id)) por(c.whatsapp, c.cliente_id)
  return mapa
}

// ---------------------------------------------------------------------------
// Pontuação
// ---------------------------------------------------------------------------

export const PONTOS = {
  completo: 0.8,
  empresa: 0.75,
  razao_social: 0.75,
  instagram: 0.75,
  empresaUmaPalavra: 0.6,
  primeiro_ultimo: 0.6,
  /** Só participante com o nome do cliente (sem nada no nome do grupo). */
  soMembro: 0.5,
  /** Participante com o nome do cliente, somado ao que veio do nome do grupo. */
  bonusMembro: 0.15,
  bonusVigente: 0.05,
  /** Abaixo disso, não sugere. */
  minimo: 0.5,
  /** Sugestão por nome nunca chega a 1 (1 = determinístico). */
  teto: 0.95,
} as const

/** Até quantas sugestões por canal; empate até esta distância do 1º vira "ambíguo". */
export const MAX_SUGESTOES = 3
const FAIXA_EMPATE = 0.1

export interface SugestaoCliente {
  client_id: string
  score: number
  origem: 'nome_grupo' | 'nome_membro'
  evidencias: Evidencias
}

const arred = (n: number) => Math.round(n * 100) / 100

/** Melhor evidência do NOME do grupo para um cliente (ou null). */
function evidenciaNome(nomesGrupo: readonly string[], c: ClienteIndice): { pontos: number; ev: NomeGrupoEvid; fonte: Fonte } | null {
  let melhor: { pontos: number; ev: NomeGrupoEvid; fonte: Fonte } | null = null
  const troca = (pontos: number, ev: NomeGrupoEvid, fonte: Fonte) => {
    if (!melhor || pontos > melhor.pontos) melhor = { pontos, ev, fonte }
  }
  for (const g of nomesGrupo) {
    const pad = ` ${g} `
    const palavras = new Set(g.split(' '))
    const compacto = g.replace(/ /g, '')
    for (const n of c.nomes) {
      const sig = significativos(n.tokens)
      if (sig.length >= 2 && n.frase.length >= 6 && pad.includes(` ${n.frase} `)) troca(PONTOS.completo, 'completo', n.fonte)
      if (sig.length >= 2) {
        const [pri, ult] = [sig[0], sig[sig.length - 1]]
        if (pri !== ult && pri.length >= 3 && ult.length >= 3 && palavras.has(pri) && palavras.has(ult)) {
          troca(PONTOS.primeiro_ultimo, 'primeiro_ultimo', n.fonte)
        }
      }
    }
    for (const e of c.empresas) {
      if (!pad.includes(` ${e.frase} `)) continue
      const sig = significativos(e.tokens)
      if (sig.length >= 2 && e.frase.length >= 6) troca(PONTOS[e.tipo], e.tipo, e.fonte)
      else if (sig.length === 1 && sig[0].length >= 5 && !GENERICOS.has(sig[0])) troca(PONTOS.empresaUmaPalavra, e.tipo, e.fonte)
    }
    for (const i of c.instagrams) {
      if (compacto.includes(i.handle)) troca(PONTOS.instagram, 'instagram', i.fonte)
    }
  }
  return melhor
}

/**
 * Sugestões para UM grupo: nomes que o grupo tem/teve no Chat (todas as
 * instâncias) e nomes dos participantes. Só clientes ativos; os rejeitados para
 * este canal ficam de fora. Ordem: maior pontuação, contrato vigente, id.
 */
export function sugerirParaGrupo(
  nomesDoGrupo: readonly (string | null | undefined)[],
  nomesMembros: readonly (string | null | undefined)[],
  clientes: readonly ClienteIndice[],
  rejeitados: ReadonlySet<string> = new Set(),
): SugestaoCliente[] {
  const grupos = [...new Set(nomesDoGrupo.map(normalizarNome).filter((g) => g.length >= 3))]
  const membros = [...new Set(nomesMembros.map(normalizarNome).filter(Boolean))]
  const achados: (SugestaoCliente & { vigente: boolean })[] = []
  for (const c of clientes) {
    if (!c.ativo || rejeitados.has(c.id)) continue
    const nome = evidenciaNome(grupos, c)
    const nMembros = c.nomesPessoa.size > 0 ? membros.filter((m) => c.nomesPessoa.has(m)).length : 0
    if (!nome && nMembros === 0) continue
    const ev: Evidencias = {}
    let pontos = 0
    if (nome) {
      pontos = nome.pontos
      ev.nome_grupo = nome.ev
      ev.fonte = nome.fonte
    }
    if (nMembros > 0) {
      pontos = nome ? pontos + PONTOS.bonusMembro : PONTOS.soMembro
      ev.membro_com_nome_do_cliente = nMembros
    }
    if (c.vigente) {
      pontos += PONTOS.bonusVigente
      ev.contrato_vigente = true
    }
    pontos = arred(Math.min(pontos, PONTOS.teto))
    if (pontos < PONTOS.minimo) continue
    achados.push({ client_id: c.id, score: pontos, origem: nome ? 'nome_grupo' : 'nome_membro', evidencias: ev, vigente: c.vigente })
  }
  if (achados.length === 0) return []
  achados.sort((a, b) => b.score - a.score || Number(b.vigente) - Number(a.vigente) || (a.client_id < b.client_id ? -1 : 1))
  const topo = achados[0].score
  const ficam = achados.filter((a) => a.score >= topo - FAIXA_EMPATE - 1e-9).slice(0, MAX_SUGESTOES)
  return ficam.map(({ vigente: _v, ...s }) => (ficam.length > 1 ? { ...s, evidencias: { ...s.evidencias, ambiguo: true } } : s))
}

export interface ResultadoTelefone {
  client_id: string
  status: 'confirmado' | 'sugerido'
  score: number
  evidencias: Evidencias
}

/**
 * Contato PRIVADO: telefone de UM cliente só → confirmado (telefone/único).
 * De 2–3 clientes → sugestão para cada um (ambíguo). Mais que isso (número
 * genérico, de empresa) → nada.
 */
export function sugerirParaPrivado(
  chave: string,
  telefones: ReadonlyMap<string, ReadonlySet<string>>,
  rejeitados: ReadonlySet<string> = new Set(),
): ResultadoTelefone[] {
  const k = telCmpContato(chave)
  if (!k) return []
  const ids = [...(telefones.get(k) ?? [])].filter((id) => !rejeitados.has(id)).sort()
  if (ids.length === 1) return [{ client_id: ids[0], status: 'confirmado', score: 1, evidencias: { telefone: 'unico' } }]
  if (ids.length >= 2 && ids.length <= MAX_SUGESTOES) {
    return ids.map((id) => ({ client_id: id, status: 'sugerido', score: 0.7, evidencias: { telefone: 'ambiguo', ambiguo: true } }))
  }
  return []
}

// ---------------------------------------------------------------------------
// Tudo junto (uma empresa)
// ---------------------------------------------------------------------------

export type StatusCanal = 'sugerido' | 'confirmado' | 'rejeitado' | 'interno' | 'nao_cliente'
export type OrigemCanal = 'legado' | 'mesmo_jid' | 'telefone' | 'nome_grupo' | 'nome_membro' | 'manual'

export interface ContatoEntrada {
  id: string
  instance_id: string | null
  nome: string | null
  numero_whatsapp: string | null
  group_size?: number | null
  client_id: string | null
  restrito_admin?: boolean | null
}

export interface CanalExistente {
  tipo: string
  chave: string
  client_id: string | null
  status: string
}

export interface EntradaSugestoes {
  contatos: readonly ContatoEntrada[]
  /** chat_contact_clients da empresa. */
  vinculosExtra: readonly { contact_id: string; client_id: string }[]
  /** cliente_canais da empresa. */
  canais: readonly CanalExistente[]
  clientes: readonly ClienteEntrada[]
  contratos: readonly ContratoEntrada[]
  /** chat_group_members (só nome) dos grupos pendentes. */
  membros: readonly { contact_id: string; nome: string | null }[]
}

export interface ItemGravar {
  tipo: TipoCanal
  chave: string
  client_id: string
  status: 'sugerido' | 'confirmado'
  origem: Exclude<OrigemCanal, 'manual'>
  score: number
  evidencias: Evidencias
}

export interface ContagemSugestoes {
  canais: number
  internos_ou_decididos: number
  ja_vinculados: number
  pendentes: number
  legado: number
  telefone_unico: number
  telefone_ambiguo: number
  grupos_com_sugestao: number
  grupos_sem_sinal: number
}

export interface ResultadoSugestoes {
  itens: ItemGravar[]
  /** "tipo:chave" de cada canal analisado (para apagar sugestões velhas deles). */
  chavesAnalisadas: string[]
  contagem: ContagemSugestoes
}

/** Canais da empresa que precisam de decisão (pendentes) e quem é o quê. */
export function calcularSugestoes(e: EntradaSugestoes): ResultadoSugestoes {
  const contagem: ContagemSugestoes = {
    canais: 0, internos_ou_decididos: 0, ja_vinculados: 0, pendentes: 0, legado: 0,
    telefone_unico: 0, telefone_ambiguo: 0, grupos_com_sugestao: 0, grupos_sem_sinal: 0,
  }
  const clientesIdx = indexarClientes(e.clientes, e.contratos)
  const idsClientes = new Set(e.clientes.map((c) => c.id))
  const telefones = indexarTelefones(e.clientes, e.contratos)

  // Contatos por canal
  const porCanal = new Map<string, { canal: Canal; contatos: ContatoEntrada[] }>()
  for (const ct of e.contatos) {
    const canal = canalDoContato(ct.numero_whatsapp, ct.group_size)
    if (!canal) continue
    const id = idCanal(canal)
    const g = porCanal.get(id) ?? { canal, contatos: [] }
    g.contatos.push(ct)
    porCanal.set(id, g)
  }
  const extrasPorContato = new Map<string, string[]>()
  for (const v of e.vinculosExtra) extrasPorContato.set(v.contact_id, [...(extrasPorContato.get(v.contact_id) ?? []), v.client_id])
  const canaisPorId = new Map<string, CanalExistente[]>()
  for (const c of e.canais) {
    const id = `${c.tipo}:${c.chave}`
    canaisPorId.set(id, [...(canaisPorId.get(id) ?? []), c])
  }
  const membrosPorContato = new Map<string, string[]>()
  for (const m of e.membros) {
    if (!m.nome) continue
    membrosPorContato.set(m.contact_id, [...(membrosPorContato.get(m.contact_id) ?? []), m.nome])
  }

  const itens: ItemGravar[] = []
  const chavesAnalisadas: string[] = []
  for (const [id, { canal, contatos }] of porCanal) {
    contagem.canais++
    const registros = canaisPorId.get(id) ?? []
    if (contatos.some((c) => c.restrito_admin === true)
        || registros.some((r) => r.client_id === null && (r.status === 'interno' || r.status === 'nao_cliente'))) {
      contagem.internos_ou_decididos++
      continue
    }
    chavesAnalisadas.push(id)
    const comRegistro = new Set(registros.map((r) => r.client_id).filter((x): x is string => Boolean(x)))
    const rejeitados = new Set(registros.filter((r) => r.status === 'rejeitado' && r.client_id).map((r) => r.client_id as string))
    let vinculado = registros.some((r) => r.status === 'confirmado')

    // Vínculo do Chat que ainda não está em cliente_canais (legado / mesmo_jid).
    const ligados = new Map<string, Set<string>>() // client_id → contatos
    for (const ct of contatos) {
      for (const cid of [ct.client_id, ...(extrasPorContato.get(ct.id) ?? [])]) {
        if (!cid || !idsClientes.has(cid) || comRegistro.has(cid)) continue
        ligados.set(cid, (ligados.get(cid) ?? new Set()).add(ct.id))
      }
    }
    const instancias = new Set(contatos.map((c) => c.instance_id ?? '')).size
    for (const [cid, cts] of ligados) {
      const parcial = cts.size < contatos.length
      itens.push({
        tipo: canal.tipo, chave: canal.chave, client_id: cid, status: 'confirmado',
        origem: parcial ? 'mesmo_jid' : 'legado', score: 1,
        evidencias: { contatos: cts.size, instancias },
      })
      contagem.legado++
      vinculado = true
    }
    if (vinculado) {
      contagem.ja_vinculados++
      continue
    }
    contagem.pendentes++

    if (canal.tipo === 'privado') {
      const r = sugerirParaPrivado(canal.chave, telefones, rejeitados)
      for (const s of r) itens.push({ tipo: canal.tipo, chave: canal.chave, origem: 'telefone', ...s })
      if (r.length === 1 && r[0].status === 'confirmado') contagem.telefone_unico++
      else if (r.length > 1) contagem.telefone_ambiguo++
      continue
    }

    const nomes = contatos.map((c) => c.nome)
    const membros = contatos.flatMap((c) => membrosPorContato.get(c.id) ?? [])
    const sugestoes = sugerirParaGrupo(nomes, membros, clientesIdx, rejeitados)
    for (const s of sugestoes) {
      itens.push({ tipo: canal.tipo, chave: canal.chave, client_id: s.client_id, status: 'sugerido', origem: s.origem, score: s.score, evidencias: s.evidencias })
    }
    if (sugestoes.length > 0) contagem.grupos_com_sugestao++
    else contagem.grupos_sem_sinal++
  }
  return { itens, chavesAnalisadas, contagem }
}
