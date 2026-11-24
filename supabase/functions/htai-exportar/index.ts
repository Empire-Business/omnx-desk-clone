// Exportar todos os dados da empresa (JSON). Sempre aberta, mesmo com a licença
// negada (contrato da licença §4). Só administrador ativo da própria empresa.
//
// Autorização: JWT da pessoa (verify_jwt = false no config.toml; a função confere
// sozinha). A empresa vem de get_user_tenant_id() com o token da pessoa, que já
// exige conta ativa e sessão válida; is_admin() decide se pode exportar.
// A leitura usa a service_role (não passa pelas travas de leitura da licença),
// sempre filtrada por tenant_id da empresa da pessoa.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gerarExportacao, nomeDoArquivo, streamDaExportacao, type TabelaExportavel } from './exportar.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: u, error: eU } = await userClient.auth.getUser()
  if (eU || !u?.user) return json({ error: 'unauthorized' }, 401)

  const [{ data: tenantId, error: eT }, { data: admin, error: eA }] = await Promise.all([
    userClient.rpc('get_user_tenant_id'),
    userClient.rpc('is_admin'),
  ])
  if (eT || eA) return json({ error: 'indisponivel' }, 503)
  if (typeof tenantId !== 'string' || !tenantId) return json({ error: 'unauthorized' }, 401)
  if (admin !== true) return json({ error: 'forbidden', mensagem: 'Só a administração da empresa exporta os dados.' }, 403)

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const agora = new Date()
  const gerador = gerarExportacao({
    empresaId: tenantId,
    agora: () => agora,
    async tabelas() {
      const { data, error } = await service.rpc('htai_exportar_tabelas')
      if (error) throw new Error('lista_indisponivel')
      return (data ?? []) as TabelaExportavel[]
    },
    async pagina(t, de, ate) {
      let q = service.from(t.tabela).select('*').eq('tenant_id', tenantId)
      if (t.ordem) q = q.order(t.ordem, { ascending: true })
      const { data, error } = await q.range(de, ate)
      if (error) throw new Error('tabela_indisponivel')
      return (data ?? []) as Record<string, unknown>[]
    },
  })

  console.log(`[htai-exportar] empresa ${tenantId} por ${u.user.id}`)
  return new Response(streamDaExportacao(gerador), {
    status: 200,
    headers: {
      ...corsHeaders,
      // octet-stream: o supabase-js entrega um Blob pronto para baixar.
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nomeDoArquivo(agora)}"`,
      'Cache-Control': 'no-store',
    },
  })
})
