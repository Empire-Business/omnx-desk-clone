/**
 * Regras do lote de tickets (seleção, sugestões da Íris, resumo do resultado).
 *
 * Tudo aqui é função pura: quem vem marcado, o que é pulado e como o resultado
 * é contado. A tela e a gravação ficam com `useTicketsEmLote`; assim a regra
 * pode ser testada sem banco e sem relógio.
 */

import type { StatusTicket } from './ticketStatus'

/** Confiança a partir da qual a sugestão da Íris já vem marcada no lote. */
export const CONFIANCA_ALTA = 0.9

export type NivelConfianca = 'muito alta' | 'alta' | 'média' | 'baixa' | 'sem confiança'

/**
 * A confiança em palavras. "Alta" e "muito alta" são as que entram marcadas
 * quando a pessoa pede para confirmar as sugestões da Íris.
 */
export function descreverConfianca(confianca: number | null | undefined): NivelConfianca {
  if (confianca === null || confianca === undefined || Number.isNaN(Number(confianca))) return 'sem confiança'
  const n = Number(confianca)
  if (n >= 0.95) return 'muito alta'
  if (n >= CONFIANCA_ALTA) return 'alta'
  if (n >= 0.7) return 'média'
  return 'baixa'
}

/** A confiança entra no lote das sugestões? (alta ou muito alta) */
export function confiancaEntraNoLote(confianca: number | null | undefined): boolean {
  return descreverConfianca(confianca) === 'alta' || descreverConfianca(confianca) === 'muito alta'
}

export type AcaoEmLote = 'resolver' | 'reabrir'

/**
 * A terceira ação do lote: prioridade e responsável. Não mexe em etapa, então
 * não tem "já está no estado": vale para qualquer ticket marcado, inclusive os
 * resolvidos (é neles que a fila costuma precisar de arrumação).
 */
export type AcaoSemEtapa = 'atribuir'

/** Toda ação que a regra do plano conhece. */
export type AcaoDoPlano = AcaoEmLote | AcaoSemEtapa

/** O que a tela precisa saber de cada ticket para montar o lote. */
export interface CandidatoEmLote {
  id: string
  codigo: string
  titulo?: string | null
  status: StatusTicket
  /** Etapa atual; `null` = ticket sem etapa. */
  etapaId: string | null
  /** Confiança da sugestão da Íris, quando existe. */
  confianca?: number | null
  /** Por que a Íris ficou em dúvida (texto curto), quando existe. */
  motivo?: string | null
}

/** O ticket já está no estado que a ação pede? Então ele não entra no lote. */
export function jaNoEstado(c: Pick<CandidatoEmLote, 'status'>, acao: AcaoEmLote): boolean {
  return acao === 'resolver' ? c.status === 'resolvido' : c.status !== 'resolvido'
}

export interface PuladoDoLote {
  candidato: CandidatoEmLote
  motivo: string
}

export interface PlanoDoLote {
  /** Vão ser gravados. */
  vao: CandidatoEmLote[]
  /** Ficam de fora, com o motivo em palavras. */
  pulados: PuladoDoLote[]
  /** Precisam de atenção: a bola está com a equipe (cliente esperando resposta). */
  aguardandoEquipe: CandidatoEmLote[]
}

/**
 * Separa o que será gravado do que fica de fora.
 *
 * Resolver: ticket já resolvido é pulado; o que está "aguardando equipe" (o
 * cliente mandou a última mensagem) entra no lote, mas com aviso — a tela o
 * deixa desmarcado por padrão.
 * Reabrir: só faz sentido no que está resolvido; o resto é pulado.
 */
export function planejarLote(candidatos: readonly CandidatoEmLote[], acao: AcaoDoPlano): PlanoDoLote {
  const vao: CandidatoEmLote[] = []
  const pulados: PuladoDoLote[] = []
  const aguardandoEquipe: CandidatoEmLote[] = []

  for (const c of candidatos) {
    // Prioridade e responsável não têm estado: todo marcado é gravado.
    if (acao !== 'atribuir' && jaNoEstado(c, acao)) {
      pulados.push({
        candidato: c,
        motivo: acao === 'resolver' ? 'Já está resolvido.' : 'Já está aberto — não há o que reabrir.',
      })
      continue
    }
    vao.push(c)
    if (acao === 'resolver' && c.status === 'aguardando_equipe') aguardandoEquipe.push(c)
  }

  return { vao, pulados, aguardandoEquipe }
}

