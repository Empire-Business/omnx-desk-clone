-- ============================================================================
-- App Automações WhatsApp — correção do CHECK do nome do modelo + reforço
-- ============================================================================
-- 1) wa_auto_modelos.nome usava '^[a-z][a-z0-9_]{0,511}$'. O Postgres só aceita
--    contador até 255 ({m,n} com n <= 255): a expressão é inválida e TODA
--    gravação na tabela falhava com "invalid regular expression" (achado do
--    teste de isolamento de 26/10/2026). Mesma regra (nome da Meta, até 512
--    caracteres) reescrita como padrão sem contador + length().
-- 2) Reforço: retira TRUNCATE de anon/authenticated nas tabelas do app e em
--    tenant_integracoes (privilégio padrão do Supabase; TRUNCATE ignora RLS).
--
-- Idempotente. Reversão: recolocar o CHECK antigo não faz sentido (é inválido);
-- para devolver TRUNCATE: GRANT TRUNCATE ON <tabela> TO authenticated;
-- ============================================================================

BEGIN;

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.wa_auto_modelos'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%nome%'
  LOOP
    EXECUTE format('ALTER TABLE public.wa_auto_modelos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.wa_auto_modelos
  ADD CONSTRAINT wa_auto_modelos_nome_check
  CHECK (nome ~ '^[a-z][a-z0-9_]*$' AND length(nome) <= 512);

REVOKE TRUNCATE ON public.wa_auto_config,
                   public.wa_auto_gestores,
                   public.wa_auto_regras_anomalia,
                   public.wa_auto_envios,
                   public.wa_auto_modelos,
                   public.wa_auto_modelos_chamadas,
                   public.tenant_integracoes
  FROM anon, authenticated;

COMMIT;
