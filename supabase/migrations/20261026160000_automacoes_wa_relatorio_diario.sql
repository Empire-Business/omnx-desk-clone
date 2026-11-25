-- ============================================================================
-- App Automações WhatsApp — relatório diário ao gestor (etapa 9.3 do roadmap)
-- ============================================================================
-- Docs/prd.md §0.6 e ROADMAP-MODULARIZACAO.md Fase 9 (F1, F2, F5, F6).
--
-- Depende de: 20261026120000 (tabelas wa_auto_*) e 20261026140000 (adaptador).
-- Publique a função `wa-auto-relatorio-diario` (com verify_jwt = false — ela se
-- autentica pelo segredo abaixo) ANTES ou junto desta migration: sem a função,
-- o agendador só recebe 404 a cada 15 min (inofensivo, mas polui o log).
--
-- O que cria:
--   1) Segredo do agendador no Vault (`wa_auto_cron_secret`), gerado aqui mesmo
--      com números aleatórios — ninguém precisa copiar/colar nada (F1). O SQL do
--      cron lê o segredo NA HORA de cada execução: ele não fica gravado em
--      cron.job (diferente das migrations antigas, que gravam a chave anon).
--   2) RPC wa_auto_cron_secret_confere(text): a edge function confere o segredo
--      recebido sem nunca ler o valor (só service_role pode chamar).
--   3) RPC wa_auto_queda_volume(...): agregação "mensagens do cliente nos últimos
--      7 dias × média semanal das 4 semanas anteriores", por contato, de UM
--      tenant (parâmetro obrigatório). Só service_role pode chamar (F2).
--   4) Agendador a cada 15 min chamando wa-auto-relatorio-diario. A função decide
--      quem está na hora (relatorio_hora de cada empresa, fuso de Brasília) e a
--      idempotência por (tenant, tipo, gestor, dia) impede repetir (F6). Se
--      nenhuma empresa ligou o relatório, o agendador nem chama a função.
--   5) Retenção de 90 dias em wa_auto_envios (F5), diariamente.
--
-- Idempotente: segredo só é criado se não existir; CREATE OR REPLACE; jobs são
-- removidos e recriados pelo nome.
--
-- Reversão (manual):
--   SELECT cron.unschedule('wa-auto-relatorio-diario-15min');
--   SELECT cron.unschedule('wa-auto-envios-retencao-90d');
--   DROP FUNCTION IF EXISTS public.wa_auto_queda_volume(uuid, numeric, timestamptz);
--   DROP FUNCTION IF EXISTS public.wa_auto_cron_secret_confere(text);
--   DELETE FROM vault.secrets WHERE name = 'wa_auto_cron_secret';
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Segredo do agendador (Vault)
--    gen_random_uuid() usa o gerador forte do Postgres; dois UUIDs = 244 bits
--    aleatórios, 64 caracteres hexadecimais.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'wa_auto_cron_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'wa_auto_cron_secret',
      'Segredo do agendador (pg_cron) para chamar as funções wa-auto-* do app Automações WhatsApp.'
    );
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2) Conferência do segredo (a função nunca recebe o valor de volta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_auto_cron_secret_confere(p_segredo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_segredo text;
BEGIN
  IF p_segredo IS NULL OR length(p_segredo) < 32 OR length(p_segredo) > 256 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_segredo
    FROM vault.decrypted_secrets
   WHERE name = 'wa_auto_cron_secret'
   LIMIT 1;
  IF v_segredo IS NULL OR length(v_segredo) < 32 THEN
    RETURN false;  -- sem segredo configurado, ninguém entra (falha fechada)
  END IF;
  -- Compara os resumos (tamanho fixo), não o texto: não vaza o tamanho/prefixo.
  RETURN sha256(convert_to(p_segredo, 'UTF8')) = sha256(convert_to(v_segredo, 'UTF8'));
END;
$fn$;

COMMENT ON FUNCTION public.wa_auto_cron_secret_confere(text) IS
  'Confere o segredo do agendador das funções wa-auto-* contra o Vault. Só service_role.';

REVOKE ALL ON FUNCTION public.wa_auto_cron_secret_confere(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_auto_cron_secret_confere(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Queda de volume de conversas (por contato, de UM tenant)
--    Conta só mensagens do cliente (nem da equipe, nem da IA). Exige base mínima
--    de 5 mensagens/semana nas 4 semanas anteriores para não alarmar por pouco.
--    p_limiar = % abaixo da média (50 = "metade do que costuma").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_auto_queda_volume(
  p_tenant_id uuid,
  p_limiar    numeric,
  p_agora     timestamptz DEFAULT now()
)
RETURNS TABLE (contact_id uuid, msgs_semana integer, media_semanal numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  WITH por_contato AS (
    SELECT c.contact_id,
           count(*) FILTER (WHERE m.criado_em >= p_agora - interval '7 days')  AS atual,
           count(*) FILTER (WHERE m.criado_em <  p_agora - interval '7 days')  AS anteriores
      FROM public.chat_messages m
      JOIN public.chat_conversations c
        ON c.id = m.conversation_id
       AND c.tenant_id = p_tenant_id
     WHERE m.tenant_id = p_tenant_id
       AND m.criado_em >= p_agora - interval '35 days'
       AND m.criado_em <  p_agora
       AND COALESCE(m.enviado_por_agente, false) = false
       AND COALESCE(m.enviado_por_ia, false) = false
       AND c.contact_id IS NOT NULL
       AND COALESCE(c.arquivada, false) = false
     GROUP BY c.contact_id
  )
  SELECT p.contact_id,
         p.atual::integer,
         round(p.anteriores / 4.0, 1)
    FROM por_contato p
   WHERE p_tenant_id IS NOT NULL
     AND p.anteriores / 4.0 >= 5
     AND p.atual < (p.anteriores / 4.0) * (1 - LEAST(GREATEST(COALESCE(p_limiar, 50), 0), 100) / 100.0)
   ORDER BY (p.anteriores / 4.0 - p.atual) DESC
   LIMIT 50;
$fn$;

COMMENT ON FUNCTION public.wa_auto_queda_volume(uuid, numeric, timestamptz) IS
  'Relatório diário (Automações WhatsApp): contatos de UM tenant cujo volume de mensagens nos últimos 7 dias caiu p_limiar% abaixo da média semanal das 4 semanas anteriores. Só service_role.';

REVOKE ALL ON FUNCTION public.wa_auto_queda_volume(uuid, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_auto_queda_volume(uuid, numeric, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Agendador do relatório diário (a cada 15 min)
--    Sem chave anon no comando (F1): o cabeçalho x-cron-secret é lido do Vault
--    em cada execução. Se nenhuma empresa ligou o relatório, não chama nada.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-auto-relatorio-diario-15min') THEN
    PERFORM cron.unschedule('wa-auto-relatorio-diario-15min');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-auto-relatorio-diario-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://seu-projeto-supabase.supabase.co/functions/v1/wa-auto-relatorio-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret'
    AND EXISTS (SELECT 1 FROM public.wa_auto_config WHERE relatorio_ativo);
  $cron$
);

-- ---------------------------------------------------------------------------
-- 5) Retenção de 90 dias do histórico (F5) — todo dia às 04:17 BRT (07:17 UTC)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-auto-envios-retencao-90d') THEN
    PERFORM cron.unschedule('wa-auto-envios-retencao-90d');
  END IF;
END
$do$;

SELECT cron.schedule(
  'wa-auto-envios-retencao-90d',
  '17 7 * * *',
  $cron$ DELETE FROM public.wa_auto_envios WHERE created_at < now() - interval '90 days'; $cron$
);

COMMIT;

NOTIFY pgrst, 'reload schema';
