import { SUPABASE_URL } from '@/integrations/supabase/client'
import { supabase } from '@/lib/supabase'

/**
 * Dispara o e-mail detalhado de "contrato assinado" para o Bruno.
 *
 * A edge function `notificar-contrato-assinado` exige um usuário autenticado
 * (ela barra a anon key pública). Por isso enviamos explicitamente o
 * `access_token` da sessão atual no header Authorization — não dá pra confiar
 * que o `functions.invoke` anexe o token sozinho.
 *
 * Em caso de falha, lança um Error com a mensagem do servidor. Quem chama
 * decide se mostra na tela (recomendado) ou só loga.
 */
export async function notificarContratoAssinado(contratoId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sessão expirada — faça login novamente para notificar o contrato.')
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/notificar-contrato-assinado`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contrato_id: contratoId }),
  })

  if (!res.ok) {
    let detalhe = ''
    try {
      const body = await res.json()
      detalhe = body?.detail || body?.error || ''
    } catch {
      // corpo não-JSON; mantém o detalhe vazio
    }
    throw new Error(detalhe || `Falha ao notificar contrato (HTTP ${res.status})`)
  }
}
