// Inspeção textual do contrato SQL; NÃO valida PostgreSQL/RLS em execução.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(new URL('../migrations/20261106150152_contratos_vigencia_prorrogacao.sql', import.meta.url), 'utf8')
const rotina = sql.split('CREATE OR REPLACE FUNCTION public.concluir_contratos_vencidos()')[1].split('-- 00:05')[0]
const rpc = sql.split('CREATE OR REPLACE FUNCTION public.prorrogar_vigencia_contrato(')[1].split('CREATE OR REPLACE FUNCTION public.concluir_contratos_vencidos')[0]
const sync = sql.split('CREATE OR REPLACE FUNCTION public.sync_cliente_ativo_from_contratos()')[1].split('DROP TRIGGER')[0]

describe('contrato estático da migração de vigência', () => {
  it('sem backfill e cron inativo, sem invocar rotina na migração', () => {
    expect(sql).toContain('ADD COLUMN vigencia_fim date,')
    expect(sql).toContain('cron.alter_job(v_job,active:=false)')
    expect(sql.match(/select public.concluir_contratos_vencidos\(\);/g)).toHaveLength(1)
    expect(sql).not.toMatch(/UPDATE public.contratos SET vigencia_fim\s*=\s*(vencimento|data_fechamento)/i)
  })
  it('cron só explícitos vencidos, preserva pausados e dia inclusivo, idempotência e lock', () => {
    expect(rotina).toContain("status='ativo' AND upper(coalesce(status_secundario,''))<>'PAUSADO'")
    expect(rotina).toContain('vigencia_fim IS NOT NULL AND vigencia_fim<v_hoje')
    expect(rotina).toContain('FOR UPDATE SKIP LOCKED')
    expect(rotina).toContain('pg_try_advisory_xact_lock')
    expect(rotina).not.toMatch(/vencimento|plano_dias|pagamentos/)
    expect(rotina).toContain('FROM PUBLIC,anon,authenticated')
    expect(rotina).toContain('TO service_role')
  })
  it('RPC deriva ator/tenant/permissão reais e trava concorrência sem aceitar identidade como autoridade', () => {
    for (const gate of ['auth.uid() IS NULL', 'auth.uid() IS DISTINCT FROM p_actor_esperado', 'public.get_user_tenant_id()', 'NOT public.pode_gerir_contratos()', 'tenant_id=v_tenant FOR UPDATE', 'c.vigencia_fim IS DISTINCT FROM p_fim_esperado', 'c.status IS DISTINCT FROM p_status_esperado']) expect(rpc).toContain(gate)
    expect(rpc).toContain("USING ERRCODE='40001'")
    expect(rpc).toContain('FROM PUBLIC,anon')
  })
  it('prorroga com motivo, só reativa por escolha explícita e não escreve pagamentos', () => {
    expect(rpc).toContain('p_reativar boolean DEFAULT false')
    expect(rpc).toContain("p_reativar AND c.status<>'concluido'")
    expect(rpc).toContain("btrim(coalesce(p_motivo,''))) NOT BETWEEN 8 AND 2000")
    expect(rpc).not.toMatch(/SET (pagamentos|vencimento|valor_total|num_parcelas)/)
    expect(sql).toContain("'observacoes','cliente_id','vigencia_fim','vigencia_motivo'")
    expect(sql).toContain("set_config('app.skip_venda_resync','on',true)")
  })
  it('cliente depende de todos os seus contratos; NULL e pausa preservam, tenant limitado, no-op sem update', () => {
    expect(sync).toContain('c.cliente_id=v.client_id AND c.tenant_id=v.tenant_id')
    expect(sync).toContain("c.status='pausado'")
    expect(sync).toContain('c.vigencia_fim IS NULL OR c.vigencia_fim>=')
    expect(sync).toContain('cl.ativo IS DISTINCT FROM v_ativo')
    expect(sync).toContain('FOR UPDATE')
  })
  it('não substitui cálculo financeiro; wrapper preserva campos comparados nas transições de vigência', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(')
    expect(sql).toContain('ROW(NEW.data_fechamento,NEW.valor_total,NEW.num_parcelas,NEW.percentual_aplicado,NEW.produto_id,NEW.estrategista_id)')
    expect(sql).toContain('PERFORM public.calcular_comissoes_contrato(NEW.id)')
  })
})
