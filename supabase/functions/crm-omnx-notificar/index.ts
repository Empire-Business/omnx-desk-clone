// Ponte Desk -> CRM OMNX (contrato v1): envia ao CRM a venda/contrato que mudou aqui.
//
// Acionada SÓ pelos gatilhos trg_crm_omnx_* (pg_net + x-notify-secret do Vault),
// com {venda_id, evento?} ou {contrato_id}. Monta o evento desk.venda.* /
// desk.contrato.atualizado, assina com o segredo crm_omnx do tenant e faz POST na
// base_url (receptor do CRM). O resultado vai para a venda:
//   crm_venda_id, crm_sincronizado_em, crm_sincronizacao_erro
// Gravar essas colunas não redispara o gatilho (ele só olha campos de dados e status).
//
// Fire-and-forget: falha vira crm_sincronizacao_erro e aparece na tela; a resposta
// para o pg_net é sempre 200 depois da autorização.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import {
  CRM_PROVIDER,
  ehUuid,
  headersAssinadosCrm,
  interpretarRespostaCrm,
  montarEventoDesk,
  tipoEventoVenda,
  urlReceptorValida,
  type LinhaContratoDesk,
  type LinhaVendaDesk,
  type TipoEventoDesk,
} from '../_shared/crm-omnx.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TIMEOUT_MS = 20_000

const COLUNAS_VENDA = [
  'id', 'tenant_id', 'status', 'criado_em', 'closer_nome', 'closer_email',
  'cliente_nome', 'cliente_razao_social', 'cliente_cpf_cnpj', 'cliente_email', 'cliente_whatsapp',
  'cliente_instagram', 'cliente_endereco', 'cliente_cep', 'cliente_logradouro', 'cliente_numero',
  'cliente_complemento', 'cliente_bairro', 'cliente_municipio', 'cliente_uf',
  'produto_nome', 'valor_total_venda', 'pagamentos', 'observacoes',
  'pagador_diferente', 'pagador_nome', 'pagador_cpf_cnpj', 'pagador_relacao',
  'crm_venda_id', 'crm_sincronizado_em',
].join(', ')
const COLUNAS_CONTRATO = 'id, status, status_secundario, link_clicksign, data_assinatura, venda_pendente_id'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

