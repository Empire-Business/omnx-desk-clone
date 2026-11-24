// Aviso de versão nova do app instalado: gravação feita pela função htai-licenca
// (mesmo padrão do GT3). Regra: nada aqui pode mudar a licença. Toda falha é
// engolida e a sincronização segue.
import type { HtaiAppUpdate } from './htai-licenca-core.ts'

export interface AppUpdateDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>
}

async function quietly(call: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  try {
    const r = await call()
    return !r.error
  } catch {
    return false
  }
}

/** Toda rodada: grava a versão instalada (o aviso some logo depois de atualizar, sem esperar o pull). */
export function recordInstalledVersion(db: AppUpdateDb, appVersion: string): Promise<boolean> {
  return quietly(() => db.rpc('htai_installation_set_installed_version', { p_installed_version: appVersion }))
}

/** Depois de aplicar o envelope do pull: grava a versão mais nova que a central mandou (ou limpa). */
export function recordAppUpdate(db: AppUpdateDb, appVersion: string, update: HtaiAppUpdate | null | undefined): Promise<boolean> {
  return quietly(() =>
    db.rpc('htai_installation_set_update', {
      p_installed_version: appVersion,
      p_latest_version: update?.latestVersion ?? null,
      p_notes: update?.notes ?? [],
    }),
  )
}

/**
 * Uma rodada de sincronização com o aviso: grava a versão instalada antes do
 * pull (só com a instalação ativada e a versão conhecida) e, se o envelope foi
 * aplicado, a versão mais nova que veio junto. Devolve o resultado da
 * sincronização sem mudar nada nele.
 */
export async function sincronizarComAviso<R extends { feito: string; atualizacao?: HtaiAppUpdate | null }>(
  db: AppUpdateDb,
  ctx: { ativo: boolean; versaoApp: string | null },
  sincronizar: () => Promise<R>,
): Promise<R> {
  const versao = ctx.ativo ? ctx.versaoApp : null
  if (versao) await recordInstalledVersion(db, versao)
  const r = await sincronizar()
  if (versao && r.feito === 'aplicado') await recordAppUpdate(db, versao, r.atualizacao)
  return r
}
