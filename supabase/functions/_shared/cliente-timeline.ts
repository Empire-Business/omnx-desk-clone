// Linha do tempo única do cliente → transcrição para IA (fase F3 do plano
// "Íris e satisfação dos clientes: histórico de conversas").
//
// Módulo PURO (sem banco, sem rede, sem Deno): roda nas edge functions
// (Íris: historico_cliente / resumo_conversa_*; análise por cliente:
// wa-relacionamento-analisar) e no Vitest (cliente-timeline.test.ts).
//
// As linhas vêm da função SQL public.cliente_timeline (migration
// 20261027140000_cliente_timeline.sql), que já:
//   * junta TODOS os grupos e conversas privadas confirmados do cliente, em
//     todas as instâncias, sem grupo interno e sem duplicata;
//   * tira o prefixo "[Nome] " do texto das mensagens de GRUPO (o nome vai para
//     autor_nome) — linhaDeMensagem() abaixo faz o mesmo para quem lê
//     chat_messages direto;
//   * troca o canal por um rótulo (G1, G2… grupos; P1, P2… privados): nunca
//     telefone/JID.
//
// Formato da transcrição (fuso America/Sao_Paulo), uma mensagem por linha:
//   [24/10 14:32] [G1] Cliente (Pessoa 1): …
//   [24/10 14:40] [G1] Equipe (Ana): …
//   [24/10 14:41] [P1] IA: …
//   [24/10 15:02] [G1] Cliente (Pessoa 2): (áudio transcrito) …
//   [24/10 15:03] [G1] Cliente (Pessoa 2): (imagem: …) legenda
// O lado do cliente é PSEUDONIMIZADO por padrão (Pessoa 1, 2… pela ordem em
// que cada nome aparece); a equipe aparece só com o primeiro nome. O conteúdo
// é DADO não confiável (wa-transcricao-dado.ts): uma linha, sem "<" ">", com os
// rótulos neutralizados. Passou de maxChars → corta as mais ANTIGAS.
import { chaveNome, ehDaEquipe, rotuloAutor, semPrefixoAutor } from './wa-autoria.ts'
import { limparTexto } from './wa-midia.ts'
import { neutralizarRotulos, textoSeguroDeMensagem } from './wa-transcricao-dado.ts'

export const FUSO_TIMELINE = 'America/Sao_Paulo'

/** Uma linha de public.cliente_timeline. */
export interface LinhaTimeline {
  message_id: string
  criado_em: string
  canal_rotulo: string
  canal_tipo: 'grupo' | 'privado'
  /** cliente | equipe | ia | sistema | desconhecido; null = mensagem antiga sem autor (lado do cliente). */
  autor_tipo: string | null
  autor_nome: string | null
  tipo: string
  conteudo: string | null
  /** Transcrição do áudio / descrição da imagem (chat_midia_texto 'ok'). */
  midia_texto: string | null
}

export interface OpcoesTranscricaoCliente {
  maxChars: number
  /** Padrão true: lado do cliente vira "Pessoa 1, 2…". */
  pseudonimizar?: boolean
  /** Referência opaca da fonte; nunca conteúdo gerado pelo modelo. */
  incluirReferencia?: boolean
  fuso?: string
}

/** Cada mensagem até este tamanho; transcrição/descrição de mídia até MAX_MIDIA. */
export const MAX_CHARS_MENSAGEM = 500
export const MAX_CHARS_MIDIA = 1_200
const MAX_LEGENDA = 200
export const AVISO_CORTE = '(mensagens mais antigas omitidas)'

const HORA = 3_600_000

const TIPOS_TEXTO = new Set(['texto', 'text', 'chat', ''])
const ROTULO_MIDIA: Record<string, string> = {
  audio: 'enviou um áudio', ptt: 'enviou um áudio', imagem: 'enviou uma imagem', image: 'enviou uma imagem',
  video: 'enviou um vídeo', documento: 'enviou um documento', document: 'enviou um documento',
  sticker: 'enviou uma figurinha', figurinha: 'enviou uma figurinha',
}
const AUDIO = new Set(['audio', 'ptt'])
const IMAGEM = new Set(['imagem', 'image'])
const COM_LEGENDA = new Set(['imagem', 'image', 'video', 'documento', 'document'])

function tempo(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(t) ? NaN : t
}

function dataHora(iso: string, fuso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '??/?? ??:??'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d).replace(',', '')
}

/** Rótulo do canal só no formato G1/P1 (qualquer outra coisa vira "?"). */
export function rotuloCanal(r: string | null | undefined): string {
  const s = String(r ?? '').trim().toUpperCase()
  return /^[GP][1-9][0-9]{0,2}$/.test(s) ? s : '?'
}

function ehEquipeOuIa(l: Pick<LinhaTimeline, 'autor_tipo'>): boolean {
  return ehDaEquipe({ autor_tipo: l.autor_tipo })
}

/** Primeiro nome só com letras/números (nome do perfil do WhatsApp é dado não confiável). */
function primeiroNome(nome: string | null | undefined): string {
  return String(nome ?? '').normalize('NFC').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 20) ?? ''
}

