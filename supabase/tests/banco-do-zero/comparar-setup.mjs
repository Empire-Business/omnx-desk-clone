#!/usr/bin/env node
// Compara dois bancos objeto a objeto, para provar que o SETUP_COMPLETE.sql gera o
// mesmo schema (e as mesmas permissões) do banco montado pelas migrações.
//
// Uso:
//   node supabase/tests/banco-do-zero/comparar-setup.mjs <url-das-migracoes> <url-do-arquivo>
//
// Sai com 0 quando os dois bancos são iguais e 1 quando há diferença, listando o que
// difere. Cobre o que já escapou uma vez e não pode escapar de novo:
//   · reloptions de view (security_invoker=true: sem ela, como anon, users_legacy
//     devolveria nome e e-mail de todo mundo);
//   · REPLICA IDENTITY das tabelas (o Realtime manda a linha inteira com FULL);
//   · OWNED BY das sequences (sem dono, a sequence fica órfã e o DROP TABLE não a leva);
//   · ACL de view, tabela e sequence (o default do Supabase libera anon, e uma
//     migration que revoga precisa valer no arquivo também).
import pg from 'pg'

const SCHEMAS = ['public', 'private']
const [primeiro, segundo] = process.argv.slice(2)
if (!primeiro || !segundo) {
  console.error('uso: node comparar-setup.mjs <url-banco-1> <url-banco-2>')
  process.exit(2)
}

const umaLinha = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

async function canonico(url) {
  const cliente = new pg.Client({ connectionString: url })
  await cliente.connect()
  const q = async (sql, params = []) => (await cliente.query(sql, params)).rows
  const linhas = []
  const add = (tipo, nome, valor = '') => linhas.push(`${tipo} ${nome}${valor ? ' :: ' + umaLinha(valor) : ''}`)

  for (const r of await q('select nspname from pg_namespace where nspname = any($1) order by 1', [SCHEMAS])) {
    add('schema', r.nspname)
  }

  for (const r of await q('select e.extname, n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1')) {
    add('extensao', r.extname, r.schema)
  }

  for (const r of await q(`
    select t.typname, t.typtype, string_agg(e.enumlabel, ',' order by e.enumsortorder) as valores
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    left join pg_enum e on e.enumtypid = t.oid
    where n.nspname = any($1) and t.typtype in ('e', 'd')
    group by 1, 2 order by 1`, [SCHEMAS])) {
    add(`tipo ${r.typtype}`, r.typname, r.valores || '')
  }

  for (const r of await q(`
    select c.relkind, n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm', 'S')
    order by 1, 2, 3`, [SCHEMAS])) {
    const tipo = { r: 'tabela', p: 'tabela particionada', v: 'view', m: 'view materializada', S: 'sequence' }[r.relkind]
    add(tipo, `${r.nspname}.${r.relname}`)
  }

  for (const r of await q(`
    select n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod) as tipo,
           a.attnotnull, a.attidentity, a.attgenerated,
           pg_get_expr(d.adbin, d.adrelid) as padrao
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = any($1) and c.relkind in ('r', 'p')
    order by 1, 2, a.attnum`, [SCHEMAS])) {
    const extras = [
      r.attnotnull ? 'not null' : '',
      r.padrao ? `default ${r.padrao}` : '',
      r.attidentity ? `identity ${r.attidentity}` : '',
      r.attgenerated ? `generated ${r.attgenerated}` : '',
    ].filter(Boolean).join(' ')
    add('coluna', `${r.nspname}.${r.relname}.${r.attname}`, `${r.tipo} ${extras}`)
  }

  for (const r of await q(`
    select n.nspname, coalesce(c.relname, t.typname) as nome, con.conname, con.contype,
           pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
    left join pg_class c on c.oid = con.conrelid
    left join pg_type t on t.oid = con.contypid
    where n.nspname = any($1)
    order by 1, 2, 3`, [SCHEMAS])) {
    add(`constraint ${r.contype}`, `${r.nspname}.${r.nome}.${r.conname}`, r.def)
  }

  for (const r of await q(`
    select i.schemaname, i.indexname, i.indexdef
    from pg_indexes i where i.schemaname = any($1) order by 1, 2`, [SCHEMAS])) {
    add('indice', `${r.schemaname}.${r.indexname}`, r.indexdef)
  }

  for (const r of await q(`
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
           pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = any($1) order by 1, 2, 3`, [SCHEMAS])) {
    add('funcao', `${r.nspname}.${r.proname}(${r.args})`, r.def)
  }

  // reloptions: é aqui que mora o security_invoker=true das views.
  for (const r of await q(`
    select n.nspname, c.relname, c.relkind, array_to_string(c.reloptions, ',') as opcoes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and c.relkind in ('v', 'm') and c.reloptions is not null
    order by 1, 2`, [SCHEMAS])) {
    add('reloptions', `${r.nspname}.${r.relname}`, r.opcoes)
  }

  // REPLICA IDENTITY: f = FULL, n = NOTHING, i = índice; d é o padrão e não entra.
  for (const r of await q(`
    select n.nspname, c.relname, c.relreplident,
           (select ci.relname from pg_index x join pg_class ci on ci.oid = x.indexrelid
             where x.indrelid = c.oid and x.indisreplident) as indice
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and c.relkind in ('r', 'p') and c.relreplident <> 'd'
    order by 1, 2`, [SCHEMAS])) {
    const ident = { f: 'FULL', n: 'NOTHING', i: `USING INDEX ${r.indice}` }[r.relreplident] || r.relreplident
    add('replica identity', `${r.nspname}.${r.relname}`, ident)
  }

  // OWNED BY da sequence (deptype 'a' em pg_depend).
  for (const r of await q(`
    select sn.nspname as seq_schema, s.relname as seq,
           tn.nspname as tab_schema, t.relname as tab, a.attname as col
    from pg_class s
    join pg_namespace sn on sn.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass
                    and d.refclassid = 'pg_class'::regclass and d.deptype = 'a'
    join pg_class t on t.oid = d.refobjid
    join pg_namespace tn on tn.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S' and sn.nspname = any($1)
    order by 1, 2`, [SCHEMAS])) {
    add('dono da sequence', `${r.seq_schema}.${r.seq}`, `${r.tab_schema}.${r.tab}.${r.col}`)
  }

  for (const r of await q(`
    select n.nspname, c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and c.relkind in ('r', 'p') and c.relrowsecurity
    order by 1, 2`, [SCHEMAS])) {
    add('rls ligada', `${r.nspname}.${r.relname}`)
  }

  for (const r of await q(`
    select n.nspname, c.relname, pg_get_triggerdef(t.oid) as def, t.tgenabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and not t.tgisinternal
    order by 1, 2, 3`, [SCHEMAS])) {
    add('gatilho', `${r.nspname}.${r.relname}.${r.def.slice(0, 60)}`, `${r.def} enabled=${r.tgenabled}`)
  }

  for (const r of await q(`
    select schemaname, tablename, policyname, permissive, roles::text as roles, cmd,
           qual, with_check
    from pg_policies where schemaname = any($1)
    order by 1, 2, 3`, [SCHEMAS])) {
    add('politica', `${r.schemaname}.${r.tablename}.${r.policyname}`,
      `${r.permissive} ${r.cmd} roles=${r.roles} using=${r.qual ?? ''} check=${r.with_check ?? ''}`)
  }

  // ACL de relação: tabelas, views, materializadas e sequences.
  for (const r of await q(`
    select n.nspname, c.relname, c.relkind,
           case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel,
           a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm', 'S')
    order by 1, 2, 4, 5`, [SCHEMAS])) {
    add(`acl ${r.relkind} ${r.papel}`, `${r.nspname}.${r.relname}`, r.privilege_type)
  }

  // ACL por coluna: é o GRANT INSERT (coluna) que deixa escrever onde o grant de
  // tabela só tem rd.
  for (const r of await q(`
    select n.nspname, c.relname, a.attname,
           case when g.grantee = 0 then 'PUBLIC' else g.grantee::regrole::text end as papel,
           g.privilege_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) g
    where a.attacl is not null and a.attnum > 0 and not a.attisdropped
      and n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm')
    order by 1, 2, 3, 4, 5`, [SCHEMAS])) {
    add(`acl coluna ${r.papel}`, `${r.nspname}.${r.relname}.${r.attname}`, r.privilege_type)
  }

  // ACL de função: o default do Supabase libera anon, e as migrações revogam.
  for (const r of await q(`
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
           case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel,
           a.privilege_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = any($1)
    order by 1, 2, 3, 4, 5`, [SCHEMAS])) {
    add(`acl funcao ${r.papel}`, `${r.nspname}.${r.proname}(${r.args})`, r.privilege_type)
  }

  await cliente.end()
  return linhas.sort()
}

