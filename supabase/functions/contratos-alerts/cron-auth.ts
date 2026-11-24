/** Só o agendador autenticado pode iniciar a rotina global; nenhuma chave pública autoriza escrita. */
export async function autorizarCronContratos(req: Request, conferir: (segredo: string) => Promise<boolean>): Promise<{ status: number; code: string } | null> {
  if (req.method !== 'POST') return { status: 405, code: 'method_not_allowed' }
  const segredo = req.headers.get('x-cron-secret')
  if (!segredo || segredo.length > 1024) return { status: 401, code: 'unauthorized' }
  try {
    return await conferir(segredo) === true ? null : { status: 401, code: 'unauthorized' }
  } catch {
    return { status: 503, code: 'cron_auth_unavailable' }
  }
}
