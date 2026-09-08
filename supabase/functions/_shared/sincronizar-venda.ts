// Envio de uma venda do Desk para o CRM (vendas_fechamento do Empire/GHL).
//
// Extraído de vendas-sincronizar-crm para ser compartilhado com a ressincronização
// automática (vendas-ressincronizar-crm, acionada por trigger quando a venda é
// editada depois de já ter sido enviada). As duas portas precisam montar o payload
// exatamente igual — duplicar a lógica era o caminho garantido para o CRM e o Desk
// divergirem de novo.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveEmpireBridge, empireHeaders } from './empire-bridge.ts'

export interface ResultadoSincronizacao {
  ok: boolean
  /** Código curto do erro quando ok=false (venda_nao_encontrada, bridge_nao_configurada, ghl_error). */
  erro?: string
  detalhe?: unknown
  ghlVendaId?: string | null
  valorFaturado?: number | null
  comprovantesSalvos?: number
}

interface ComprovanteDesk {
  storage_path: string
  nome_original?: string | null
  mime_type?: string | null
  sinal?: string | null
}

/**
 * Envia (ou reenvia) a venda ao CRM e grava o resultado em vendas_pendentes.
 *
 * É idempotente do lado do CRM: `crm-registrar-venda` faz UPSERT por
 * oportunidade_id, então chamar de novo ATUALIZA a venda existente em vez de
 * duplicar. É isso que faz a edição no Desk chegar ao dashboard.
 */
export async function sincronizarVendaComCrm(
  admin: SupabaseClient,
  args: { vendaId: string; oportunidadeId: string; pipelineName?: string | null },
): Promise<ResultadoSincronizacao> {
  const { data: venda, error: vErr } = await admin
    .from('vendas_pendentes')
    .select('*')
    .eq('id', args.vendaId)
    .single()
  if (vErr || !venda) return { ok: false, erro: 'venda_nao_encontrada' }

  // Secret da ponte do tenant DONO da venda — não da "única integração ativa".
  const bridge = await resolveEmpireBridge(admin, venda.tenant_id ?? null)
  if (!bridge) return { ok: false, erro: 'bridge_nao_configurada' }

  // Links assinados dos comprovantes (10 min) para o CRM baixar e copiar.
  const comprovantes: Array<{ url: string; nome_original: string | null; mime_type: string | null; sinal: string | null }> = []
  for (const c of ((venda.comprovantes ?? []) as ComprovanteDesk[])) {
    const { data: signed } = await admin.storage
      .from('vendas-comprovantes')
      .createSignedUrl(c.storage_path, 600)
    if (signed?.signedUrl) {
      comprovantes.push({
        url: signed.signedUrl,
        nome_original: c.nome_original ?? null,
        mime_type: c.mime_type ?? null,
        sinal: c.sinal ?? null,
      })
    }
  }

  // Estado do contrato desta venda. O CRM não tem como descobrir isso sozinho:
  // contrato fechado fora do Clicksign não move card nem preenche link, e a venda
  // ficava eternamente marcada como "sem contrato assinado" no dashboard.
  const { data: contrato } = await admin
    .from('contratos')
    .select('status, link_clicksign, data_assinatura')
    .eq('venda_pendente_id', args.vendaId)
    .maybeSingle()

  const vendaPayload = {
    contrato: contrato
      ? {
          status: contrato.status ?? null,
          link_assinatura: contrato.link_clicksign ?? null,
          data_assinatura: contrato.data_assinatura ?? null,
        }
      : null,
    nome_contratante: venda.cliente_nome ?? null,
    cpf_cnpj_contratante: venda.cliente_cpf_cnpj ?? null,
    logradouro_rua_avenida: venda.cliente_logradouro ?? venda.cliente_endereco ?? null,
    numero_endereco: venda.cliente_numero ?? null,
    complemento_endereco: venda.cliente_complemento ?? null,
    bairro: venda.cliente_bairro ?? null,
    municipio: venda.cliente_municipio ?? null,
    estado_uf: venda.cliente_uf ?? null,
    cep: venda.cliente_cep ?? null,
    produto_vendido: venda.produto_nome ?? null,
    observacoes_venda: venda.observacoes ?? null,
    closer_nome: venda.closer_nome ?? null,
    closer_email: venda.closer_email ?? null,
    pagamentos: venda.pagamentos ?? [],
  }

  let res: Response
  try {
    res = await fetch(`${bridge.baseUrl}/crm-registrar-venda`, {
      method: 'POST',
      headers: empireHeaders(bridge.secret),
      body: JSON.stringify({ oportunidade_id: args.oportunidadeId, venda: vendaPayload, comprovantes }),
    })
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : 'falha_de_rede'
    await admin
      .from('vendas_pendentes')
      .update({ sincronizacao_erro: String(detalhe).slice(0, 500) })
      .eq('id', args.vendaId)
    return { ok: false, erro: 'ghl_error', detalhe }
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok || (data as { error?: string })?.error) {
    await admin
      .from('vendas_pendentes')
      .update({ sincronizacao_erro: JSON.stringify(data).slice(0, 500) })
      .eq('id', args.vendaId)
    return { ok: false, erro: 'ghl_error', detalhe: data }
  }

  const patch: Record<string, unknown> = {
    ghl_oportunidade_id: args.oportunidadeId,
    ghl_venda_id: (data as { id?: string })?.id ?? null,
    sincronizado_em: new Date().toISOString(),
    sincronizacao_erro: null,
  }
  // Num reenvio não vem pipeline_name; não sobrescrever o que já está gravado com null.
  if (args.pipelineName) patch.ghl_pipeline_name = args.pipelineName

  await admin.from('vendas_pendentes').update(patch).eq('id', args.vendaId)

  return {
    ok: true,
    ghlVendaId: (data as { id?: string })?.id ?? null,
    valorFaturado: (data as { valor_faturado?: number })?.valor_faturado ?? null,
    comprovantesSalvos: (data as { comprovantes_salvos?: number })?.comprovantes_salvos ?? 0,
  }
}
