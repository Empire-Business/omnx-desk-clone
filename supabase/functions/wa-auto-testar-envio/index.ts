import { sessaoDeskLiberada } from '../_shared/desk-session.ts'
// "Enviar mensagem de teste" do app Automações WhatsApp (etapa 9.2).
//
// Admin autenticado informa UM telefone (E.164); o servidor resolve o tenant DELE
// (nunca do body), monta o provedor ativo (UAZAPI ou Zernio) com o segredo do
// Vault e envia uma única mensagem. Registra em wa_auto_envios (tipo 'teste').
//
// Proteções:
//   * JWT do usuário validado aqui (client anon + auth.getUser) e verify_jwt padrão
//     (true) no gateway — esta função NÃO entra no config.toml com verify_jwt=false.
//   * Só users.perfil = 'admin' e app 'automacoes-wa' ligado no tenant.
//   * Idempotência por minuto (mesmo número, mesmo minuto = 1 envio) via
//     UNIQUE (tenant_id, chave_idempotencia) — a linha é reservada ANTES do envio.
//   * Rate limit: máx. 5 testes por hora por tenant. Disjuntor após 5 falhas seguidas.
//   * Resposta e log nunca contêm token/chave.
//   * UAZAPI (não oficial): o texto do teste é reescrito pela IA a cada envio
//     (_shared/wa-humanizar.ts), com fallback variado — nunca o mesmo texto colado.
//     O histórico guarda só humanizado: 'ia' | 'fallback'. Zernio: nada muda (modelo).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveWaProvider, disjuntorAberto, WaProviderError, type ResultadoEnvio } from '../_shared/wa-provider.ts'
import { E164, chaveIdempotencia, janelaMinuto } from '../_shared/wa-mensagem.ts'
import { variaveisDeTeste } from '../_shared/wa-modelos-oficiais.ts'
import { criarChamadaOpenRouter, humanizarTexto, periodoDoDia, type OrigemHumanizacao } from '../_shared/wa-humanizar.ts'
import { pedidoTeste } from '../_shared/wa-humanizar-pedidos.ts'
import { travaDeLicenca } from '../_shared/htai-licenca.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LIMITE_TESTES_HORA = 5
const MAX_VARIAVEIS = 10
const MAX_TAM_VARIAVEL = 60
/** Tempo máximo esperando a IA (a pessoa está com a tela aberta); depois, fallback. */
const PRAZO_IA_MS = 10_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Autoriza (só admin) e devolve o usuário e o tenant DELE. */
async function autorizarAdmin(authHeader: string | null): Promise<{ userId: string; tenantId: string } | null> {
  if (!authHeader) return null
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || !await sessaoDeskLiberada(userClient)) return null
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data } = await admin.from('users').select('perfil').eq('id', user.id).single()
  if (data?.perfil !== 'admin') return null
  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  if (!tenantId) return null
  return { userId: user.id, tenantId: tenantId as string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  // Licença HTAI (desligada sem HTAI_ENTITLEMENTS_MODE; ver docs/LICENCA-HTAI.md)
  const licencaNegada = await travaDeLicenca(corsHeaders)
  if (licencaNegada) return licencaNegada
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = await autorizarAdmin(req.headers.get('Authorization'))
  if (!auth) return json({ ok: false, error: 'forbidden' }, 403)
  const { tenantId, userId } = auth

  // ---- Entrada: só o telefone (e, na oficial, valores opcionais do modelo) ----
  let telefone = ''
  let variaveis: string[] = []
  try {
    const bruto = await req.text()
    if (bruto.length > 4096) return json({ ok: false, error: 'Pedido grande demais.' }, 413)
    const body = bruto ? JSON.parse(bruto) : {}
    telefone = typeof body?.telefone === 'string' ? body.telefone.trim() : ''
    if (Array.isArray(body?.variaveis)) {
      variaveis = body.variaveis
        .slice(0, MAX_VARIAVEIS)
        .map((v: unknown) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_TAM_VARIAVEL))
    }
  } catch {
    return json({ ok: false, error: 'Pedido inválido.' }, 400)
  }
  if (!E164.test(telefone)) {
    return json({ ok: false, error: 'Telefone inválido. Use o formato +5511999998888.' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ---- App ligado neste tenant ----
  // Só segue com o app explicitamente ligado: erro na consulta ou linha ausente = recusa.
  const { data: app, error: errApp } = await admin
    .from('app_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('slug', 'automacoes-wa')
    .maybeSingle()
  if (errApp || app?.enabled !== true) {
    return json({ ok: false, error: 'O app Automações WhatsApp está desligado nesta empresa.' }, 403)
  }

  // ---- Provedor + segredo do Vault ----
  let resolvido
  try {
    resolvido = await resolveWaProvider(admin, tenantId)
  } catch (e) {
    const msg = e instanceof WaProviderError ? e.message : 'Não foi possível preparar o envio.'
    return json({ ok: false, status: 'nao_enviado', error: msg })
  }
  const { provider, config } = resolvido

  // Oficial: fora da janela de 24h só sai com modelo aprovado.
  if (provider.nome === 'zernio' && config.template_relatorio !== 'omnx_aviso_diario_v2') {
    return json({
      ok: false,
      status: 'nao_enviado',
      provider: 'zernio',
      error: 'Selecione o modelo omnx_aviso_diario_v2 aprovado pela Meta, com três variáveis e sem agenda.',
    })
  }
  // Oficial sem valores no pedido: preenche o modelo do aviso diário com valores
  // de teste (sem dado real). Pedido com valores segue como antes.
  if (provider.nome === 'zernio' && !variaveis.some((v) => v.length > 0)) {
    variaveis = variaveisDeTeste(new Date())
  }
  if (provider.nome === 'zernio' && variaveis.length !== 3) {
    return json({ ok: false, status: 'nao_enviado', provider: 'zernio', error: 'O modelo do aviso diário usa exatamente três variáveis.' })
  }

  // ---- Rate limit (5 testes / hora / tenant) ----
  const umaHoraAtras = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count, error: errCount } = await admin
    .from('wa_auto_envios')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tipo', 'teste')
    .gte('created_at', umaHoraAtras)
  if (errCount) return json({ ok: false, error: 'Não foi possível conferir o limite de testes.' }, 500)
  if ((count ?? 0) >= LIMITE_TESTES_HORA) {
    return json({ ok: false, status: 'limite', error: `Limite de ${LIMITE_TESTES_HORA} testes por hora atingido. Tente mais tarde.` }, 429)
  }

  // ---- Disjuntor ----
  if (await disjuntorAberto(admin, tenantId, provider.nome)) {
    return json({
      ok: false,
      status: 'pausado',
      error: 'Os últimos envios falharam seguidos. Os envios estão pausados por alguns minutos — confira o token e o número.',
    }, 503)
  }

  // ---- Reserva idempotente (antes de enviar) ----
  const chave = chaveIdempotencia('teste', telefone, janelaMinuto(new Date()))
  const { data: linha, error: errIns } = await admin
    .from('wa_auto_envios')
    .insert({
      tenant_id: tenantId, // explícito: service_role não tem sessão para o carimbo (F2)
      tipo: 'teste',
      provider: provider.nome,
      destino: telefone,
      destino_nome: 'Teste manual',
      status: 'pendente',
      chave_idempotencia: chave,
      payload: { solicitado_por: userId }, // sem texto de conversa, sem token (F5)
    })
    .select('id')
    .single()
  if (errIns) {
    if ((errIns as { code?: string }).code === '23505') {
      return json({ ok: false, status: 'duplicado', error: 'Já foi enviado um teste para este número neste minuto. Aguarde um pouco.' }, 409)
    }
    console.error('wa-auto-testar-envio: falha ao registrar envio', errIns.code)
    return json({ ok: false, error: 'Não foi possível registrar o envio.' }, 500)
  }

  // ---- Envio ----
  let status: 'enviado' | 'falhou' = 'falhou'
  let erro: string | null = null
  let messageId: string | null = null
  let humanizado: OrigemHumanizacao | undefined
  try {
    let r: ResultadoEnvio
    if (provider.nome === 'zernio') {
      r = await provider.sendTemplate(telefone, config.template_relatorio as string, variaveis, {
        chaveIdempotencia: `${tenantId}:${chave}`,
        idioma: config.template_idioma,
      })
    } else {
      const h = await humanizarTexto(pedidoTeste(periodoDoDia(new Date())), {
        chamarIa: criarChamadaOpenRouter(Deno.env.get('OPENROUTER_API_KEY')),
        prazoMs: PRAZO_IA_MS,
      })
      humanizado = h.origem
      if (h.origem === 'fallback') console.log('wa-auto-testar-envio: fallback da humanização', h.motivos.join(','))
      r = await provider.sendText(telefone, h.texto, { chaveIdempotencia: `${tenantId}:${chave}`, humanizado })
    }
    status = 'enviado'
    messageId = r.messageId
  } catch (e) {
    erro = e instanceof WaProviderError ? e.message : 'Falha inesperada no envio.'
    if (!(e instanceof WaProviderError)) console.error('wa-auto-testar-envio: erro inesperado', (e as Error)?.name)
  }

  await admin
    .from('wa_auto_envios')
    .update({
      status,
      erro,
      payload: {
        solicitado_por: userId, message_id: messageId, fonte_segredo: resolvido.fonteSegredo,
        ...(humanizado ? { humanizado } : {}), // só a origem, nunca o texto (F5)
      },
    })
    .eq('id', linha.id)
    .eq('tenant_id', tenantId)

  return json({ ok: status === 'enviado', status, provider: provider.nome, error: erro ?? undefined })
})
