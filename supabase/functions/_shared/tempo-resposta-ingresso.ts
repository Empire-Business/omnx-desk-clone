import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface IngressoTempo { mensagemId: string; confiavel: boolean; ocorridoEm: string | null; recuperada?: boolean; usuarioId?: string | null }
/** Só invocar após persistência, de handler com autoria/ingresso já conferidos.
 * Falha na medição não impede receber/enviar WhatsApp. O detalhe SQL fecha a
 * medição quando encontra uma mensagem sem este comprovante (sem falso atraso).
 */
export async function registrarIngressoTempo(admin: SupabaseClient, entrada: IngressoTempo): Promise<boolean> {
  if (!entrada.confiavel) return false
  try {
    const r = await admin.rpc('tempo_resposta_registrar', { p_mensagem: entrada.mensagemId, p_confiavel: true,
      p_ocorrido_em: entrada.ocorridoEm, p_recuperada: entrada.recuperada === true, p_user: entrada.usuarioId ?? null })
    if (r.error) {
      if (!['PGRST202', '42883'].includes(r.error.code)) console.error('tempo-resposta: registro indisponível')
      return false
    }
    return true
  } catch { console.error('tempo-resposta: registro indisponível'); return false }
}
