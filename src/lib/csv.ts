/** Gera string CSV a partir de array de objetos. */
export function toCSV<T extends Record<string, unknown>>(rows: T[], headers?: Array<keyof T>): string {
  if (rows.length === 0) return ''
  const cols = headers ?? (Object.keys(rows[0]) as Array<keyof T>)
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const head = cols.join(';')
  const body = rows.map(row => cols.map(c => escape(row[c])).join(';')).join('\n')
  return `${head}\n${body}`
}

export function downloadCSV(filename: string, csv: string) {
  // BOM pra Excel reconhecer UTF-8
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
