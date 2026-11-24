// Agendamento em duas etapas do app Automações WhatsApp (etapa 9.5 — docs/prd.md §0.6).
//
// Ações (POST, corpo JSON com `acao`):
//   * 'grupos'      — lista os grupos de WhatsApp vinculados a um cliente (só leitura;
//                     a tela usa para escolher quando o cliente tem mais de um grupo).
//   * 'marcar'      — ETAPA 1: grava a reunião em `meetings` SEM link (status 'scheduled').
//   * 'enviar_link' — ETAPA 2: envia o link da reunião no grupo do cliente, UMA única vez.
//
// Autenticação — JWT do usuário (não segredo de cron). Justificativa:
//   As duas etapas são ações humanas pontuais (alguém marca a reunião; depois alguém
//   manda o link). Não há agendador aqui. O JWT amarra cada envio a uma pessoa
//   (auditoria em wa_auto_envios.payload.solicitado_por) e à empresa DELA; um segredo
//   de cron seria uma credencial de máquina capaz de agir em qualquer empresa, sem
//   ninguém responsável, e exigiria receber o tenant no corpo do pedido (proibido, F2).
//   Se um dia o link sair sozinho (ex.: X minutos antes), isso vira uma função de cron
//   separada, autenticada por segredo do Vault (F1), reaproveitando a lógica daqui.
//   Exigência: has_permissao('automacoes-wa', 'editar') avaliada COM o JWT do usuário
//   (o admin passa pela escada de ações), app ligado e agendamento ligado na empresa.
//
// Segurança:
//   * tenant_id SEMPRE do servidor (get_tenant_do_usuario) e explícito em TODA consulta
//     feita com service_role (F2). Cliente, reunião, instância e grupo são conferidos
//     contra esse tenant.
//   * Destino NUNCA vem do corpo nem de texto livre/IA (F4): o grupo é derivado do
//     cliente da reunião (chat_contacts / chat_contact_clients → conversa is_group) e
//     precisa estar na instância de WhatsApp configurada da empresa. O corpo só pode
//     ESCOLHER um grupo entre os que o servidor já validou (grupo_contact_id).
//   * Envio no grupo sai pela UAZAPI mesmo quando a empresa usa a Zernio: a API oficial
//     não abre conversa de grupo pelo nosso lado (ver handoff/PRD).
//   * Idempotência: chave por (agendamento_link + grupo + reunião) com UNIQUE no banco,
//     reservada ANTES do envio, e trava extra por reunião: UNIQUE parcial no banco em
//     (tenant_id, payload->>'meeting_id') para pendente/enviado (migration
//     20261026180000) e meetings.metadata.link_enviado_em (sobrevive à retenção de
//     90 dias do histórico), para o link não sair duas vezes nem se o grupo mudar. Falha incerta (timeout) só é
//     repetida com confirmação explícita (confirmar_reenvio), para não duplicar no grupo.
//   * Limites: 60 reuniões/hora e 20 links/hora por empresa; disjuntor após falhas.
//   * A mensagem cita sempre o nome do cliente; histórico sem token e sem o texto.
//   * UAZAPI (não oficial — o link SEMPRE sai por ela): o texto é reescrito pela IA a
//     cada envio (_shared/wa-humanizar.ts). Nome, data, hora e link vão à IA como
//     marcadores e são recolocados por nós (o link sai idêntico ao validado aqui);
//     saída reprovada 2x, IA fora ou sem tempo → fallback variado. O envio do link
//     NUNCA é bloqueado por causa da IA. Histórico guarda só humanizado: 'ia'|'fallback'.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resolveWaProvider, disjuntorAberto, novoProvedorUazapi, WaProviderError,
  type WaProvider,
} from '../_shared/wa-provider.ts'
import {
  GRUPO_WA, chaveIdempotencia, renderizarTexto,
} from '../_shared/wa-mensagem.ts'
import { criarChamadaOpenRouter, humanizarTexto, periodoDoDia, type OrigemHumanizacao } from '../_shared/wa-humanizar.ts'
import { pedidoLinkReuniao } from '../_shared/wa-humanizar-pedidos.ts'
import { tokenDoNumeroOuLegado, urlUazapi } from '../_shared/uazapi-credenciais.ts'
import { escolherLinkReuniao, salaDeVideoLigada, type OrigemLink } from './link.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Endereço público do app (mesmo padrão de outras funções), usado só para montar o
// link da sala interna quando a reunião não tem link próprio.
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://desk.omnx.pro').trim().replace(/\/+$/, '')

