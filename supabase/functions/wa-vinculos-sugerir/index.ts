import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { contratosDosClientesAtendidos } from '../_shared/contratos-clientes-atendidos.ts'
// Sugestões de vínculo das conversas (grupos e privados) com os clientes
// (app Automações WhatsApp → aba "Vínculos").
//
// PARA QUÊ: a análise de satisfação e o relatório só enxergam conversa LIGADA a
// cliente. A maioria dos grupos de clientes não estava ligada (o vínculo ficava
// preso ao número antigo, e grupos ficam escondidos no Chat). Esta função olha
// todos os canais da empresa e grava em cliente_canais:
//   * 'confirmado' só quando é certo (determinístico):
//       - o canal já estava ligado no Chat em algum número (legado / mesmo_jid);
//       - o telefone do contato privado é de UM cliente só (telefone);
//   * 'sugerido' pelo nome (nome do grupo / participantes) — nome NUNCA
//     confirma sozinho; uma pessoa aceita ou recusa na tela.
// As regras ficam em _shared/vinculo-sugestoes.ts (puras, testadas no Vitest).
// A RPC vinculos_gravar_sugestoes confere de novo os determinísticos e NUNCA
// mexe em decisão humana (confirmado, rejeitado, interno, não é cliente).
//
// Quem chama:
//   * o agendador (pg_cron 'wa-vinculos-sugerir-diario', 06:30 de Brasília),
//     autenticado pelo segredo do Vault `wa_auto_cron_secret` (header
//     `x-cron-secret`, conferido pela RPC wa_auto_cron_secret_confere) — mesmo
//     padrão de wa-auto-satisfacao. Roda para toda empresa com o app ligado;
//   * o botão "Recalcular sugestões" da tela, com o JWT do usuário: só
//     admin/gerente que administra o app (RPC vinculos_pode_gerir avaliada COM O
//     JWT dele), só a empresa DELE, no máximo 1 vez por minuto (reserva atômica
//     no banco: vinculos_reservar_execucao).
// Precisa de verify_jwt = false (config.toml): o cron não tem JWT; o JWT do
// botão é validado aqui (auth.getUser).
//
// Segurança:
//   * client service_role; toda leitura leva `.eq('tenant_id', T)`; a empresa do
//     botão vem do cadastro do usuário, nunca do corpo.
//   * Nomes e telefones só são comparados em memória; nada disso vai para log,
//     resposta ou evidência (só códigos e contagens).
//   * Limites de linhas lidas e de tempo (a função tem 150 s).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type CanalExistente, type ClienteEntrada, type ContagemSugestoes, type ContatoEntrada, type ContratoEntrada,
  calcularSugestoes, canalDoContato, idCanal,
} from '../_shared/vinculo-sugestoes.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ORCAMENTO_MS = 120_000          // não começa empresa nova depois disso
const PAGINA = 1_000                  // linhas por página do PostgREST
const MAX_LINHAS = 30_000             // por tabela e empresa
const MAX_MEMBROS = 60_000            // participantes lidos por empresa
const TAMANHO_LOTE = 150              // ids por `.in(...)`
const MAX_ITENS = 5_000               // limite da RPC
const MAX_TENANTS = 1_000
const INTERVALO_MANUAL_MS = 60_000    // botão: 1 vez por minuto por empresa
const RETENCAO_DIAS = 90

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function cronAutorizado(admin: SupabaseClient, segredo: string): Promise<boolean> {
  if (segredo.length < 32 || segredo.length > 256) return false
  const { data, error } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  return !error && data === true
}

/** JWT válido + vinculos_pode_gerir (com o JWT dele) + usuário ativo. Devolve a empresa DELE. */
async function usuarioAutorizado(admin: SupabaseClient, authHeader: string | null): Promise<{ userId: string; tenantId: string } | null> {
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) return null
  const usuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return null
  const { data: pode, error } = await usuario.rpc('vinculos_pode_gerir')
  if (error || pode !== true) return null
  const { data: u } = await admin.from('users').select('ativo, tenant_id').eq('id', user.id).maybeSingle()
  if (!u || u.ativo !== true || !u.tenant_id) return null
  return { userId: user.id, tenantId: u.tenant_id as string }
}

/** Lê todas as páginas (ordem estável). Erro ou passou do limite → null. */
async function lerPaginas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>,
  max = MAX_LINHAS,
): Promise<T[] | null> {
  const out: T[] = []
  for (let de = 0; de < max; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1)
    if (error) return null
    const linhas = (data ?? []) as T[]
    out.push(...linhas)
    if (linhas.length < PAGINA) return out
  }
  return null
}

