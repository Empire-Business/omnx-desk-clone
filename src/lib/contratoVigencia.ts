import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

/** Datas civis não passam por UTC: 2026-09-28 continua 28/09 no Brasil. */
export function formatarDataCivil(valor: string | null | undefined): string | null {
  if (!valor) return null
  const civil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (civil) return `${civil[3]}/${civil[2]}/${civil[1]}`
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString('pt-BR')
}

export function hojeSaoPaulo(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === tipo)!.value
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

export interface VigenciaInput {
  contratoId: string
  actorId: string
  novaData: string
  motivo: string
  fimEsperado: string | null
  statusEsperado: string
  reativar: boolean
}
export interface VigenciaConfirmada {
  id: string
  vigencia_fim: string
  vigencia_motivo: string
  status: 'ativo' | 'pausado' | 'concluido'
  status_secundario: string | null
}
export function erroVigencia(input: Pick<VigenciaInput, 'novaData' | 'motivo' | 'fimEsperado'>, hoje = hojeSaoPaulo()): string | null {
  const data = new Date(`${input.novaData}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.novaData) || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== input.novaData || input.novaData < hoje) return 'Informe uma data válida a partir de hoje.'
  if (input.fimEsperado && input.novaData <= input.fimEsperado) return 'A prorrogação deve terminar depois da vigência confirmada.'
  if (input.motivo.trim().length < 8 || input.motivo.trim().length > 2000) return 'Descreva o acordo em 8 a 2000 caracteres.'
  return null
}

export async function confirmarVigencia(banco: SupabaseClient<Database>, input: VigenciaInput): Promise<VigenciaConfirmada> {
  const erro = erroVigencia(input)
  if (erro) throw new Error(erro)
  const sessao = await banco.auth.getSession()
  if (sessao.error || sessao.data.session?.user.id !== input.actorId) throw new Error('A sessão mudou. Reabra o contrato antes de confirmar.')
  // O ator esperado é só uma precondição; o banco deriva tenant/permissão do JWT real.
  const { data, error } = await banco.rpc('prorrogar_vigencia_contrato', {
    p_contrato_id: input.contratoId, p_actor_esperado: input.actorId,
    p_nova_data: input.novaData, p_motivo: input.motivo.trim(),
    p_fim_esperado: input.fimEsperado, p_status_esperado: input.statusEsperado, p_reativar: input.reativar,
  })
  if (error) {
    if (error.code === '40001') throw new Error('O contrato mudou. Recarregue a ficha antes de confirmar novamente.')
    if (error.code === '42501') throw new Error('Sua sessão não permite alterar este contrato.')
    throw new Error('Não foi possível confirmar a vigência. Confira a ficha antes de tentar novamente.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== input.contratoId || data.vigencia_fim !== input.novaData || typeof data.vigencia_motivo !== 'string' || !['ativo', 'pausado', 'concluido'].includes(String(data.status)) || !(data.status_secundario === null || typeof data.status_secundario === 'string')) throw new Error('A resposta não confirmou a alteração. Reabra a ficha para conferir.')
  const atual = await banco.auth.getSession()
  if (atual.error || atual.data.session?.user.id !== input.actorId) throw new Error('A sessão mudou após a solicitação. Reabra a ficha para conferir o resultado.')
  return data as unknown as VigenciaConfirmada
}
