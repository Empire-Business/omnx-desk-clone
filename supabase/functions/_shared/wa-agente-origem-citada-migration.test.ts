// Contrato estático: não interpreta SQL nem demonstra execução em banco.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../migrations/20261105123645_iris_origem_resposta_citada.sql', import.meta.url), 'utf8')
const base = readFileSync(new URL('../../migrations/20261103233619_iris_whatsapp_responsaveis.sql', import.meta.url), 'utf8')
function corpo(fonte: string, nome: string) {
  const inicio = fonte.indexOf(`CREATE OR REPLACE FUNCTION ${nome}(`)
  expect(inicio).toBeGreaterThanOrEqual(0)
  const fim = fonte.indexOf('\n$f$;', inicio)
  return fonte.slice(inicio, fim).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
}

describe('origem SQL de resposta citada — contrato estático', () => {
  it('muda apenas o aceite de quote e exige corpo próprio não vazio, preservando as demais guardas', () => {
    const anterior = corpo(base, 'private.wa_agente_acoes_pedido')
      .replace(' OR msg.reply_to_id IS NOT NULL', '')
      .replaceAll("p.gatilho NOT IN ('nome', 'mencao')", "p.gatilho NOT IN ('nome', 'mencao', 'quote')")
      .replace('Use uma mensagem de texto própria, direta e sem citação.', 'Use o texto próprio de uma mensagem autenticada.')
      .replace('IF v_texto IS NULL OR encode(extensions.digest', "IF nullif(btrim(v_texto), '') IS NULL OR encode(extensions.digest")
    expect(corpo(sql, 'private.wa_agente_acoes_pedido')).toBe(anterior)
    expect(sql).toContain("regexp_replace(msg.conteudo,")
    expect(sql).toContain("IS DISTINCT FROM p.entrada_texto_sha256")
  })

  it('confirmação conserva integralmente a implementação anterior e acrescenta veto de quote/reply', () => {
    const atual = corpo(sql, 'public.wa_agente_acoes_confirmar')
    const veto = "IF p.gatilho NOT IN ('nome', 'mencao') OR EXISTS ( SELECT 1 FROM public.chat_messages WHERE id = p.chat_message_id AND tenant_id = p.tenant_id AND reply_to_id IS NOT NULL ) THEN RETURN jsonb_build_object('ok', false, 'codigo', 'confirmacao_invalida', 'erro', 'Envie a confirmação sozinha em uma nova mensagem sem citação.'); END IF; "
    expect(atual).toContain(veto)
    expect(atual.replace(veto, '')).toBe(corpo(base, 'public.wa_agente_acoes_confirmar'))
  })

  it('não cria origem retroativa, grants novos, tabelas ou caminhos de impersonação', () => {
    const efetivo = sql.replace(/--[^\n]*/g, '')
    expect(efetivo).not.toMatch(/set_config|request\.jwt|SET\s+ROLE|CREATE\s+TABLE|UPDATE\s+(?:public\.)?wa_agente_pedidos/i)
    expect(efetivo.match(/GRANT[^;]+;/g)).toEqual([
      'GRANT EXECUTE ON FUNCTION private.wa_agente_acoes_pedido(uuid,boolean) TO service_role;',
      'GRANT EXECUTE ON FUNCTION public.wa_agente_acoes_confirmar(uuid,text) TO service_role;',
    ])
    expect(efetivo).toContain('REVOKE ALL ON FUNCTION private.wa_agente_acoes_pedido(uuid,boolean) FROM PUBLIC,anon,authenticated;')
    expect(efetivo).toContain('REVOKE ALL ON FUNCTION public.wa_agente_acoes_confirmar(uuid,text) FROM PUBLIC,anon,authenticated;')
  })
})
