// Contrato ESTÁTICO: não interpreta PL/pgSQL nem comprova execução/rollback/RLS.
// Cenários reais preparados em supabase/tests/client_assignment_operational.sql.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261028194828_client_assignments_operational_history.sql', import.meta.url), 'utf8')
const semComentarios = sql.replace(/--[^\n]*/g, '')
function funcao(nome: string) {
  return sql.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION ' + nome.replaceAll('.', '\\.') + '\\([\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;'))?.[1] ?? ''
}

describe('contrato estático da migration de responsabilidade operacional', () => {
  it('não escreve contratos/comissões e retira as duas cascatas', () => {
    expect(semComentarios).not.toMatch(/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?(?:contratos|comissoes)\b/i)
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_sync_estrategista_contratos ON public.client_assignments;')
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_sync_contrato_estrategista_to_assignment ON public.contratos;')
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.sync_/)
  })
  it('retém snapshots sem cascata de usuário/assignment e protege append-only', () => {
    const eventos = sql.match(/CREATE TABLE public\.client_assignment_events \(([\s\S]*?)\n\);/)?.[1] ?? ''
    expect(eventos).not.toMatch(/REFERENCES\s+(?:public\.)?(?:users|client_assignments)\b|ON DELETE CASCADE/i)
    expect(eventos).toContain('REFERENCES public.clients(id) ON DELETE NO ACTION')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.client_assignment_events')
    expect(sql).toContain('BEFORE TRUNCATE ON public.client_assignment_events')
  })
  it('novas tabelas têm RLS, sem escrita pública e sem leitura pública de operações', () => {
    for (const nome of ['state', 'operations', 'events']) {
      expect(sql).toContain('ALTER TABLE public.client_assignment_' + nome + ' ENABLE ROW LEVEL SECURITY;')
    }
    expect(sql).toContain('public.client_assignment_events FROM PUBLIC, anon, authenticated, service_role;')
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*ON\s+(?:TABLE\s+)?public\.client_assignment_(?:state|operations|events)/i)
    expect(sql).not.toMatch(/GRANT SELECT ON public\.client_assignment_operations/i)
  })
  it('funções novas revogam execução pública e não forjam auth por GUC/role', () => {
    const nomes = [...sql.matchAll(/CREATE FUNCTION ((?:public|private)\.[a-z_]+)\(/g)].map((m) => m[1])
    expect(nomes.length).toBeGreaterThan(5)
    for (const nome of nomes) expect(sql).toMatch(new RegExp('REVOKE ALL ON FUNCTION ' + nome.replaceAll('.', '\\.') + '\\([^;]*\\) FROM PUBLIC, anon'))
    expect(funcao('private.client_assignment_autorizar')).toContain('id = auth.uid()')
    expect(semComentarios).not.toMatch(/set_config|request\.jwt|SET\s+ROLE|session_replication_role/i)
  })
  it('guard/audit cobrem todo DML legado; UPDATE false e alteração de identidade são recusados', () => {
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON public.client_assignments')
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.client_assignments')
    expect(funcao('private.client_assignment_guard')).toContain("MESSAGE='atribuicao_use_encerrar'")
    expect(funcao('private.client_assignment_guard')).toContain("MESSAGE = 'atribuicao_identidade_imutavel'")
    expect(funcao('private.client_assignment_auditar')).toContain("'legado_dml'")
    expect(funcao('private.client_assignment_auditar')).toContain('revisao = revisao + 1')
  })
  it('contexto protegido vincula tx/ator/cliente e retry reautoriza antes de ler recibo', () => {
    const a = funcao('private.client_assignment_autorizar')
    for (const trecho of ['op.transacao = txid_current()', 'op.ator_id = auth.uid()', 'op.client_id = p_client_id', 'op.resposta IS NULL']) expect(a).toContain(trecho)
    const decidir = funcao('public.client_assignment_decidir')
    expect(decidir.indexOf('private.client_assignment_autorizar')).toBeLessThan(decidir.indexOf('v_op.resposta'))
    expect(decidir).toContain('v_op.pedido IS DISTINCT FROM v_pedido')
    expect(decidir).toContain('v_rev <> p_revisao_esperada')
  })
  it('leitura distingue legado ausente e pagina 30 eventos com sentinela adicional', () => {
    expect(funcao('public.client_assignment_contexto')).toContain('IF NOT FOUND THEN v_rev:=0; v_desde:=NULL; END IF;')
    expect(funcao('public.client_assignment_contexto')).toContain("'legados_inativos'")
    const historico = funcao('public.client_assignment_historico')
    expect(historico).toContain('LIMIT 31')
    expect(historico).toContain("v_itens->29->>'revisao'")
    expect(historico).toContain('revisao < p_antes_revisao')
  })
  it('helper de acesso filtra ativo/tenant e blocos PL/pgSQL têm terminador', () => {
    const acesso = funcao('public.user_can_access_client')
    expect(acesso).toContain('ca.ativo IS TRUE')
    expect(acesso).toContain('ca.tenant_id = public.get_user_tenant_id()')
    expect(acesso).toContain("WHEN p_client_id IS NULL THEN true")
    const blocos = [...sql.matchAll(/LANGUAGE plpgsql[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)]
    expect(blocos).toHaveLength(7)
    for (const bloco of blocos) expect(bloco[1].trimEnd()).toMatch(/END;$/)
  })
})
