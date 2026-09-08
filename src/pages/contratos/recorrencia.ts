/**
 * Regra de negócio de recorrência de contratos.
 *
 * Um contrato é considerado "recorrente" quando tem 6 parcelas ou mais no total.
 * A entrada/sinal NÃO conta como parcela — o número usado aqui é `num_parcelas`,
 * que já é armazenado excluindo a entrada.
 */
export const MIN_PARCELAS_RECORRENTE = 6

/** Recorrente = 6 parcelas ou mais no total. */
export function ehRecorrentePorParcelas(numParcelas: number | null | undefined): boolean {
  return (numParcelas ?? 1) >= MIN_PARCELAS_RECORRENTE
}
