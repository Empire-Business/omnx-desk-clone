import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_URL_PADRAO } from './wa-mensagem.ts'
import { hostDe, limparCacheUrlUazapi, tokenUazapi, tokenUazapiComFonte, urlUazapi } from './uazapi-credenciais.ts'

interface Cenario {
  cofreNumero?: string | null
  cofreEmpresa?: string | null
  principal?: string | null
  tenantDoNumero?: string | null
  baseEmpresa?: string | null
  appSettings?: string | null
  rpcFalha?: boolean
}

function falso(c: Cenario) {
  const chamadas: { rpc: string[]; filtros: Record<string, Record<string, unknown>> } = { rpc: [], filtros: {} }
  const admin = {
    rpc: async (nome: string) => {
      chamadas.rpc.push(nome)
      if (c.rpcFalha) return { data: null, error: { message: 'function does not exist' } }
      if (nome === 'uazapi_token_do_numero') return { data: c.cofreNumero ?? null, error: null }
      if (nome === 'get_omnx_bridge_credential_tenant') return { data: c.cofreEmpresa ? [{ secret: c.cofreEmpresa }] : [], error: null }
      return { data: null, error: null }
    },
    from(tabela: string) {
      const filtros: Record<string, unknown> = {}
      chamadas.filtros[tabela] = filtros
      const linha = () => {
        if (tabela === 'whatsapp_instances') return { tenant_id: c.tenantDoNumero ?? null }
        if (tabela === 'wa_auto_config') return { uazapi_instance_id: c.principal ?? null }
        if (tabela === 'tenant_integracoes') return c.baseEmpresa ? { base_url: c.baseEmpresa } : null
        return null
      }
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filtros[k] = v; return q },
        maybeSingle: async () => ({ data: linha(), error: null }),
        limit: async () => ({ data: tabela === 'app_settings' && c.appSettings ? [{ valor: c.appSettings }] : [], error: null }),
      }
      return q
    },
  }
  return { admin: admin as never, chamadas }
}

const env = (vars: Record<string, string>) => (n: string) => vars[n]

describe('tokenUazapi — ordem de busca', () => {
  it('1º cofre do número', async () => {
    const { admin } = falso({ cofreNumero: 'tok-numero', cofreEmpresa: 'tok-empresa', principal: 'num' })
    expect(await tokenUazapiComFonte(admin, 'num', 't1', env({ UAZAPI_TOKEN_num: 'tok-env' }))).toEqual({ token: 'tok-numero', fonte: 'cofre_numero' })
  })

  it('2º cofre da empresa, só se o número for o principal', async () => {
    const principal = falso({ cofreEmpresa: 'tok-empresa', principal: 'num' })
    expect(await tokenUazapiComFonte(principal.admin, 'num', 't1', env({ UAZAPI_TOKEN_num: 'tok-env' }))).toEqual({ token: 'tok-empresa', fonte: 'cofre_empresa' })
    const outro = falso({ cofreEmpresa: 'tok-empresa', principal: 'outro' })
    expect(await tokenUazapiComFonte(outro.admin, 'num', 't1', env({ UAZAPI_TOKEN_num: 'tok-env' }))).toEqual({ token: 'tok-env', fonte: 'env_instancia' })
  })

  it('3º segredo legado UAZAPI_TOKEN_<id> (produção sem nada no cofre e sem a migração)', async () => {
    const { admin } = falso({ rpcFalha: true })
    expect(await tokenUazapi(admin, 'Suporte4', 't1', env({ UAZAPI_TOKEN_Suporte4: 'tok-env' }))).toBe('tok-env')
  })

  it('descobre a empresa do número quando a função não sabe', async () => {
    const { admin, chamadas } = falso({ cofreEmpresa: 'tok-empresa', principal: 'num', tenantDoNumero: 't7' })
    expect(await tokenUazapi(admin, 'num', null, env({}))).toBe('tok-empresa')
    expect(chamadas.filtros.wa_auto_config).toMatchObject({ tenant_id: 't7' })
  })

  it('id de instância inválido não consulta nada', async () => {
    const { admin, chamadas } = falso({ cofreNumero: 'x' })
    expect(await tokenUazapi(admin, '../etc', 't1', env({ 'UAZAPI_TOKEN_../etc': 'y' }))).toBeNull()
    expect(chamadas.rpc).toHaveLength(0)
  })

  it('sem token em lugar nenhum = null', async () => {
    const { admin } = falso({})
    expect(await tokenUazapi(admin, 'num', 't1', env({}))).toBeNull()
  })
})

