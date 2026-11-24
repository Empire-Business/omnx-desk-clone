import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105145000_unread_chat_limita_mensagens_candidatas.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '')
const body = sql.split('$function$')[1]

// Verifica o contrato estrutural da migration; não executa SQL ou simula RLS.
describe('consulta de não lidas limitada às mensagens candidatas', () => {
  it('mantém invoker, assinatura e contexto de resolução seguros', () => {
    expect(sql).toContain('get_unread_counts_for_user(p_user_id uuid, p_instance_ids uuid[] DEFAULT NULL::uuid[])')
    expect(sql).toContain('STABLE SECURITY INVOKER')
    expect(sql).toContain("SET search_path TO 'public', 'pg_temp'")
    expect(sql).not.toMatch(/SECURITY DEFINER|GRANT|REVOKE|CREATE INDEX|CREATE POLICY|ALTER TABLE/i)
  })
  it('materializa conversas autorizadas e leituras só do ator', () => {
    expect(body).toContain('conversas_visiveis AS MATERIALIZED')
    expect(body).toContain('leituras_do_usuario AS MATERIALIZED')
    expect(body.match(/p_user_id = \(SELECT auth.uid\(\)\)/g)).toHaveLength(2)
    expect(body).toContain('WHERE r.user_id = p_user_id')
    expect(body).toContain('c.instance_id = ANY(p_instance_ids)')
    expect(body).toContain('c.tenant_id = (SELECT public.get_user_tenant_id())')
    expect(body).toContain('public.pode_ver_restrito()')
    expect(body).toContain('private.chat_contatos_restritos_ids()')
  })
  it('mantém acesso messages sob invoker e usa tenant/conversa em ambos os braços', () => {
    expect(body).toContain('CROSS JOIN LATERAL')
    const arms = body.split('UNION ALL')
    expect(arms).toHaveLength(2)
    for (const arm of arms) {
      expect(arm).toContain('FROM public.chat_messages m')
      expect(arm).toContain('m.tenant_id = c.tenant_id')
      expect(arm).toContain('m.conversation_id = c.id')
      expect(arm).toContain('m.enviado_por_agente = false')
      expect(arm).toContain("m.tipo != 'nota_interna'")
    }
    expect(body).toContain('WHERE nao_lidas.unread_count > 0')
  })
  it('preserva datas nulas sem leitura e torna o limite temporal indexável quando lida', () => {
    const [neverRead, previouslyRead] = body.split('UNION ALL')
    expect(neverRead).toContain('WHERE r.last_read_at IS NULL')
    expect(neverRead).not.toContain('m.criado_em')
    expect(previouslyRead).toContain('WHERE r.last_read_at IS NOT NULL')
    expect(previouslyRead).toContain('AND m.criado_em > r.last_read_at')
    expect(body).not.toMatch(/COALESCE\(\s*(m.criado_em|r.last_read_at)/i)
  })
})
