import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  BLOCO_PARALELO,
  resumirResultado,
  type AcaoResumo,
  type ResultadoDoTicket,
} from '@/lib/ticketsEmLote'

/**
 * Gravação do lote de tickets.
 *
 * Um `update` por bloco de 10 tickets (`.in('id', ids)`), em paralelo, para 200
 * tickets não abrirem 200 conexões; `.select('id')` no fim é o que diz se a RLS
 * deixou gravar — linha que não volta é "sem permissão", como no
 * `useRecusarSugestaoIris`. O lote não para no primeiro erro: cada ticket
 * terminou como terminou, e a tela conta o resultado.
 *
 * Uma invalidação só, no fim: `['atendimento']`.
 */

export interface ItemDoLote {
  id: string
  codigo: string
  /** Etapa antes da gravação — é o que o desfazer devolve. */
  etapaId: string | null
}

export interface ResultadoDoLote {
  resultados: ResultadoDoTicket[]
  /** Os que foram gravados, com a etapa anterior, para o desfazer. */
  anteriores: ItemDoLote[]
  /** Códigos cujo comentário não foi gravado (o ticket foi, o comentário não). */
  comentariosFalhos: string[]
  resumo: string
}

function blocos<T>(itens: readonly T[], tamanho = BLOCO_PARALELO): T[][] {
  const saida: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(itens.slice(i, i + tamanho))
  return saida
}

/**
 * O client gerado do Supabase não tipa as tabelas de atendimento (o resto do
 * app também as acessa sem tipo). Aqui só o mínimo que o lote usa, para não
 * espalhar `any` por este arquivo.
 */
interface ConsultaDoLote {
  update: (valores: Record<string, unknown>) => ConsultaDoLote
  insert: (valores: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>
  in: (coluna: string, valores: readonly string[]) => ConsultaDoLote
  select: (colunas: string) => Promise<{ data: unknown; error: { message: string } | null }>
}
const db = supabase as unknown as { from: (tabela: string) => ConsultaDoLote }

/** Grava o mesmo `patch` em cada bloco e diz, por ticket, o que aconteceu. */
async function gravarPatch(
  itens: readonly ItemDoLote[],
  patch: Record<string, unknown>,
): Promise<ResultadoDoTicket[]> {
  const porId = new Map<string, ResultadoDoTicket>()

  await Promise.all(blocos(itens).map(async (bloco) => {
    const ids = bloco.map((i) => i.id)
    const { data, error } = await db
      .from('atendimento_demandas')
      .update(patch)
      .in('id', ids)
      .select('id')

    if (error) {
      bloco.forEach((i) => porId.set(i.id, { id: i.id, codigo: i.codigo, erro: 'falha' }))
      return
    }

    const gravados = new Set<string>(((data ?? []) as { id: string }[]).map((r) => r.id))
    bloco.forEach((i) => porId.set(i.id, gravados.has(i.id)
      ? { id: i.id, codigo: i.codigo }
      : { id: i.id, codigo: i.codigo, erro: 'sem_permissao' }))
  }))

  // A ordem do lote é a ordem em que a pessoa viu os tickets na tela.
  return itens.map((i) => porId.get(i.id) ?? { id: i.id, codigo: i.codigo, erro: 'falha' })
}

/** O comentário é o mesmo texto em cada ticket, pelo mesmo caminho do `useComentar`. */
async function comentarNoLote(ids: readonly string[], texto: string): Promise<string[]> {
  const limpo = texto.trim()
  if (!limpo || ids.length === 0) return []

  const { data: sessao } = await supabase.auth.getUser()
  const autorId = sessao.user?.id ?? null
  const falhos: string[] = []

  await Promise.all(blocos(ids).map(async (bloco) => {
    const linhas = bloco.map((demandaId) => ({ demanda_id: demandaId, texto: limpo, autor_id: autorId }))
    const { error } = await db.from('atendimento_comentarios').insert(linhas)
    if (error) falhos.push(...bloco)
  }))

  return falhos
}

export interface VarsDoLote {
  itens: readonly ItemDoLote[]
  /** O que muda em cada ticket (etapa_id, prioridade, responsavel_id…). */
  patch: Record<string, unknown>
  acao: AcaoResumo
  comentario?: string | null
}

/** Resolve, reabre, muda prioridade ou responsável — em lote, sem parar no erro. */
export function useGravarLote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (vars: VarsDoLote): Promise<ResultadoDoLote> => {
      const resultados = await gravarPatch(vars.itens, vars.patch)
      const anteriores = vars.itens.filter((i) => resultados.find((r) => r.id === i.id && !r.erro))
      const comentariosFalhos = vars.comentario
        ? await comentarNoLote(anteriores.map((i) => i.id), vars.comentario)
        : []

      return {
        resultados,
        anteriores,
        comentariosFalhos,
        resumo: resumirResultado(vars.acao, resultados).texto,
      }
    },
    onSuccess: () => {
      // Uma invalidação para o lote inteiro, não uma por ticket.
      qc.invalidateQueries({ queryKey: ['atendimento'] })
    },
  })
}

export interface ResultadoDoDesfazer {
  /** Os que voltaram para a etapa anterior. */
  restaurados: string[]
  /** Os que não voltaram: RLS, erro do banco ou ticket que não tinha etapa. */
  falhos: string[]
}

/**
 * Desfazer: devolve a etapa que cada ticket tinha. Agrupa por etapa para gastar
 * um `update ... in (...)` por etapa em vez de um por ticket. Os comentários
 * gravados ficam (são histórico, não se apagam).
 *
 * Como no `gravarPatch`: `.select('id')` diz o que a RLS deixou gravar, e o
 * erro do bloco é contado em vez de sumir. Ticket que já estava sem etapa
 * (`etapaId` nulo) não tem para onde voltar e nunca vira `etapa_id: null`.
 */
export function useDesfazerLote() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (anteriores: readonly ItemDoLote[]): Promise<ResultadoDoDesfazer> => {
      const porEtapa = new Map<string | null, string[]>()
      anteriores.forEach((i) => {
        const ids = porEtapa.get(i.etapaId) ?? []
        ids.push(i.id)
        porEtapa.set(i.etapaId, ids)
      })

      const restaurados: string[] = []
      const falhos: string[] = []

      await Promise.all([...porEtapa.entries()].map(async ([etapaId, ids]) => {
        if (!etapaId) {
          falhos.push(...ids)
          return
        }
        for (const bloco of blocos(ids)) {
          const { data, error } = await db
            .from('atendimento_demandas')
            .update({ etapa_id: etapaId })
            .in('id', bloco)
            .select('id')

          if (error) {
            falhos.push(...bloco)
            continue
          }

          const voltaram = new Set<string>(((data ?? []) as { id: string }[]).map((r) => r.id))
          bloco.forEach((id) => (voltaram.has(id) ? restaurados : falhos).push(id))
        }
      }))

      return { restaurados, falhos }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['atendimento'] }),
  })
}
