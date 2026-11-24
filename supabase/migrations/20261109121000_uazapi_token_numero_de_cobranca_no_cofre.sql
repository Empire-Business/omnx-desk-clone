-- ============================================================================
-- Token da UAZAPI dos números de COBRANÇA, guardado no cofre (Vault)
-- ============================================================================
-- Por quê: a migração 20261109120000 guarda o token por número no cofre, mas só
-- para os números do Chat (whatsapp_instances). Um número que existe só em
-- cobranca_instances (tela Cobrança > Números) não tinha onde guardar o token e
-- o cobranca-scheduler caía sempre no segredo legado UAZAPI_TOKEN_<instance_id>.
--
-- O que faz (mesmo desenho da 20261109120000):
--   1. cobranca_instance_tokens: ponteiro para o segredo no Vault, por número de
--      cobrança. RLS ligado e SEM política: só as funções abaixo mexem nela.
--   2. salvar_uazapi_token_cobranca(número, token): só administrador da empresa
--      dona do número. Token vazio = remove. Nunca devolve o token.
--   3. uazapi_cobranca_com_token(): ids dos números de cobrança da empresa de
--      quem chama que têm token salvo.
--   4. uazapi_token_do_numero(instance_id, tenant) passa a procurar também aqui,
--      DEPOIS do token do número do Chat. As funções continuam lendo só pelo
--      _shared/uazapi-credenciais.ts (cofre do número → cofre da empresa → legado).
-- Produção: sem token salvo aqui, a resposta da RPC é a mesma de antes.
--
-- Reverter:
--   (recriar uazapi_token_do_numero como na 20261109120000)
--   DROP FUNCTION IF EXISTS public.uazapi_cobranca_com_token();
--   DROP FUNCTION IF EXISTS public.salvar_uazapi_token_cobranca(uuid, text);
--   DELETE FROM vault.secrets WHERE id IN (SELECT secret_key_id FROM public.cobranca_instance_tokens);
--   DROP TABLE IF EXISTS public.cobranca_instance_tokens;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cobranca_instance_tokens (
  instance_uuid  uuid PRIMARY KEY REFERENCES public.cobranca_instances(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  secret_key_id  uuid NOT NULL,
  atualizado_por uuid,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cobranca_instance_tokens_tenant_idx
  ON public.cobranca_instance_tokens (tenant_id);

ALTER TABLE public.cobranca_instance_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cobranca_instance_tokens FROM anon, authenticated;

COMMENT ON TABLE public.cobranca_instance_tokens IS
  'Ponteiro para o token UAZAPI de cada número de cobrança no Vault. Sem política de RLS de propósito: só RPCs SECURITY DEFINER acessam.';

-- ---------------------------------------------------------------------------
-- 2) Salvar / trocar / remover (administrador da empresa dona do número)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_uazapi_token_cobranca(p_instance uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant    uuid;
  v_inst      public.cobranca_instances%ROWTYPE;
  v_atual     public.cobranca_instance_tokens%ROWTYPE;
  v_token     text := NULLIF(btrim(COALESCE(p_token, '')), '');
  v_secret_id uuid;
BEGIN
  v_tenant := public.get_user_tenant_id();
  IF v_tenant IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'apenas administrador pode salvar o token do número'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_inst FROM public.cobranca_instances
   WHERE id = p_instance AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'número não encontrado nesta empresa';
  END IF;

  IF v_token IS NOT NULL AND (length(v_token) > 512 OR v_token ~ '\s') THEN
    RAISE EXCEPTION 'token inválido';
  END IF;

  SELECT * INTO v_atual FROM public.cobranca_instance_tokens WHERE instance_uuid = p_instance;

  IF v_token IS NULL THEN
    IF FOUND THEN
      DELETE FROM public.cobranca_instance_tokens WHERE instance_uuid = p_instance;
      DELETE FROM vault.secrets WHERE id = v_atual.secret_key_id;
    END IF;
    RETURN false;
  END IF;

  IF FOUND THEN
    PERFORM vault.update_secret(v_atual.secret_key_id, v_token);
    UPDATE public.cobranca_instance_tokens
       SET atualizado_por = auth.uid(), atualizado_em = now()
     WHERE instance_uuid = p_instance;
  ELSE
    v_secret_id := vault.create_secret(
      v_token,
      'uazapi_cobranca:' || p_instance::text || ':' || gen_random_uuid()::text,
      'Token UAZAPI do número de cobrança ' || v_inst.instance_id
    );
    INSERT INTO public.cobranca_instance_tokens (instance_uuid, tenant_id, secret_key_id, atualizado_por)
    VALUES (p_instance, v_tenant, v_secret_id, auth.uid());
  END IF;

  RETURN true;  -- nunca devolve o token
END;
$fn$;

REVOKE ALL ON FUNCTION public.salvar_uazapi_token_cobranca(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_uazapi_token_cobranca(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Quais números de cobrança da minha empresa têm token salvo (sem o token)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uazapi_cobranca_com_token()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT t.instance_uuid
    FROM public.cobranca_instance_tokens t
   WHERE t.tenant_id = public.get_user_tenant_id();
$fn$;

REVOKE ALL ON FUNCTION public.uazapi_cobranca_com_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uazapi_cobranca_com_token() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Ler o token decifrado (só o servidor): número do Chat primeiro, depois o
--    número de cobrança com o mesmo instance_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uazapi_token_do_numero(p_instance_id text, p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT x.token FROM (
    SELECT ds.decrypted_secret AS token, 1 AS ordem
      FROM public.whatsapp_instances wi
      JOIN public.whatsapp_instance_tokens t ON t.instance_uuid = wi.id AND t.tenant_id = wi.tenant_id
      JOIN vault.decrypted_secrets ds ON ds.id = t.secret_key_id
     WHERE wi.instance_id = p_instance_id
       AND (p_tenant_id IS NULL OR wi.tenant_id = p_tenant_id)
    UNION ALL
    SELECT ds.decrypted_secret, 2
      FROM public.cobranca_instances ci
      JOIN public.cobranca_instance_tokens t ON t.instance_uuid = ci.id AND t.tenant_id = ci.tenant_id
      JOIN vault.decrypted_secrets ds ON ds.id = t.secret_key_id
     WHERE ci.instance_id = p_instance_id
       AND (p_tenant_id IS NULL OR ci.tenant_id = p_tenant_id)
  ) x
  ORDER BY x.ordem
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.uazapi_token_do_numero(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uazapi_token_do_numero(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
