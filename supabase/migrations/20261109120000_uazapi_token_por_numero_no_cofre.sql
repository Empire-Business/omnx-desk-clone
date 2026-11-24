-- ============================================================================
-- Token da UAZAPI por número, guardado no cofre (Vault)
-- ============================================================================
-- Por quê: cada número de WhatsApp (whatsapp_instances) tem o próprio token na
-- UAZAPI. Até aqui ele ficava nos segredos das funções, com nome dinâmico
-- `UAZAPI_TOKEN_<instance_id>`, o que obriga alguém a rodar `supabase secrets set`
-- a cada número novo. A aba Conexão das Automações já guarda UM token por empresa
-- no Vault (tenant_integracoes, provider 'uazapi'); faltava o token de cada número.
--
-- O que faz:
--   1. Tabela whatsapp_instance_tokens: ponteiro para o segredo no Vault, por
--      número (nunca o token em texto). RLS ligado e SEM política: só as funções
--      SECURITY DEFINER abaixo mexem nela.
--   2. salvar_uazapi_token_numero(instância, token): só administrador da empresa
--      dona do número. Token vazio = remove. Nunca devolve o token.
--   3. uazapi_numeros_com_token(): ids dos números da empresa de quem chama que
--      têm token salvo (para a tela mostrar "token salvo").
--   4. uazapi_token_do_numero(instance_id, tenant): devolve o token decifrado.
--      Só service_role (as funções do servidor).
--
-- Ordem de leitura nas funções (supabase/functions/_shared/uazapi-credenciais.ts):
--   token do número no cofre → token da empresa no cofre (se for o número
--   principal da aba Conexão) → segredo legado UAZAPI_TOKEN_<instance_id>.
-- Produção: sem token salvo aqui, nada muda (cai no segredo legado de sempre).
--
-- Reverter:
--   DROP FUNCTION IF EXISTS public.uazapi_token_do_numero(text, uuid);
--   DROP FUNCTION IF EXISTS public.uazapi_numeros_com_token();
--   DROP FUNCTION IF EXISTS public.salvar_uazapi_token_numero(uuid, text);
--   DELETE FROM vault.secrets WHERE id IN (SELECT secret_key_id FROM public.whatsapp_instance_tokens);
--   DROP TABLE IF EXISTS public.whatsapp_instance_tokens;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_instance_tokens (
  instance_uuid  uuid PRIMARY KEY REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  secret_key_id  uuid NOT NULL,
  atualizado_por uuid,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_instance_tokens_tenant_idx
  ON public.whatsapp_instance_tokens (tenant_id);

ALTER TABLE public.whatsapp_instance_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_instance_tokens FROM anon, authenticated;

COMMENT ON TABLE public.whatsapp_instance_tokens IS
  'Ponteiro para o token UAZAPI de cada número no Vault. Sem política de RLS de propósito: só RPCs SECURITY DEFINER acessam.';

-- ---------------------------------------------------------------------------
-- 2) Salvar / trocar / remover (administrador da empresa dona do número)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_uazapi_token_numero(p_instance uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant    uuid;
  v_inst      public.whatsapp_instances%ROWTYPE;
  v_atual     public.whatsapp_instance_tokens%ROWTYPE;
  v_token     text := NULLIF(btrim(COALESCE(p_token, '')), '');
  v_secret_id uuid;
BEGIN
  v_tenant := public.get_user_tenant_id();
  IF v_tenant IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'apenas administrador pode salvar o token do número'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_inst FROM public.whatsapp_instances
   WHERE id = p_instance AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'número não encontrado nesta empresa';
  END IF;

  IF v_token IS NOT NULL AND (length(v_token) > 512 OR v_token ~ '\s') THEN
    RAISE EXCEPTION 'token inválido';
  END IF;

  SELECT * INTO v_atual FROM public.whatsapp_instance_tokens WHERE instance_uuid = p_instance;

  IF v_token IS NULL THEN
    IF FOUND THEN
      DELETE FROM public.whatsapp_instance_tokens WHERE instance_uuid = p_instance;
      DELETE FROM vault.secrets WHERE id = v_atual.secret_key_id;
    END IF;
    RETURN false;
  END IF;

  IF FOUND THEN
    PERFORM vault.update_secret(v_atual.secret_key_id, v_token);
    UPDATE public.whatsapp_instance_tokens
       SET atualizado_por = auth.uid(), atualizado_em = now()
     WHERE instance_uuid = p_instance;
  ELSE
    v_secret_id := vault.create_secret(
      v_token,
      'uazapi_numero:' || p_instance::text || ':' || gen_random_uuid()::text,
      'Token UAZAPI do número ' || v_inst.instance_id
    );
    INSERT INTO public.whatsapp_instance_tokens (instance_uuid, tenant_id, secret_key_id, atualizado_por)
    VALUES (p_instance, v_tenant, v_secret_id, auth.uid());
  END IF;

  RETURN true;  -- nunca devolve o token
END;
$fn$;

REVOKE ALL ON FUNCTION public.salvar_uazapi_token_numero(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_uazapi_token_numero(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Quais números da minha empresa têm token salvo (sem o token)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uazapi_numeros_com_token()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT t.instance_uuid
    FROM public.whatsapp_instance_tokens t
   WHERE t.tenant_id = public.get_user_tenant_id();
$fn$;

REVOKE ALL ON FUNCTION public.uazapi_numeros_com_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uazapi_numeros_com_token() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Ler o token decifrado (só o servidor)
--    p_tenant_id opcional: quando vem, o número precisa ser dessa empresa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uazapi_token_do_numero(p_instance_id text, p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT ds.decrypted_secret
    FROM public.whatsapp_instances wi
    JOIN public.whatsapp_instance_tokens t ON t.instance_uuid = wi.id AND t.tenant_id = wi.tenant_id
    JOIN vault.decrypted_secrets ds ON ds.id = t.secret_key_id
   WHERE wi.instance_id = p_instance_id
     AND (p_tenant_id IS NULL OR wi.tenant_id = p_tenant_id)
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.uazapi_token_do_numero(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uazapi_token_do_numero(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
