#!/usr/bin/env node
// Corrida do primeiro acesso (D3 do ensaio real de 19/11/2026, migração 20261119180000):
// duas pessoas criam conta ao mesmo tempo num app recém-instalado. Só uma pode virar a
// primeira administradora, e o nome da empresa é o dela.
//
// Precisa de duas conexões ao mesmo tempo, por isso não cabe num verificar-*.sql.
// Usa como modelo o banco do ensaio (rode antes: ensaiar.mjs), copia para um banco
// novo, abre duas sessões psql e apaga a cópia no fim.
//
// Uso:
//   node supabase/tests/banco-do-zero/corrida-primeiro-acesso.mjs [--banco ensaio_desk]
// Conexão pelas variáveis padrão do psql (PGHOST, PGPORT, PGUSER, PGPASSWORD).
//
// A sessão A cria a conta e segura a transação aberta por 2 s; a B cria a dela
// 0,5 s depois. Sem a trava do handle_new_user, as duas viravam administradoras
// e a B trocava o nome da empresa (conferido na main de 19/11/2026). Com a trava,
// a B espera a A e, como já há administradora e ela não tem papel e empresa do
// servidor, é recusada no COMMIT (20261119150000).

import { spawn, spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const i = args.indexOf('--banco')
const modelo = i >= 0 && args[i + 1] ? args[i + 1] : 'ensaio_desk'
if (!/^[a-z_][a-z0-9_]{0,40}$/.test(modelo)) {
  console.error('Nome de banco inválido.')
  process.exit(2)
}
const banco = `${modelo}_corrida`

function psqlSync(base, sql) {
  return spawnSync('psql', ['-X', '-q', '-At', '-d', base, '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
}
function psqlAsync(base, sql) {
  return new Promise((resolve) => {
    const p = spawn('psql', ['-X', '-q', '-d', base, '-v', 'ON_ERROR_STOP=1'])
    let erro = ''
    p.stderr.on('data', (d) => { erro += d })
    p.on('close', (status) => resolve({ status, erro }))
    p.stdin.end(sql)
  })
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const prep = psqlSync('postgres', `drop database if exists "${banco}" with (force);\ncreate database "${banco}" template "${modelo}";`)
if (prep.status !== 0) {
  console.error(`Não consegui copiar o banco ${modelo} (rode antes o ensaiar.mjs):\n${prep.stderr}`)
  process.exit(2)
}

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const cadastro = (id, email, empresa, pausa) => `BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('${id}', '${email}', '{"nome":"${empresa}","empresa":"${empresa}"}');
${pausa ? `SELECT pg_sleep(${pausa});` : ''}
COMMIT;`

let falhou = false
try {
  const sessaoA = psqlAsync(banco, cadastro(A, 'a@exemplo.com', 'Empresa A', 2))
  await esperar(500)
  const sessaoB = psqlAsync(banco, cadastro(B, 'b@exemplo.com', 'Empresa B', 0))
  const [ra, rb] = await Promise.all([sessaoA, sessaoB])
  if (ra.status !== 0) throw new Error(`cadastro da A falhou: ${ra.erro}`)
  const bRecusada = rb.status !== 0 && rb.erro.includes('Cadastro recusado')
  if (rb.status !== 0 && !bRecusada) throw new Error(`cadastro da B falhou por outro motivo: ${rb.erro}`)

  const r = psqlSync(banco, `
    select count(*) filter (where u.perfil = 'admin') || '|' ||
           count(*) filter (where ur.role = 'admin') || '|' ||
           coalesce(max(u.perfil) filter (where u.id = '${A}'), '-') || '|' ||
           coalesce(max(u.perfil) filter (where u.id = '${B}'), '-') || '|' ||
           (select count(*) from auth.users where id = '${B}') || '|' ||
           (select string_agg(name, ',') from public.tenants) || '|' ||
           (select count(*) from public.tenants)
      from public.users u join public.user_roles ur on ur.user_id = u.id;`)
  if (r.status !== 0) throw new Error(r.stderr)
  const [admins, papeisAdmin, perfilA, perfilB, contaB, nomes, empresas] = r.stdout.trim().split('|')
  const casos = [
    [admins === '1', `uma administradora só (achou ${admins})`],
    [papeisAdmin === '1', `um papel admin só (achou ${papeisAdmin})`],
    [perfilA === 'admin', `quem chegou primeiro é a administradora (A = ${perfilA})`],
    [bRecusada && perfilB === '-' && contaB === '0', `quem chegou depois foi recusada, sem sobrar conta (B = ${perfilB}, contas ${contaB})`],
    [nomes === 'Empresa A', `o nome da empresa é o de quem chegou primeiro (${nomes})`],
    [empresas === '1', `nenhuma empresa a mais (${empresas})`],
  ]
  // Com administradora (o caso da produção da empresa): o cadastro feito pelas funções
  // (admin-create-user, provision-tenant: papel e empresa no app_metadata, gravado pelo
  // Supabase logo depois do INSERT) segue igual e não pede a trava do primeiro acesso.
  const equipe = psqlSync(banco, `BEGIN;
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES ('cccccccc-0000-4000-8000-00000000000c', 'equipe@exemplo.com',
            '{"nome":"Equipe","perfil":"estrategista","tenant_id":"00000000-0000-0000-0000-000000000001"}');
    UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"perfil":"estrategista","tenant_id":"00000000-0000-0000-0000-000000000001"}'
     WHERE id = 'cccccccc-0000-4000-8000-00000000000c';
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) || '|' ||
           (SELECT perfil FROM public.users WHERE id = 'cccccccc-0000-4000-8000-00000000000c') || '|' ||
           (SELECT role::text FROM public.user_roles WHERE user_id = 'cccccccc-0000-4000-8000-00000000000c');
    ROLLBACK;`)
  if (equipe.status !== 0) throw new Error(equipe.stderr)
  const [travas, perfilEquipe, papelEquipe] = equipe.stdout.trim().split('|')
  casos.push(
    [travas === '0', `com administradora, o cadastro não pede a trava (${travas})`],
    [perfilEquipe === 'estrategista' && papelEquipe === 'member', `cadastro pelas funções segue igual (${perfilEquipe}/${papelEquipe})`],
  )
  for (const [passou, texto] of casos) {
    console.log(`${passou ? 'ok' : 'FALHOU'} ${texto}`)
    if (!passou) falhou = true
  }
} catch (e) {
  console.log(`FALHOU ${e.message}`)
  falhou = true
} finally {
  psqlSync('postgres', `drop database if exists "${banco}" with (force);`)
}
console.log(falhou ? 'corrida-primeiro-acesso: falhou' : 'corrida-primeiro-acesso: todos os casos passaram')
process.exit(falhou ? 1 : 0)