const FUSO = 'America/Sao_Paulo'
const ORIGEM = 'automacoes-wa'
const LIMITE_REUNIOES_HORA = 60
const LIMITE_LINKS_HORA = 20
const PENDENTE_TRAVADO_MIN = 10
const MAX_GRUPOS = 20
/** Tempo máximo esperando a IA (a pessoa está com a tela aberta); depois, fallback. */
const PRAZO_IA_MS = 10_000

/** Modelo da mensagem do link (UAZAPI = texto). Sempre cita o cliente (decisão do Bruno). */
const MODELO_LINK = 'Olá, {{cliente}}! Segue o link da nossa reunião de {{data}} às {{hora}}:\n{{link}}'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function erro(mensagem: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error: mensagem, ...extra }, status)
}

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------
interface Autorizado { userId: string; tenantId: string }

/** Usuário logado com 'automacoes-wa' · editar; devolve o tenant DELE (nunca do corpo). */
async function autorizar(authHeader: string | null, admin: SupabaseClient): Promise<Autorizado | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  // has_permissao usa auth.uid() → precisa rodar com o JWT do usuário, não service_role.
  const { data: pode, error: errPerm } = await userClient.rpc('has_permissao', {
    p_recurso: 'automacoes-wa',
    p_acao: 'editar',
  })
  if (errPerm || pode !== true) return null
  const { data: tenantId } = await admin.rpc('get_tenant_do_usuario', { p_user_id: user.id })
  if (!tenantId || typeof tenantId !== 'string') return null
  return { userId: user.id, tenantId }
}

// ---------------------------------------------------------------------------
// Configuração, instância e grupos (sempre filtrando por tenant — F2)
// ---------------------------------------------------------------------------
interface ConfigAgendamento {
  provider: 'uazapi' | 'zernio'
  uazapi_instance_id: string | null
  agendamento_ativo: boolean
}

async function lerConfig(admin: SupabaseClient, tenantId: string): Promise<ConfigAgendamento | null> {
  const { data } = await admin
    .from('wa_auto_config')
    .select('provider, uazapi_instance_id, agendamento_ativo')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return (data as ConfigAgendamento | null) ?? null
}

/** whatsapp_instances.id (uuid) da instância configurada, conferida contra o tenant. */
async function instanciaDaEmpresa(
  admin: SupabaseClient, tenantId: string, instanceId: string | null,
): Promise<{ id: string; instance_id: string } | null> {
  if (!instanceId || !/^[A-Za-z0-9_-]{1,128}$/.test(instanceId)) return null
  const { data } = await admin
    .from('whatsapp_instances')
    .select('id, instance_id')
    .eq('tenant_id', tenantId)
    .eq('instance_id', instanceId)
    .maybeSingle()
  return (data as { id: string; instance_id: string } | null) ?? null
}

interface Cliente { id: string; nome: string }

async function clienteDaEmpresa(admin: SupabaseClient, tenantId: string, clientId: string): Promise<Cliente | null> {
  const { data } = await admin
    .from('clients')
    .select('id, nome, empresa')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; nome: string | null; empresa: string | null }
  const nome = limparTexto(row.nome || row.empresa || '', 80)
  return nome ? { id: row.id, nome } : null
}

interface GrupoCliente {
  contact_id: string
  /** Nome do grupo no WhatsApp (só para mostrar). */
  nome: string | null
  /** Destino no formato do WhatsApp (…@g.us). Derivado do banco, nunca do corpo. */
  destino: string
  /** Conversa de grupo mais recente desse contato. */
  conversation_id: string
}

/**
 * Grupos vinculados ao cliente, só na instância que envia (a instância precisa
 * ser membro do grupo). Vínculo = chat_contacts.client_id OU chat_contact_clients.
 */
