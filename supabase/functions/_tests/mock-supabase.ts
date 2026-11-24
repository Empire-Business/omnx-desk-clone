export type SupabaseClient = any
export function createClient(...args: any[]) {
  return (globalThis as any).__deskCreateClient(...args)
}
