// Assistente da equipe no WhatsApp — quem RESPONDE (plano 1c/1d/1e).
//
// Chamada SÓ pelo servidor: pg_net logo que um pedido nasce (trigger
// wa_agente_pedido_acorda, corpo { pedido_id }) e a varredura de 1 em 1 minuto.
// Autenticação: cabeçalho x-cron-secret conferido pela RPC wa_auto_cron_secret_confere
// (mesmo padrão do wa-auto-relatorio-diario; verify_jwt = false no config.toml).
//
// Para cada pedido reivindicado (wa_agente_reivindicar — vários workers sem pegar o mesmo):
//   1. debounce: do mesmo chat + mesma pessoa, só o mais NOVO responde; os anteriores
//      viram 'agrupado' e o texto deles (últimos 2 min) entra na pergunta;
//   2. travas: assistente/app ligados, canal (privado/grupos) ligado, membro ativo,
//      grupo liberado e AINDA interno (motivoGrupoBloqueado — conferido de novo logo
//      antes da IA), humano respondeu nos últimos 30 min (silêncio, só no privado), limites (pessoa/hora, 150/dia pessoa, 300/dia
//      empresa) e teto diário em US$ (env WA_AGENTE_TETO_DIA_USD, padrão 15);
//   2b. ÁUDIO (mensagem de voz): a pergunta usa a transcrição pronta de
//      chat_midia_texto ou transcreve NA HORA (OpenRouter, mesmo pedido da fila
//      wa-midia-processar — _shared/wa-midia-transcrever.ts; até 5 min de áudio,
//      timeout que cabe no orçamento) e grava 'ok' lá (a fila não refaz). Mídia
//      ainda não no Storage / IA instável → o pedido volta à fila (+20 s) até a 3ª
//      tentativa; depois vira "(mandou um áudio que não consegui ouvir)" e a IA
//      pede para escrever. Gatilho 'audio' (áudio de membro no grupo sem menção/
//      citação): só segue se o nome do assistente aparecer na fala; senão o pedido
//      fica 'ignorado' ('audio_sem_chamado') sem responder nada e sem contar no
//      limite de respostas (o custo entra no log com resultado 'audio_ignorado').
//      Esse gatilho tem limite diário por empresa (env WA_MIDIA_LIMITE_DIA, o
//      mesmo da fila) e nunca manda aviso de limite. O custo da transcrição soma
//      no custo da execução (o teto diário enxerga);
//   3. "ajuda"/"menu"/"o que você faz" → texto fixo (sem IA);
//   4. escopo do SERVIDOR (carteira de quem pergunta; no grupo, interseção dos
//      participantes — ou carteira total se o grupo tem "Todos no grupo veem tudo");
//   5. cérebro (Claude via OpenRouter, ferramentas só de leitura) → saída validada;
//   6. antes do 1º envio grava motivo 'enviando' no pedido; se a função cair no meio,
//      a próxima reivindicação vê o marcador e marca 'incerto' (não reenvia);
//      envio pela UAZAPI no MESMO chat (citando a pergunta), humanizado:'ia'; no grupo,
//      pelo número principal e, se ele estiver desconectado/falhar, pelas reservas;
//   7. grava a resposta no Chat (enviado_por_ia, fonte_envio 'assistente') e o log
//      em wa_agente_execucoes — só números/códigos, NUNCA texto.
//
// Segurança: service_role com `.eq('tenant_id', …)` em TODA consulta (F2); destino é
// sempre o chat do pedido (nunca vem da IA); logs só com códigos.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { WaProviderError, disjuntorAberto, resolveUazapiDaInstancia, type WaProvider } from '../_shared/wa-provider.ts'
import { E164 } from '../_shared/wa-mensagem.ts'
import { destinoGrupo, motivoGrupoBloqueado } from '../_shared/wa-grupos-internos.ts'
import { carregarGruposInternos } from '../_shared/wa-grupos-internos-dados.ts'
import { jidParaNumero } from '../_shared/wa-telefone.ts'
import { chaveTelefone } from '../_shared/telefone.ts'
import { type EscopoAgente, carregarEscopo, escopoDoGrupo, participantesDoGrupoInfo } from '../_shared/wa-agente-escopo.ts'
import { type MensagemHistorico, type SaidaCerebro, TEXTO_BLOQUEADO, TEXTO_FALHA_IA, pensar } from '../_shared/wa-agente-cerebro.ts'
import { esforcoDaEnv, modeloDaEnv, ultimoErroIa } from '../_shared/wa-agente-llm.ts'
import { textosAjuda } from '../_shared/wa-agente-como-chamar.ts'
import { carregarAprendizados, linhasParaPrompt } from '../_shared/wa-agente-ferr-aprendizado.ts'
import { carregarPerfilRuntime } from '../_shared/wa-agente-perfil.ts'
import { limitesDoDia, FUSO_PADRAO } from '../_shared/wa-relatorio.ts'
import {
  LIMITE_DIA_PADRAO, MAX_MB_AUDIO_PADRAO, MODELO_AUDIO_PADRAO, inteiroDaEnv, modeloDaEnv as modeloMidiaDaEnv,
} from '../_shared/wa-midia.ts'
import { type ResultadoTranscricao, transcreverDoStorage } from '../_shared/wa-midia-transcrever.ts'
import { type TextoMidia, carregarTextosMidia } from '../_shared/wa-midia-texto.ts'
import {
  type Audicao, ESPERA_AUDIO_MS, JANELA_HUMANO_MIN, JANELA_JUNTAR_MIN, MAX_DURACAO_AUDIO_S, MOTIVO_ENVIANDO,
  MOTIVO_ENVIO_INTERROMPIDO, type MsgChat, PREFIXO_AUDIO, type Pedido, PRAZO_MINIMO_CEREBRO_MS, type ResultadoExecucao,
  TEXTO_LIMITE, agruparPedidos, contextoDoAudio, custoDasAudicoes, decidirAudio, devolverPorAudio, ehAudio,
  ehPedidoDeAjuda, envioFoiInterrompido, humanoAssumiu, instanciaDesconectada, juntarPerguntas, prazoDoCerebro,
  primeiroNome, separarAutorDoGrupo, tetoDaEnv, textoDoAudio, timeoutDaTranscricao, verificarTravas,
} from './regras.ts'
import { type MsgAudio, audiosDeHoje, ouvirAudios } from './audio.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MODELO = modeloDaEnv(Deno.env.get('WA_AGENTE_MODELO'))
const ESFORCO = esforcoDaEnv(Deno.env.get('WA_AGENTE_ESFORCO'))
const TETO_DIA_USD = tetoDaEnv(Deno.env.get('WA_AGENTE_TETO_DIA_USD'))
// Áudio: mesmas envs da fila wa-midia-processar (modelo, tamanho, limite/dia).
const MODELO_AUDIO = modeloMidiaDaEnv(Deno.env.get('OPENROUTER_MODELO_AUDIO'), MODELO_AUDIO_PADRAO)
const MAX_BYTES_AUDIO = inteiroDaEnv(Deno.env.get('WA_MIDIA_MAX_MB'), MAX_MB_AUDIO_PADRAO, 1, 20) * 1024 * 1024
const LIMITE_AUDIO_DIA = inteiroDaEnv(Deno.env.get('WA_MIDIA_LIMITE_DIA'), LIMITE_DIA_PADRAO, 0, 5_000)