async function gruposDoCliente(
  admin: SupabaseClient, tenantId: string, clientId: string, instanciaUuid: string,
): Promise<GrupoCliente[]> {
  const ids = new Set<string>()
  const [{ data: diretos }, { data: ligados }] = await Promise.all([
    admin.from('chat_contacts').select('id')
      .eq('tenant_id', tenantId).eq('client_id', clientId).eq('instance_id', instanciaUuid)
      .limit(100),
    admin.from('chat_contact_clients').select('contact_id')
      .eq('tenant_id', tenantId).eq('client_id', clientId)
      .limit(100),
  ])
  for (const r of (diretos ?? []) as { id: string }[]) ids.add(r.id)
  for (const r of (ligados ?? []) as { contact_id: string }[]) ids.add(r.contact_id)
  if (ids.size === 0) return []

  const { data: contatos } = await admin
    .from('chat_contacts')
    .select('id, nome, numero_whatsapp, bloqueado')
    .eq('tenant_id', tenantId)
    .eq('instance_id', instanciaUuid)
    .in('id', [...ids])
  const candidatos = new Map<string, { nome: string | null; destino: string }>()
  for (const c of (contatos ?? []) as { id: string; nome: string | null; numero_whatsapp: string | null; bloqueado: boolean | null }[]) {
    if (c.bloqueado) continue
    // O webhook guarda o grupo sem o sufixo; aceitamos as duas formas.
    const base = String(c.numero_whatsapp ?? '').trim().toLowerCase().replace(/@g\.us$/, '')
    const destino = `${base}@g.us`
    if (!GRUPO_WA.test(destino)) continue
    candidatos.set(c.id, { nome: c.nome ? limparTexto(c.nome, 80) : null, destino })
  }
  if (candidatos.size === 0) return []

  // Só conta como grupo se houver conversa marcada is_group nesta empresa.
  const { data: conversas } = await admin
    .from('chat_conversations')
    .select('id, contact_id, criado_em')
    .eq('tenant_id', tenantId)
    .eq('instance_id', instanciaUuid)
    .eq('is_group', true)
    .in('contact_id', [...candidatos.keys()])
    .order('criado_em', { ascending: false })
  const grupos: GrupoCliente[] = []
  const vistos = new Set<string>()
  for (const cv of (conversas ?? []) as { id: string; contact_id: string }[]) {
    if (vistos.has(cv.contact_id)) continue
    vistos.add(cv.contact_id)
    const c = candidatos.get(cv.contact_id)!
    grupos.push({ contact_id: cv.contact_id, nome: c.nome, destino: c.destino, conversation_id: cv.id })
    if (grupos.length >= MAX_GRUPOS) break
  }
  return grupos
}

/** Versão para a tela: sem o id do grupo no WhatsApp. */
function grupoParaTela(g: GrupoCliente) {
  return { contact_id: g.contact_id, nome: g.nome ?? 'Grupo sem nome' }
}

// ---------------------------------------------------------------------------
// Envio no grupo: sempre UAZAPI
// ---------------------------------------------------------------------------
/**
 * Provedor UAZAPI para o envio no grupo.
 *   * Empresa em 'uazapi': reaproveita resolveWaProvider (mesmo caminho do teste).
 *   * Empresa em 'zernio': a oficial não abre conversa de grupo; monta a UAZAPI com o
 *     token do Vault (provider 'uazapi') ou, na transição, o token em env da instância
 *     configurada, pelo MESMO adaptador (novoProvedorUazapi): allowlist da base_url,
 *     timeout, sem retry em timeout, "digitando…", humanização obrigatória, sem segredo em log.
 */
async function provedorDeGrupo(
  admin: SupabaseClient, tenantId: string, cfg: ConfigAgendamento, instancia: { instance_id: string },
): Promise<{ provider: WaProvider; fonteSegredo: string }> {
  if (cfg.provider === 'uazapi') {
    const r = await resolveWaProvider(admin, tenantId)
    if (r.provider.nome !== 'uazapi') throw new WaProviderError('nao_configurado', 'Conexão não oficial indisponível.')
    return { provider: r.provider, fonteSegredo: r.fonteSegredo }
  }

  let segredo: string | null = null
  let baseUrlSalva: string | null = null
  const { data: cred, error: errCred } = await admin.rpc('get_omnx_bridge_credential_tenant', {
    p_tenant_id: tenantId,
    p_provider: 'uazapi',
  })
  if (!errCred && Array.isArray(cred) && cred.length > 0) {
    const row = cred[0] as { secret?: string; base_url?: string | null }
    if (row?.secret) segredo = row.secret
    baseUrlSalva = row?.base_url ?? null
  }
  let fonte = 'vault'
  if (!segredo) {
    // instancia já foi conferida contra o tenant por instanciaDaEmpresa().
    // Token do número no cofre; por último, o segredo legado UAZAPI_TOKEN_<instância>.
    const doNumero = await tokenDoNumeroOuLegado(admin, String(instancia.instance_id ?? ''), tenantId)
    segredo = doNumero?.token ?? null
    fonte = doNumero?.fonte ?? 'env_instancia'
  }
  if (!segredo) {
    throw new WaProviderError('nao_configurado',
      'O link vai no grupo pela conexão não oficial (UAZAPI). Salve o token da UAZAPI na aba Conexão ou use um número já conectado no Chat.')
  }
  const baseUrl = baseUrlSalva && baseUrlSalva.length > 0 ? baseUrlSalva : await urlUazapi(admin, tenantId)
  return { provider: novoProvedorUazapi(baseUrl, segredo), fonteSegredo: fonte }
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
/** Uma linha só, sem caracteres de controle, com tamanho máximo. */
function limparTexto(v: unknown, max: number): string {
  // deno-lint-ignore no-control-regex
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max)
}

