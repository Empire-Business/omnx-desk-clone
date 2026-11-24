// Revisão contratual estática: não executa nem interpreta PL/pgSQL.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105124122_iris_reconciliacao_report_20261105.sql', import.meta.url), 'utf8')
const semComentarios = sql.replace(/--[^\n]*/g, '')
const base = readFileSync(new URL('../../migrations/20261103233619_iris_whatsapp_responsaveis.sql', import.meta.url), 'utf8')
function corpo(fonte: string, nome: string, tag: string) {
  const re = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${nome.replaceAll('.', '\\.')}\\([\\s\\S]*?AS \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`)
  const r = fonte.match(re)?.[1]
  expect(r).toBeDefined()
  return r!
}
const entrada = corpo(sql, 'private.client_assignment_reconciliar_report_20261105', 'm')
const contexto = corpo(sql, 'private.client_assignment_report_contexto_20261105', 'm')

describe('manutenção específica Report Entregas — contrato estático', () => {
  it('não carrega alvos operacionais e recusa execução sem lote de 11 alvos', () => {
    expect(semComentarios).not.toMatch(/INSERT INTO private\.client_assignment_report_20261105/)
    expect(entrada).toContain('IF n<>11 THEN')
    expect(sql).toContain("acao='encerrar' AND assignment_id IS NOT NULL AND user_id IS NULL")
    expect(sql).toContain("CHECK (solicitante_id = '0295d401-6270-4fbe-be47-ee9b6a9ed9c9'::uuid)")
    expect(sql).toContain('CHECK (revisao_esperada = 0)')
  })
  it('não simula sessão, não instala acesso público, não altera contratos/usuários ou core', () => {
    expect(semComentarios).not.toMatch(/request\.jwt|set_config|SET\s+ROLE|DISABLE\s+TRIGGER|session_replication_role/i)
    expect(semComentarios).not.toMatch(/\bGRANT\b|CREATE (?:OR REPLACE )?FUNCTION public\.client_assignment_decidir/i)
    expect(semComentarios).not.toMatch(/(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?(?:contratos|comissoes|users)\b/i)
    expect(sql).toContain('ALTER TABLE private.client_assignment_report_20261105 ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('REVOKE ALL ON private.client_assignment_report_20261105 FROM PUBLIC,anon,authenticated,service_role;')
  })
  it('capacidade depende da sessão SQL real, backend, transação, alvo e solicitante atual', () => {
    expect(entrada).toContain("session_user NOT IN ('postgres','supabase_admin')")
    expect(entrada).toContain("current_user NOT IN ('postgres','supabase_admin')")
    for (const t of ['auth.uid() IS NOT NULL', 'client_id=p_client_id', 'backend_pid=pg_backend_pid()',
      'transacao=txid_current()', 'executor_sql=session_user', 'recibo IS NULL', "has_permissao_de(u.id,'clientes.atribuir','editar')", 'public.wa_agente_escopo']) expect(contexto).toContain(t)
  })
  it('confere lote completo antes de chamar RPC e não chama reconciliação na instalação', () => {
    for (const t of ['IF n<>11', 'rev<>r.revisao_esperada', 'r.assignment_id IS NULL AND n<>0',
      'r.assignment_id IS NOT NULL AND n<>1', 'id=r.assignment_id', 'private.client_assignment_elegivel']) expect(entrada).toContain(t)
    expect(entrada.indexOf('manutencao_destino_inelegivel')).toBeLessThan(entrada.indexOf('resultado:=public.client_assignment_decidir'))
    expect(semComentarios).not.toMatch(/SELECT\s+private\.client_assignment_reconciliar_report_20261105\(\)/i)
    expect(entrada).toContain('backend_pid=NULL,transacao=NULL')
    expect(entrada).not.toMatch(/EXCEPTION\s+WHEN/)
  })
  it('preserva separadamente mensagem e pedido reais e valida vínculo, tenant e grupo', () => {
    expect(sql).toContain('pedido_fonte_id uuid NOT NULL')
    expect(sql).toContain('mensagem_fonte_id uuid NOT NULL')
    expect(entrada).toContain('JOIN public.chat_messages m ON m.id=p.chat_message_id AND m.tenant_id=p.tenant_id')
    expect(entrada).toContain('m.id=r.mensagem_fonte_id')
    expect(entrada).toContain('p.chat_jid=(SELECT principal.chat_jid')
    expect(entrada).toContain('principal.tenant_id=r.tenant_id AND principal.eh_grupo IS TRUE')
    expect(entrada).toContain("p.chat_jid='120363415422487266@g.us'")
    expect(entrada).toContain("principal.chat_jid='120363415422487266@g.us'")
    expect(contexto).toContain('r.mensagem_fonte_id::text')
  })
  it('mantém guard original substituindo somente a origem da capacidade', () => {
    const antes = corpo(base, 'private.client_assignment_guard', 'fn')
    expect(corpo(sql, 'private.client_assignment_guard', 'fn')).toBe(antes.replace("op.origem='iris_whatsapp'", "op.origem=coalesce(v_ctx->>'origem','iris_whatsapp')"))
  })
  it('operação de manutenção valida parâmetros exatos e mantém código Iris preexistente', () => {
    const atual = corpo(sql, 'private.client_assignment_iris_operacao', 'f')
    const antes = corpo(base, 'private.client_assignment_iris_operacao', 'f')
    const inicio = atual.indexOf('  c:=private.client_assignment_report_contexto_20261105')
    const fim = atual.indexOf('  c:=private.client_assignment_iris_contexto(NEW.client_id)')
    expect(inicio).toBeGreaterThan(0)
    expect(atual.slice(0, inicio) + atual.slice(fim)).toBe(antes)
    expect(atual.slice(inicio, fim)).toContain('NEW.pedido IS DISTINCT FROM esperado')
    expect(atual.slice(inicio, fim)).toContain("NEW.origem:='manutencao_codex'")
  })
  it('preserva autoria/antes/depois/revisão dos eventos e registra executor separadamente', () => {
    const antes = corpo(base, 'private.client_assignment_auditar', 'fn')
    const substituido = antes.replace("IF v_ator IS NULL THEN v_ator:=(private.client_assignment_iris_contexto(a.client_id)->>'ator_id')::uuid; END IF;",
      "IF v_ator IS NULL THEN v_ator:=coalesce((private.client_assignment_report_contexto_20261105(a.client_id)->>'ator_id')::uuid,\n    (private.client_assignment_iris_contexto(a.client_id)->>'ator_id')::uuid); END IF;")
    expect(corpo(sql, 'private.client_assignment_auditar', 'fn')).toBe(substituido)
    expect(contexto).toContain("'executor_sql',r.executor_sql")
    expect(contexto).toContain('executor SQL: ')
    expect(entrada).toContain('executado_em=clock_timestamp()')
  })
  it('auditoria derivada do tempo de resposta identifica manutenção sem fingir confirmação WhatsApp', () => {
    const atual = corpo(sql, 'private.tempo_resposta_sincronizar_titular', 'fn')
    expect(atual).toContain('ctx:=private.client_assignment_report_contexto_20261105(p_client)')
    expect(atual).toContain("WHEN ctx->>'origem'='manutencao_codex' THEN jsonb_build_object('origem','manutencao_codex'")
    expect(atual).toContain("'operacao_manutencao_id',ctx->'proposta_id','executor_sql',ctx->'executor_sql'")
    expect(atual).toContain("ELSE jsonb_build_object('origem','iris_whatsapp'")
  })
})
