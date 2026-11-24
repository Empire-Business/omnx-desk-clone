// Licença HTAI desta instalação (contrato htai.entitlement.v1, escopo instalação).
//
// Duas entradas, autorização própria (verify_jwt = false no config.toml):
//  * agendador (pg_cron): cabeçalho x-cron-secret conferido pela RPC
//    wa_auto_cron_secret_confere → faz o pull assinado quando renew_after venceu;
//  * pessoa logada (JWT): devolve a situação para a tela, sem segredo nenhum.
//    Com {"acao": "atualizar"} pede um pull agora (no máximo 1 por minuto).
//  * nas duas, grava a versão instalada e o aviso de versão nova que a central
//    manda no corpo assinado (tabela htai_app_update); falha aí nunca muda a licença.
//
// Modo off (fora do escopo instalação e sem HTAI_ENTITLEMENTS_MODE): não chama a central, só responde "desligada".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { lerCredenciais, versaoDoApp } from '../_shared/htai-licenca-core.ts'
import { modoDaFuncao, situacaoDaLicenca } from '../_shared/htai-licenca.ts'
import { sincronizarLicenca, type EstadoLinha } from './sincronizar.ts'
import { sincronizarComAviso } from '../_shared/htai-app-update.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const deps = {
    modo: modoDaFuncao(),
    credenciais: lerCredenciais((n) => Deno.env.get(n)),
    versaoApp: versaoDoApp((n) => Deno.env.get(n)),
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    nowMs: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    async lerEstado(): Promise<EstadoLinha | null> {
      const { data, error } = await admin
        .from('htai_licenca_estado')
        .select('versao, renew_after, ultima_tentativa_em')
        .eq('id', true)
        .maybeSingle()
      if (error) throw new Error('estado_indisponivel')
      return data as EstadoLinha | null
    },
    async gravar(campos: Record<string, unknown>) {
      const { error } = await admin
        .from('htai_licenca_estado')
        .upsert({ id: true, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw new Error('estado_indisponivel')
    },
    async registerSignature(hash: string) {
      const { error } = await admin.from('htai_licenca_assinaturas').insert({ hash })
      if (!error) return true
      if (error.code === '23505') return false
      throw new Error('assinatura_indisponivel')
    },
  }

  // Aviso de versão nova (tabela htai_app_update): só com a licença ligada e a instalação ativada.
  const aviso = { ativo: deps.modo !== 'off' && deps.credenciais !== null, versaoApp: deps.versaoApp }

  try {
    // 1) Agendador
    const segredo = req.headers.get('x-cron-secret')
    if (segredo !== null) {
      if (req.method !== 'POST' || !segredo || segredo.length > 1024) return json({ error: 'unauthorized' }, 401)
      const { data: confere, error } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
      if (error) return json({ error: 'cron_auth_unavailable' }, 503)
      if (confere !== true) return json({ error: 'unauthorized' }, 401)
      const r = await sincronizarComAviso(admin, aviso, () => sincronizarLicenca(deps))
      return json({ ok: true, resultado: r.feito })
    }

    // 2) Pessoa logada
    const auth = req.headers.get('authorization') ?? ''
    if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'unauthorized' }, 401)
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u, error: eU } = await userClient.auth.getUser()
    if (eU || !u?.user) return json({ error: 'unauthorized' }, 401)

    let acao = 'situacao'
    if (req.method === 'POST') {
      try {
        const b = await req.json()
        if (b && typeof b === 'object' && (b as { acao?: unknown }).acao === 'atualizar') acao = 'atualizar'
      } catch { /* corpo vazio = situação */ }
    }
    if (acao === 'atualizar' && deps.modo !== 'off') {
      await sincronizarComAviso(admin, aviso, () => sincronizarLicenca(deps, { forcar: true, intervaloMinimoMs: 60_000 }))
    }
    const s = await situacaoDaLicenca(admin)
    return json({ ok: true, situacao: s })
  } catch {
    // Sem detalhes: nunca devolver segredo, cabeçalho ou resposta da central.
    return json({ ok: false, error: 'licenca_indisponivel' }, 503)
  }
})
