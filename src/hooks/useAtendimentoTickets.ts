import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  primeiraEtapaAberta, statusDoTicket, ultimaMensagemDaConversa,
  type EtapaBasica, type StatusTicket,
} from '@/lib/ticketStatus'
import { lerSugestao, SELECT_SUGESTAO_IRIS, type LinhaSugestaoIris, type SugestaoIris } from '@/lib/sugestaoIris'

/**
 * Tickets do WhatsApp: o que liga o ticket à conversa de onde ele nasceu.
 *
 * Tudo aqui é **consulta separada** da consulta principal de tickets
 * (`SELECT_DEMANDA`). Se uma coluna nova ainda não existir no banco (ambiente
 * antigo, preview), a lista, o painel e o quadro continuam abrindo — só deixam
 * de mostrar o selo do WhatsApp e o status pela conversa.
 *
 * As tabelas do Chat são lidas só quando a pessoa pode ver o Chat. Sem acesso,
 * o ticket cai no status pela etapa (Aberto / Em andamento / Resolvido).
 */

const colunaAusente = (codigo: string | undefined) => codigo === '42703' || codigo === 'PGRST204'

/** Ids por consulta: mantém a URL do PostgREST curta. */
const LOTE = 50
function emLotes<T>(itens: readonly T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE))
  return lotes
}

export interface WhatsAppDoTicket {
  demandaId: string
  origemMensagemId: string
  reabertaEm: string | null
  resolvidaManualmente: boolean
  /** `'ia'` quando a Íris resolveu; `undefined` quando o banco ainda não tem a coluna. */
  resolucaoMetodo?: 'ia' | null
  resolucaoMotivo?: string | null
  resolucaoConfianca?: number | null
  /**
   * Sugestão de resolução que espera alguém confirmar. `null` = sem sugestão;
   * `undefined` = o banco ainda não tem as colunas da sugestão.
   */
  sugestao?: SugestaoIris | null
  /** Da conversa — nulos quando a pessoa não vê o Chat ou a mensagem foi apagada. */
  conversaId: string | null
  contatoId: string | null
  textoOrigem: string | null
  tipoOrigem: string | null
  aguardandoResposta: boolean | null
  ultimaMsgClienteEm: string | null
  conversaAtualizadaEm: string | null
}

interface LinhaWhatsApp extends LinhaSugestaoIris {
  id: string
  wa_origem_mensagem_id: string
  wa_reaberta_em: string | null
  wa_resolvida_manualmente: boolean | null
  wa_resolucao_metodo?: 'ia' | null
  wa_resolucao_motivo?: string | null
  wa_resolucao_confianca?: number | string | null
}

const SELECT_WA_BASE = 'id, wa_origem_mensagem_id, wa_reaberta_em, wa_resolvida_manualmente'
const SELECT_WA_RESOLUCAO = 'wa_resolucao_metodo, wa_resolucao_motivo, wa_resolucao_confianca'

/**
 * Tickets com origem WhatsApp (só as colunas `wa_*`), tolerante a banco antigo.
 * Tenta do mais completo ao mais simples: com a sugestão da Íris → só com a
 * resolução automática → só a ponte. Exportada para teste.
 */
export async function lerTicketsWhatsApp(clienteId?: string): Promise<LinhaWhatsApp[]> {
  const consultar = (campos: string) => {
    let q = (supabase as any).from('atendimento_demandas').select(campos).not('wa_origem_mensagem_id', 'is', null)
    if (clienteId) q = q.eq('cliente_id', clienteId)
    return q
  }
  const niveis = [
    `${SELECT_WA_BASE}, ${SELECT_WA_RESOLUCAO}, ${SELECT_SUGESTAO_IRIS}`,
    `${SELECT_WA_BASE}, ${SELECT_WA_RESOLUCAO}`,
    SELECT_WA_BASE,
  ]
  for (const campos of niveis) {
    const { data, error } = await consultar(campos)
    if (!error) return (data ?? []) as LinhaWhatsApp[]
    // Falta de permissão ou rede não é "coluna ausente": mostra o erro de verdade.
    if (!colunaAusente(error.code)) throw error
  }
  // Nem a ponte existe: nenhum ticket veio do WhatsApp neste ambiente.
  return []
}