/** Quem falou: "IA", "Sistema", "Equipe (Ana)", "Equipe", "Cliente (Pessoa 1)", "Cliente". */
function quemFalou(l: LinhaTimeline, pessoas: Map<string, number>, pseudonimizar: boolean): string {
  if (l.autor_tipo === 'ia') return 'IA'
  if (l.autor_tipo === 'sistema') return 'Sistema'
  if (ehEquipeOuIa(l)) return rotuloAutor({ autor_tipo: 'equipe', autor_nome: l.autor_nome })
  const k = chaveNome(l.autor_nome)
  if (!k) return 'Cliente'
  if (!pseudonimizar) {
    const p = primeiroNome(l.autor_nome)
    return p ? `Cliente (${p})` : 'Cliente'
  }
  let n = pessoas.get(k)
  if (n === undefined) {
    n = pessoas.size + 1
    pessoas.set(k, n)
  }
  return `Cliente (Pessoa ${n})`
}

function textoMidia(t: string | null | undefined): string {
  if (typeof t !== 'string' || !t.trim()) return ''
  return neutralizarRotulos(limparTexto(t.replace(/[<>]/g, ' '), MAX_CHARS_MIDIA))
}

/** Corpo da linha ('' = mensagem sem nada para mostrar). */
export function corpoDaMensagem(l: Pick<LinhaTimeline, 'tipo' | 'conteudo' | 'midia_texto'>): string {
  const tipo = String(l.tipo ?? 'texto').trim().toLowerCase()
  if (TIPOS_TEXTO.has(tipo)) return textoSeguroDeMensagem(l.conteudo, MAX_CHARS_MENSAGEM)
  const midia = textoMidia(l.midia_texto)
  let base: string
  if (AUDIO.has(tipo)) base = midia ? `(áudio transcrito) ${midia}` : '(enviou um áudio)'
  else if (IMAGEM.has(tipo)) base = midia ? `(imagem: ${midia})` : '(enviou uma imagem)'
  else base = `(${ROTULO_MIDIA[tipo] ?? 'enviou um arquivo'})${midia ? ` ${midia}` : ''}`
  const legenda = COM_LEGENDA.has(tipo) ? textoSeguroDeMensagem(l.conteudo, MAX_LEGENDA) : ''
  return legenda ? `${base} ${legenda}` : base
}

/**
 * Linhas (ordem cronológica) → transcrição "[dd/mm hh:mm] [G1] Quem: …".
 * Cabe em maxChars cortando as mensagens mais ANTIGAS (com o aviso
 * AVISO_CORTE na primeira linha).
 */
export function montarTranscricaoCliente(linhas: LinhaTimeline[], opts: OpcoesTranscricaoCliente): string {
  const fuso = opts.fuso ?? FUSO_TIMELINE
  const pseudo = opts.pseudonimizar !== false
  const max = Math.max(0, Math.floor(opts.maxChars))
  const pessoas = new Map<string, number>()
  const saida: string[] = []
  for (const l of linhas) {
    const corpo = corpoDaMensagem(l)
    if (!corpo) continue
    const referencia = opts.incluirReferencia && /^[0-9a-f-]{36}$/i.test(l.message_id) ? `[msg:${l.message_id}] ` : ''
    saida.push(`${referencia}[${dataHora(l.criado_em, fuso)}] [${rotuloCanal(l.canal_rotulo)}] ${quemFalou(l, pessoas, pseudo)}: ${corpo}`)
  }
  const texto = saida.join('\n')
  if (texto.length <= max) return texto
  const aviso = `${AVISO_CORTE}\n`
  if (max <= aviso.length + 20) return texto.slice(texto.length - max)
  const cabe = max - aviso.length
  const inicio = texto.length - cabe
  let resto = texto.slice(inicio)
  // Começou no meio de uma linha? Descarta o pedaço (a não ser que seja a única).
  if (texto[inicio - 1] !== '\n') {
    const q = resto.indexOf('\n')
    if (q >= 0) resto = resto.slice(q + 1)
  }
  return `${aviso}${resto}`
}

/** Fato calculado (não opinião): quem falou por último e há quanto tempo. */
export function situacaoUltima(linhas: readonly LinhaTimeline[], agora: Date): string {
  const ultima = [...linhas].reverse().find((l) => l.autor_tipo !== 'sistema' && corpoDaMensagem(l))
  if (!ultima) return 'Sem mensagens no período.'
  const h = Math.max(0, Math.floor((agora.getTime() - tempo(ultima.criado_em)) / HORA))
  const desde = h < 24 ? `${h}h` : (Math.floor(h / 24) === 1 ? '1 dia' : `${Math.floor(h / 24)} dias`)
  return ehEquipeOuIa(ultima)
    ? `A última mensagem é da Equipe, há ${desde}.`
    : `A última mensagem é do Cliente, há ${desde}, sem mensagem da Equipe depois dela.`
}

