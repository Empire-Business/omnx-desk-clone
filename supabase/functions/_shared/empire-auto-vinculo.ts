// Auto-vínculo de uma venda recém-criada com o Empire (vendas_fechamento do GHL).
//
// Extraído de vendas-publicas-create para ser usado também pela venda que chega do
// CRM OMNX (crm-venda-receber). O comportamento é o mesmo do formulário:
//   - busca o lead no Empire (crm-buscar-lead) por telefone/e-mail;
//   - se houver EXATAMENTE 1 oportunidade candidata, registra a venda nela
//     (crm-registrar-venda) e carimba ghl_* + sincronizado_em na venda;
//   - 0 ou >1 oportunidade: nada acontece e a venda fica na fila de vínculo manual.
// Falha aqui nunca quebra a criação da venda.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveEmpireBridge, empireHeaders } from './empire-bridge.ts'

/** Teto de cada chamada ao Empire: sem resposta, a venda fica para o vínculo manual. */
const EMPIRE_TIMEOUT_MS = 10_000

export interface ComprovanteParaVinculo {
  storage_path: string
  nome_original: string
  mime_type: string
  sinal: string | null
}

/** Campos da venda que o Empire recebe (mesmos nomes do payload do formulário). */
export interface DadosVendaParaVinculo {
  cliente_nome: string
  cliente_whatsapp: string
  cliente_email?: string | null
  cliente_cpf_cnpj?: string | null
  cliente_endereco?: string | null
  cliente_logradouro?: string | null
  cliente_numero?: string | null
  cliente_complemento?: string | null
  cliente_bairro?: string | null
  cliente_municipio?: string | null
  cliente_uf?: string | null
  cliente_cep?: string | null
  produto_nome?: string | null
  observacoes?: string | null
  closer_nome: string
  closer_email: string
  pagamentos: unknown
}

export async function autoVincularVendaEmpire(
  admin: SupabaseClient,
  args: {
    vendaId: string
    tenantId: string | null
    dados: DadosVendaParaVinculo
    comprovantes?: ComprovanteParaVinculo[]
  },
): Promise<{ vinculado: boolean }> {
  const { vendaId, tenantId, dados } = args
  const comprovantes = args.comprovantes ?? []
  try {
    // Credencial do tenant dono da venda recém-criada.
    const bridge = await resolveEmpireBridge(admin, tenantId ?? null)
    if (!bridge) return { vinculado: false }
    const buscaRes = await fetch(`${bridge.baseUrl}/crm-buscar-lead`, {
      method: 'POST',
      headers: empireHeaders(bridge.secret),
      body: JSON.stringify({ telefone: dados.cliente_whatsapp, email: dados.cliente_email ?? null }),
      signal: AbortSignal.timeout(EMPIRE_TIMEOUT_MS),
    })
    const buscaData = (await buscaRes.json().catch(() => ({}))) as {
      candidatos?: Array<{ oportunidades?: Array<{ oportunidade_id: string }> }>
    }
    const todasOpps = (buscaData.candidatos ?? []).flatMap((c) => c.oportunidades ?? [])
    if (!(buscaRes.ok && todasOpps.length === 1)) return { vinculado: false }

    const oppId = todasOpps[0].oportunidade_id
    const compsComUrl: Array<{ url: string; nome_original: string; mime_type: string; sinal: string | null }> = []
    for (const c of comprovantes) {
      const { data: signed } = await admin.storage
        .from('vendas-comprovantes')
        .createSignedUrl(c.storage_path, 600)
      if (signed?.signedUrl) {
        compsComUrl.push({ url: signed.signedUrl, nome_original: c.nome_original, mime_type: c.mime_type, sinal: c.sinal })
      }
    }
    const vendaPayload = {
      nome_contratante: dados.cliente_nome,
      cpf_cnpj_contratante: dados.cliente_cpf_cnpj ?? null,
      logradouro_rua_avenida: dados.cliente_logradouro ?? dados.cliente_endereco ?? null,
      numero_endereco: dados.cliente_numero ?? null,
      complemento_endereco: dados.cliente_complemento ?? null,
      bairro: dados.cliente_bairro ?? null,
      municipio: dados.cliente_municipio ?? null,
      estado_uf: dados.cliente_uf ?? null,
      cep: dados.cliente_cep ?? null,
      produto_vendido: dados.produto_nome ?? null,
      observacoes_venda: dados.observacoes ?? null,
      closer_nome: dados.closer_nome,
      closer_email: dados.closer_email,
      pagamentos: dados.pagamentos,
    }
    const regRes = await fetch(`${bridge.baseUrl}/crm-registrar-venda`, {
      method: 'POST',
      headers: empireHeaders(bridge.secret),
      body: JSON.stringify({ oportunidade_id: oppId, venda: vendaPayload, comprovantes: compsComUrl }),
      signal: AbortSignal.timeout(EMPIRE_TIMEOUT_MS),
    })
    const regData = (await regRes.json().catch(() => ({}))) as { id?: string; error?: string }
    if (regRes.ok && !regData.error) {
      await admin.from('vendas_pendentes').update({
        ghl_oportunidade_id: oppId,
        ghl_venda_id: regData.id ?? null,
        sincronizado_em: new Date().toISOString(),
        sincronizacao_erro: null,
      }).eq('id', vendaId)
      return { vinculado: true }
    }
    return { vinculado: false }
  } catch (e) {
    console.error('auto-vínculo falhou (venda segue pendente):', (e as Error).message)
    return { vinculado: false }
  }
}
