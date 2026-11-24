import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105141748_rpc_humana_exige_conta_ativa.sql', import.meta.url), 'utf8')
const baseline = JSON.parse(readFileSync(new URL('./fixtures/human-rpc-production-base.json', import.meta.url), 'utf8')) as { functions: Record<string, string> }
const functions = sql.match(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?\$function\$[\s\S]*?\$function\$\s*;/g) ?? []
const guard = "  -- GUARDA DE CONTA ATIVA\n  IF auth.uid() IS NULL OR public.get_user_tenant_id() IS NULL THEN\n    RAISE EXCEPTION 'Conta sem acesso ativo' USING ERRCODE = '42501';\n  END IF;\n  -- FIM DA GUARDA\n"
const normalize = (value: string) => value.trim().replace(/;$/, '').trim()

// Compara fonte do catálogo, sem executar SQL; não é teste de autorização em banco.
describe('RPCs humanas — somente atividade e tenant', () => {
  it('altera exatamente as duas funções previstas', () => {
    expect(functions).toHaveLength(2)
    expect(functions.map(s => s.match(/FUNCTION public\.(\w+)/)?.[1])).toEqual(['aprovar_extrato_mes', 'pj_registrar_nota'])
  })
  it.each(Object.entries(baseline.functions))('mantém o corpo LIVE de %s retirando apenas a guarda contratada', (signature, original) => {
    const name = signature.split('(')[0]
    const changed = functions.find(s => s.includes('public.' + name + '('))!
    expect(changed).toContain('\nbegin\n' + guard)
    const restored = changed.replace(guard, '').replace(
      'where e.id = p_entrega_id and p.user_id = auth.uid()\n    and p.tenant_id = public.get_user_tenant_id();',
      'where e.id = p_entrega_id and p.user_id = auth.uid();',
    )
    expect(normalize(restored)).toBe(normalize(original))
  })
  it('prestador só registra nota de entrega própria do tenant confirmado', () => {
    expect(functions[1]).toContain('where e.id = p_entrega_id and p.user_id = auth.uid()\n    and p.tenant_id = public.get_user_tenant_id();')
  })
  it('nenhuma policy, grant, owner ou trigger é alterado', () => {
    const outside = functions.reduce((text, fn) => text.replace(fn, ''), sql).replace(/--[^\n]*/g, '')
    expect(outside).not.toMatch(/\b(ALTER|DROP|POLICY|GRANT|REVOKE|OWNER|TRIGGER|INSERT|UPDATE|DELETE)\b/i)
    expect(outside).not.toContain('storage.')
  })
})
