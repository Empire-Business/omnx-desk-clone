/**
 * Status de um ticket, do jeito que a equipe lê na tela.
 *
 * O banco não tem uma coluna "status": o ticket tem uma **etapa** (que pode ser
 * final) e, quando veio do WhatsApp, a conversa de onde nasceu. O status
 * exibido é **derivado** desses dados, sem mudar o banco:
 *
 * - **Resolvido**: o ticket está numa etapa final (pela Íris ou por alguém).
 * - **Reaberto**: alguém reabriu depois da última resolução e ele ainda não
 *   foi resolvido de novo.
 * - **Aguardando equipe**: veio do WhatsApp e a última mensagem da conversa é
 *   do cliente — falta a equipe responder.
 * - **Aguardando cliente**: veio do WhatsApp e a última mensagem é da equipe.
 * - **Aberto / Em andamento**: ticket sem conversa conhecida (criado à mão, ou
 *   a conversa não está acessível). Aberto = na primeira etapa de trabalho;
 *   Em andamento = em qualquer outra etapa não final.
 *
 * Tudo aqui é função pura: nada de rede, nada de relógio implícito (quem
 * precisa da hora recebe `agora`), para poder ser testado por inteiro.
 */

export type StatusTicket =
  | 'aguardando_equipe'
  | 'aguardando_cliente'
  | 'resolvido'
  | 'reaberto'
  | 'aberto'
  | 'em_andamento'

/** Quem mandou a última mensagem relevante da conversa. */
export type UltimaMensagemDe = 'cliente' | 'equipe'

export interface EntradaStatusTicket {
  /** Etapa atual. `null` = ticket sem etapa. */
  etapaId: string | null
  /** `is_final` da etapa atual; `null`/`undefined` quando a etapa não é conhecida. */
  etapaFinal?: boolean | null
  concluidaEm?: string | null
  /** Primeira etapa não final pelo `ordem` — onde o ticket nasce. */
  primeiraEtapaAbertaId?: string | null
  /** O ticket nasceu de uma mensagem do WhatsApp. */
  origemWhatsApp?: boolean
  /** Quando alguém reabriu o ticket pela última vez. */
  reabertaEm?: string | null
  /** Última mensagem relevante da conversa de origem; `null` se não deu para saber. */
  ultimaMensagemDe?: UltimaMensagemDe | null
}

/**
 * O ticket está resolvido?
 *
 * Vale a **etapa**: se ela é final, está resolvido. Só quando a etapa não é
 * conhecida (ticket sem etapa, ou etapa que não veio na consulta) usamos a data
 * de conclusão. Assim, mudar a marcação "Final" de uma etapa já muda o status na
 * tela, mesmo que a data antiga não tenha sido recalculada.
 */
export function ticketResolvido(e: Pick<EntradaStatusTicket, 'etapaFinal' | 'concluidaEm'>): boolean {
  if (e.etapaFinal === true) return true
  if (e.etapaFinal === false) return false
  return Boolean(e.concluidaEm)
}

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

export function statusDoTicket(e: EntradaStatusTicket): StatusTicket {
  if (ticketResolvido(e)) {
    // Reaberto depois da última conclusão, mas a etapa ainda é final: só
    // acontece se a marcação "Final" mudou por fora. A etapa manda.
    return 'resolvido'
  }

  const reaberta = instante(e.reabertaEm)
  const concluida = instante(e.concluidaEm)
  if (reaberta !== null && (concluida === null || reaberta > concluida)) return 'reaberto'

  if (e.origemWhatsApp && e.ultimaMensagemDe) {
    return e.ultimaMensagemDe === 'cliente' ? 'aguardando_equipe' : 'aguardando_cliente'
  }

  if (!e.etapaId || !e.primeiraEtapaAbertaId || e.etapaId === e.primeiraEtapaAbertaId) return 'aberto'
  return 'em_andamento'
}

export const ROTULO_STATUS_TICKET: Record<StatusTicket, string> = {
  aguardando_equipe: 'Aguardando equipe',
  aguardando_cliente: 'Aguardando cliente',
  resolvido: 'Resolvido',
  reaberto: 'Reaberto',
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
}

/** Uma frase que diz o que fazer, para o topo da ficha. */
export const EXPLICACAO_STATUS_TICKET: Record<StatusTicket, string> = {
  aguardando_equipe: 'O cliente mandou a última mensagem. A equipe precisa responder.',
  aguardando_cliente: 'A equipe respondeu por último. Agora é a vez do cliente.',
  resolvido: 'Este ticket está resolvido.',
  reaberto: 'O ticket foi reaberto e precisa de atenção da equipe.',
  aberto: 'Ninguém começou este ticket ainda.',
  em_andamento: 'A equipe está cuidando deste ticket.',
}