interface ResultadoTenant {
  tenant_id: string
  ok: boolean
  motivo?: string
  contagem?: ContagemSugestoes
  gravados?: number
  confirmados?: number
  removidos?: number
  ignorados?: number
}

/** execId: linha já reservada em vinculos_execucoes (botão) — atualiza em vez de inserir. */
async function processarTenant(
  admin: SupabaseClient, T: string, origem: 'cron' | 'manual', userId: string | null, execId: string | null = null,
): Promise<ResultadoTenant> {
  const contatos = await lerPaginas<ContatoEntrada>((de, ate) => admin
    .from('chat_contacts')
    .select('id, instance_id, nome, numero_whatsapp, group_size, client_id, restrito_admin')
    .eq('tenant_id', T).order('id').range(de, ate))
  const vinculosExtra = await lerPaginas<{ contact_id: string; client_id: string }>((de, ate) => admin
    .from('chat_contact_clients').select('contact_id, client_id').eq('tenant_id', T).order('id').range(de, ate))
  const canais = await lerPaginas<CanalExistente>((de, ate) => admin
    .from('cliente_canais').select('tipo, chave, client_id, status').eq('tenant_id', T).order('id').range(de, ate))
  const clientes = await lerPaginas<ClienteEntrada>((de, ate) => admin
    .from('clients').select('id, nome, empresa, razao_social, instagram, telefone, whatsapp, ativo')
    .eq('tenant_id', T).order('id').range(de, ate))
  const contratos = await lerPaginas<ContratoEntrada>((de, ate) => admin
    .from('contratos').select('cliente_id, cliente_nome, empresa, instagram, whatsapp, status')
    .eq('tenant_id', T).not('cliente_id', 'is', null).order('id').range(de, ate))
  if (!contatos || !vinculosExtra || !canais || !clientes || !contratos) return { tenant_id: T, ok: false, motivo: 'erro_leitura' }

  // Adicionais contribuem apenas para vigência. Nome/telefone/Instagram do
  // pagador não viram evidência de identidade do outro cliente atendido.
  const atendidos = await contratosDosClientesAtendidos(admin, T, clientes.map((c) => c.id)).catch(() => null)
  if (!atendidos) return { tenant_id: T, ok: false, motivo: 'erro_leitura' }
  contratos.push(...atendidos.filter((c) => !c.principal).map((c) => ({ cliente_id: c.cliente_id, status: c.status })))

  // Participantes só dos GRUPOS ainda sem decisão nem vínculo (é o que pede nome).
  const decididos = new Set(canais
    .filter((c) => c.status === 'confirmado' || (c.client_id === null && (c.status === 'interno' || c.status === 'nao_cliente')))
    .map((c) => `${c.tipo}:${c.chave}`))
  const idsGrupos = contatos
    .filter((c) => {
      if (c.restrito_admin || c.client_id) return false
      const canal = canalDoContato(c.numero_whatsapp, c.group_size)
      return canal?.tipo === 'grupo' && !decididos.has(idCanal(canal))
    })
    .map((c) => c.id)
  const membros: { contact_id: string; nome: string | null }[] = []
  for (let i = 0; i < idsGrupos.length && membros.length < MAX_MEMBROS; i += TAMANHO_LOTE) {
    const lote = idsGrupos.slice(i, i + TAMANHO_LOTE)
    const linhas = await lerPaginas<{ contact_id: string; nome: string | null }>((de, ate) => admin
      .from('chat_group_members').select('contact_id, nome')
      .eq('tenant_id', T).in('contact_id', lote).not('nome', 'is', null).order('id').range(de, ate), MAX_MEMBROS)
    if (!linhas) return { tenant_id: T, ok: false, motivo: 'erro_leitura_membros' }
    membros.push(...linhas)
  }

  const calc = calcularSugestoes({ contatos, vinculosExtra, canais, clientes, contratos, membros })
  if (calc.itens.length > MAX_ITENS) {
    console.warn('wa-vinculos-sugerir: itens acima do limite, cortados', calc.itens.length)
  }
  const { data: gravacao, error: errGrav } = await admin.rpc('vinculos_gravar_sugestoes', {
    p_tenant: T,
    p_itens: calc.itens.slice(0, MAX_ITENS),
    p_chaves: calc.itens.length > MAX_ITENS ? null : calc.chavesAnalisadas,
  })
  if (errGrav) {
    console.error('wa-vinculos-sugerir: falha ao gravar', errGrav.code)
    return { tenant_id: T, ok: false, motivo: 'erro_gravacao', contagem: calc.contagem }
  }
  const g = (gravacao ?? {}) as { gravados?: number; confirmados?: number; removidos?: number; ignorados?: number }
  const res: ResultadoTenant = {
    tenant_id: T, ok: true, contagem: calc.contagem,
    gravados: g.gravados ?? 0, confirmados: g.confirmados ?? 0, removidos: g.removidos ?? 0, ignorados: g.ignorados ?? 0,
  }

  // Registro (só contagens) + retenção.
  const resultado = { ...calc.contagem, gravados: res.gravados, confirmados: res.confirmados, removidos: res.removidos, ignorados: res.ignorados }
  const { error: errLog } = execId
    ? await admin.from('vinculos_execucoes').update({ resultado }).eq('id', execId).eq('tenant_id', T)
    : await admin.from('vinculos_execucoes').insert({
      tenant_id: T, // explícito: service_role não tem sessão
      origem,
      user_id: userId,
      resultado,
    })
  if (errLog) console.error('wa-vinculos-sugerir: falha ao registrar execução', errLog.code)
  await admin.from('vinculos_execucoes').delete().eq('tenant_id', T)
    .lt('criado_em', new Date(Date.now() - RETENCAO_DIAS * 86_400_000).toISOString())
  return res
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const inicio = Date.now()

  // --- Agendador ---
  const segredo = req.headers.get('x-cron-secret')
  if (segredo !== null) {
    if (!(await cronAutorizado(admin, segredo))) return json({ ok: false, error: 'unauthorized' }, 401)
    const { data: apps, error } = await admin
      .from('app_modules').select('tenant_id')
      .eq('slug', 'automacoes-wa').eq('enabled', true)
      .order('tenant_id').limit(MAX_TENANTS)
    if (error) {
      console.error('wa-vinculos-sugerir: falha ao ler empresas', error.code)
      return json({ ok: false, error: 'Não foi possível ler as empresas.' }, 500)
    }
    const resultados: ResultadoTenant[] = []
    for (const { tenant_id: T } of (apps ?? []) as { tenant_id: string }[]) {
      if (Date.now() - inicio > ORCAMENTO_MS) {
        resultados.push({ tenant_id: T, ok: false, motivo: 'tempo_esgotado' })
        continue
      }
      try {
        resultados.push(await processarTenant(admin, T, 'cron', null))
      } catch (e) {
        console.error('wa-vinculos-sugerir: erro no tenant', (e as Error)?.name)
        resultados.push({ tenant_id: T, ok: false, motivo: 'erro_inesperado' })
      }
    }
    const tot = resultados.reduce((a, r) => ({ ok: a.ok + (r.ok ? 1 : 0), gravados: a.gravados + (r.gravados ?? 0) }), { ok: 0, gravados: 0 })
    console.log(`wa-vinculos-sugerir: ${resultados.length} empresa(s), ${tot.ok} ok, ${tot.gravados} gravado(s)`)
    return json({ ok: true, resultados })
  }

  // --- Botão "Recalcular sugestões" ---
  const quem = await usuarioAutorizado(admin, req.headers.get('Authorization'))
  if (!quem) return json({ ok: false, error: 'Sem permissão para recalcular os vínculos.' }, 403)

  // Reserva ATÔMICA (lock por empresa no banco): dois cliques ao mesmo tempo
  // não rodam duas vezes.
  const { data: execId, error: errReserva } = await admin.rpc('vinculos_reservar_execucao', {
    p_tenant: quem.tenantId, p_user: quem.userId, p_intervalo_s: Math.round(INTERVALO_MANUAL_MS / 1000),
  })
  if (errReserva) {
    console.error('wa-vinculos-sugerir: falha ao reservar execução', errReserva.code)
    return json({ ok: false, error: 'Não foi possível recalcular agora. Tente de novo em alguns minutos.' }, 500)
  }
  if (!execId) {
    return json({ ok: false, error: 'As sugestões acabaram de ser recalculadas. Aguarde um minuto e tente de novo.' }, 429)
  }

  try {
    const r = await processarTenant(admin, quem.tenantId, 'manual', quem.userId, execId as string)
    if (!r.ok) return json({ ok: false, error: 'Não foi possível recalcular agora. Tente de novo em alguns minutos.' }, 500)
    const { tenant_id: _t, ...semTenant } = r
    return json(semTenant)
  } catch (e) {
    console.error('wa-vinculos-sugerir: erro no botão', (e as Error)?.name)
    return json({ ok: false, error: 'Não foi possível recalcular agora. Tente de novo em alguns minutos.' }, 500)
  }
})