interface MensagemOrigem { id: string; conversation_id: string | null; conteudo: string | null; tipo: string | null }
interface ConversaResumo {
  id: string; contact_id: string | null; aguardando_resposta: boolean | null
  ultima_msg_cliente_em: string | null; atualizado_em: string | null
}

/** Lê do Chat sem derrubar a tela: sem acesso, devolve vazio. */
async function lerEmLotes<T>(tabela: string, campos: string, ids: string[]): Promise<T[]> {
  const resultado: T[] = []
  for (const lote of emLotes(ids)) {
    const { data, error } = await (supabase as any).from(tabela).select(campos).in('id', lote)
    if (error) return resultado
    resultado.push(...((data ?? []) as T[]))
  }
  return resultado
}

async function carregarWhatsAppDosTickets(clienteId: string | undefined, incluirConversa: boolean) {
  const linhas = await lerTicketsWhatsApp(clienteId)
  const mapa = new Map<string, WhatsAppDoTicket>()
  if (linhas.length === 0) return mapa

  const mensagens = new Map<string, MensagemOrigem>()
  const conversas = new Map<string, ConversaResumo>()
  if (incluirConversa) {
    const idsOrigem = [...new Set(linhas.map((l) => l.wa_origem_mensagem_id))]
    for (const m of await lerEmLotes<MensagemOrigem>('chat_messages', 'id, conversation_id, conteudo, tipo', idsOrigem)) {
      mensagens.set(m.id, m)
    }
    const idsConversa = [...new Set([...mensagens.values()].map((m) => m.conversation_id).filter((v): v is string => Boolean(v)))]
    const camposConversa = 'id, contact_id, aguardando_resposta, ultima_msg_cliente_em, atualizado_em'
    for (const c of await lerEmLotes<ConversaResumo>('chat_conversations', camposConversa, idsConversa)) {
      conversas.set(c.id, c)
    }
  }

  for (const l of linhas) {
    const msg = mensagens.get(l.wa_origem_mensagem_id)
    const conversa = msg?.conversation_id ? conversas.get(msg.conversation_id) : undefined
    const confianca = l.wa_resolucao_confianca === undefined || l.wa_resolucao_confianca === null
      ? l.wa_resolucao_confianca
      : Number(l.wa_resolucao_confianca)
    mapa.set(l.id, {
      demandaId: l.id,
      origemMensagemId: l.wa_origem_mensagem_id,
      reabertaEm: l.wa_reaberta_em ?? null,
      resolvidaManualmente: Boolean(l.wa_resolvida_manualmente),
      resolucaoMetodo: l.wa_resolucao_metodo,
      resolucaoMotivo: l.wa_resolucao_motivo,
      resolucaoConfianca: confianca,
      sugestao: lerSugestao(l),
      conversaId: msg?.conversation_id ?? null,
      contatoId: conversa?.contact_id ?? null,
      textoOrigem: msg?.conteudo ?? null,
      tipoOrigem: msg?.tipo ?? null,
      aguardandoResposta: conversa?.aguardando_resposta ?? null,
      ultimaMsgClienteEm: conversa?.ultima_msg_cliente_em ?? null,
      conversaAtualizadaEm: conversa?.atualizado_em ?? null,
    })
  }
  return mapa
}

/**
 * Mapa ticket → dados do WhatsApp. Atualiza sozinho a cada minuto: o status
 * "aguardando" muda conforme a conversa anda, sem ninguém mexer no ticket.
 */
export function useWhatsAppDosTickets(opcoes: { clienteId?: string; incluirConversa: boolean; habilitado?: boolean }) {
  const { clienteId, incluirConversa, habilitado = true } = opcoes
  return useQuery({
    queryKey: ['atendimento', 'tickets-whatsapp', clienteId ?? 'todos', incluirConversa],
    queryFn: () => carregarWhatsAppDosTickets(clienteId, incluirConversa),
    enabled: habilitado,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })
}

