import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contrato estático da correção "papel e empresa só do servidor" (20261119150000).
// O comportamento é provado no banco do ensaio: supabase/tests/banco-do-zero/verificar-cadastro-servidor.sql.
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8')
const migracao = ler('../../migrations/20261119150000_cadastro_papel_empresa_so_do_servidor.sql')
const antiga = ler('../../migrations/20261109100000_instalacao_do_zero.sql')
const adminCreateUser = ler('../admin-create-user/index.ts')
const provisionTenant = ler('../provision-tenant/index.ts')

function corpo(sql: string, nome: string) {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`)
  expect(inicio, nome).toBeGreaterThanOrEqual(0)
  const abre = sql.indexOf('$function$', inicio)
  return sql.slice(abre, sql.indexOf('$function$;', abre + 1))
}
const semComentarios = (s: string) => s.replace(/--[^\n]*/g, '')

describe('handle_new_user não aceita papel nem empresa dos dados da pessoa', () => {
  it('nenhum gatilho lê perfil ou tenant_id de raw_user_meta_data', () => {
    for (const nome of ['handle_new_user', 'desk_conferir_conta_nova', 'desk_provisionar_conta']) {
      const f = semComentarios(corpo(migracao, nome))
      expect(f, nome).not.toMatch(/raw_user_meta_data\s*->>\s*'(perfil|tenant_id)'/)
      expect(f, nome).not.toMatch(/v_user\s*->>\s*'(perfil|tenant_id)'/)
    }
    // A versão anterior lia (é a brecha).
    expect(corpo(antiga, 'handle_new_user')).toContain("NEW.raw_user_meta_data->>'perfil'")
  })

  it('papel e empresa só de raw_app_meta_data, conferidos no fim da transação; sem eles, recusa', () => {
    const f = corpo(migracao, 'desk_conferir_conta_nova')
    expect(f).toContain("v_app->>'perfil'")
    expect(f).toContain("v_app->>'tenant_id'")
    expect(f).toContain('SELECT u.raw_app_meta_data, u.raw_user_meta_data, u.email')
    expect(f).toMatch(/RAISE EXCEPTION USING\s+ERRCODE = '42501'/)
    expect(migracao).toMatch(/CREATE CONSTRAINT TRIGGER desk_conta_nova_conferida\s+AFTER INSERT ON auth\.users\s+DEFERRABLE INITIALLY DEFERRED/)
  })

  it('o primeiro acesso continua: sem administradora, a primeira conta vira admin', () => {
    const f = corpo(migracao, 'handle_new_user')
    expect(f).toContain("SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;")
    expect(f).toContain("PERFORM public.desk_provisionar_conta(NEW.id, NEW.email, v_nome, 'admin', v_new_tenant);")
    expect(f).toContain("VALUES (NEW.id, v_nome, NEW.email, 'admin', v_new_tenant)")
  })

  it('o vínculo da conta mantém o mapa perfil → papel → cargo de antes', () => {
    const casoAntigo = corpo(antiga, 'handle_new_user').match(/CASE v_perfil[^]*?END CASE;/)?.[0]
    const casoNovo = corpo(migracao, 'desk_provisionar_conta').match(/CASE p_perfil[^]*?END CASE;/)?.[0]
    expect(casoAntigo).toBeTruthy()
    expect(casoNovo?.replace('CASE p_perfil', 'CASE v_perfil')).toBe(casoAntigo)
  })

  it('funções internas sem permissão para a API', () => {
    expect(migracao).toContain('REVOKE ALL ON FUNCTION public.desk_provisionar_conta(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;')
    expect(migracao).toContain('REVOKE ALL ON FUNCTION public.desk_conferir_conta_nova() FROM PUBLIC, anon, authenticated, service_role;')
    expect(migracao).toContain('REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;')
  })
})

describe('as funções mandam papel e empresa em app_metadata', () => {
  it('admin-create-user', () => {
    expect(adminCreateUser).toContain('app_metadata: { perfil: input.perfil, tenant_id: input.tenant_id },')
    // Durante a transição o user_metadata continua (o gatilho antigo lê dele).
    expect(adminCreateUser).toContain('user_metadata: { nome: input.nome, perfil: input.perfil, tenant_id: input.tenant_id },')
  })

  it('provision-tenant: dono e membro, e não responde sucesso sem a conta na empresa', () => {
    expect(provisionTenant).toContain("app_metadata: { perfil: 'admin', tenant_id: tenantId },")
    expect(provisionTenant).toContain("app_metadata: { perfil: 'atendimento', tenant_id: tenant.id },")
    expect(provisionTenant).toMatch(/if \(vinculoErr \|\| !vinculoDono\?\.length\)/)
    expect(provisionTenant).toMatch(/if \(profileErr \|\| !vinculoMembro\?\.length\)/)
    expect(provisionTenant.match(/admin\.auth\.admin\.createUser\(/g)).toHaveLength(2)
    expect(provisionTenant.match(/app_metadata:/g)).toHaveLength(2)
  })
})
