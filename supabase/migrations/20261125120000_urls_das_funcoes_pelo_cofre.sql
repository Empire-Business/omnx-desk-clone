-- ============================================================================
-- Agendamentos e gatilhos chamam as funções pelo endereço do próprio projeto
-- (#1063). Só num banco novo (htai_banco_novo(): auth.users vazio).
--
-- Migrações antigas gravaram o endereço da produção fixo em ~15 jobs do pg_cron
-- e em 7 funções de gatilho (SECURITY DEFINER, dono postgres). Num banco de
-- cliente esses jobs chamariam outro projeto a cada minuto, levando junto o
-- segredo do cofre dele (wa_auto_cron_secret). Aqui cada
--   'https://<ref>.supabase.co/functions/v1/<funcao>'
-- vira
--   public.app_url_funcoes('<funcao>')
-- que lê 'project_url' do cofre na hora da chamada. Assim não importa se o
-- instalador grava o cofre antes ou depois das migrações.
--
-- Produção: nada muda (tem contas; a migração só avisa e sai).
-- Idempotente: depois da troca não sobra literal para trocar.
-- Migração nova que gravar endereço fixo precisa fazer o mesmo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_reapontar_urls_funcoes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
  -- Literal entre aspas simples, sem aspa colada antes ou depois (fica de fora
  -- quem monta SQL dinâmico com aspas dobradas).
  c_padrao constant text :=
    '(^|[^''])''https://[a-z0-9-]+\.supabase\.co/functions/v1/([a-z0-9-]+)''(?!'')';
  c_troca constant text := '\1public.app_url_funcoes(''\2'')';
  r record;
  v_def text;
  v_novo text;
  v_total integer := 0;
BEGIN
  -- Jobs do pg_cron
  FOR r IN
    SELECT jobid, command FROM cron.job
     WHERE command ~ c_padrao
  LOOP
    v_novo := regexp_replace(r.command, c_padrao, c_troca, 'g');
    PERFORM cron.alter_job(r.jobid, command := v_novo);
    v_total := v_total + 1;
  END LOOP;

  -- Funções do schema public (gatilhos que chamam net.http_post)
  FOR r IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname <> 'app_url_funcoes'
       AND p.prosrc ~ c_padrao
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_novo := regexp_replace(v_def, c_padrao, c_troca, 'g');
    IF v_novo <> v_def THEN
      EXECUTE v_novo;
      v_total := v_total + 1;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.app_reapontar_urls_funcoes() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_total integer;
BEGIN
  IF NOT public.htai_banco_novo() THEN
    RAISE NOTICE 'urls_das_funcoes_pelo_cofre: banco com contas, nada muda';
    RETURN;
  END IF;
  v_total := public.app_reapontar_urls_funcoes();
  RAISE NOTICE 'urls_das_funcoes_pelo_cofre: % objeto(s) passaram a usar app_url_funcoes()', v_total;
END
$$;