/** Classes só com tokens semânticos — o visual troca pelas variáveis CSS. */
export const CLASSE_STATUS_TICKET: Record<StatusTicket, string> = {
  aguardando_equipe: 'bg-warning/15 text-warning border-warning/30',
  aguardando_cliente: 'bg-info/15 text-info border-info/30',
  resolvido: 'bg-success/15 text-success border-success/30',
  reaberto: 'bg-destructive/10 text-destructive border-destructive/30',
  aberto: 'bg-primary/10 text-primary border-primary/30',
  em_andamento: 'bg-muted text-foreground border-border',
}

// ─── Filas (os filtros da lista) ─────────────────────────────────────────────

export type FiltroTicket = 'equipe' | 'cliente' | 'resolvidos' | 'todos'

/**
 * Em que fila o ticket cai.
 *
 * "Aguardando equipe" é a fila de quem precisa agir: além dos tickets do
 * WhatsApp com mensagem do cliente por responder, entram os reabertos e os
 * tickets sem conversa ainda abertos — todos dependem da equipe.
 */
export function filaDoStatus(status: StatusTicket): Exclude<FiltroTicket, 'todos'> {
  if (status === 'resolvido') return 'resolvidos'
  if (status === 'aguardando_cliente') return 'cliente'
  return 'equipe'
}

export function passaNoFiltro(status: StatusTicket, filtro: FiltroTicket): boolean {
  return filtro === 'todos' || filaDoStatus(status) === filtro
}

export const ROTULO_FILTRO_TICKET: Record<FiltroTicket, string> = {
  equipe: 'Aguardando equipe',
  cliente: 'Aguardando cliente',
  resolvidos: 'Resolvidos',
  todos: 'Todos',
}

// ─── Mensagens ───────────────────────────────────────────────────────────────

export interface MensagemComAutor {
  autor_tipo?: string | null
  enviado_por_agente?: boolean | null
  enviado_por_ia?: boolean | null
}

/**
 * Quem escreveu a mensagem. Mesma regra do servidor (`ehDaEquipe` e o gatilho
 * de "aguardando resposta"): vale o autor gravado; sem ele, as marcas antigas.
 * Mensagem de sistema não conta como de ninguém.
 */
export function autorDaMensagem(m: MensagemComAutor): 'cliente' | 'equipe' | 'sistema' {
  if (m.autor_tipo === 'equipe' || m.autor_tipo === 'ia') return 'equipe'
  if (m.autor_tipo === 'sistema') return 'sistema'
  if (m.autor_tipo === 'cliente' || m.autor_tipo === 'desconhecido') return 'cliente'
  return m.enviado_por_agente === true || m.enviado_por_ia === true ? 'equipe' : 'cliente'
}

/** A mensagem da equipe não chegou ao cliente (o envio ao WhatsApp falhou)? */
export function envioFalhou(m: { status_envio?: string | null }): boolean {
  return m.status_envio === 'falha'
}

/**
 * Lê o "aguardando resposta" que o banco mantém na conversa: verdadeiro quando
 * a última mensagem relevante é do cliente. Sem a informação, não chuta.
 */
export function ultimaMensagemDaConversa(aguardandoResposta: boolean | null | undefined): UltimaMensagemDe | null {
  if (aguardandoResposta === true) return 'cliente'
  if (aguardandoResposta === false) return 'equipe'
  return null
}

// ─── Etapas ──────────────────────────────────────────────────────────────────

export interface EtapaBasica {
  id: string
  nome: string
  ordem: number
  is_final: boolean
}

const porOrdem = <T extends EtapaBasica>(a: T, b: T) => a.ordem - b.ordem || a.id.localeCompare(b.id)

/** Primeira etapa não final — a mesma regra do servidor para criar tickets. */
export function primeiraEtapaAberta<T extends EtapaBasica>(etapas: readonly T[]): T | null {
  return [...etapas].sort(porOrdem).find((e) => !e.is_final) ?? null
}

/**
 * Para onde o ticket vai ao clicar em "Marcar como resolvido" ou "Reabrir".
 *
 * Escolhe a primeira etapa do tipo pedido que **não seja a atual**: se o ticket
 * já estiver nela (marcação "Final" alterada depois), trocar para a mesma etapa
 * não teria efeito nenhum e o botão pareceria quebrado.
 */