/**
 * Quem vem marcado quando a pessoa abre o lote.
 * Resolver: tudo menos "aguardando equipe" (cliente esperando resposta).
 * Reabrir: só o que está resolvido (para o resto não há o que reabrir).
 */
export function marcadosPorPadrao(candidatos: readonly CandidatoEmLote[], acao: AcaoDoPlano): string[] {
  return planejarLote(candidatos, acao)
    .vao.filter((c) => !(acao === 'resolver' && c.status === 'aguardando_equipe'))
    .map((c) => c.id)
}

/**
 * Quem vem marcado no cartão de confirmação: o que a pessoa marcou na lista,
 * menos o que a regra deixa de fora por padrão. É o que faz o aviso do cartão
 * ("aguardando a equipe vem desmarcado") valer também quando a pessoa marcou
 * todos pelo "selecionar todos deste filtro" — e ela ainda pode incluir um a um.
 */
export function marcadosNoCartao(
  marcados: readonly string[],
  candidatos: readonly CandidatoEmLote[],
  acao: AcaoDoPlano,
): string[] {
  const padrao = new Set(marcadosPorPadrao(candidatos, acao))
  return marcados.filter((id) => padrao.has(id))
}

/**
 * Quem vem marcado no "Confirmar as sugestões da Íris": só os que têm sugestão
 * de confiança alta, ainda não estão resolvidos e não estão aguardando a equipe
 * (o cliente mandou a última mensagem — mesma regra do `marcadosPorPadrao`).
 * A pessoa ajusta depois, vendo a confiança e o motivo.
 */
export function marcadosDasSugestoesIris(candidatos: readonly CandidatoEmLote[]): string[] {
  return candidatos
    .filter((c) => c.status !== 'resolvido'
      && c.status !== 'aguardando_equipe'
      && confiancaEntraNoLote(c.confianca))
    .map((c) => c.id)
}

/** Uma linha para o cartão de confirmação: "3 tickets, 1 aguardando a equipe". */
export function resumoDoPlano(plano: PlanoDoLote): string {
  const n = plano.vao.length
  if (n === 0) return 'Nenhum ticket para gravar.'
  const partes = [`${n} ${n === 1 ? 'ticket' : 'tickets'}`]
  if (plano.aguardandoEquipe.length > 0) {
    const a = plano.aguardandoEquipe.length
    partes.push(`${a} ${a === 1 ? 'está' : 'estão'} aguardando a equipe`)
  }
  if (plano.pulados.length > 0) {
    const p = plano.pulados.length
    partes.push(`${p} ${p === 1 ? 'fica' : 'ficam'} de fora`)
  }
  return partes.join(' · ')
}

export type ErroDoLote = 'sem_permissao' | 'falha'

export interface ResultadoDoTicket {
  id: string
  codigo: string
  erro?: ErroDoLote
}

/** 'atualizar' é o resumo de prioridade e responsável: mudou, mas não é etapa. */
export type AcaoResumo = AcaoEmLote | 'atualizar'

export interface ResumoDoResultado {
  /** "18 resolvidos, 2 sem permissão" */
  texto: string
  gravados: number
  semPermissao: number
  falhas: number
}

/**
 * Conta o que aconteceu no lote. A ação no plural fica certa para 1 e para N:
 * "1 resolvido, 2 sem permissão" / "18 resolvidos, 2 sem permissão".
 */
export function resumirResultado(acao: AcaoResumo, resultados: readonly ResultadoDoTicket[]): ResumoDoResultado {
  const gravados = resultados.filter((r) => !r.erro).length
  const semPermissao = resultados.filter((r) => r.erro === 'sem_permissao').length
  const falhas = resultados.filter((r) => r.erro === 'falha').length

  const verbo = acao === 'resolver' ? 'resolvido' : acao === 'reabrir' ? 'reaberto' : 'atualizado'
  const partes: string[] = []
  if (gravados > 0) partes.push(`${gravados} ${verbo}${gravados === 1 ? '' : 's'}`)
  if (semPermissao > 0) partes.push(`${semPermissao} sem permissão`)
  if (falhas > 0) partes.push(`${falhas} com falha${falhas === 1 ? '' : 's'}`)
  if (partes.length === 0) partes.push('Nada foi gravado')

  return { texto: partes.join(', '), gravados, semPermissao, falhas }
}

/** Em blocos de 10 em paralelo: o lote de 200 tickets não abre 200 conexões. */
export const BLOCO_PARALELO = 10