// Link de reunião (validação e sala interna): ./link.ts (testado no Vitest).

function nomeSala(): string {
  const aleatorio = crypto.getRandomValues(new Uint8Array(6))
  const sufixo = Array.from(aleatorio, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
  return `meeting-${Date.now().toString(36)}-${sufixo}`
}

function dataHoraBR(iso: string): { data: string; hora: string } {
  const d = new Date(iso)
  return {
    data: new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d),
    hora: new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(d),
  }
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return erro('Método não permitido.', 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const auth = await autorizar(req.headers.get('Authorization'), admin)
  if (!auth) return erro('Sem permissão para agendar pelas Automações WhatsApp.', 403)
  const { tenantId, userId } = auth

  let body: Record<string, unknown>
  try {
    const bruto = await req.text()
    if (bruto.length > 4096) return erro('Pedido grande demais.', 413)
    body = objeto(bruto ? JSON.parse(bruto) : {})
  } catch {
    return erro('Pedido inválido.')
  }

  // ---- App e agendamento ligados nesta empresa ----
  const { data: app } = await admin
    .from('app_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('slug', 'automacoes-wa')
    .maybeSingle()
  if (app && app.enabled === false) return erro('O app Automações WhatsApp está desligado nesta empresa.', 403)

  const cfg = await lerConfig(admin, tenantId)
  if (!cfg) return erro('Configure o app Automações WhatsApp antes de agendar.', 409)
  if (!cfg.agendamento_ativo) return erro('Ligue o "Agendamento em duas etapas" na aba Agendamento.', 409)

  const acao = typeof body.acao === 'string' ? body.acao : ''
  try {
    if (acao === 'grupos') return await acaoGrupos(admin, tenantId, cfg, body)
    if (acao === 'marcar') return await acaoMarcar(admin, tenantId, userId, cfg, body)
    if (acao === 'enviar_link') return await acaoEnviarLink(admin, tenantId, userId, cfg, body)
  } catch (e) {
    console.error('wa-auto-agendar: erro inesperado', acao, (e as Error)?.name)
    return erro('Não foi possível concluir. Tente de novo em instantes.', 500)
  }
  return erro('Ação desconhecida.')
})

// ---------------------------------------------------------------------------
// 'grupos' — opções de grupo do cliente (para a tela escolher)
// ---------------------------------------------------------------------------
async function acaoGrupos(
  admin: SupabaseClient, tenantId: string, cfg: ConfigAgendamento, body: Record<string, unknown>,
): Promise<Response> {
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  if (!UUID.test(clientId)) return erro('Cliente inválido.')
  const cliente = await clienteDaEmpresa(admin, tenantId, clientId)
  if (!cliente) return erro('Cliente não encontrado nesta empresa.', 404)
  const instancia = await instanciaDaEmpresa(admin, tenantId, cfg.uazapi_instance_id)
  if (!instancia) {
    return json({ ok: true, grupos: [], aviso: 'Escolha na aba Conexão o número de WhatsApp que participa dos grupos dos clientes.' })
  }
  const grupos = await gruposDoCliente(admin, tenantId, clientId, instancia.id)
  return json({ ok: true, cliente: cliente.nome, grupos: grupos.map(grupoParaTela) })
}

// ---------------------------------------------------------------------------
// ETAPA 1 — marcar a reunião (sem link)
// ---------------------------------------------------------------------------
async function acaoMarcar(
  admin: SupabaseClient, tenantId: string, userId: string, cfg: ConfigAgendamento, body: Record<string, unknown>,
): Promise<Response> {
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  if (!UUID.test(clientId)) return erro('Escolha o cliente da reunião.')

  const quando = new Date(typeof body.scheduled_at === 'string' ? body.scheduled_at : '')
  if (Number.isNaN(quando.getTime())) return erro('Data e hora da reunião inválidas.')
  const agora = Date.now()
  if (quando.getTime() < agora - 5 * 60_000) return erro('A reunião precisa ser no futuro.')
  if (quando.getTime() > agora + 366 * 24 * 60 * 60_000) return erro('A reunião precisa ser nos próximos 12 meses.')

  const duracaoBruta = body.duracao_min === undefined ? 30 : Number(body.duracao_min)
  if (!Number.isInteger(duracaoBruta) || duracaoBruta < 15 || duracaoBruta > 480) {
    return erro('Duração inválida (de 15 a 480 minutos).')
  }

  const cliente = await clienteDaEmpresa(admin, tenantId, clientId)
  if (!cliente) return erro('Cliente não encontrado nesta empresa.', 404)
  const titulo = limparTexto(body.titulo, 120) || `Reunião com ${cliente.nome}`
  const scheduledAt = quando.toISOString()

  // Clique duplo / reenvio: mesma reunião (empresa + cliente + horário, desta origem) não é criada duas vezes.
  const { data: existente } = await admin
    .from('meetings')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('scheduled_at', scheduledAt)
    .eq('status', 'scheduled')
    .eq('metadata->>origem', ORIGEM)
    .limit(1)
    .maybeSingle()
  if (existente) {
    return json({ ok: true, status: 'ja_marcada', meeting_id: (existente as { id: string }).id })
  }

  // Limite por empresa (protege contra laço/automação errada no front).
  const umaHoraAtras = new Date(agora - 60 * 60_000).toISOString()
  const { count } = await admin
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('metadata->>origem', ORIGEM)
    .gte('created_at', umaHoraAtras)
  if ((count ?? 0) >= LIMITE_REUNIOES_HORA) {
    return erro(`Limite de ${LIMITE_REUNIOES_HORA} reuniões por hora atingido. Tente mais tarde.`, 429)
  }

  // Grupo: só informativo aqui (a etapa 2 confere tudo de novo).
  const instancia = await instanciaDaEmpresa(admin, tenantId, cfg.uazapi_instance_id)
  const grupos = instancia ? await gruposDoCliente(admin, tenantId, clientId, instancia.id) : []
  const grupoUnico = grupos.length === 1 ? grupos[0] : null

  const { data: nova, error: errIns } = await admin
    .from('meetings')
    .insert({
      tenant_id: tenantId, // explícito: service_role não tem sessão para o carimbo (F2)
      title: titulo,
      client_id: cliente.id,
      conversation_id: grupoUnico?.conversation_id ?? null,
      meeting_type: 'scheduled',
      status: 'scheduled',
      livekit_room_name: nomeSala(),
      meeting_link: null, // ETAPA 1: sem link
      recording_status: 'pending',
      created_by: userId,
      scheduled_at: scheduledAt,
      scheduled_duration_min: duracaoBruta,
      guest_name: cliente.nome,
      metadata: { origem: ORIGEM, etapa: 1, marcado_por: userId },
    })
    .select('id')
    .single()
  if (errIns || !nova) {
    console.error('wa-auto-agendar: falha ao gravar reunião', errIns?.code)
    return erro('Não foi possível marcar a reunião.', 500)
  }

  return json({
    ok: true,
    status: 'marcada',
    meeting_id: (nova as { id: string }).id,
    cliente: cliente.nome,
    grupos: grupos.map(grupoParaTela),
    aviso: grupos.length === 0
      ? (instancia
        ? 'Reunião marcada. Este cliente ainda não tem grupo de WhatsApp vinculado: vincule o grupo ao cliente no Chat antes de enviar o link.'
        : 'Reunião marcada. Escolha na aba Conexão o número de WhatsApp que participa dos grupos para poder enviar o link.')
      : undefined,
  })
}

// ---------------------------------------------------------------------------
// ETAPA 2 — enviar o link no grupo do cliente (uma única vez)
// ---------------------------------------------------------------------------
interface Reuniao {
  id: string
  client_id: string | null
  conversation_id: string | null
  status: string | null
  scheduled_at: string | null
  meeting_link: string | null
  livekit_room_name: string
  metadata: unknown
}

interface EnvioExistente {
  id: string
  status: 'pendente' | 'enviado' | 'falhou' | 'simulado'
  chave_idempotencia: string | null
  payload: unknown
  created_at: string
}

async function acaoEnviarLink(
  admin: SupabaseClient, tenantId: string, userId: string, cfg: ConfigAgendamento, body: Record<string, unknown>,
): Promise<Response> {
  const meetingId = typeof body.meeting_id === 'string' ? body.meeting_id : ''
  if (!UUID.test(meetingId)) return erro('Reunião inválida.')
  const grupoEscolhido = typeof body.grupo_contact_id === 'string' && UUID.test(body.grupo_contact_id)
    ? body.grupo_contact_id : null
  const confirmarReenvio = body.confirmar_reenvio === true

  // ---- Reunião desta empresa ----
  const { data: mData } = await admin
    .from('meetings')
    .select('id, client_id, conversation_id, status, scheduled_at, meeting_link, livekit_room_name, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', meetingId)
    .maybeSingle()
  const reuniao = mData as Reuniao | null
  if (!reuniao) return erro('Reunião não encontrada nesta empresa.', 404)
  if (!reuniao.client_id) return erro('Esta reunião não tem cliente vinculado.', 409)
  if (reuniao.status !== 'scheduled') return erro('Só dá para enviar o link de uma reunião agendada (não iniciada nem encerrada).', 409)
  if (!reuniao.scheduled_at) return erro('Esta reunião não tem data marcada.', 409)
  if (new Date(reuniao.scheduled_at).getTime() < Date.now() - 2 * 60 * 60_000) {
    return erro('Esta reunião já passou.', 409)
  }

  const cliente = await clienteDaEmpresa(admin, tenantId, reuniao.client_id)
  if (!cliente) return erro('O cliente desta reunião não foi encontrado nesta empresa.', 409)

  // ---- Link (conteúdo): informado agora > já salvo na reunião > sala interna ----
  // Sala interna só com a sala de vídeo ligada (segredo REUNIAO_VIDEO; padrão ligado).
  const videoLigado = salaDeVideoLigada((n) => Deno.env.get(n))
  let link: string | null = null
  let origemLink: OrigemLink = 'informado'
  try {
    const escolha = escolherLinkReuniao({
      informado: body.meeting_link,
      salvo: reuniao.meeting_link,
      sala: reuniao.livekit_room_name,
      appUrl: APP_URL,
      videoLigado,
    })
    link = escolha.link
    origemLink = escolha.origem
  } catch (e) {
    return erro((e as Error).message)
  }
  if (!link && !videoLigado) {
    return erro('Informe o link da reunião (Google Meet, Zoom ou outro): a sala de vídeo do app está desligada nesta instalação.')
  }
  if (!link) return erro('Informe o link da reunião.')

  // ---- Já enviado / em andamento para ESTA reunião (qualquer grupo) ----
  // A marca na reunião vale mesmo depois que a retenção de 90 dias apagar o histórico.
  if (objeto(reuniao.metadata).link_enviado_em) {
    return json({ ok: true, status: 'ja_enviado', mensagem: 'O link desta reunião já foi enviado no grupo.' })
  }
  const { data: envData } = await admin
    .from('wa_auto_envios')
    .select('id, status, chave_idempotencia, payload, created_at')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'agendamento_link')
    .eq('payload->>meeting_id', reuniao.id)
    .order('created_at', { ascending: false })
    .limit(20)
  const envios = (envData ?? []) as EnvioExistente[]
  if (envios.some((e) => e.status === 'enviado')) {
    return json({ ok: true, status: 'ja_enviado', mensagem: 'O link desta reunião já foi enviado no grupo.' })
  }
  const limiteTravado = Date.now() - PENDENTE_TRAVADO_MIN * 60_000
  for (const e of envios.filter((x) => x.status === 'pendente')) {
    if (new Date(e.created_at).getTime() > limiteTravado) {
      return erro('O envio do link desta reunião já está em andamento.', 409, { status: 'em_andamento' })
    }
    // Pendente antigo = execução interrompida no meio: pode ter saído. Marca como incerto.
    await admin
      .from('wa_auto_envios')
      .update({ status: 'falhou', erro: 'Envio interrompido; confira o grupo antes de reenviar.', payload: { ...objeto(e.payload), incerto: true } })
      .eq('id', e.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'pendente')
    e.status = 'falhou'
    e.payload = { ...objeto(e.payload), incerto: true }
  }
  if (!confirmarReenvio && envios.some((e) => e.status === 'falhou' && objeto(e.payload).incerto === true)) {
    return erro(
      'A última tentativa não teve confirmação do WhatsApp e o link pode ter chegado. Confira o grupo; se não chegou, envie de novo confirmando o reenvio.',
      409,
      { status: 'confirmar_reenvio' },
    )
  }

  // ---- Grupo: derivado do cliente, na instância da empresa (nunca do corpo) ----
  const instancia = await instanciaDaEmpresa(admin, tenantId, cfg.uazapi_instance_id)
  if (!instancia) {
    return erro('Escolha na aba Conexão o número de WhatsApp que participa dos grupos dos clientes.', 409)
  }
  const grupos = await gruposDoCliente(admin, tenantId, cliente.id, instancia.id)
  if (grupos.length === 0) {
    return erro(`Nenhum grupo de WhatsApp vinculado a ${cliente.nome} neste número. Vincule o grupo ao cliente no Chat.`, 409)
  }
  let grupo: GrupoCliente | undefined
  if (grupoEscolhido) {
    grupo = grupos.find((g) => g.contact_id === grupoEscolhido)
    if (!grupo) return erro('O grupo escolhido não está vinculado a este cliente.', 409)
  } else if (grupos.length === 1) {
    grupo = grupos[0]
  } else {
    grupo = grupos.find((g) => g.conversation_id === reuniao.conversation_id)
  }
  if (!grupo) {
    return erro('Este cliente tem mais de um grupo. Escolha em qual enviar o link.', 409, {
      status: 'escolher_grupo',
      grupos: grupos.map(grupoParaTela),
    })
  }

  // ---- Mensagem (cita sempre o cliente) ----
  const { data: dataBR, hora } = dataHoraBR(reuniao.scheduled_at)
  let texto: string
  try {
    texto = renderizarTexto(MODELO_LINK, { cliente: cliente.nome, data: dataBR, hora, link })
  } catch {
    return erro('Não foi possível montar a mensagem (faltou o nome do cliente ou o link).', 409)
  }

  // ---- Provedor (UAZAPI), limites e disjuntor ----
  let provedor: { provider: WaProvider; fonteSegredo: string }
  try {
    provedor = await provedorDeGrupo(admin, tenantId, cfg, instancia)
  } catch (e) {
    return erro(e instanceof WaProviderError ? e.message : 'Não foi possível preparar o envio.', 409, { status: 'nao_enviado' })
  }

  const umaHoraAtras = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count, error: errCount } = await admin
    .from('wa_auto_envios')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tipo', 'agendamento_link')
    .gte('created_at', umaHoraAtras)
  if (errCount) return erro('Não foi possível conferir o limite de envios.', 500)
  if ((count ?? 0) >= LIMITE_LINKS_HORA) {
    return erro(`Limite de ${LIMITE_LINKS_HORA} links por hora atingido. Tente mais tarde.`, 429, { status: 'limite' })
  }
  if (await disjuntorAberto(admin, tenantId, 'uazapi')) {
    return erro('Os últimos envios falharam seguidos. Os envios estão pausados por alguns minutos — confira o token e o número.', 503, { status: 'pausado' })
  }

  // ---- Reserva idempotente (ANTES do envio) ----
  const chave = chaveIdempotencia('agendamento_link', grupo.destino, `reuniao-${reuniao.id}`)
  const payloadBase = {
    meeting_id: reuniao.id,
    client_id: cliente.id,
    grupo_contact_id: grupo.contact_id,
    solicitado_por: userId,
    origem_link: origemLink, // o link em si não vai para o histórico (minimização — F5)
  }
  let linhaId: string
  const anterior = envios.find((e) => e.chave_idempotencia === chave)
  if (anterior) {
    // Mesma reunião + mesmo grupo já falhou: reaproveita a linha, trocando falhou → pendente
    // de forma condicional (só um pedido concorrente consegue).
    // A UNIQUE por reunião (pendente/enviado) também barra aqui: erro 23505 = outro
    // grupo desta reunião já está em andamento ou enviado.
    const { data: upd, error: errUpd } = await admin
      .from('wa_auto_envios')
      .update({ status: 'pendente', erro: null, payload: { ...payloadBase, tentativa_anterior: anterior.status } })
      .eq('id', anterior.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'falhou')
      .select('id')
    if (errUpd && (errUpd as { code?: string }).code !== '23505') {
      console.error('wa-auto-agendar: falha ao reabrir envio', errUpd.code)
      return erro('Não foi possível registrar o envio.', 500)
    }
    if (errUpd || !upd || upd.length !== 1) return erro('O envio do link desta reunião já está em andamento.', 409, { status: 'em_andamento' })
    linhaId = anterior.id
  } else {
    const { data: linha, error: errIns } = await admin
      .from('wa_auto_envios')
      .insert({
        tenant_id: tenantId, // explícito (F2)
        tipo: 'agendamento_link',
        provider: 'uazapi',
        destino: grupo.destino,
        destino_nome: `Grupo de ${cliente.nome}`,
        status: 'pendente',
        chave_idempotencia: chave,
        payload: payloadBase,
      })
      .select('id')
      .single()
    if (errIns || !linha) {
      // 23505: mesma chave (reunião + grupo) OU a UNIQUE por reunião
      // (uq_wa_auto_envios_agendamento_reuniao): pedido simultâneo em outro grupo.
      if ((errIns as { code?: string } | null)?.code === '23505') {
        return erro('O envio do link desta reunião já está em andamento.', 409, { status: 'em_andamento' })
      }
      console.error('wa-auto-agendar: falha ao registrar envio', errIns?.code)
      return erro('Não foi possível registrar o envio.', 500)
    }
    linhaId = (linha as { id: string }).id
  }

  // ---- Texto humanizado (UAZAPI) — nunca bloqueia: na pior hipótese, fallback variado ----
  const h = await humanizarTexto(
    pedidoLinkReuniao({ textoBase: texto, cliente: cliente.nome, data: dataBR, hora, link, periodo: periodoDoDia(new Date(), FUSO) }),
    { chamarIa: criarChamadaOpenRouter(Deno.env.get('OPENROUTER_API_KEY'), { titulo: 'OMNX Desk Agendamento WhatsApp' }), prazoMs: PRAZO_IA_MS },
  )
  const humanizado: OrigemHumanizacao = h.origem
  if (h.origem === 'fallback') console.log('wa-auto-agendar: fallback da humanização', h.motivos.join(','))

  // ---- Envio ----
  let status: 'enviado' | 'falhou' = 'falhou'
  let msgErro: string | null = null
  let incerto = false
  let messageId: string | null = null
  try {
    const r = await provedor.provider.sendText(grupo.destino, h.texto, { humanizado })
    status = 'enviado'
    messageId = r.messageId
  } catch (e) {
    if (e instanceof WaProviderError) {
      msgErro = e.message
      // 'rede'/5xx podem acontecer depois de o WhatsApp já ter recebido: não repetir sem confirmação.
      incerto = e.codigo === 'rede' || e.incerto
    } else {
      msgErro = 'Falha inesperada no envio.'
      incerto = true
      console.error('wa-auto-agendar: erro inesperado no envio', (e as Error)?.name)
    }
  }

  await admin
    .from('wa_auto_envios')
    .update({
      status,
      erro: msgErro,
      payload: {
        ...payloadBase, message_id: messageId, fonte_segredo: provedor.fonteSegredo, humanizado, // só a origem (F5)
        ...(incerto ? { incerto: true } : {}),
      },
    })
    .eq('id', linhaId)
    .eq('tenant_id', tenantId)

  if (status === 'enviado') {
    const meta = objeto(reuniao.metadata)
    await admin
      .from('meetings')
      .update({
        meeting_link: link,
        metadata: {
          ...meta,
          etapa: 2,
          link_enviado_em: new Date().toISOString(),
          link_enviado_por: userId,
          wa_auto_envio_id: linhaId,
        },
      })
      .eq('id', reuniao.id)
      .eq('tenant_id', tenantId)
    return json({ ok: true, status: 'enviado', grupo: grupoParaTela(grupo) })
  }

  return json({
    ok: false,
    status: incerto ? 'incerto' : 'falhou',
    error: incerto
      ? `${msgErro} Confira o grupo antes de tentar de novo.`
      : msgErro,
  })
}