// ─── Status de um ticket da lista ────────────────────────────────────────────

export interface TicketParaStatus {
  id: string
  etapa_id: string | null
  concluida_em: string | null
  etapa?: { is_final: boolean } | null
}

/** Junta o ticket, os dados do WhatsApp e as etapas num status de tela. */
export function statusDaDemanda(
  d: TicketParaStatus,
  wa: WhatsAppDoTicket | undefined,
  etapas: readonly EtapaBasica[],
): StatusTicket {
  const etapaFinal = d.etapa
    ? d.etapa.is_final
    : etapas.find((e) => e.id === d.etapa_id)?.is_final ?? null
  return statusDoTicket({
    etapaId: d.etapa_id,
    etapaFinal,
    concluidaEm: d.concluida_em,
    primeiraEtapaAbertaId: primeiraEtapaAberta(etapas)?.id ?? null,
    origemWhatsApp: Boolean(wa),
    reabertaEm: wa?.reabertaEm ?? null,
    ultimaMensagemDe: ultimaMensagemDaConversa(wa?.aguardandoResposta),
  })
}

// ─── Conversa na ficha do ticket ─────────────────────────────────────────────

export interface MensagemDaConversa {
  id: string
  conversation_id: string | null
  conteudo: string | null
  tipo: string | null
  criado_em: string
  autor_tipo: string | null
  autor_nome: string | null
  enviado_por_agente: boolean | null
  enviado_por_ia: boolean | null
  /** Situação do envio ao WhatsApp (`falha` = não chegou ao cliente). Ausente em dados antigos. */
  status_envio?: string | null
}

export interface ConversaDoTicket {
  /** `apagada`: a mensagem de origem saiu pela retenção. `sem_acesso`: RLS/permissão. */
  situacao: 'ok' | 'apagada' | 'sem_acesso'
  origem: MensagemDaConversa | null
  mensagens: MensagemDaConversa[]
  /** Índice após o qual há mensagens omitidas (conversa longa). */
  intervaloApos: number | null
  conversa: {
    id: string
    contatoId: string | null
    contatoNome: string | null
    aguardandoResposta: boolean | null
    ultimaMsgClienteEm: string | null
    atualizadaEm: string | null
  } | null
}

// `status_envio` existe desde a criação do Chat: mostra "Não enviada" na ficha.
const CAMPOS_MENSAGEM =
  'id, conversation_id, conteudo, tipo, criado_em, autor_tipo, autor_nome, enviado_por_agente, enviado_por_ia, status_envio'
const ANTES = 3
const DEPOIS = 40
const RECENTES = 15

/** Junta trechos da conversa sem repetir e diz onde há um salto. Exportada para teste. */
export function juntarTrechos(
  antes: MensagemDaConversa[],
  origem: MensagemDaConversa,
  depois: MensagemDaConversa[],
  recentes: MensagemDaConversa[],
): { mensagens: MensagemDaConversa[]; intervaloApos: number | null } {
  const inicio = [...antes].reverse().concat(origem, depois)
  const vistos = new Set(inicio.map((m) => m.id))
  const fim = [...recentes].reverse().filter((m) => !vistos.has(m.id))
  // Se o trecho "depois" veio cheio e as recentes não emendam nele, há mensagens no meio.
  const temSalto = depois.length >= DEPOIS && fim.length > 0 && fim.length === recentes.length
  return {
    mensagens: inicio.concat(fim),
    intervaloApos: temSalto ? inicio.length - 1 : null,
  }
}

