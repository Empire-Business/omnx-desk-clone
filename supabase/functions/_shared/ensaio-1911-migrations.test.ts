import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contrato estático das três migrações do ensaio real de 19/11/2026 (D3, D4 e o aviso
// da licença). Não executa SQL: o comportamento é provado no banco do ensaio
// (supabase/tests/banco-do-zero: verificar-primeiro-acesso, verificar-superadmin,
// verificar-licenca-aviso e corrida-primeiro-acesso).
const ler = (nome: string) => readFileSync(new URL(`../../migrations/${nome}`, import.meta.url), 'utf8')
const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '')

const servidor = ler('20261119150000_cadastro_papel_empresa_so_do_servidor.sql')
const licenca = ler('20261109130000_htai_licenca_instalacao.sql')
const primeiroAcesso = ler('20261119180000_desk_primeiro_acesso.sql')
const superadmin = ler('20261119180100_superadmin_pela_regra_do_is_admin.sql')
const aviso = ler('20261119180200_licenca_aviso_por_motivo.sql')

function bloco(sql: string, inicio: string, fim: string) {
  const i = sql.indexOf(inicio)
  const j = sql.indexOf(fim, i)
  expect(i, inicio).toBeGreaterThanOrEqual(0)
  expect(j, fim).toBeGreaterThan(i)
  return sql.slice(i, j + fim.length)
}
const handleNewUser = (sql: string) => bloco(sql, 'CREATE OR REPLACE FUNCTION public.handle_new_user()', 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;')
const rpcsLivres = (sql: string) => [...bloco(sql, 'FUNCTION public.htai_licenca_rpcs_livres()', ']::text[]').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

// As duas migrações de 19/11 que montam função por banco (20261119180100 e 20261119180200)
// escrevem o corpo dentro de um DO, em `EXECUTE format($sql$ … AS $fn$ … $fn$; $sql$, …)`.
// Por isso o corpo é recortado com qualquer marca de dólar e o recuo que o EXECUTE
// acrescenta é descontado antes de comparar com a migração de origem.
const corpo = (sql: string, nome: string) =>
  sql.match(new RegExp(`FUNCTION public\\.${nome}\\(\\)[^]*?AS \\$(\\w*)\\$([^]*?)\\$\\1\\$;`))?.[2] ?? ''

function desindentar(sql: string) {
  const linhas = sql.split('\n')
  const recuos = linhas.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)?.[0].length ?? 0)
  const recuo = Math.min(...recuos)
  return linhas.map((l) => l.slice(Math.min(recuo, l.match(/^ */)?.[0].length ?? 0))).join('\n')
}

// Recorta a função do começo da linha (o recuo faz parte do recorte, para o desindentar valer).
function funcaoInteira(sql: string, assinatura: string) {
  const i = sql.indexOf(assinatura)
  expect(i, assinatura).toBeGreaterThanOrEqual(0)
  const j = sql.indexOf('$fn$;', i)
  expect(j, '$fn$;').toBeGreaterThan(i)
  return sql.slice(sql.lastIndexOf('\n', i) + 1, j + '$fn$;'.length)
}
const situacao = (sql: string) => funcaoInteira(sql, 'CREATE OR REPLACE FUNCTION public.htai_licenca_situacao()')

describe('D3: primeiro acesso (20261119180000)', () => {
  it('a função anônima devolve só um booleano, sem parâmetro, e só lê', () => {
    const f = bloco(primeiroAcesso, 'CREATE OR REPLACE FUNCTION public.desk_primeiro_acesso_aberto()', '$fn$;')
    expect(f).toContain('RETURNS boolean')
    expect(f).toContain('STABLE')
    expect(f).toContain('SECURITY DEFINER')
    expect(f).toContain('SET search_path = public, pg_temp')
    expect(semComentarios(f)).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i)
    expect(primeiroAcesso).toContain('REVOKE ALL ON FUNCTION public.desk_primeiro_acesso_aberto() FROM PUBLIC;')
    expect(primeiroAcesso).toContain('GRANT EXECUTE ON FUNCTION public.desk_primeiro_acesso_aberto() TO anon, authenticated, service_role;')
  })

  it('handle_new_user é a versão de 20261119150000 com só dois ajustes: a decisão da primeira conta (#48) e a marca do gatilho adiado (#57)', () => {
    const velho = handleNewUser(servidor)
    const novo = handleNewUser(primeiroAcesso)

    // #48: a decisão da primeira conta vem da função da tela, com a trava consultiva.
    const antigo = "  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;\n"
    expect(velho).toContain(antigo)
    const trecho = novo.slice(novo.indexOf('  -- Mesma regra da tela de entrada'), novo.indexOf('  END IF;\n', novo.indexOf('pg_advisory_xact_lock')) + '  END IF;\n'.length)
    expect(trecho).toContain('v_has_admin := NOT public.desk_primeiro_acesso_aberto();')
    expect(trecho.match(/desk_primeiro_acesso_aberto\(\)/g)).toHaveLength(2) // antes e depois da trava
    expect(trecho).toContain("PERFORM pg_advisory_xact_lock(hashtextextended('omnx-desk:primeiro-acesso', 0));")

    // #57: o RETURNING guarda em v_gravado e a marca é somada fora dele — UPDATE sem linha
    // não devolve linha e zeraria a marca, e com a marca nula o gatilho adiado apaga a empresa.
    const declaracao = '  v_gravado     JSONB;\n'
    expect(novo).toContain(declaracao)
    const inicioMarca = novo.indexOf("    RETURNING jsonb_build_object('name_gravado'")
    const fimMarca = novo.indexOf("COALESCE(v_gravado, '{}'::jsonb);\n", inicioMarca) + "COALESCE(v_gravado, '{}'::jsonb);\n".length
    expect(inicioMarca).toBeGreaterThan(0)
    const marca = novo.slice(inicioMarca, fimMarca)
    expect(marca).toContain('INTO v_gravado;')
    // O RETURNING guarda só o que ficou gravado: nada de somar a marca dentro dele.
    const returning = marca.slice(0, marca.indexOf('INTO v_gravado;') + 'INTO v_gravado;'.length)
    expect(returning).not.toContain('||')
    expect(marca).toContain("v_renomeou := COALESCE(v_renomeou, '{}'::jsonb) || COALESCE(v_gravado, '{}'::jsonb);")

    // Desfeitos os dois ajustes, o texto tem que bater byte a byte com o de 20261119150000.
    const marcaAntiga = "    RETURNING v_renomeou || jsonb_build_object('name_gravado', name, 'slug_gravado', slug)\n         INTO v_renomeou;\n"
    expect(velho).toContain(marcaAntiga)
    expect(novo.replace(trecho, antigo).replace(declaracao, '').replace(marca, marcaAntiga)).toBe(velho)
  })

  it('a lista de RPCs livres com a licença negada só ganha a pergunta da tela de entrada', () => {
    const antes = rpcsLivres(licenca)
    const depois = rpcsLivres(primeiroAcesso)
    expect(antes).toHaveLength(19)
    expect(depois).toEqual([...antes, 'desk_primeiro_acesso_aberto'])
  })
})

