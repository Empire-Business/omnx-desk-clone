-- ============================================================================
-- App Automações WhatsApp — correção do CHECK dos nomes de modelo em wa_auto_config
-- ============================================================================
-- wa_auto_config_template_nomes_check (migration 20261026140000) usava
-- '^[a-z0-9_]{1,512}$'. O Postgres só aceita contador até 255: a expressão é
-- inválida e QUALQUER gravação de template_relatorio/resumo/link falhava com
-- "invalid regular expression" (achado ao configurar o teste em 26/10/2026; mesmo
-- bug corrigido em wa_auto_modelos pela 20261026210000). Mesma regra reescrita
-- sem contador + length().
--
-- Idempotente. Reversão: não faz sentido recolocar a expressão inválida.
-- ============================================================================

BEGIN;

ALTER TABLE public.wa_auto_config DROP CONSTRAINT IF EXISTS wa_auto_config_template_nomes_check;

ALTER TABLE public.wa_auto_config
  ADD CONSTRAINT wa_auto_config_template_nomes_check CHECK (
        (template_relatorio IS NULL OR (template_relatorio ~ '^[a-z0-9_]+$' AND length(template_relatorio) <= 512))
    AND (template_resumo    IS NULL OR (template_resumo    ~ '^[a-z0-9_]+$' AND length(template_resumo)    <= 512))
    AND (template_link      IS NULL OR (template_link      ~ '^[a-z0-9_]+$' AND length(template_link)      <= 512))
  ) NOT VALID;

ALTER TABLE public.wa_auto_config VALIDATE CONSTRAINT wa_auto_config_template_nomes_check;

COMMIT;