export interface MetricasLinhaDoTempo {
  mensagens: number
  mensagens_cliente: number
  mensagens_equipe: number
  /** Dias desde a última mensagem do cliente no período (null = nenhuma). */
  dias_desde_msg_cliente: number | null
  /** Mediana (minutos corridos) entre a 1ª mensagem do cliente e a próxima da equipe, no mesmo canal. */
  resposta_equipe_mediana_min: number | null
  respostas_medidas: number
  /** Canais em que a última mensagem é do cliente (rótulo e horas desde ela). */
  sem_resposta_agora: { canal: string; horas: number }[]
  audios_sem_transcricao: number
}

/**
 * Métricas SIMPLES e determinísticas do período lido (sem IA, tempo corrido,
 * sem horário comercial). As do relacionamento (cliente_relacionamento.metricas)
 * são mais completas quando existem.
 */
export function metricasLinhaDoTempo(linhas: readonly LinhaTimeline[], agora: Date): MetricasLinhaDoTempo {
  let cliente = 0
  let equipe = 0
  let ultCliente = NaN
  let audios = 0
  const respostas: number[] = []
  const pendente = new Map<string, number>()
  const ultimoPorCanal = new Map<string, { cliente: boolean; t: number }>()
  for (const l of linhas) {
    const t = tempo(l.criado_em)
    if (!Number.isFinite(t)) continue
    const tipo = String(l.tipo ?? '').toLowerCase()
    if (AUDIO.has(tipo) && !(l.midia_texto ?? '').trim()) audios++
    if (l.autor_tipo === 'sistema') continue
    const canal = rotuloCanal(l.canal_rotulo)
    if (ehEquipeOuIa(l)) {
      equipe++
      const p = pendente.get(canal)
      if (p !== undefined) { respostas.push((t - p) / 60_000); pendente.delete(canal) }
      ultimoPorCanal.set(canal, { cliente: false, t })
    } else {
      cliente++
      if (!(t <= ultCliente)) ultCliente = t
      if (!pendente.has(canal)) pendente.set(canal, t)
      ultimoPorCanal.set(canal, { cliente: true, t })
    }
  }
  respostas.sort((a, b) => a - b)
  const meio = Math.floor(respostas.length / 2)
  const mediana = respostas.length === 0 ? null
    : Math.round(respostas.length % 2 ? respostas[meio] : (respostas[meio - 1] + respostas[meio]) / 2)
  const sem = [...ultimoPorCanal.entries()]
    .filter(([, v]) => v.cliente)
    .map(([canal, v]) => ({ canal, horas: Math.max(0, Math.floor((agora.getTime() - v.t) / HORA)) }))
    .sort((a, b) => b.horas - a.horas)
  return {
    mensagens: cliente + equipe,
    mensagens_cliente: cliente,
    mensagens_equipe: equipe,
    dias_desde_msg_cliente: Number.isFinite(ultCliente) ? Math.max(0, Math.floor((agora.getTime() - ultCliente) / 86_400_000)) : null,
    resposta_equipe_mediana_min: mediana,
    respostas_medidas: respostas.length,
    sem_resposta_agora: sem,
    audios_sem_transcricao: audios,
  }
}

// ---------------------------------------------------------------------------
// Para quem lê chat_messages direto (ferramentas por contato, fallback de
// transição): mesma regra da função SQL.
// ---------------------------------------------------------------------------

export interface MensagemChat {
  id: string
  criado_em: string
  tipo: string | null
  conteudo: string | null
  autor_tipo?: string | null
  autor_nome?: string | null
  enviado_por_agente?: boolean | null
  enviado_por_ia?: boolean | null
  midia_texto?: { tipo: string; texto: string } | null
}

const PREFIXO = /^\[([^\]\n]{1,80})\] /

/**
 * Mensagem do Chat → linha da linha do tempo (= public.cliente_timeline):
 * autor_tipo pelas flags quando falta; em GRUPO, sem o prefixo "[Nome] " (que
 * vira autor_nome quando a coluna está vazia).
 */
export function linhaDeMensagem(
  m: MensagemChat, canal: { rotulo: string; tipo: 'grupo' | 'privado' },
): LinhaTimeline {
  const autorTipo = m.autor_tipo ?? (m.enviado_por_ia === true ? 'ia' : m.enviado_por_agente === true ? 'equipe' : null)
  let conteudo = m.conteudo ?? null
  let nome = (m.autor_nome ?? '').trim() || null
  if (canal.tipo === 'grupo' && conteudo) {
    const p = PREFIXO.exec(conteudo)
    if (p) {
      conteudo = semPrefixoAutor(conteudo)
      nome = nome ?? (p[1].trim() || null)
    }
  }
  return {
    message_id: m.id,
    criado_em: m.criado_em,
    canal_rotulo: canal.rotulo,
    canal_tipo: canal.tipo,
    autor_tipo: autorTipo,
    autor_nome: nome ? nome.slice(0, 80) : null,
    tipo: m.tipo ?? 'texto',
    conteudo: conteudo === null ? null : conteudo.slice(0, 2000),
    midia_texto: m.midia_texto?.texto ?? null,
  }
}
