-- Endereço das funções nos agendamentos e gatilhos (migração 20261125120000, #1063).
-- Roda com `ensaiar.mjs --verificar` (banco novo). Transação desfeita no fim.
--
-- Casos:
--  1. nenhum job do pg_cron tem endereço de funções fixo;
--  2. nenhuma função do schema public tem endereço fixo (fora a reserva de app_url_funcoes);
--  3. os jobs que chamam funções passam por app_url_funcoes();
--  4. com 'project_url' no cofre, app_url_funcoes() devolve o endereço do cofre;
--  5. rodar de novo não troca nada (idempotente);
--  6. anon e authenticated não executam app_reapontar_urls_funcoes().

BEGIN;

DO $$
DECLARE
  v_lista text;
  v_n integer;
BEGIN
  SELECT string_agg(jobname, ', ') INTO v_lista
    FROM cron.job WHERE command ~ 'supabase\.co/functions/v1/';
  ASSERT v_lista IS NULL, '1: jobs com endereço fixo: ' || v_lista;

  SELECT string_agg(p.proname, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname <> 'app_url_funcoes'
     AND p.prosrc ~ 'supabase\.co/functions/v1/';
  ASSERT v_lista IS NULL, '2: funções com endereço fixo: ' || v_lista;

  SELECT count(*) INTO v_n FROM cron.job WHERE command LIKE '%app_url_funcoes(%';
  ASSERT v_n >= 5, '3: só ' || v_n || ' job(s) usam app_url_funcoes()';

  PERFORM vault.create_secret('https://clienteteste.supabase.co', 'project_url');
  ASSERT public.app_url_funcoes('wa-agente-responder')
       = 'https://clienteteste.supabase.co/functions/v1/wa-agente-responder',
    '4: app_url_funcoes() não leu o cofre';

  ASSERT public.app_reapontar_urls_funcoes() = 0, '5: segunda passada trocou algo';

  ASSERT NOT has_function_privilege('anon', 'public.app_reapontar_urls_funcoes()', 'EXECUTE'),
    '6: anon executa app_reapontar_urls_funcoes()';
  ASSERT NOT has_function_privilege('authenticated', 'public.app_reapontar_urls_funcoes()', 'EXECUTE'),
    '6: authenticated executa app_reapontar_urls_funcoes()';

  RAISE NOTICE 'verificar-urls-funcoes: ok (% jobs por app_url_funcoes)', v_n;
END
$$;

ROLLBACK;