describe('urlUazapi — ordem de busca', () => {
  beforeEach(() => limparCacheUrlUazapi())

  it('1º endereço salvo na aba Conexão da empresa', async () => {
    const { admin } = falso({ baseEmpresa: 'https://empresa.uazapi.com/', appSettings: 'https://admin.uazapi.com' })
    expect(await urlUazapi(admin, 't1', env({ UAZAPI_URL: 'https://env.uazapi.com' }))).toBe('https://empresa.uazapi.com')
  })

  it('2º segredo UAZAPI_URL', async () => {
    const { admin } = falso({ appSettings: 'https://admin.uazapi.com' })
    expect(await urlUazapi(admin, 't1', env({ UAZAPI_URL: 'https://env.uazapi.com' }))).toBe('https://env.uazapi.com')
  })

  it('3º Admin > Integrações (app_settings da empresa)', async () => {
    const { admin, chamadas } = falso({ appSettings: 'https://admin.uazapi.com' })
    expect(await urlUazapi(admin, 't1', env({}))).toBe('https://admin.uazapi.com')
    expect(chamadas.filtros.app_settings).toMatchObject({ chave: 'uazapi_server_url', tenant_id: 't1' })
  })

  it('4º padrão legado', async () => {
    const { admin } = falso({})
    expect(await urlUazapi(admin, 't1', env({}))).toBe(BASE_URL_PADRAO.uazapi)
  })

  it('ignora endereço fora da allowlist (SSRF) e segue para o próximo', async () => {
    const { admin } = falso({ baseEmpresa: 'https://evil.example.com', appSettings: 'http://x.uazapi.com' })
    expect(await urlUazapi(admin, 't1', env({ UAZAPI_URL: 'https://uazapi.com.evil.com' }))).toBe(BASE_URL_PADRAO.uazapi)
  })

  it('hostDe', () => {
    expect(hostDe('https://Cliente.uazapi.com/x')).toBe('cliente.uazapi.com')
    expect(hostDe('nada')).toBe('')
  })
})

describe('nenhuma função lê o token ou o endereço da UAZAPI por fora do helper', () => {
  const raiz = fileURLToPath(new URL('..', import.meta.url))
  const arquivos: string[] = []
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (statSync(p).isDirectory()) { if (!['_tests', 'fixtures'].includes(nome)) andar(p) }
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) arquivos.push(p)
    }
  }
  andar(raiz)

  it.each(arquivos.map((a) => [a.slice(raiz.length)]))('%s', (rel) => {
    const fonte = readFileSync(join(raiz, rel), 'utf8')
    if (!rel.endsWith('uazapi-credenciais.ts')) expect(fonte).not.toMatch(/env\.get\(`UAZAPI_TOKEN_/)
    if (!rel.endsWith('wa-mensagem.ts')) expect(fonte).not.toContain("'https://empirebusiness.uazapi.com'")
  })
})

describe('números de cobrança usam o mesmo caminho (cofre do número primeiro)', () => {
  const raiz = fileURLToPath(new URL('../..', import.meta.url))
  it('cobranca-scheduler lê token e endereço só pelo helper', () => {
    const fonte = readFileSync(join(raiz, 'functions/cobranca-scheduler/index.ts'), 'utf8')
    expect(fonte).toContain("from '../_shared/uazapi-credenciais.ts'")
    expect(fonte).toMatch(/tokenUazapi\(supabase, instance\.instance_id, instance\.tenant_id\)/)
    expect(fonte).toMatch(/urlUazapi\(supabase, instance\.tenant_id\)/)
    expect(fonte).not.toMatch(/(env\.get|Deno\.env)[^\n]*UAZAPI_(TOKEN|URL)/)
  })

  it('a RPC do cofre procura também os números de cobrança, depois os do Chat', () => {
    const sql = readFileSync(join(raiz, 'migrations/20261109121000_uazapi_token_numero_de_cobranca_no_cofre.sql'), 'utf8')
    const rpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.uazapi_token_do_numero'))
    expect(rpc.indexOf('whatsapp_instance_tokens')).toBeGreaterThan(-1)
    expect(rpc.indexOf('cobranca_instance_tokens')).toBeGreaterThan(rpc.indexOf('whatsapp_instance_tokens'))
    expect(rpc).toMatch(/ORDER BY x\.ordem/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.uazapi_token_do_numero\(text, uuid\) TO service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.uazapi_token_do_numero\(text, uuid\) FROM PUBLIC, anon, authenticated/)
  })
})
