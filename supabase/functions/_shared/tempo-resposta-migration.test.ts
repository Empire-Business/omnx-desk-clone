// Revisão de contrato por texto; NÃO executa SQL nem comprova RLS/concorrência.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261103184950_tempo_resposta_estrategistas.sql', import.meta.url), 'utf8')
const codigo = sql.replace(/--[^\n]*/g, '')
function corpo(nome: string): string {
  return sql.match(new RegExp(`CREATE FUNCTION ${nome.replaceAll('.', '\\.')}\\([\\s\\S]*?AS \\$fn\\$([\\s\\S]*?)\\$fn\\$;`))?.[1] ?? ''
}

describe('contrato estático do monitor de tempo de resposta', () => {
  it('isola as oito tabelas sem grants diretos ao navegador', () => {
    const tabelas = [...sql.matchAll(/CREATE TABLE public\.(tempo_resposta_\w+)/g)].map((m) => m[1])
    expect(tabelas).toHaveLength(8)
    for (const tabela of tabelas) expect(sql).toContain(`ALTER TABLE public.${tabela} ENABLE ROW LEVEL SECURITY;`)
    expect(codigo).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+(?:authenticated|anon|PUBLIC)/i)
    expect(sql).toContain('public.tempo_resposta_alertas,public.tempo_resposta_auditoria FROM PUBLIC,anon,authenticated,service_role;')
  })
  it('todas as funções revogam o execute público; service e pessoa são separados', () => {
    for (const f of codigo.matchAll(/CREATE FUNCTION ((?:private|public)\.\w+)\(/g)) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${f[1].replaceAll('.', '\\.')}\\([^;]*FROM PUBLIC,anon`))
    }
    for (const f of ['registrar','detalhe','lote']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public.tempo_resposta_${f}\\([^;]*FROM PUBLIC,anon,authenticated;`))
    }
    for (const f of ['painel','configurar','definir_titular','pausar','encerrar_pausa']) {
      expect(corpo(`public.tempo_resposta_${f}`)).toContain('private.tempo_resposta_autorizar()')
    }
    const auth = corpo('private.tempo_resposta_autorizar')
    for (const requisito of ['auth.uid()', 'public.get_user_tenant_id()', 'ativo IS TRUE', "public.has_permissao('automacoes-wa','admin')", 'public.profiles', 'p.tenant_id=u.tenant_id']) expect(auth).toContain(requisito)
    expect(codigo).not.toMatch(/set_config|SET\s+ROLE|request\.jwt|session_replication_role/i)
  })
  it('não altera contratos, comissões, dados antigos nem infraestrutura', () => {
    expect(codigo).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(contratos|comissoes|client_assignments|chat_messages)\b/i)
    expect(codigo).not.toMatch(/CREATE\s+(?:DATABASE|SCHEMA|EXTENSION)|cron\.schedule|TRUNCATE\s+TABLE|DROP\s+TABLE|DISABLE\s+ROW\s+LEVEL/i)
    expect(sql).not.toContain('ON DELETE CASCADE')
  })
  it('preserva primeira mensagem, prova idempotente e limite de relógio', () => {
    const cap = corpo('public.tempo_resposta_registrar')
    expect(cap.indexOf('p_confiavel IS DISTINCT FROM true')).toBeLessThan(cap.indexOf('INSERT INTO public.tempo_resposta_ingressos'))
    expect(cap).toContain('ON CONFLICT DO NOTHING')
    expect(cap).toContain('GET DIAGNOSTICS linhas=ROW_COUNT')
    expect(cap).toContain('quando<cfg.monitorando_desde OR p_recuperada')
    expect(cap).toContain("interval '5 minutes'")
    expect(cap).toContain("interval '1 minute'")
    expect(cap).not.toMatch(/UPDATE public\.tempo_resposta_episodios SET inicio=/)
    expect(cap).toContain('horario_nao_confirmado')
    expect(cap).toContain("coalesce(m.autor_origem,'') NOT LIKE 'heuristica%'")
    expect(cap).toContain('p_user IS DISTINCT FROM m.agente_id')
  })
  it('IA, reação, envio falho e identidade fraca não dão crédito humano', () => {
    const cap = corpo('public.tempo_resposta_registrar')
    expect(cap.indexOf("m.enviado_por_ia IS TRUE")).toBeLessThan(cap.indexOf("SET estado='respondido'"))
    expect(cap).toContain("m.status_envio IN ('enviando','falha')")
    expect(cap).toContain("m.tipo IN ('sistema','reacao','reaction')")
    expect(cap).toContain("m.autor_tipo='equipe' AND ator IS NULL")
    expect(cap).toContain('equipe_sem_identificacao')
  })
  it('não escolhe um entre vários estrategistas sem titular explícito', () => {
    const resolver = corpo('private.tempo_resposta_resolver_titular')
    expect(resolver).toContain('JOIN candidatos c ON c.user_id=t.user_id')
    expect(resolver).toContain('HAVING count(*)=1')
    expect(resolver).toContain("a.tipo='estrategista' AND a.ativo IS TRUE")
    const definir = corpo('public.tempo_resposta_definir_titular')
    expect(definir).toContain('tempo_resposta_titular_nao_vinculado')
    expect(definir).toContain('u.tenant_id=t')
  })
  it('transferências encerram o segmento e cancelam pendentes sem reiniciar a espera', () => {
    const troca = corpo('private.tempo_resposta_sincronizar_titular')
    expect(troca).toContain('fim=greatest(inicio,instante)')
    expect(troca).toContain("SET status='cancelado'")
    expect(troca).toContain('INSERT INTO public.tempo_resposta_segmentos')
    expect(troca).not.toMatch(/SET inicio=/)
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.client_assignments')
  })
  it('usa calendário versionado, confirmação anual e observação sem envio', () => {
    const cfg = corpo('public.tempo_resposta_configurar')
    expect(cfg).toContain("p_modo<>'desligado' AND NOT (ano=ANY(p_anos))")
    expect(cfg).toContain('cfg.revisao<>p_revisao')
    expect(cfg).toContain("estado='cancelado'")
    expect(cfg).not.toMatch(/UPDATE public\.tempo_resposta_episodios SET[^;]*feriados=/)
    expect(cfg.indexOf("IF p_modo='desligado' THEN")).toBeLessThan(cfg.indexOf("UPDATE public.tempo_resposta_alertas SET status='cancelado'"))
    expect(sql).toContain("modo text NOT NULL DEFAULT 'desligado'")
  })
  it('pausas são futuras, limitadas, auditadas e não excluíveis pelo navegador', () => {
    const pausa = corpo('public.tempo_resposta_pausar')
    expect(pausa).toContain('p_minutos NOT BETWEEN 15 AND 240')
    expect(pausa).toContain('instante timestamptz:=clock_timestamp()')
    expect(pausa).toContain("INSERT INTO public.tempo_resposta_auditoria")
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.tempo_resposta_auditoria')
    expect(sql).toContain('BEFORE TRUNCATE ON public.tempo_resposta_auditoria')
  })
  it('falta de captura não gera atraso comprovado e todos leitores usam projeção conservadora', () => {
    const proj = corpo('private.tempo_resposta_projetar')
    expect(proj).toContain('mensagem_sem_comprovacao')
    expect(proj).toContain('m.tenant_id=p_tenant AND m.conversation_id=ep.conversation_id')
    expect(proj).toContain('i.tenant_id=p_tenant AND i.mensagem_id=m.id AND i.confiavel')
    for (const f of ['detalhe','lote','painel']) expect(corpo(`public.tempo_resposta_${f}`)).toContain('private.tempo_resposta_projetar')
  })
  it('interrupção da conexão invalida o caso aberto e reconectar não apaga a lacuna', () => {
    const inter = corpo('private.tempo_resposta_instancia_changed')
    expect(inter).toContain("qualidade='inconclusiva',motivo='conexao_interrompida'")
    expect(inter).not.toContain("qualidade='confiavel'")
    expect(sql).toContain('AFTER UPDATE OF status,ativo ON public.whatsapp_instances')
    expect(corpo('private.tempo_resposta_projetar')).toContain("w.status='conectado' AND w.ativo IS TRUE")
  })
  it('pagina casos e deduplica alertas por episódio, segmento e revisão do destinatário', () => {
    expect(sql).toContain('UNIQUE(connection_id,recipient_id,recipient_revisao,episodio_id,segmento_id,etapa)')
    expect(corpo('public.tempo_resposta_painel')).toContain('LIMIT 101')
    expect(corpo('public.tempo_resposta_lote')).toContain('least(25,greatest(1,coalesce(p_limite,25)))')
    expect(corpo('public.tempo_resposta_lote')).toContain("estado='aberto' AND (p_cursor IS NULL OR id>p_cursor)")
  })
  it('um recibo enviado é definitivo e cancelamento não esconde entrega já commitada', () => {
    const guarda = corpo('private.tempo_resposta_alerta_guard')
    expect(guarda).toContain("OLD.status IN ('enviado','sem_alertas')")
    expect(guarda).toContain("OLD.status='cancelado' AND NEW.status<>'cancelado'")
    expect(guarda).toContain("NEW.status='enviado' AND NEW.delivery_id IS NOT NULL")
    expect(guarda).toContain('r.desk_user_id=s.user_id')
    expect(guarda).toContain('tempo_resposta_delivery_imutavel')
  })
  it('altera só a autenticação do job legado identificado sem criar jobs ou revelar segredo', () => {
    expect(sql).toContain("jobname='chat-sla-monitor-every-5min'")
    expect(sql).toContain('IF jid IS NULL THEN RETURN; END IF;')
    expect(sql).toContain('cron.alter_job(jid,command:=')
    expect(sql).toContain("'x-cron-secret'")
    expect(sql).toContain("name='wa_auto_cron_secret'")
    expect(codigo).not.toContain('cron.schedule(')
    expect(codigo).not.toMatch(/cron\.alter_job\(jid,[^;]*\b(?:schedule|active):=/)
  })
  it('todos os blocos PL/pgSQL têm terminador e funções fixam search_path', () => {
    for (const bloco of sql.matchAll(/LANGUAGE plpgsql[\s\S]*?AS \$fn\$([\s\S]*?)\$fn\$;/g)) expect(bloco[1].trim()).toMatch(/END;$/)
    expect([...sql.matchAll(/CREATE FUNCTION/g)].length).toBe([...sql.matchAll(/SET search_path=''/g)].length)
  })
})
