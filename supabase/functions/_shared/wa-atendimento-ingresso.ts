import { encaminhadaEntradaAcaoChat, sha256EntradaAcaoChat } from './wa-agente-entrada-integridade.ts'

interface ClienteRpc {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>
}
export interface EntradaTicket {
  tenantId: string; mensagemId: string | null; conversationId: string; messageIdWpp?: string | null
  autenticada: boolean; recuperada: boolean; ocorridoEm: string | null
  tipo: string; conteudoOriginal: string | null; autorOrigem: string | null
  autorTipo: string | null; autorUserId: string | null
  body: Record<string, unknown>; msg: Record<string, unknown>
}

/** Resposta com "Responder" (citação) do WhatsApp vale: o conteúdo salvo é só o
 * texto próprio da pessoa (a mensagem citada não entra). Decisão do dono, 07/11/2026.
 * Somente depois do INSERT autenticado. Ausência da migration nunca bloqueia
 * recebimento no Chat; false não pode ser anunciado como prova registrada.
 */
export async function registrarEntradaTicket(
  admin: ClienteRpc, e: EntradaTicket, buscarExistente?: (messageIdWpp: string) => Promise<string | null>,
): Promise<boolean> {
  if (!e.autenticada || e.recuperada || !e.ocorridoEm || !Number.isFinite(Date.parse(e.ocorridoEm))
    || e.tipo !== 'texto' || !e.conteudoOriginal || e.autorOrigem !== 'webhook'
    || !['cliente', 'equipe'].includes(e.autorTipo ?? '') || (e.autorTipo === 'equipe' && !e.autorUserId)
    || e.msg.fromMe === true || e.msg.wasSentByApi === true
    || encaminhadaEntradaAcaoChat(e.msg, e.body) === true) return false
  try {
    const mensagemId = e.mensagemId ?? (e.messageIdWpp && buscarExistente ? await buscarExistente(e.messageIdWpp) : null)
    if (!mensagemId) return false
    const args = {
      p_tenant: e.tenantId, p_mensagem: mensagemId, p_conversa: e.conversationId,
      p_texto_sha256: await sha256EntradaAcaoChat(e.conteudoOriginal), p_ocorrido_em: e.ocorridoEm,
    }
    // Uma retentativa imediata usa exatamente o mesmo envelope/hash; duplicatas
    // futuras podem retomar pela mensagem original enquanto a janela é válida.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const { data, error } = await admin.rpc('atendimento_atestar_entrada_whatsapp', args)
        if (!error) return data === true
        if (['PGRST202', '42883', '42501'].includes(error.code ?? '')) return false
      } catch { /* transporte: uma única retentativa idempotente abaixo */ }
    }
    console.error('atendimento: entrada não atestada')
    return false
  } catch {
    console.error('atendimento: entrada não atestada')
    return false
  }
}
