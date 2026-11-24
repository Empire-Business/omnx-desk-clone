#!/usr/bin/env node
// Ensaio do banco do zero: cria um banco vazio num Postgres local (17 recomendado),
// aplica a imitação do Supabase (stub-supabase.sql) e depois supabase/migrations/*.sql
// em ordem de nome, cada arquivo numa transação — do mesmo jeito que o instalador
// do HTAI faz pela API do Supabase. Falhou um arquivo = a instalação do zero pararia ali.
//
// Uso:
//   node supabase/tests/banco-do-zero/ensaiar.mjs [--banco ensaio_desk] [--continuar] [--verificar] [--sem-licenca]
// --verificar: depois das migrações, roda cada verificar-*.sql desta pasta (transação
// desfeita no fim; ASSERT por caso). Hoje: licença HTAI e segundo fator do superadmin.
// --sem-licenca: ensaio do banco no formato do SaaS da empresa, onde a licença HTAI não
// existe: pula as duas migrações que só existem no app instalado (20261109130000, que cria
// htai_licenca_*, e 20261109140000, que é a MFA do app instalado) e roda só os
// verificar-saas-*.sql. Serve para provar que as migrações novas instalam limpas nos dois.
// Conexão pelas variáveis padrão do psql (PGHOST, PGPORT, PGUSER, PGPASSWORD); o
// usuário precisa poder criar banco e papéis (superusuário local).
//
// As linhas `create extension ... pg_cron | pg_net | supabase_vault | pg_stat_statements`
// são puladas: o stub já cria os schemas e funções que as migrações usam.

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = resolve(aqui, '..', '..', '..')
const args = process.argv.slice(2)
const valor = (nome, padrao) => {
  const i = args.indexOf(nome)
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao
}
const banco = valor('--banco', 'ensaio_desk')
const continuar = args.includes('--continuar')
const semLicenca = args.includes('--sem-licenca')
const pasta = resolve(raiz, valor('--pasta', 'supabase/migrations'))

// Só existem no app instalado na conta do cliente. No SaaS da empresa a licença HTAI
// não existe (HTAI_ENTITLEMENTS_MODE off, nenhuma tabela htai_licencas).
const SO_NO_APP_INSTALADO = new Set([
  '20261109130000_htai_licenca_instalacao.sql',
  '20261109140000_superadmin_mfa_instalacao.sql',
])

if (!/^[a-z_][a-z0-9_]{0,40}$/.test(banco)) {
  console.error('Nome de banco inválido.')
  process.exit(2)
}

function psql(base, sql, extra = []) {
  return spawnSync('psql', ['-X', '-q', '-d', base, '-v', 'ON_ERROR_STOP=1', ...extra], {
    input: sql,
    encoding: 'utf8',
  })
}

const prep = psql('postgres', [
  `drop database if exists "${banco}" with (force);`,
  `create database "${banco}";`,
  `alter database "${banco}" set search_path = "$user", public, extensions;`,
].join('\n'))
if (prep.status !== 0) {
  console.error('Não consegui criar o banco de ensaio:\n' + prep.stderr)
  process.exit(2)
}

const stub = psql(banco, readFileSync(join(aqui, 'stub-supabase.sql'), 'utf8'))
if (stub.status !== 0) {
  console.error('A imitação do Supabase falhou:\n' + stub.stderr)
  process.exit(2)
}

const EXT = /^\s*create\s+extension\s+if\s+not\s+exists\s+"?(pg_cron|pg_net|supabase_vault|pg_stat_statements)"?[^;]*;/gim
const arquivos = readdirSync(pasta)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => !semLicenca || !SO_NO_APP_INSTALADO.has(f))
  .sort()
const falhas = []
for (const [i, nome] of arquivos.entries()) {
  const sql = readFileSync(join(pasta, nome), 'utf8').replace(EXT, '-- (extensão do Supabase, imitada)')
  const r = psql(banco, sql, ['--single-transaction'])
  if (r.status !== 0) {
    const erro = r.stderr.split('\n').find((l) => /ERRO|ERROR/.test(l)) || r.stderr.trim().slice(0, 300)
    falhas.push(nome)
    console.log(`FALHOU ${i + 1}/${arquivos.length} ${nome}: ${erro}`)
    if (!continuar) break
  }
}
console.log(
  `${arquivos.length} arquivos; ${falhas.length} falharam (banco: ${banco}${semLicenca ? ', sem licença HTAI' : ''})`,
)

if (args.includes('--verificar') && falhas.length === 0) {
  const verificar = readdirSync(aqui)
    .filter((f) => /^verificar-.*\.sql$/.test(f))
    .filter((f) => (semLicenca ? /^verificar-saas-/.test(f) : !/^verificar-saas-/.test(f)))
    .sort()
  for (const nome of verificar) {
    const r = psql(banco, readFileSync(join(aqui, nome), 'utf8'))
    if (r.status !== 0) {
      const erro = r.stderr.split('\n').find((l) => /ERRO|ERROR/.test(l)) || r.stderr.trim().slice(0, 300)
      falhas.push(nome)
      console.log(`FALHOU ${nome}: ${erro}`)
    } else {
      console.log(`ok ${nome}`)
    }
  }
}
process.exit(falhas.length ? 1 : 0)
