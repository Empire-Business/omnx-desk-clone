/** Uma regra mais forte cobre as ações inferiores, nunca o contrário. */
export type AcaoPermissao = 'ver' | 'editar' | 'admin'

const NIVEL: Record<AcaoPermissao, number> = { ver: 1, editar: 2, admin: 3 }

export function regraPermiteAcao(regra: AcaoPermissao, solicitada: AcaoPermissao): boolean {
  return NIVEL[regra] >= NIVEL[solicitada]
}
