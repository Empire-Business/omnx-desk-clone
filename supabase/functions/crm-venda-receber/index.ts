// Receptor da ponte CRM OMNX -> Desk (contrato v1).
//
// POST {functions}/crm-venda-receber, sem JWT (verify_jwt=false): a autorização é só a
// assinatura HMAC do corpo com o segredo do par de empresas.
//   X-OMNX-Desk-Tenant  uuid do tenant do Desk (acha o segredo crm_omnx no cofre)
//   X-OMNX-Timestamp    unix em segundos (janela de 300 s)
//   X-OMNX-Signature    sha256=<hex HMAC-SHA256(segredo, "<timestamp>.<corpo cru>")>
//
// Grava por crm_omnx_aplicar_venda (UPSERT por tenant + crm_venda_id, origem='crm',
// idempotente por event_id, sem eco de volta ao CRM). Venda nova: tenta o
// auto-vínculo com o Empire igual ao formulário e avisa a equipe de atendimento.
//
// Respostas: 200 {ok, status: created|updated|unchanged, desk_venda_id, desk_contrato_id}
//            401 assinatura inválida · 400 invalid_payload / data_invalida · 409 sem crm_omnx ativo.
// v1.1: desk_venda_id opcional — a venda do Desk já ligada é atualizada (não duplica).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { autoVincularVendaEmpire } from '../_shared/empire-auto-vinculo.ts'
import {
  CRM_PROVIDER,
  HEADER_ASSINATURA,
  HEADER_TENANT,
  HEADER_TIMESTAMP,
  ehUuid,
  validarEventoCrm,
  vendaCrmParaColunas,
  verificarAssinaturaCrm,
} from '../_shared/crm-omnx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Corpo maior que isso não é uma venda: recusa antes de ler tudo. */
const MAX_BODY_BYTES = 256 * 1024

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function recusar(status: number, error: string, detail?: string) {
  console.warn(`crm-venda-receber recusado ${status} ${error}${detail ? ` — ${detail}` : ''}`)
  return json({ ok: false, error, ...(detail ? { detail } : {}) }, status)
}

servirComLicenca(async (req) => {
  if (req.method !== 'POST') return recusar(405, 'method_not_allowed')

  const tenantId = req.headers.get(HEADER_TENANT)?.trim() ?? ''
  if (!ehUuid(tenantId)) return recusar(401, 'invalid_signature', 'tenant ausente')

  const tamanho = Number(req.headers.get('content-length') ?? '0')
  if (tamanho > MAX_BODY_BYTES) return recusar(400, 'payload_too_large')
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) return recusar(400, 'payload_too_large')

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Segredo do tenant. Sem integração ativa -> 409 (o CRM sabe que precisa configurar).
  const { data: cred, error: credErr } = await admin.rpc('get_omnx_bridge_credential_tenant', {
    p_tenant_id: tenantId,
    p_provider: CRM_PROVIDER,
  })
  if (credErr) return recusar(500, 'credential_lookup_failed')
  const segredo = Array.isArray(cred) && cred.length > 0 ? (cred[0] as { secret?: string }).secret : null
  if (!segredo) return recusar(409, 'integration_inactive')

  const assinatura = await verificarAssinaturaCrm(segredo, {
    timestamp: req.headers.get(HEADER_TIMESTAMP),
    signature: req.headers.get(HEADER_ASSINATURA),
    rawBody,
  })
  if (!assinatura.ok) return recusar(401, 'invalid_signature', assinatura.code)

  let body: unknown
  try { body = JSON.parse(rawBody) } catch { return recusar(400, 'invalid_json') }
  const validacao = validarEventoCrm(body)
  if (!validacao.ok) return recusar(400, validacao.codigo, validacao.erro)
  const evento = validacao.evento

  const dados = vendaCrmParaColunas(evento.venda)
  // Só venda ganha nasce no Desk. Venda já conhecida é atualizada em qualquer status
  // (o status do Desk nunca regride; 'lost' no CRM não descarta nada aqui).
  const criar = evento.venda.status === 'won'

  const { data: aplicado, error: apErr } = await admin.rpc('crm_omnx_aplicar_venda', {
    p_tenant_id: tenantId,
    p_event_id: evento.event_id,
    p_crm_venda_id: evento.crm_venda_id,
    p_dados: dados,
    p_criar: criar,
    p_contrato: evento.venda.contrato,
    p_desk_venda_id: evento.desk_venda_id,
  })
  if (apErr || !aplicado) {
    console.error('crm-venda-receber: falha ao gravar', apErr?.message)
    return recusar(500, 'db_write_failed')
  }

  const r = aplicado as {
    status: 'created' | 'updated' | 'unchanged'
    desk_venda_id: string | null
    desk_contrato_id: string | null
    duplicado?: boolean
  }

  if (r.status === 'created' && !r.duplicado && r.desk_venda_id) {
    // Auto-vínculo com o Empire e aviso à equipe depois da resposta: o CRM não
    // espera (nem sofre timeout) por causa do Empire.
    emSegundoPlano(aposCriar(admin, tenantId, r.desk_venda_id))
  }

  return json({
    ok: true,
    status: r.status,
    desk_venda_id: r.desk_venda_id,
    desk_contrato_id: r.desk_contrato_id,
  })
})

/** Roda depois de responder: EdgeRuntime.waitUntil quando existe; senão, solto com catch. */
function emSegundoPlano(tarefa: Promise<unknown>) {
  const seguro = tarefa.catch((e) => console.error('crm-venda-receber: pós-criação falhou', (e as Error)?.message))
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (typeof rt?.waitUntil === 'function') rt.waitUntil(seguro)
}

async function aposCriar(admin: SupabaseClient, tenantId: string, vendaId: string) {
  const { data: venda } = await admin
    .from('vendas_pendentes')
    .select('*')
    .eq('id', vendaId)
    .maybeSingle()
  if (!venda) return

  // Mesmo auto-vínculo do formulário (crm-buscar-lead -> 1 match -> crm-registrar-venda).
  await autoVincularVendaEmpire(admin, {
    vendaId,
    tenantId,
    dados: venda,
    comprovantes: [],
  })

  // Aviso só para a equipe da empresa dona da venda.
  try {
    const { data: alvos } = await admin
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('perfil', ['atendimento', 'admin', 'gerente'])
    if (alvos && alvos.length > 0) {
      const titulo = `Nova venda vinda do CRM: ${venda.cliente_nome}`
      const mensagem = `${venda.closer_nome} fechou uma venda no CRM — abra para validar e iniciar o atendimento.`
      await admin.from('notifications').insert(
        (alvos as Array<{ id: string }>).map((u) => ({
          user_id: u.id,
          tipo: 'venda_pendente',
          titulo,
          mensagem,
          link: '/contratos/onboarding',
          metadata: { venda_id: vendaId, origem: 'crm', closer_nome: venda.closer_nome, cliente_nome: venda.cliente_nome },
        })),
      )
    }
  } catch (e) {
    console.error('crm-venda-receber: aviso não enviado', (e as Error).message)
  }
}