servirComLicenca(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Auth: só o gatilho do banco (mesmo esquema de vendas-ressincronizar-crm).
  const notifySecret = req.headers.get('x-notify-secret')
  let autorizado = false
  if (notifySecret) {
    const { data: ok } = await admin.rpc('notify_secret_matches', { candidate: notifySecret })
    autorizado = ok === true
  }
  if (!autorizado) return json({ error: 'unauthorized' }, 401)

  let body: { venda_id?: unknown; contrato_id?: unknown; evento?: unknown }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  type ContratoComVenda = LinhaContratoDesk & { venda_pendente_id: string | null }
  let contrato: ContratoComVenda | null = null
  let vendaId: string | null = null
  let tipo: TipoEventoDesk | null = null

  if (ehUuid(body?.contrato_id)) {
    const { data } = await admin.from('contratos').select(COLUNAS_CONTRATO).eq('id', body.contrato_id).maybeSingle()
    if (!data) return json({ ok: true, skipped: 'contrato_nao_encontrado' })
    contrato = data as unknown as ContratoComVenda
    vendaId = contrato.venda_pendente_id
    if (!vendaId) return json({ ok: true, skipped: 'contrato_sem_venda' })
    tipo = 'desk.contrato.atualizado'
  } else if (ehUuid(body?.venda_id)) {
    vendaId = body.venda_id
  } else {
    return json({ error: 'venda_id_ou_contrato_id_obrigatorio' }, 400)
  }

  const { data: vendaRow } = await admin.from('vendas_pendentes').select(COLUNAS_VENDA).eq('id', vendaId).maybeSingle()
  if (!vendaRow) return json({ ok: true, skipped: 'venda_nao_encontrada' })
  const venda = vendaRow as unknown as LinhaVendaDesk & { crm_sincronizado_em: string | null }

  if (!contrato) {
    const { data } = await admin.from('contratos').select(COLUNAS_CONTRATO).eq('venda_pendente_id', venda.id).maybeSingle()
    contrato = (data as unknown as ContratoComVenda | null) ?? null
  }
  if (!tipo) tipo = tipoEventoVenda(body?.evento, !!venda.crm_venda_id || !!venda.crm_sincronizado_em)

  // Credencial do tenant dono da venda. Ponte desligada = nada a fazer (o gatilho
  // já filtra; aqui é só a guarda de sanidade).
  const { data: cred } = await admin.rpc('get_omnx_bridge_credential_tenant', {
    p_tenant_id: venda.tenant_id,
    p_provider: CRM_PROVIDER,
  })
  const row = Array.isArray(cred) && cred.length > 0 ? (cred[0] as { secret?: string; base_url?: string | null }) : null
  if (!row?.secret) return json({ ok: true, skipped: 'ponte_crm_desligada' })
  if (!urlReceptorValida(row.base_url)) {
    await gravarResultado(admin, venda.id, { erro: 'endereco_do_crm_invalido' })
    return json({ ok: false, motivo: 'endereco_do_crm_invalido' })
  }

  const evento = montarEventoDesk({
    tipo,
    venda,
    contrato,
    eventId: crypto.randomUUID(),
    occurredAt: new Date(),
  })
  const rawBody = JSON.stringify(evento)

  let status = 0
  let resposta: unknown = null
  try {
    const res = await fetch(row.base_url!, {
      method: 'POST',
      headers: await headersAssinadosCrm(row.secret, rawBody),
      body: rawBody,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    status = res.status
    resposta = await res.json().catch(() => null)
  } catch (e) {
    const msg = (e as Error).name === 'TimeoutError' ? 'crm_sem_resposta' : 'crm_falha_de_rede'
    console.error(`crm-omnx-notificar: ${msg}`, (e as Error).message)
    await gravarResultado(admin, venda.id, { erro: msg })
    return json({ ok: false, motivo: msg })
  }

  const r = interpretarRespostaCrm(status, resposta)
  if (r.sincronizado) {
    await gravarResultado(admin, venda.id, {
      erro: null,
      sincronizadoEm: new Date().toISOString(),
      crmVendaId: r.crmVendaId && r.crmVendaId !== venda.crm_venda_id ? r.crmVendaId : undefined,
    })
  } else {
    await gravarResultado(admin, venda.id, { erro: r.erro })
  }
  return json({ ok: r.sincronizado, evento: tipo, http_status: status, motivo: r.erro, crm_venda_id: r.crmVendaId })
})

async function gravarResultado(admin: SupabaseClient, vendaId: string, r: { erro: string | null; sincronizadoEm?: string; crmVendaId?: string }) {
  const patch: Record<string, unknown> = { crm_sincronizacao_erro: r.erro }
  if (r.sincronizadoEm) patch.crm_sincronizado_em = r.sincronizadoEm
  if (r.crmVendaId) patch.crm_venda_id = r.crmVendaId
  const { error } = await admin.from('vendas_pendentes').update(patch).eq('id', vendaId)
  if (error && r.crmVendaId && error.code === '23505') {
    // A venda do CRM já está ligada a outra venda deste Desk: não sobrescreve o vínculo.
    await admin.from('vendas_pendentes').update({
      crm_sincronizacao_erro: 'venda_do_crm_ja_ligada_a_outra_venda',
      ...(r.sincronizadoEm ? { crm_sincronizado_em: r.sincronizadoEm } : {}),
    }).eq('id', vendaId)
  } else if (error) {
    console.error('crm-omnx-notificar: não gravou o resultado', error.message)
  }
}
