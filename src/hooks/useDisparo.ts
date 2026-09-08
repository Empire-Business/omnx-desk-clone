import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Ponte da tela de Disparo com o CRM externo.
 *
 * Duas chamadas para a mesma edge function: `analisar` só olha e conta (não
 * escreve nada no CRM), `aplicar` é a que efetiva. Separar as duas é o que
 * permite mostrar "X já existem, Y serão criados" antes de a pessoa decidir.
 */

export interface ContatoDisparo {
  contrato_id: string
  nome: string
  /** Já normalizado em E.164 pela tela. */
  telefone: string
  email: string | null
}

export interface AnaliseDisparo {
  tag: string
  /** Quantos contatos foram analisados — usado para invalidar a análise quando o recorte muda. */
  total: number
  existentes: number
  novos: number
  /** Telefones com mais de um cadastro no CRM: não são tocados. */
  ambiguos: Array<{ telefone: string; nome: string }>
}

export interface ResultadoDisparo {
  marcados: number
  criados: number
  falhas: number
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('disparo-enviar-ghl', { body })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('resposta vazia')
  return data
}

export function useAnalisarDisparo() {
  return useMutation({
    mutationFn: ({ tag, contatos }: { tag: string; contatos: ContatoDisparo[] }) =>
      chamar<AnaliseDisparo>({ modo: 'analisar', tag, contatos }),
  })
}

export function useAplicarDisparo() {
  return useMutation({
    mutationFn: ({ tag, contatos, criarNovos }: {
      tag: string
      contatos: ContatoDisparo[]
      criarNovos: boolean
    }) => chamar<ResultadoDisparo>({ modo: 'aplicar', tag, contatos, criar_novos: criarNovos }),
  })
}