export function useConversaDoTicket(origemMensagemId: string | null | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['atendimento', 'conversa-ticket', origemMensagemId],
    enabled: Boolean(origemMensagemId) && habilitado,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<ConversaDoTicket> => {
      const vazio = (situacao: ConversaDoTicket['situacao']): ConversaDoTicket =>
        ({ situacao, origem: null, mensagens: [], intervaloApos: null, conversa: null })
      const db = supabase as any

      const { data: origem, error } = await db.from('chat_messages').select(CAMPOS_MENSAGEM)
        .eq('id', origemMensagemId).maybeSingle()
      if (error) return vazio('sem_acesso')
      if (!origem) return vazio('apagada')
      const msg = origem as MensagemDaConversa
      if (!msg.conversation_id) return { ...vazio('ok'), origem: msg, mensagens: [msg] }

      const [conv, antes, depois, recentes] = await Promise.all([
        db.from('chat_conversations')
          .select('id, contact_id, aguardando_resposta, ultima_msg_cliente_em, atualizado_em, chat_contacts(nome)')
          .eq('id', msg.conversation_id).maybeSingle(),
        db.from('chat_messages').select(CAMPOS_MENSAGEM).eq('conversation_id', msg.conversation_id)
          .lt('criado_em', msg.criado_em).order('criado_em', { ascending: false }).limit(ANTES),
        db.from('chat_messages').select(CAMPOS_MENSAGEM).eq('conversation_id', msg.conversation_id)
          .gt('criado_em', msg.criado_em).order('criado_em', { ascending: true }).limit(DEPOIS),
        db.from('chat_messages').select(CAMPOS_MENSAGEM).eq('conversation_id', msg.conversation_id)
          .gt('criado_em', msg.criado_em).order('criado_em', { ascending: false }).limit(RECENTES),
      ])

      const { mensagens, intervaloApos } = juntarTrechos(
        (antes.data ?? []) as MensagemDaConversa[], msg,
        (depois.data ?? []) as MensagemDaConversa[], (recentes.data ?? []) as MensagemDaConversa[],
      )
      const c = conv.data as (ConversaResumo & { chat_contacts?: { nome: string | null } | null }) | null
      return {
        situacao: 'ok',
        origem: msg,
        mensagens,
        intervaloApos,
        conversa: c ? {
          id: c.id,
          contatoId: c.contact_id,
          contatoNome: c.chat_contacts?.nome ?? null,
          aguardandoResposta: c.aguardando_resposta,
          ultimaMsgClienteEm: c.ultima_msg_cliente_em,
          atualizadaEm: c.atualizado_em,
        } : null,
      }
    },
  })
}

// ─── Tickets de um cliente (para o Chat) ─────────────────────────────────────

export interface TicketDoCliente {
  id: string
  codigo: string
  titulo: string
  etapa_id: string | null
  concluida_em: string | null
  created_at: string
  etapa: { nome: string; is_final: boolean } | null
}

export function useTicketsDoCliente(clienteId: string | null | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['atendimento', 'tickets-do-cliente', clienteId],
    enabled: Boolean(clienteId) && habilitado,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<TicketDoCliente[]> => {
      const { data, error } = await (supabase as any)
        .from('atendimento_demandas')
        .select('id, codigo, titulo, etapa_id, concluida_em, created_at, etapa:atendimento_etapas(nome, is_final)')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as TicketDoCliente[]
    },
  })
}

/**
 * Quantos tickets abertos cada cliente tem. Só leitura, uma consulta para vários
 * clientes (usada pelos alertas da Íris para não mostrar a mesma espera duas vezes).
 * "Aberto" = sem conclusão e fora de etapa final, igual à ficha do cliente.
 */
export function useTicketsAbertosPorCliente(clienteIds: readonly string[], habilitado: boolean) {
  const ids = [...new Set(clienteIds)].sort()
  return useQuery({
    queryKey: ['atendimento', 'tickets-abertos-por-cliente', ids],
    enabled: habilitado && ids.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<Map<string, number>> => {
      const contagem = new Map<string, number>()
      for (const lote of emLotes(ids)) {
        const { data, error } = await (supabase as any)
          .from('atendimento_demandas')
          .select('cliente_id, concluida_em, etapa:atendimento_etapas(is_final)')
          .in('cliente_id', lote)
          .is('concluida_em', null)
        if (error) throw error
        for (const t of (data ?? []) as { cliente_id: string | null; etapa: { is_final: boolean } | null }[]) {
          if (!t.cliente_id || t.etapa?.is_final) continue
          contagem.set(t.cliente_id, (contagem.get(t.cliente_id) ?? 0) + 1)
        }
      }
      return contagem
    },
  })
}
