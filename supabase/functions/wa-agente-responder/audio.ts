// Áudio da equipe para a Íris — parte com BANCO do wa-agente-responder
// (regras puras em regras.ts; rede/Storage em _shared/wa-midia-transcrever.ts).
//
//   * ouvirAudios: para cada mensagem de áudio da pergunta, usa a transcrição
//     pronta em chat_midia_texto (status 'ok'); se não houver, transcreve AGORA
//     (até MAX_AUDIOS_AGORA, com o prazo que sobra) e grava como 'ok' — a fila
//     wa-midia-processar não refaz e o Chat mostra "Ver transcrição".
//   * gravarTranscricao: INSERT … ON CONFLICT DO NOTHING + UPDATE só se o status
//     ainda não é 'ok' (nunca sobrescreve uma transcrição pronta).
//   * audiosDeHoje: quantos pedidos de gatilho 'audio' já foram ouvidos hoje na
//     empresa (limite diário, mesma env da fila: WA_MIDIA_LIMITE_DIA).
//
// Segurança: TODA consulta com `.eq('tenant_id', …)`; nada de texto em log; o
// texto transcrito é DADO não confiável (já limpo por interpretarTranscricao).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { carregarTextosMidia } from '../_shared/wa-midia-texto.ts'
import type { ResultadoTranscricao } from '../_shared/wa-midia-transcrever.ts'
import { type Audicao, MAX_AUDIOS_AGORA, ehAudio } from './regras.ts'

export interface MsgAudio {
  id: string
  tipo: string | null
  media_url: string | null
  conversation_id: string | null
  criado_em: string | null
}

export interface OpcoesOuvir {
  /** Transcreve uma mensagem agora; null = sem tempo (o pedido volta à fila). */
  transcrever: (m: MsgAudio) => Promise<ResultadoTranscricao | null>
  /** Mensagem do próprio pedido: ouvida primeiro (é a única que pode devolver o pedido à fila). */
  idPrincipal?: string | null
  maxAgora?: number
}

/** message_id → audição. Mensagens que não são áudio ficam fora. */
export async function ouvirAudios(
  admin: SupabaseClient, tenantId: string, msgs: readonly MsgAudio[], o: OpcoesOuvir,
): Promise<Map<string, Audicao>> {
  const audios = msgs.filter((m) => ehAudio(m.tipo))
  const out = new Map<string, Audicao>()
  if (audios.length === 0) return out
  const prontos = await carregarTextosMidia(admin, tenantId, audios.map((m) => m.id))
  let agora = 0
  const max = o.maxAgora ?? MAX_AUDIOS_AGORA
  // O áudio do próprio pedido primeiro; depois os agrupados, do mais novo ao mais antigo.
  // Além do máximo (ou sem tempo), o agrupado fica com o rótulo "não consegui ouvir".
  const ordem = [...audios].reverse().sort((a, b) => Number(b.id === o.idPrincipal) - Number(a.id === o.idPrincipal))
  for (const m of ordem) {
    const pronto = prontos.get(m.id)
    if (pronto?.tipo === 'transcricao') { out.set(m.id, { ok: true, texto: pronto.texto, custoUsd: 0, nova: false }); continue }
    if (agora >= max) { out.set(m.id, { ok: false, erro: 'sem_tempo', custoUsd: 0 }); continue }
    agora++
    const r = await o.transcrever(m)
    if (!r) { out.set(m.id, { ok: false, erro: 'sem_tempo', custoUsd: 0 }); continue }
    if (!r.ok) { out.set(m.id, { ok: false, erro: r.erro, custoUsd: 0 }); continue }
    const custoUsd = r.custo ?? 0
    await gravarTranscricao(admin, tenantId, m, r)
    out.set(m.id, { ok: true, texto: r.texto, custoUsd, nova: true })
  }
  return out
}

/** Grava a transcrição como 'ok' sem sobrescrever uma 'ok' existente. Falha não derruba a resposta. */
export async function gravarTranscricao(
  admin: SupabaseClient, tenantId: string, m: MsgAudio, r: Extract<ResultadoTranscricao, { ok: true }>,
): Promise<boolean> {
  const agora = new Date().toISOString()
  const campos = {
    status: 'ok',
    texto: r.texto,
    idioma: r.idioma,
    duracao_s: r.duracaoS,
    modelo: r.modelo,
    custo_usd: r.custo,
    erro_code: null,
    processado_em: agora,
    reivindicado_em: null,
  }
  try {
    const ins = await admin.from('chat_midia_texto').upsert(
      { message_id: m.id, tenant_id: tenantId, tipo: 'transcricao', mensagem_em: m.criado_em ?? agora, ...campos },
      { onConflict: 'message_id', ignoreDuplicates: true },
    )
    if (ins.error) { console.error('wa-agente-responder: falha ao gravar transcrição', ins.error.code); return false }
    // Já existia (ex.: pendente na fila): completa, a menos que já esteja 'ok'.
    const up = await admin.from('chat_midia_texto').update(campos)
      .eq('tenant_id', tenantId).eq('message_id', m.id).neq('status', 'ok')
    if (up.error) { console.error('wa-agente-responder: falha ao gravar transcrição', up.error.code); return false }
    return true
  } catch {
    console.error('wa-agente-responder: falha ao gravar transcrição', 'erro')
    return false
  }
}

/** Pedidos de gatilho 'audio' já ouvidos hoje na empresa (execuções registradas). */
export async function audiosDeHoje(admin: SupabaseClient, tenantId: string, inicioDia: Date): Promise<number> {
  const { count, error } = await admin.from('wa_agente_execucoes').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('gatilho', 'audio').gte('created_at', inicioDia.toISOString())
  if (error) throw new Error('contagem_audio')
  return count ?? 0
}
