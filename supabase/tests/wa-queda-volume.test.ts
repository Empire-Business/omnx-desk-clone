// Contrato estático da migration; não executa SQL nem comprova resultados PostgreSQL.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync(new URL('../migrations/20261106160448_wa_queda_volume_autoria_grupos.sql', import.meta.url), 'utf8')
const corpo = sql.split('AS $fn$')[1].split('$fn$;')[0]

describe('RPC queda de volume — autoria e grupo, sem mutação de negócio', () => {
  it('preserva assinatura, invoker, estabilidade e execução exclusiva do serviço', () => {
    expect(sql).toMatch(/p_tenant_id uuid,\s+p_limiar numeric,\s+p_agora timestamptz DEFAULT now\(\)/)
    expect(sql).toContain('RETURNS TABLE (contact_id uuid, msgs_semana integer, media_semanal numeric)')
    expect(sql).toMatch(/STABLE\s+SECURITY INVOKER\s+SET search_path = public, pg_temp/)
    expect(sql).toContain('FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('TO service_role;')
    expect(corpo).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/i)
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
  })
  it('não usa flags antigas para contar equipe como cliente e limita os joins ao tenant', () => {
    expect(corpo).toContain("m.autor_tipo = 'cliente'")
    expect(corpo).not.toMatch(/enviado_por_agente|enviado_por_ia|autor_nome/)
    for (const alias of ['m', 'c', 'ct', 'cl', 'vinculo']) expect(corpo).toContain(`${alias}.tenant_id = p_tenant_id`)
    expect(corpo).toContain('COALESCE(c.arquivada, false) = false')
  })
  it('consolida grupo full/numeric por JID validado; privados por contato, nunca nome', () => {
    expect(corpo).toContain('c.is_group IS TRUE')
    expect(corpo).toContain("'^[0-9]{5,30}(-[0-9]{5,20})?$'")
    expect(corpo).toContain("THEN 'grupo:' || regexp_replace")
    expect(corpo).toContain("ELSE 'contato:' || ct.id::text")
    expect(corpo).not.toMatch(/ct\.nome|c\.instance_id/)
  })
  it('seleciona representante estável vinculado direto ou por junction sem multiplicar eventos', () => {
    expect(corpo).toContain('cl.id = ct.client_id')
    expect(corpo).toContain('public.chat_contact_clients vinculo')
    expect(corpo).toContain('vinculo.contact_id = ct.id')
    expect(corpo).toContain('ORDER BY canal, vinculado DESC, contact_id')
    expect(corpo.indexOf('representantes AS')).toBeLessThan(corpo.indexOf('eventos AS'))
  })
  it('deduplica providerID com fallback de linha antes de agregar/limitar e preserva fórmula', () => {
    expect(corpo).toContain("THEN 'wpp:' || btrim(m.message_id_wpp)")
    expect(corpo).toContain("ELSE 'linha:' || m.id::text")
    expect(corpo).toContain('DISTINCT ON (canal, chave_mensagem)')
    expect(corpo).toContain('ORDER BY canal, chave_mensagem, criado_em, id')
    expect(corpo.indexOf('DISTINCT ON (canal, chave_mensagem)')).toBeLessThan(corpo.indexOf('GROUP BY canal'))
    expect(corpo.indexOf('GROUP BY canal')).toBeLessThan(corpo.indexOf('LIMIT 50'))
    expect(corpo).toContain("m.criado_em >= p_agora - interval '35 days'")
    expect(corpo).toContain('m.criado_em < p_agora')
    expect(corpo).toContain("criado_em >= p_agora - interval '7 days'")
    expect(corpo).toContain('p.anteriores / 4.0 >= 5')
    expect(corpo).toContain('LEAST(GREATEST(COALESCE(p_limiar, 50), 0), 100) / 100.0')
  })
})
