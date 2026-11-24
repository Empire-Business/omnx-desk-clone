-- ============================================================================
-- Automações WhatsApp — ASSISTENTE DA EQUIPE: o que ela APRENDEU com a equipe
-- ============================================================================
-- Pedido do dono (27/10/2026): "um sistema de aprendizado que muda seu
-- comportamento conforme o feedback que dermos no WhatsApp".
--
-- O que cria:
--   wa_agente_aprendizados — preferências de estilo/conteúdo que a equipe deu ao
--   assistente ("responda mais curto", "chame os clientes pelo primeiro nome").
--   Entram no prompt (seção PREFERÊNCIAS APRENDIDAS DA EQUIPE), SEMPRE abaixo das
--   regras de segurança. Nascem de dois jeitos:
--     * origem 'whatsapp': a ferramenta registrar_aprendizado / ajustar_relatorio
--       (service_role, wa-agente-responder) — a validação de instruções perigosas
--       fica no servidor (_shared/wa-agente-ferr-aprendizado.ts);
--     * origem 'tela': quem administra o app adiciona na aba Assistente.
--
-- Segurança:
--   * RLS + policy RESTRICTIVE de tenant. Front lê/escreve só com
--     has_permissao('automacoes-wa','admin'); GRANT por coluna (o front não
--     escolhe origem, autor nem pedido — o trigger carimba).
--   * service_role grava (o responder).
--   * Limite de 50 ATIVOS por empresa (trigger com advisory lock).
--   * Sem regex com contador > 255; tamanhos via char_length().
--   * Nunca TRUNCATE pelo front.
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS.
--
-- Reversão (manual):
--   DROP TABLE IF EXISTS public.wa_agente_aprendizados CASCADE;
--   DROP FUNCTION IF EXISTS public.wa_agente_aprendizados_confere();
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wa_agente_aprendizados (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instrucao        TEXT NOT NULL CHECK (char_length(btrim(instrucao)) BETWEEN 5 AND 400),
  categoria        TEXT NOT NULL DEFAULT 'outro' CHECK (categoria IN ('estilo', 'conteudo', 'relatorio', 'outro')),
  origem           TEXT NOT NULL DEFAULT 'tela' CHECK (origem IN ('whatsapp', 'tela')),
  criado_por_user  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  criado_por_nome  TEXT CHECK (criado_por_nome IS NULL OR char_length(criado_por_nome) <= 80),
  pedido_id        UUID REFERENCES public.wa_agente_pedidos(id) ON DELETE SET NULL,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  desativado_em    TIMESTAMPTZ
);

COMMENT ON TABLE public.wa_agente_aprendizados IS
  'Preferências que a equipe ensinou ao assistente do WhatsApp (estilo/conteúdo/aviso diário). Entram no prompt abaixo das regras de segurança. Máximo de 50 ativas por empresa.';

CREATE INDEX IF NOT EXISTS idx_wa_agente_aprendizados_tenant
  ON public.wa_agente_aprendizados (tenant_id, ativo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_agente_aprendizados_pedido
  ON public.wa_agente_aprendizados (pedido_id);
CREATE INDEX IF NOT EXISTS idx_wa_agente_aprendizados_user
  ON public.wa_agente_aprendizados (criado_por_user);

-- ---------------------------------------------------------------------------
-- Trigger: carimbo do autor (front), desativado_em e limite de 50 ativos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_agente_aprendizados_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Usuário logado só grava na própria empresa (recusa genérica, antes do RLS).
  IF v_uid IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.instrucao := btrim(NEW.instrucao);
    -- Pela tela: autor = quem está logado; origem 'tela'; sem pedido.
    IF v_uid IS NOT NULL THEN
      NEW.origem := 'tela';
      NEW.criado_por_user := v_uid;
      NEW.criado_por_nome := (SELECT left(u.nome, 80) FROM public.users u WHERE u.id = v_uid AND u.tenant_id = NEW.tenant_id);
      NEW.pedido_id := NULL;
      NEW.created_at := now();
    END IF;
    NEW.desativado_em := CASE WHEN NEW.ativo THEN NULL ELSE now() END;
  ELSE
    -- Imutáveis depois de criado.
    NEW.tenant_id := OLD.tenant_id;
    NEW.instrucao := OLD.instrucao;
    NEW.categoria := OLD.categoria;
    NEW.origem := OLD.origem;
    NEW.criado_por_user := OLD.criado_por_user;
    NEW.criado_por_nome := OLD.criado_por_nome;
    NEW.pedido_id := OLD.pedido_id;
    NEW.created_at := OLD.created_at;
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      NEW.desativado_em := CASE WHEN NEW.ativo THEN NULL ELSE now() END;
    END IF;
  END IF;

  -- Limite de 50 ativos por empresa (ao criar ativo ou religar).
  IF NEW.ativo AND (TG_OP = 'INSERT' OR OLD.ativo IS DISTINCT FROM true) THEN
    PERFORM pg_advisory_xact_lock(hashtext('wa_agente_aprendizados:' || NEW.tenant_id::text));
    IF (SELECT count(*) FROM public.wa_agente_aprendizados a
         WHERE a.tenant_id = NEW.tenant_id AND a.ativo AND a.id IS DISTINCT FROM NEW.id) >= 50 THEN
      RAISE EXCEPTION 'Limite de 50 aprendizados ativos por empresa atingido. Desligue ou apague algum antes.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.wa_agente_aprendizados_confere() FROM PUBLIC, anon, authenticated;

-- Carimbo de tenant (front) ANTES da conferência (ordem alfabética: set_ < wa_).
DROP TRIGGER IF EXISTS set_tenant_id_wa_agente_aprendizados ON public.wa_agente_aprendizados;
CREATE TRIGGER set_tenant_id_wa_agente_aprendizados
  BEFORE INSERT ON public.wa_agente_aprendizados
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

DROP TRIGGER IF EXISTS wa_agente_aprendizados_confere ON public.wa_agente_aprendizados;
CREATE TRIGGER wa_agente_aprendizados_confere
  BEFORE INSERT OR UPDATE ON public.wa_agente_aprendizados
  FOR EACH ROW EXECUTE FUNCTION public.wa_agente_aprendizados_confere();

-- ---------------------------------------------------------------------------
-- RLS, policies e GRANTs
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_agente_aprendizados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_agente_aprendizados_tenant_isolation ON public.wa_agente_aprendizados;
CREATE POLICY wa_agente_aprendizados_tenant_isolation ON public.wa_agente_aprendizados
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS wa_agente_aprendizados_admin ON public.wa_agente_aprendizados;
CREATE POLICY wa_agente_aprendizados_admin ON public.wa_agente_aprendizados
  FOR ALL TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'admin')))
  WITH CHECK ((SELECT public.has_permissao('automacoes-wa', 'admin')));

REVOKE ALL ON public.wa_agente_aprendizados FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wa_agente_aprendizados TO service_role;

-- Front: lê, cria (só texto/categoria/ativo), liga/desliga e apaga.
GRANT SELECT ON public.wa_agente_aprendizados TO authenticated;
GRANT INSERT (id, tenant_id, instrucao, categoria, ativo) ON public.wa_agente_aprendizados TO authenticated;
GRANT UPDATE (ativo) ON public.wa_agente_aprendizados TO authenticated;
GRANT DELETE ON public.wa_agente_aprendizados TO authenticated;

-- Nunca TRUNCATE pelo front (TRUNCATE ignora RLS).
REVOKE TRUNCATE ON public.wa_agente_aprendizados FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
