import { supabase } from '@/lib/supabase'

/**
 * Leitura do comprovante por IA com visão (edge function `comprovante-ler-ia`).
 *
 * Substitui, na prática, o OCR local para o caso real deste sistema: a maioria
 * dos comprovantes é print de checkout, e-mail de confirmação ou tela de
 * plataforma, onde o nome de quem pagou não vem depois de um rótulo. O OCR lê as
 * letras; a IA entende o documento.
 *
 * O trabalho pesado fica no servidor: o arquivo é baixado lá, a chave da IA
 * nunca chega ao navegador, e nada depende da memória do aparelho de quem está
 * conferindo — que foi onde a leitura local travava.
 */

export interface LeituraIa {
  /**
   * Nome do pagador — ou, quando o comprovante só traz o e-mail do comprador,
   * o e-mail seguido de "(e-mail — nome não encontrado no comprovante)". A marca
   * é proposital: quem confere o extrato precisa ver de imediato que ali não
   * está o nome do titular.
   */
  identificador: string | null
  tipo?: 'nome' | 'email'
  confianca: 'alta' | 'media' | 'baixa'
  motivo?: string | null
  /** true quando a function já gravou o identificador na venda. */
  gravado?: boolean
  arquivo?: string
  erro?: string
}

export async function lerComprovanteComIa(
  vendaId: string,
  opcoes?: { gravar?: boolean },
): Promise<LeituraIa> {
  const { data, error } = await supabase.functions.invoke('comprovante-ler-ia', {
    body: { venda_id: vendaId, gravar: opcoes?.gravar !== false },
  })

  // O motivo da falha PRECISA chegar à tela. Na primeira versão, qualquer erro
  // — permissão, chave da IA ausente, download do arquivo — virava um silencioso
  // "não encontrei nome", e ficava impossível saber o que corrigir.
  if (error) {
    // `FunctionsHttpError` guarda o corpo da resposta, onde está o erro real.
    let detalhe = error.message
    try {
      const corpo = await (error as { context?: Response }).context?.json?.()
      if (corpo?.error) detalhe = `${corpo.error}${corpo.detail ? `: ${corpo.detail}` : ''}`
    } catch { /* resposta sem JSON — fica a mensagem genérica */ }
    return { identificador: null, confianca: 'baixa', erro: detalhe }
  }

  const r = (data ?? {}) as LeituraIa & { error?: string; detail?: string; tentativas?: unknown[] }
  // A function responde 200 mesmo quando não identifica; se veio `error` no
  // corpo, é falha de verdade e não "não achei".
  if (r.error) return { identificador: null, confianca: 'baixa', erro: r.error }
  return r
}
