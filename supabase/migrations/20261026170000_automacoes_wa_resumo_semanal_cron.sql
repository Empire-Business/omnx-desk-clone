-- ============================================================================
-- App Automações WhatsApp — agendador do resumo semanal (etapa 9.4 do roadmap)
-- ============================================================================
-- Docs/prd.md §0.6 e ROADMAP-MODULARIZACAO.md Fase 9 (F1).
--
-- O que faz: agenda a edge function wa-auto-resumo-semanal no pg_cron, a cada
-- 15 minutos. A função decide quem está no dia/horário configurado (fuso
-- America/Sao_Paulo) e a idempotência por (empresa, destino, dia) em
-- wa_auto_envios impede envio repetido nas execuções seguintes do mesmo dia.
-- Se nenhuma empresa tiver o resumo ligado, o job nem chama a função.
--
-- Autenticação (F1): sem JWT anon no SQL. O job lê, a cada execução, o segredo
-- `wa_auto_cron_secret` do Vault e manda no header `x-cron-secret`; a função
-- confere pela RPC wa_auto_cron_secret_confere (só service_role).
--
-- DEPENDE da migration 20261026160000_automacoes_wa_relatorio_diario.sql (etapa
-- 9.3), que cria o segredo no Vault e a RPC de conferência — reaproveitados aqui
-- para todos os jobs wa-auto-* usarem um segredo só. Sem ela, esta migration
-- para com erro claro (nada é criado pela metade).
--
-- ORDEM DE PUBLICAÇÃO: 1) aplicar 20261026160000; 2) publicar a função com
-- verify_jwt = false (`supabase functions deploy wa-auto-resumo-semanal
-- --no-verify-jwt`, ou entrada no config.toml) — o cron não tem JWT; a proteção
-- real é o segredo; 3) aplicar esta migration.
--
-- Reversão:
--   SELECT cron.unschedule('wa-auto-resumo-semanal-15min');
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regprocedure('public.wa_auto_cron_secret_confere(text)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a migration 20261026160000_automacoes_wa_relatorio_diario.sql (cria a RPC wa_auto_cron_secret_confere).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'wa_auto_cron_secret') THEN
    RAISE EXCEPTION 'Segredo wa_auto_cron_secret não encontrado no Vault (criado pela migration 20261026160000).';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-auto-resumo-semanal-15min') THEN
    PERFORM cron.unschedule('wa-auto-resumo-semanal-15min');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-auto-resumo-semanal-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-auto-resumo-semanal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret'
    AND EXISTS (SELECT 1 FROM public.wa_auto_config WHERE resumo_ativo);
  $cron$
);

COMMIT;
