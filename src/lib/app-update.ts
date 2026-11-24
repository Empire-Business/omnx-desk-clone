/** Aviso de versão nova do app (dados vindos da central do HTAI pelo htai-heartbeat). */

export interface AppUpdateRow {
  installed_version: string
  latest_version: string | null
  notes: unknown
}

export interface AppUpdateNotice {
  installed: string
  latest: string
  notes: string[]
}

/** Só x.y.z (a mesma regra da página do app no HTAI). Qualquer outro formato: na dúvida, não avisa. */
function parts(v: string): number[] | null {
  return /^\d+\.\d+\.\d+$/.test(v.trim()) ? v.trim().split('.').map(Number) : null
}

/** true só quando as duas versões são x.y.z e a mais nova é maior. */
export function isNewerVersion(installed: string, latest: string): boolean {
  const a = parts(installed)
  const b = parts(latest)
  if (!a || !b) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (y !== x) return y > x
  }
  return false
}

export function appUpdateNotice(row: AppUpdateRow | null | undefined): AppUpdateNotice | null {
  if (!row || !row.latest_version || !isNewerVersion(row.installed_version, row.latest_version)) return null
  const notes = Array.isArray(row.notes) ? row.notes.filter((n): n is string => typeof n === 'string' && n.trim() !== '') : []
  return { installed: row.installed_version, latest: row.latest_version, notes: notes.slice(0, 5) }
}

/** O pedido que a pessoa cola na IA, dentro da pasta do app. */
export function updateRequest(appName: string): string {
  return `Atualize o meu app ${appName}.`
}