const contar = (linhas) => {
  const mapa = new Map()
  for (const l of linhas) mapa.set(l, (mapa.get(l) ?? 0) + 1)
  return mapa
}

const migracoes = contar(await canonico(primeiro))
const arquivo = contar(await canonico(segundo))

const falta = []   // existe nas migrações, não no arquivo
const sobra = []   // existe no arquivo, não nas migrações
for (const [linha, n] of migracoes) {
  const m = arquivo.get(linha) ?? 0
  for (let i = m; i < n; i++) falta.push(linha)
}
for (const [linha, n] of arquivo) {
  const m = migracoes.get(linha) ?? 0
  for (let i = m; i < n; i++) sobra.push(linha)
}

// Diferença só de parênteses: o BETWEEN da migração é impresso com um par de
// parênteses a mais que a mesma expressão reescrita como >= e <=. Sem isso o diff
// acusa 5 CHECK que valem a mesma coisa.
const chaveDe = (l) => (l.includes(' :: ') ? l.slice(0, l.indexOf(' :: ')) : l)
const valorDe = (l) => (l.includes(' :: ') ? l.slice(l.indexOf(' :: ') + 4) : '')
const semParens = (v) => v.replace(/[\s()]/g, '')
const soParens = []
for (const f of [...falta]) {
  if (!chaveDe(f).startsWith('constraint c ')) continue
  const i = sobra.findIndex((s) => chaveDe(s) === chaveDe(f) && semParens(valorDe(s)) === semParens(valorDe(f)))
  if (i < 0) continue
  soParens.push([f, sobra[i]])
  falta.splice(falta.indexOf(f), 1)
  sobra.splice(i, 1)
}

const total = [...migracoes.values()].reduce((a, b) => a + b, 0)
const corta = (s) => (s.length > 400 ? s.slice(0, 400) + '…' : s)

if (soParens.length) {
  console.log(`só parênteses (a expressão é a mesma, BETWEEN vira >= e <=): ${soParens.length}`)
  for (const [f] of soParens) console.log('  ' + corta(chaveDe(f)))
}

if (!falta.length && !sobra.length) {
  console.log(`ok: ${total} objetos canônicos iguais nos dois bancos`)
  process.exit(0)
}

console.log(`${total} objetos canônicos nas migrações; ${falta.length} faltam no arquivo e ${sobra.length} sobram`)
for (const l of falta.slice(0, 40)) console.log('  falta: ' + corta(l))
for (const l of sobra.slice(0, 40)) console.log('  sobra: ' + corta(l))
if (falta.length + sobra.length > 80) console.log(`  … e mais ${falta.length + sobra.length - 80}`)
process.exit(1)