describe('D4: superadmin pela régua do is_admin (20261119180100)', () => {
  it.each(['is_master_admin', 'desk_mfa_situacao'])('%s decide só por users.perfil', (nome) => {
    const f = corpo(superadmin, nome)
    expect(f).toContain("u.perfil = 'admin'")
    expect(f).not.toContain('user_roles')
    expect(f).not.toContain('ur.role')
    expect(f).toContain('p.tenant_id = public.get_user_tenant_id()')
  })

  it.each(['is_master_admin', 'desk_mfa_situacao'])('%s não chama a licença no corpo (o SaaS não tem a função, e o CREATE confere o corpo)', (nome) => {
    const f = corpo(superadmin, nome)
    expect(f).toContain('%s') // o trecho do segundo fator entra por format, depois do CREATE
    expect(f).not.toContain('htai_licenca')
    expect(superadmin).toContain("to_regprocedure('public.htai_licenca_escopo_instalacao()') IS NOT NULL")
    expect(superadmin).toContain('EXECUTE format($sql$')
  })

  it('o segundo fator continua exigido no app instalado, e só lá', () => {
    // Com a licença: o trecho que entra no corpo e a exigência que a situação devolve.
    expect(superadmin).toContain("  AND (NOT public.htai_licenca_escopo_instalacao()\n       OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2')")
    expect(superadmin).toContain("v_exigida := 'public.htai_licenca_escopo_instalacao()';")
    // Sem ela (SaaS): os dois ficam no padrão, sem trecho e sem exigência.
    expect(superadmin).toContain("v_gate text := '';")
    expect(superadmin).toContain("v_exigida text := 'false';")
    // O trecho entra no ponto certo dos dois corpos.
    expect(corpo(superadmin, 'is_master_admin')).toContain("AND u.perfil = 'admin')%s")
    expect(corpo(superadmin, 'desk_mfa_situacao')).toContain('%s AS exigida')
    expect(corpo(superadmin, 'desk_mfa_situacao')).toContain("'pendente', exigida AND superadmin AND aal <> 'aal2'")
  })

  it('não mexe em dados, políticas nem permissões — só no EXECUTE da desk_mfa_situacao()', () => {
    // Desde a 20261120140000 a 180100 repete o fecho de ACL da 20261109140000, porque o
    // CREATE OR REPLACE não mexe em ACL e no SaaS aquela migração não roda (sem licença HTAI).
    const semAcl = semComentarios(superadmin)
      .replace(
        /EXECUTE 'REVOKE ALL ON FUNCTION public\.desk_mfa_situacao\(\) FROM PUBLIC, anon';/g,
        '',
      )
      .replace(
        /EXECUTE 'GRANT EXECUTE ON FUNCTION public\.desk_mfa_situacao\(\) TO authenticated, service_role';/g,
        '',
      )
    expect(semAcl).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|GRANT|REVOKE|CREATE POLICY)\b/i)
    expect(superadmin).toContain(
      'REVOKE ALL ON FUNCTION public.desk_mfa_situacao() FROM PUBLIC, anon',
    )
    expect(superadmin).toContain(
      'GRANT EXECUTE ON FUNCTION public.desk_mfa_situacao() TO authenticated, service_role',
    )
  })
})

describe('aviso da licença por motivo (20261119180200)', () => {
  it('só muda o texto: a decisão é a mesma de 20261109130000', () => {
    const tirarMensagem = (sql: string) => desindentar(situacao(sql)).replace(/'mensagem', CASE[^]*?END,/, "'mensagem', <texto>,")
    expect(tirarMensagem(aviso)).toBe(tirarMensagem(licenca))
  })

  it('não mexe em dados, políticas nem permissões', () => {
    expect(semComentarios(aviso)).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|GRANT|REVOKE|CREATE POLICY)\b/i)
  })
})