/** O pedido nasce com processar_apos = +5 s; o pg_net acorda na hora. */
const ESPERA_DEBOUNCE_MS = 5_500
/**
 * Não começa pedido novo depois disto. O cérebro recebe só o tempo que sobra do
 * orçamento da função (prazoDoCerebro: 120 s − gasto − 25 s de reserva do envio).
 */
const LIMITE_INICIO_MS = 10_000
const LOTE = 3
const HORA = 3_600_000

// Áudio tem tratamento próprio (transcrição — textoDoAudio).
const ROTULO_MIDIA: Record<string, string> = {
  imagem: '(mandou uma imagem)', image: '(mandou uma imagem)',
  video: '(mandou um vídeo)', documento: '(mandou um documento)', document: '(mandou um documento)',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function espera(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

type Admin = SupabaseClient

async function atualizarPedido(admin: Admin, p: Pedido, campos: Record<string, unknown>) {
  await admin.from('wa_agente_pedidos').update({ lock_ate: null, ...campos }).eq('id', p.id).eq('tenant_id', p.tenant_id)
}

interface LogExecucao {
  resultado: ResultadoExecucao
  userId: string | null
  canal: 'privado' | 'grupo'
  gatilho: string
  cerebro?: SaidaCerebro | null
  mensagens?: number
  /** Custo da transcrição de áudio na hora (soma no custo da execução → teto diário). */
  custoExtraUsd?: number
}

/**
 * Marca o pedido como "enviando" ANTES do 1º sendText (continua 'processando', lock
 * renovado). Se a função morrer depois disso, a reivindicação seguinte NÃO reenvia.
 * Sem conseguir gravar o marcador, não envia (erro → nova tentativa, sem duplicar).
 */
async function marcarEnviando(admin: Admin, p: Pedido) {
  const { error } = await admin.from('wa_agente_pedidos')
    .update({ motivo: MOTIVO_ENVIANDO, lock_ate: new Date(Date.now() + 3 * 60_000).toISOString() })
    .eq('id', p.id).eq('tenant_id', p.tenant_id).eq('status', 'processando')
  if (error) throw new Error('marcar_envio')
}

type Grupo = { id: string; acesso_total: boolean; ativo: boolean }

/**
 * Confere o grupo AGORA: liberado (ativo) em wa_agente_grupos e ainda interno —
 * do número que recebeu e sem vínculo/nome de cliente (motivoGrupoBloqueado).
 */
async function conferirGrupo(
  admin: Admin, p: Pedido, jid: string,
): Promise<{ grupo: Grupo | null; liberado: boolean; interno: boolean }> {
  const { data, error } = await admin.from('wa_agente_grupos').select('id, acesso_total, ativo')
    .eq('tenant_id', p.tenant_id).eq('grupo_jid', jid).maybeSingle()
  if (error) throw new Error('grupo')
  const grupo = (data as Grupo | null) ?? null
  if (grupo?.ativo !== true || !p.instance_uuid) return { grupo, liberado: grupo?.ativo === true, interno: false }
  const { data: wi } = await admin.from('whatsapp_instances').select('instance_id')
    .eq('tenant_id', p.tenant_id).eq('id', p.instance_uuid).maybeSingle()
  const instanceIdTexto = (wi as { instance_id: string } | null)?.instance_id ?? null
  if (!instanceIdTexto) return { grupo, liberado: true, interno: false }
  const leitura = await carregarGruposInternos(admin, p.tenant_id, instanceIdTexto, [jid])
  const interno = motivoGrupoBloqueado(jid, new Set(leitura.grupos.map((g) => g.grupo_jid)), leitura.deCliente, leitura.nomeDeCliente) === null
  return { grupo, liberado: true, interno }
}

async function registrarExecucao(admin: Admin, p: Pedido, l: LogExecucao) {
  const c = l.cerebro
  const { error } = await admin.from('wa_agente_execucoes').insert({
    tenant_id: p.tenant_id,
    pedido_id: p.id,
    user_id: l.userId,
    canal: l.canal,
    gatilho: l.gatilho,
    modelo: c?.modelo ?? null,
    passos: c?.passos ?? 0,
    ferramentas: (c?.ferramentas ?? []).slice(0, 20),
    tokens_entrada: c?.uso.entrada ?? 0,
    tokens_saida: c?.uso.saida ?? 0,
    tokens_cache: c?.uso.cache ?? 0,
    custo_usd: Math.round(((c?.uso.custoUsd ?? 0) + (l.custoExtraUsd ?? 0)) * 10_000) / 10_000,
    duracao_ms: c?.duracaoMs ?? 0,
    resultado: l.resultado,
    mensagens: l.mensagens ?? 0,
  })
  if (error) console.error('wa-agente-responder: falha ao gravar execução', error.code)
}

/** Filtro "mesma pessoa" do pedido. */
function mesmaPessoa<Q extends { eq: (c: string, v: unknown) => Q; is: (c: string, v: null) => Q }>(q: Q, p: Pedido): Q {
  if (p.membro_id) return q.eq('membro_id', p.membro_id)
  if (p.user_id) return q.eq('user_id', p.user_id)
  if (p.remetente_chave) return q.eq('remetente_chave', p.remetente_chave)
  return q.is('membro_id', null)
}

async function contarPedidos(admin: Admin, p: Pedido, desde: Date, daPessoa: boolean): Promise<number> {
  let q = admin.from('wa_agente_pedidos').select('id', { count: 'exact', head: true })
    .eq('tenant_id', p.tenant_id).eq('status', 'respondido').gte('created_at', desde.toISOString())
  if (daPessoa) q = mesmaPessoa(q, p)
  const { count, error } = await q
  if (error) throw new Error('contagem')
  return count ?? 0
}

async function custoDeHoje(admin: Admin, tenantId: string, inicioDia: Date): Promise<number> {
  const { data, error } = await admin.from('wa_agente_execucoes').select('custo_usd')
    .eq('tenant_id', tenantId).gte('created_at', inicioDia.toISOString()).limit(5000)
  if (error) throw new Error('custo')
  return ((data ?? []) as { custo_usd: number | string | null }[]).reduce((s, r) => s + (Number(r.custo_usd) || 0), 0)
}

interface Pergunta {
  texto: string
  autor: string | null
  ids: string[]
  /** Áudios da pergunta (transcritos ou não). */
  audicoes: Audicao[]
  /** Áudio da mensagem do PRÓPRIO pedido (null se ela não é áudio). */
  audioProprio: Audicao | null
}

/**
 * Textos das mensagens deste pedido + agrupados da mesma pessoa nos últimos 2 min.
 * Áudio: transcrição pronta ou feita agora (ouvirAudios) → "(áudio transcrito) …".
 */
async function lerPergunta(
  admin: Admin, p: Pedido, agora: Date, transcrever: (m: MsgAudio) => Promise<ResultadoTranscricao | null>,
): Promise<Pergunta> {
  let q = admin.from('wa_agente_pedidos').select('chat_message_id')
    .eq('tenant_id', p.tenant_id).eq('chat_jid', p.chat_jid).eq('status', 'agrupado')
    .gte('created_at', new Date(agora.getTime() - JANELA_JUNTAR_MIN * 60_000).toISOString())
  q = mesmaPessoa(q, p)
  const { data: ag } = await q.limit(10)
  const ids = [...new Set([...((ag ?? []) as { chat_message_id: string | null }[]).map((a) => a.chat_message_id), p.chat_message_id]
    .filter((x): x is string => typeof x === 'string'))]
  if (ids.length === 0) return { texto: '', autor: null, ids, audicoes: [], audioProprio: null }
  const { data: msgs, error } = await admin.from('chat_messages').select('id, conteudo, tipo, criado_em, media_url, conversation_id')
    .eq('tenant_id', p.tenant_id).in('id', ids).order('criado_em', { ascending: true })
  if (error) throw new Error('mensagens')
  const lidas = (msgs ?? []) as (MsgAudio & { conteudo: string | null })[]
  const audicoes = await ouvirAudios(admin, p.tenant_id, lidas, { transcrever, idPrincipal: p.chat_message_id })
  let autor: string | null = null
  const textos = lidas.map((m) => {
    const tipo = String(m.tipo ?? 'texto').toLowerCase()
    if (ehAudio(tipo)) return textoDoAudio(audicoes.get(m.id))
    if (tipo !== 'texto') return ROTULO_MIDIA[tipo] ?? '(mandou um arquivo)'
    if (!p.eh_grupo) return m.conteudo
    const s = separarAutorDoGrupo(m.conteudo)
    autor ??= s.autor
    return s.texto
  })
  return {
    texto: juntarPerguntas(textos), autor, ids, audicoes: [...audicoes.values()],
    audioProprio: p.chat_message_id ? audicoes.get(p.chat_message_id) ?? null : null,
  }
}

/**
 * Histórico curto: privado = últimas 8 msgs (6 h); grupo = perguntas desta pessoa e as respostas ligadas.
 * Áudio entra só se já tiver transcrição pronta (não transcreve aqui).
 */
async function lerHistorico(admin: Admin, p: Pedido, agora: Date, excluir: string[]): Promise<MensagemHistorico[]> {
  if (!p.conversation_id) return []
  const desde = new Date(agora.getTime() - 6 * HORA).toISOString()
  type Linha = { id: string; conteudo: string | null; tipo: string | null; criado_em: string; enviado_por_agente: boolean | null; enviado_por_ia: boolean | null; fonte_envio: string | null; message_id_wpp: string | null }
  const colunas = 'id, conteudo, tipo, criado_em, enviado_por_agente, enviado_por_ia, fonte_envio, message_id_wpp'
  let linhas: Linha[] = []
  if (!p.eh_grupo) {
    const { data } = await admin.from('chat_messages').select(colunas)
      .eq('tenant_id', p.tenant_id).eq('conversation_id', p.conversation_id).gte('criado_em', desde)
      .order('criado_em', { ascending: false }).limit(14)
    linhas = ((data ?? []) as Linha[]).filter((m) => !excluir.includes(m.id)).reverse()
  } else {
    let q = admin.from('wa_agente_pedidos').select('chat_message_id, resposta_message_ids')
      .eq('tenant_id', p.tenant_id).eq('chat_jid', p.chat_jid).eq('status', 'respondido').gte('created_at', desde)
    q = mesmaPessoa(q, p)
    const { data: ps } = await q.order('created_at', { ascending: false }).limit(3)
    const perguntas = ((ps ?? []) as { chat_message_id: string | null }[]).map((x) => x.chat_message_id).filter((x): x is string => !!x)
    const respostas = ((ps ?? []) as { resposta_message_ids: string[] | null }[]).flatMap((x) => x.resposta_message_ids ?? []).slice(0, 9)
    if (perguntas.length > 0) {
      const { data } = await admin.from('chat_messages').select(colunas).eq('tenant_id', p.tenant_id).in('id', perguntas)
      linhas.push(...((data ?? []) as Linha[]))
    }
    if (respostas.length > 0) {
      const { data } = await admin.from('chat_messages').select(colunas)
        .eq('tenant_id', p.tenant_id).eq('conversation_id', p.conversation_id).in('message_id_wpp', respostas)
      linhas.push(...((data ?? []) as Linha[]))
    }
    linhas.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
  }
  let transcricoes = new Map<string, TextoMidia>()
  const idsAudio = linhas.filter((m) => ehAudio(m.tipo)).map((m) => m.id)
  if (idsAudio.length > 0) {
    try { transcricoes = await carregarTextosMidia(admin, p.tenant_id, idsAudio) } catch { /* segue sem */ }
  }
  const out: MensagemHistorico[] = []
  for (const m of linhas) {
    const tipo = String(m.tipo ?? 'texto')
    const tr = ehAudio(tipo) ? transcricoes.get(m.id) : undefined
    const conteudo = tipo === 'texto' ? m.conteudo : tr?.tipo === 'transcricao' ? `${PREFIXO_AUDIO} ${tr.texto}` : null
    if (!conteudo) continue
    if (m.fonte_envio === 'assistente') out.push({ de: 'assistente', texto: conteudo })
    else if (m.enviado_por_agente !== true && m.enviado_por_ia !== true) {
      const s = p.eh_grupo && tipo === 'texto' ? separarAutorDoGrupo(conteudo) : { texto: conteudo, autor: null }
      out.push({ de: 'equipe', texto: s.texto, autor: primeiroNome(s.autor) })
    }
  }
  return out.slice(-8)
}

/**
 * Contexto para quem responde ao AVISO DIÁRIO ("detalhe mais sobre a Jane", citando o
 * relatório): se o aviso saiu hoje para este chat, a IA é avisada para consultar os
 * pontos de atenção. O pedido não guarda o id citado; usamos o gatilho 'quote' e o
 * envio de hoje (wa_auto_envios, sem texto).
 */
async function contextoDoAviso(admin: Admin, p: Pedido, destino: string, inicioDia: Date): Promise<string[]> {
  const { data } = await admin.from('wa_auto_envios').select('id')
    .eq('tenant_id', p.tenant_id).eq('tipo', 'relatorio_diario').eq('status', 'enviado').eq('destino', destino)
    .gte('created_at', inicioDia.toISOString()).limit(1)
  const out: string[] = []
  if (p.gatilho === 'quote') out.push('A pessoa está respondendo (citando) uma mensagem enviada por este número — sua resposta anterior ou o aviso diário.')
  if ((data ?? []).length > 0) {
    out.push('Hoje este chat recebeu o aviso diário com os pontos de atenção. Se a pergunta se referir a ele ("detalhe mais", "esse cliente", um nome da lista), use listar_alertas e buscar_cliente para responder.')
  }
  return out
}

interface Envio { enviados: string[]; incerto: boolean; ok: boolean }

/**
 * Envia as partes pelo primeiro número que conseguir (ordem dada). Erro com
 * possibilidade de já ter saído (incerto) → para (não duplica pelo reserva).
 */
async function enviar(
  admin: Admin, p: Pedido, numeros: string[], destino: string, partes: string[], humanizado: 'ia' | 'fallback',
): Promise<Envio & { instancia: string | null }> {
  const pularPrincipal = numeros.length > 1 && await disjuntorAberto(admin, p.tenant_id, 'uazapi')
  for (let i = 0; i < numeros.length; i++) {
    if (i === 0 && pularPrincipal) continue
    let provider: WaProvider
    try {
      const r = await resolveUazapiDaInstancia(admin, p.tenant_id, numeros[i])
      if (instanciaDesconectada(r.status)) continue
      provider = r.provider
    } catch {
      continue
    }
    const enviados: string[] = []
    try {
      for (let k = 0; k < partes.length; k++) {
        const r = await provider.sendText(destino, partes[k], {
          humanizado, ...(k === 0 && p.message_id_wpp ? { responderA: p.message_id_wpp } : {}),
        })
        enviados.push(r.messageId ?? '')
      }
      return { enviados, incerto: false, ok: true, instancia: numeros[i] }
    } catch (e) {
      const incerto = e instanceof WaProviderError ? e.incerto : true
      if (incerto || enviados.length > 0) return { enviados, incerto: true, ok: false, instancia: numeros[i] }
      console.log('wa-agente-responder: número falhou, tentando o próximo', e instanceof WaProviderError ? e.codigo : 'erro')
    }
  }
  return { enviados: [], incerto: false, ok: false, instancia: null }
}

/** Grava as partes enviadas no Chat (para a equipe ver no OMNX Desk). */
async function gravarNoChat(admin: Admin, p: Pedido, partes: string[], ids: string[]) {
  if (!p.conversation_id) return
  const linhas = ids.map((id, i) => ({
    tenant_id: p.tenant_id,
    conversation_id: p.conversation_id,
    message_id_wpp: id || null,
    tipo: 'texto',
    conteudo: partes[i],
    enviado_por_agente: false,
    enviado_por_ia: true,
    fonte_envio: 'assistente',
    status_envio: 'enviada',
    lida: true,
  }))
  if (linhas.length === 0) return
  const { error } = await admin.from('chat_messages').insert(linhas)
  if (!error) return
  if (error.code !== '23505') { console.error('wa-agente-responder: falha ao gravar no Chat', error.code); return }
  // message_id_wpp é único no banco: o webhook de OUTRA instância (no mesmo grupo)
  // pode ter gravado a nossa resposta antes. Grava uma a uma; a que já existe é a
  // MESMA mensagem do WhatsApp (id devolvido pelo provedor ao enviar) → só corrige a
  // autoria para 'ia' (mesma empresa; não mexe em conversa, texto nem horário).
  for (const l of linhas) {
    const r = await admin.from('chat_messages').insert(l)
    if (!r.error) continue
    if (r.error.code !== '23505' || !l.message_id_wpp) { console.error('wa-agente-responder: falha ao gravar no Chat', r.error.code); continue }
    const u = await admin.from('chat_messages')
      .update({ autor_tipo: 'ia', autor_origem: 'plataforma', autor_user_id: null, enviado_por_ia: true, enviado_por_agente: false })
      .eq('tenant_id', p.tenant_id).eq('message_id_wpp', l.message_id_wpp)
    if (u.error) console.error('wa-agente-responder: falha ao marcar autoria da resposta', u.error.code)
  }
}

async function processarPedido(admin: Admin, p: Pedido, inicioFuncao: number): Promise<string> {
  const agora = new Date()
  const canal: 'privado' | 'grupo' = p.eh_grupo ? 'grupo' : 'privado'

  // ---- 1. Debounce: existe pedido mais novo da mesma pessoa neste chat? ----
  let qNovo = admin.from('wa_agente_pedidos').select('id')
    .eq('tenant_id', p.tenant_id).eq('chat_jid', p.chat_jid).in('status', ['aguardando', 'processando'])
    .gt('created_at', p.created_at).neq('id', p.id)
    // Pedido de áudio (gatilho 'audio') talvez nem seja para o assistente: não engole este.
    .neq('gatilho', 'audio')
  qNovo = mesmaPessoa(qNovo, p)
  const { data: novo } = await qNovo.limit(1)
  if ((novo ?? []).length > 0) { await atualizarPedido(admin, p, { status: 'agrupado', motivo: 'mensagem_mais_nova' }); return 'agrupado' }

  // ---- 2. Configuração, app, membro, grupo ----
  const { data: cfgBruta, error: eCfg } = await admin.from('wa_auto_config').select('*').eq('tenant_id', p.tenant_id).maybeSingle()
  if (eCfg) throw new Error('config')
  const cfg = (cfgBruta ?? {}) as Record<string, unknown>
  const { data: app } = await admin.from('app_modules').select('enabled').eq('tenant_id', p.tenant_id).eq('slug', 'automacoes-wa').maybeSingle()
  const nomeAgente = typeof cfg.agente_nome === 'string' && cfg.agente_nome.trim() ? cfg.agente_nome.trim() : 'Ana'

  type Membro = { id: string; user_id: string; telefone: string; ativo: boolean }
  type Usuario = { nome: string | null; ativo: boolean | null }
  let membro: Membro | null = null
  if (p.membro_id) {
    const { data } = await admin.from('wa_agente_membros').select('id, user_id, telefone, ativo')
      .eq('tenant_id', p.tenant_id).eq('id', p.membro_id).maybeSingle()
    membro = (data as Membro | null) ?? null
  }
  let usuario: Usuario | null = null
  if (membro?.user_id) {
    const { data } = await admin.from('users').select('nome, ativo').eq('tenant_id', p.tenant_id).eq('id', membro.user_id).maybeSingle()
    usuario = (data as Usuario | null) ?? null
  }
  const membroAtivo = membro?.ativo === true && usuario?.ativo !== false && !!usuario

  let grupo: Grupo | null = null
  let grupoLiberado = false
  let grupoInterno = false
  const jid = p.eh_grupo ? destinoGrupo(p.chat_jid) : null
  if (p.eh_grupo && jid) {
    const c = await conferirGrupo(admin, p, jid)
    grupo = c.grupo
    grupoLiberado = c.liberado
    grupoInterno = c.interno
  }

  // ---- 3. Humano assumiu (só no privado), limites e custo ----
  let msgsRecentes: MsgChat[] = []
  if (p.conversation_id && !p.eh_grupo) {
    const { data } = await admin.from('chat_messages').select('enviado_por_agente, enviado_por_ia, fonte_envio, criado_em')
      .eq('tenant_id', p.tenant_id).eq('conversation_id', p.conversation_id)
      .gte('criado_em', new Date(agora.getTime() - JANELA_HUMANO_MIN * 60_000).toISOString()).limit(200)
    msgsRecentes = (data ?? []) as MsgChat[]
  }
  const inicioDia = limitesDoDia(agora, FUSO_PADRAO).inicio
  const [usoHora, usoDia, usoEmpresa, custo] = await Promise.all([
    contarPedidos(admin, p, new Date(agora.getTime() - HORA), true),
    contarPedidos(admin, p, inicioDia, true),
    contarPedidos(admin, p, inicioDia, false),
    custoDeHoje(admin, p.tenant_id, inicioDia),
  ])
  const trava = verificarTravas({
    agenteAtivo: cfg.agente_ativo === true,
    appLigado: (app as { enabled?: boolean } | null)?.enabled === true,
    canalLigado: p.eh_grupo ? cfg.agente_grupos === true : cfg.agente_privado !== false,
    membroAtivo,
    ehGrupo: p.eh_grupo,
    grupoLiberado,
    grupoInterno,
    grupoAcessoTotal: grupo?.acesso_total === true,
    humanoAssumiu: humanoAssumiu(msgsRecentes, agora),
    usoPessoaHora: usoHora,
    usoPessoaDia: usoDia,
    usoEmpresaDia: usoEmpresa,
    limiteHora: Number(cfg.agente_limite_hora) || 0,
    custoHojeUsd: custo,
    tetoDiaUsd: TETO_DIA_USD,
  })
  const userId = membroAtivo ? membro!.user_id : null

  // Destino = o MESMO chat do pedido (privado: telefone conferido com o do membro).
  let destino: string | null = null
  if (p.eh_grupo) destino = jid
  else if (membro) {
    const doChat = jidParaNumero(p.chat_jid) ?? p.chat_jid.replace(/\D/g, '')
    const tel = membro.telefone
    destino = E164.test(tel) && (!doChat || chaveTelefone(doChat) === chaveTelefone(tel)) ? tel : null
  }

  if (trava) {
    // Áudio que talvez nem seja para o assistente: nunca avisa limite nem registra.
    if (p.gatilho === 'audio') { await atualizarPedido(admin, p, { status: 'ignorado', motivo: trava.motivo }); return trava.motivo }
    if (trava.resultado === 'ignorar') { await atualizarPedido(admin, p, { status: 'ignorado', motivo: trava.motivo }); return trava.motivo }
    if (trava.resultado === 'limite' && destino && p.instance_uuid) {
      // Avisa no máximo uma vez por hora.
      let qAviso = admin.from('wa_agente_pedidos').select('id').eq('tenant_id', p.tenant_id).eq('chat_jid', p.chat_jid)
        .like('motivo', 'limite%').gte('created_at', new Date(agora.getTime() - HORA).toISOString())
      qAviso = mesmaPessoa(qAviso, p)
      const { data: ja } = await qAviso.limit(1)
      if ((ja ?? []).length === 0) {
        await marcarEnviando(admin, p)
        const e = await enviar(admin, p, [p.instance_uuid], destino, [TEXTO_LIMITE], 'fallback')
        if (e.ok) await gravarNoChat(admin, p, [TEXTO_LIMITE], e.enviados)
      }
    }
    await atualizarPedido(admin, p, { status: 'ignorado', motivo: trava.motivo })
    await registrarExecucao(admin, p, { resultado: trava.resultado, userId, canal, gatilho: p.gatilho })
    return trava.motivo
  }
  if (!destino || !p.instance_uuid) { await atualizarPedido(admin, p, { status: 'ignorado', motivo: 'destino_invalido' }); return 'destino_invalido' }
  // Áudio sem menção/citação: limite diário por empresa (cada um custa uma transcrição).
  if (p.gatilho === 'audio' && await audiosDeHoje(admin, p.tenant_id, inicioDia) >= LIMITE_AUDIO_DIA) {
    await atualizarPedido(admin, p, { status: 'ignorado', motivo: 'audio_limite_dia' })
    return 'audio_limite_dia'
  }

  // ---- 4. Pergunta (áudio: transcrição pronta ou feita agora) ----
  const transcrever = async (m: MsgAudio): Promise<ResultadoTranscricao | null> => {
    const timeoutMs = timeoutDaTranscricao(inicioFuncao, Date.now())
    if (timeoutMs === null) return null
    const chave = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
    if (!chave) return { ok: false, erro: 'ia_chave_invalida' }
    try {
      return await transcreverDoStorage(admin, {
        chave, modelo: MODELO_AUDIO, supabaseUrl: SUPABASE_URL, mediaUrl: m.media_url, conversationId: m.conversation_id,
        maxBytes: MAX_BYTES_AUDIO, maxDuracaoS: MAX_DURACAO_AUDIO_S, timeoutMs,
        origem: 'wa-agente-responder', titulo: 'OMNX Desk Assistente Audio',
      })
    } catch (e) {
      console.error('wa-agente-responder: falha ao transcrever', (e as Error)?.name)
      return { ok: false, erro: 'download_falhou' }
    }
  }
  const pergunta = await lerPergunta(admin, p, agora, transcrever)
  const custoAudio = custoDasAudicoes(pergunta.audicoes)
  const proprio = pergunta.audioProprio
  if (proprio && !proprio.ok) {
    // Mídia ainda subindo / IA instável / sem tempo → volta à fila (limitado).
    const volta = devolverPorAudio(proprio.erro, p.tentativas)
    if (volta) {
      await atualizarPedido(admin, p, {
        status: 'aguardando', motivo: 'aguardando_audio',
        processar_apos: new Date(Date.now() + (volta === 'ja' ? 0 : ESPERA_AUDIO_MS)).toISOString(),
      })
      return volta === 'ja' ? 'devolvido' : 'audio_aguardando'
    }
  }
  // Gatilho 'audio': só segue se a fala chamar o assistente pelo nome.
  const decisao = decidirAudio(p.gatilho, proprio, nomeAgente)
  if (!decisao.seguir) {
    await atualizarPedido(admin, p, { status: 'ignorado', motivo: decisao.motivo })
    await registrarExecucao(admin, p, { resultado: 'audio_ignorado', userId, canal, gatilho: p.gatilho, custoExtraUsd: custoAudio })
    return decisao.motivo
  }
  if (!pergunta.texto.trim()) { await atualizarPedido(admin, p, { status: 'ignorado', motivo: 'sem_texto' }); return 'sem_texto' }
  const quemPergunta = primeiroNome(usuario?.nome ?? pergunta.autor)

  // ---- 5. Números (grupo: principal + reservas; privado: o que recebeu) ----
  let numeros = [p.instance_uuid]
  if (p.eh_grupo && grupo) {
    const { data: ns } = await admin.from('wa_agente_grupo_numeros').select('instance_uuid, ordem')
      .eq('tenant_id', p.tenant_id).eq('grupo_id', grupo.id).order('ordem', { ascending: true })
    const lista = ((ns ?? []) as { instance_uuid: string }[]).map((n) => n.instance_uuid)
    if (lista.length > 0) numeros = lista
  }

  // ---- 6. Escopo do servidor ----
  let escopo: EscopoAgente
  if (p.eh_grupo && jid) {
    let leitor: WaProvider | null = null
    try { leitor = (await resolveUazapiDaInstancia(admin, p.tenant_id, p.instance_uuid)).provider } catch { leitor = null }
    escopo = await escopoDoGrupo(admin, p.tenant_id, userId, jid, {
      acessoTotal: grupo?.acesso_total === true,
      lerParticipantes: leitor?.infoGrupo ? async () => participantesDoGrupoInfo(await leitor!.infoGrupo!(jid)) : undefined,
    })
  } else {
    escopo = await carregarEscopo(admin, p.tenant_id, userId as string)
  }

  // ---- 7a. Reconfere o grupo logo antes de responder (pode ter mudado no meio) ----
  if (p.eh_grupo && jid) {
    const c = await conferirGrupo(admin, p, jid)
    if (!c.liberado || !c.interno) {
      await atualizarPedido(admin, p, { status: 'ignorado', motivo: 'grupo_nao_interno' })
      return 'grupo_nao_interno'
    }
  }

  // ---- 7. Resposta: ajuda fixa ou cérebro ----
  let partes: string[]
  let humanizado: 'ia' | 'fallback' = 'fallback'
  let resultado: ResultadoExecucao
  let diagnostico: string | null = null
  let cerebro: SaidaCerebro | null = null
  const dadosChamar = { nome: nomeAgente, nomeContato: typeof cfg.agente_nome_contato === 'string' ? cfg.agente_nome_contato : null, telefoneNumero: null }
  if (ehPedidoDeAjuda(pergunta.texto, nomeAgente)) {
    const opcoes = textosAjuda(canal, dadosChamar)
    partes = [opcoes[Math.floor(Math.random() * opcoes.length) % opcoes.length]]
    resultado = escopo.modo === 'normal' ? 'respondido' : 'restrito'
  } else {
    const historico = await lerHistorico(admin, p, agora, pergunta.ids)
    const contexto = [...await contextoDoAviso(admin, p, destino, inicioDia), ...contextoDoAudio(pergunta.audicoes)]
    // Perfil e aprendizados vêm do mesmo tenant e só fora do modo restrito.
    const [aprendizados, perfil] = await Promise.all([
      escopo.modo === 'normal' ? carregarAprendizados(admin, p.tenant_id, p.eh_grupo ? destino : undefined).then(linhasParaPrompt) : Promise.resolve([]),
      carregarPerfilRuntime(admin, p.tenant_id, escopo.modo),
    ])
    // Só o tempo que realmente sobra (reservando o envio); pouco tempo → volta à fila.
    const prazoMs = prazoDoCerebro(inicioFuncao, Date.now())
    if (prazoMs < PRAZO_MINIMO_CEREBRO_MS) {
      await atualizarPedido(admin, p, { status: 'aguardando', processar_apos: new Date().toISOString() })
      return 'devolvido'
    }
    cerebro = await pensar({
      admin, escopo, nomeAgente, canal, quemPergunta, pergunta: pergunta.texto, historico, agora, contexto,
      aprendizados, perfil, remetenteNome: usuario?.nome ?? pergunta.autor, pedidoId: p.id,
      apiKey: Deno.env.get('OPENROUTER_API_KEY'), modelo: MODELO, esforco: ESFORCO, prazoMs,
    })
    if (cerebro.ok) {
      partes = cerebro.partes
      humanizado = 'ia'
      resultado = escopo.modo === 'normal' ? 'respondido' : 'restrito'
    } else if (cerebro.falha === 'bloqueado') {
      partes = [TEXTO_BLOQUEADO]
      resultado = 'recusado'
    } else {
      partes = [TEXTO_FALHA_IA]
      resultado = 'erro_ia'
      diagnostico = `erro_ia ${ultimoErroIa ?? cerebro.falha ?? ''}`.slice(0, 300)
    }
  }

  // ---- 8. Envio no mesmo chat ----
  await marcarEnviando(admin, p)
  const e = await enviar(admin, p, numeros, destino, partes, humanizado)
  if (e.enviados.length > 0) await gravarNoChat(admin, p, partes.slice(0, e.enviados.length), e.enviados)
  const ids = e.enviados.filter(Boolean)
  if (e.ok) await atualizarPedido(admin, p, { status: 'respondido', motivo: resultado === 'respondido' ? null : (diagnostico ?? resultado), resposta_message_ids: ids })
  else await atualizarPedido(admin, p, { status: e.incerto ? 'incerto' : 'falhou', motivo: e.incerto ? 'envio_incerto' : 'envio_falhou', resposta_message_ids: ids })
  await registrarExecucao(admin, p, { resultado, userId, canal, gatilho: p.gatilho, cerebro, mensagens: e.enviados.length, custoExtraUsd: custoAudio })
  return e.ok ? resultado : 'envio_falhou'
}

servirComLicenca(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const segredo = req.headers.get('x-cron-secret') ?? ''
  if (segredo.length < 32 || segredo.length > 256) return json({ ok: false, error: 'unauthorized' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: confere, error: errSeg } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  if (errSeg || confere !== true) return json({ ok: false, error: 'unauthorized' }, 401)

  const inicioFuncao = Date.now()
  const corpo = await req.json().catch(() => null) as { pedido_id?: unknown } | null
  // Acordado por um pedido novo: espera o debounce (processar_apos = +5 s).
  if (corpo && typeof corpo.pedido_id === 'string') await espera(ESPERA_DEBOUNCE_MS)

  const inicio = Date.now()
  const placar: Record<string, number> = {}
  const conta = (k: string) => { placar[k] = (placar[k] ?? 0) + 1 }

  for (let rodada = 0; rodada < 5 && Date.now() - inicio < LIMITE_INICIO_MS; rodada++) {
    const { data, error } = await admin.rpc('wa_agente_reivindicar', { p_limite: LOTE })
    if (error) { console.error('wa-agente-responder: falha ao reivindicar', error.code); break }
    const reivindicados = (data ?? []) as Pedido[]
    if (reivindicados.length === 0) break
    // Já tinha começado a enviar quando a função caiu: NÃO reenvia (evita duplicar).
    const pedidos: Pedido[] = []
    for (const p of reivindicados) {
      if (!envioFoiInterrompido(p)) { pedidos.push(p); continue }
      await atualizarPedido(admin, p, { status: 'incerto', motivo: MOTIVO_ENVIO_INTERROMPIDO })
      conta(MOTIVO_ENVIO_INTERROMPIDO)
    }
    const { processar, agrupar } = agruparPedidos(pedidos)
    for (const p of agrupar) { await atualizarPedido(admin, p, { status: 'agrupado', motivo: 'debounce' }); conta('agrupado') }
    for (const p of processar) {
      if (Date.now() - inicio > LIMITE_INICIO_MS) {
        // Sem tempo: devolve à fila (outra execução pega).
        await atualizarPedido(admin, p, { status: 'aguardando', processar_apos: new Date().toISOString() })
        conta('devolvido')
        continue
      }
      try {
        conta(await processarPedido(admin, p, inicioFuncao))
      } catch (e) {
        console.error('wa-agente-responder: erro no pedido', (e as Error)?.message?.slice(0, 40))
        // Fica 'processando' com lock: a próxima varredura tenta de novo (até 3 vezes).
        conta('erro')
      }
    }
  }
  return json({ ok: true, resultados: placar })
})