export function etapaDestino<T extends EtapaBasica>(
  etapas: readonly T[],
  etapaAtualId: string | null,
  acao: 'resolver' | 'reabrir',
): T | null {
  const querFinal = acao === 'resolver'
  return [...etapas].sort(porOrdem).find((e) => e.is_final === querFinal && e.id !== etapaAtualId) ?? null
}

/**
 * Nome da etapa para a tela. Etapa final aparece como "Resolvido" (a etapa
 * herdada se chama "Publicado", que não faz sentido em atendimento). Se houver
 * mais de uma etapa final, o nome original vai junto para distinguir.
 */
export function rotuloEtapa(etapa: Pick<EtapaBasica, 'nome' | 'is_final'>, etapas: readonly Pick<EtapaBasica, 'is_final'>[] = []): string {
  if (!etapa.is_final) return etapa.nome
  const finais = etapas.filter((e) => e.is_final).length
  if (finais > 1 && etapa.nome.trim().toLowerCase() !== 'resolvido') return `Resolvido (${etapa.nome})`
  return 'Resolvido'
}

/** O mesmo, quando só se tem o nome gravado (histórico guarda o nome como texto). */
export function rotuloNomeEtapa(nome: string | null, etapas: readonly Pick<EtapaBasica, 'nome' | 'is_final'>[]): string {
  if (!nome) return 'sem etapa'
  const etapa = etapas.find((e) => e.nome === nome)
  return etapa ? rotuloEtapa(etapa, etapas) : nome
}

// ─── Textos ──────────────────────────────────────────────────────────────────

/** Certeza da Íris em linguagem simples (a confiança vem de 0 a 1). */
export function descreverConfianca(confianca: number | null | undefined): string | null {
  if (confianca === null || confianca === undefined || Number.isNaN(confianca)) return null
  if (confianca >= 0.97) return 'muito alta'
  if (confianca >= 0.9) return 'alta'
  if (confianca >= 0.75) return 'média'
  return 'baixa'
}

/**
 * Prazo de um ticket em aberto: "Sem prazo", "Vence hoje", "Vence 12/11",
 * "Atrasado 2 dias". (O texto antigo era no feminino, de "demanda".)
 */
export function textoPrazoTicket(prazo: string | null | undefined, agora: Date): string {
  if (!prazo) return 'Sem prazo'
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  const data = new Date(`${prazo}T00:00:00`)
  if (Number.isNaN(data.getTime())) return 'Sem prazo'
  if (data < hoje) {
    const dias = Math.round((hoje.getTime() - data.getTime()) / 86_400_000)
    return dias === 1 ? 'Atrasado 1 dia' : `Atrasado ${dias} dias`
  }
  if (data.getTime() === hoje.getTime()) return 'Vence hoje'
  return `Vence ${data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}

/** "agora há pouco", "há 5 min", "há 3 h", "há 2 dias". */
export function tempoDesde(iso: string | null | undefined, agora: Date): string | null {
  const t = instante(iso)
  if (t === null) return null
  const minutos = Math.floor((agora.getTime() - t) / 60_000)
  if (minutos < 1) return 'agora há pouco'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}

/**
 * Desde quando o ticket espera, conforme o status:
 * - aguardando equipe: desde a última mensagem do cliente;
 * - aguardando cliente: desde a última atividade da conversa;
 * - resolvido: desde a resolução;
 * - reaberto: desde a reabertura;
 * - demais: desde a criação.
 */
export function inicioDaEspera(
  status: StatusTicket,
  datas: {
    criadoEm: string
    concluidaEm?: string | null
    reabertaEm?: string | null
    ultimaMsgClienteEm?: string | null
    conversaAtualizadaEm?: string | null
  },
): string {
  switch (status) {
    case 'aguardando_equipe':
      return datas.ultimaMsgClienteEm ?? datas.criadoEm
    case 'aguardando_cliente':
      return datas.conversaAtualizadaEm ?? datas.criadoEm
    case 'resolvido':
      return datas.concluidaEm ?? datas.criadoEm
    case 'reaberto':
      return datas.reabertaEm ?? datas.criadoEm
    default:
      return datas.criadoEm
  }
}

/**
 * Nome de quem fez uma mudança no histórico. O servidor grava a ação da Íris
 * sem autor; num ticket do WhatsApp, autor vazio é a Íris, não "alguém".
 */
export function autorDoHistorico(nome: string | null | undefined, origemWhatsApp: boolean): string {
  if (nome && nome.trim()) return nome
  return origemWhatsApp ? 'Íris' : 'Alguém da equipe'
}
