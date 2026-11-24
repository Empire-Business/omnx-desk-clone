// Verificação ESTÁTICA do contrato; não executa SQL nem prova validação em banco.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const base = readFileSync(new URL('../../migrations/20261105123637_iris_memoria_operacional_grupo.sql', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../../migrations/20261105130413_iris_memoria_importacao_duas_declaracoes.sql', import.meta.url), 'utf8')

describe('contrato estático da importação administrativa excepcional', () => {
  it('não concede capacidade HTTP nem usa identidade privilegiada fabricada', () => {
    expect(sql.replace(/^--.*$/gm, '')).not.toMatch(/SECURITY DEFINER|SET ROLE|set_config\s*\(/i)
    for (const nome of ['wa_agente_fatos_fontes_20261105','wa_agente_fatos_importar_20261105']) {
      expect(sql).toContain(`CREATE FUNCTION private.${nome}()`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION private.${nome}() FROM PUBLIC, anon, authenticated, service_role;`)
      expect(sql).not.toMatch(new RegExp(`GRANT.*${nome}`))
    }
    expect(sql).toContain("current_user NOT IN ('postgres','supabase_admin') OR session_user <> current_user OR auth.uid() IS NOT NULL")
  })
  it('separa autor histórico, executor real, autorização e data original', () => {
    expect(sql).toContain('f.autor_id := a.autor;')
    expect(sql).toContain('f.executor_bd := session_user;')
    expect(sql).toContain('f.autorizado_por := v_autorizador; f.fonte_criada_em := m.criado_em;')
    expect(sql).toContain('m.criado_em IS NULL')
    expect(sql).toContain("f.origem := 'manutencao_codex'")
    expect(sql).toContain('f.criado_em := clock_timestamp();')
    expect(sql).toContain('digest do snapshot histórico conferido na importação; não atesta captura original pelo webhook')
  })
  it('limita os alvos às duas mensagens e não modifica usuários ou fila', () => {
    expect(sql).toContain('849a0faa-f08d-43a5-b381-7164363c8c68')
    expect(sql).toContain('1583771d-b531-4d0d-bfce-85668eb107c8')
    expect(sql).toContain('@255748827312232 virendra é um estrategista que já saiu.')
    expect(sql).toContain('Herilly prado não é mais estrategista da empresa.')
    expect(sql).toContain("v_grupo constant text := '120363415422487266@g.us'")
    expect(sql).not.toMatch(/UPDATE\s+public\.(?:users|wa_agente_pedidos)|ALTER TABLE\s+public\.wa_agente_pedidos/i)
    expect(sql).toContain('p.user_id IS DISTINCT FROM a.autor OR p.chat_message_id IS DISTINCT FROM a.mensagem')
    expect(sql).toContain('m.autor_user_id IS DISTINCT FROM a.autor')
    expect(sql).toContain('coalesce(strpos(v_texto,a.trecho),0) = 0')
    expect(sql).toContain('mb.user_id = a.autor AND mb.telefone_chave = p.remetente_chave')
    expect(sql).toContain('m.conversation_id = p.conversation_id AND (m.autor_tipo')
    expect(sql).toContain('cv.id = p.conversation_id AND cv.instance_id = p.instance_uuid')
    expect(sql).toContain('cv.id = m.conversation_id AND cv.tenant_id = v_tenant')
    expect(sql).toContain('p.entrada_texto_sha256 IS NOT NULL AND p.entrada_texto_sha256 IS DISTINCT FROM')
  })
  it('preserva byte a byte o gate WhatsApp original depois da exceção fechada', () => {
    const extrair = (s: string) => s.slice(s.indexOf('FUNCTION private.wa_agente_fatos_equipe_confere()'), s.indexOf('$f$;', s.indexOf('FUNCTION private.wa_agente_fatos_equipe_confere()')) + 4)
    let atual = extrair(sql).replace('  esperado public.wa_agente_fatos_equipe%ROWTYPE;\n', '')
    const inicio = atual.indexOf("  IF TG_OP = 'INSERT' AND NEW.origem = 'manutencao_codex' THEN")
    const fim = atual.indexOf('  p := private.wa_agente_acoes_pedido', inicio)
    atual = atual.slice(0,inicio) + atual.slice(fim)
    expect(atual).toBe(extrair(base))
  })
  it('não importa automaticamente e não reativa memórias esquecidas', () => {
    expect(sql).toContain("CASE WHEN existente.ativo THEN 'ja_importado' ELSE 'ja_desativado_preservado' END")
    expect(sql).not.toMatch(/^SELECT \* FROM private\.wa_agente_fatos_importar_20261105\(\);/m)
    expect(sql).toContain("OR existente.autorizado_por IS DISTINCT FROM esperado.autorizado_por")
  })
})
