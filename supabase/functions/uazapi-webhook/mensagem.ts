import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ContextoMensagem {
  tenantId: string
  conversationId: string
  messageIdWpp: string
  chatJid: string
  isGroup: boolean
}

/**
 * O Chat deduplica message_id_wpp entre instâncias. A primeira conexão pode
 * salvar a mensagem antes da conexão autorizada a acionar a Íris recebê-la.
 * Só grupos permitem esse reaproveitamento, com tenant e canal comprovados.
 * O destino do pedido continua sendo a conexão do webhook autenticado.
 */
export async function localizarMensagemDoAgente(
  supabase: SupabaseClient, ctx: ContextoMensagem,
): Promise<string | null> {
  const { data: local, error: erroLocal } = await supabase.from('chat_messages')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('message_id_wpp', ctx.messageIdWpp)
    .eq('conversation_id', ctx.conversationId)
    .maybeSingle()
  if (erroLocal) throw new Error('mensagem_agente_leitura')
  if (local) return local.id as string
  if (!ctx.isGroup || !ctx.chatJid.endsWith('@g.us')) return null

  const { data: mensagem, error: erroMensagem } = await supabase.from('chat_messages')
    .select('id, conversation_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('message_id_wpp', ctx.messageIdWpp)
    .maybeSingle()
  if (erroMensagem) throw new Error('mensagem_agente_leitura')
  if (!mensagem?.conversation_id) return null

  const { data: conversa, error: erroConversa } = await supabase.from('chat_conversations')
    .select('contact_id, instance_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', mensagem.conversation_id)
    .eq('is_group', true)
    .maybeSingle()
  if (erroConversa) throw new Error('mensagem_agente_conversa')
  if (!conversa?.contact_id || !conversa.instance_id) return null

  const { data: contato, error: erroContato } = await supabase.from('chat_contacts')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', conversa.contact_id)
    .eq('instance_id', conversa.instance_id)
    .in('numero_whatsapp', [ctx.chatJid, ctx.chatJid.slice(0, -5)])
    .maybeSingle()
  if (erroContato) throw new Error('mensagem_agente_contato')
  if (!contato) return null

  const { data: instancia, error: erroInstancia } = await supabase.from('whatsapp_instances')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', conversa.instance_id)
    .maybeSingle()
  if (erroInstancia) throw new Error('mensagem_agente_instancia')
  return instancia ? mensagem.id as string : null
}

