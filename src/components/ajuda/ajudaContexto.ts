import { createContext, useContext } from 'react'

/** O que qualquer gatilho de ajuda pode fazer (ver `PontoDeAjuda`). */
export type AjudaCtx = {
  abrirMenu: () => void
  abrirIris: () => void
  abrirReporte: () => void
  capturando: boolean
}

export const ContextoAjuda = createContext<AjudaCtx | null>(null)

/** Atributo dos elementos que não devem sair na foto do reporte. */
export const SEM_CAPTURA = 'data-sem-captura'

const SEM_PROVEDOR: AjudaCtx = { abrirMenu: () => {}, abrirIris: () => {}, abrirReporte: () => {}, capturando: false }

/** Abre o ponto de ajuda de qualquer lugar dentro do `AjudaProvider`. */
export function useAjuda(): AjudaCtx {
  // Fora do provedor (ex.: layout arquivado de Cobrança) não quebra: só não faz nada.
  return useContext(ContextoAjuda) ?? SEM_PROVEDOR
}
