-- ============================================================================
-- App Automações WhatsApp — link de reunião enviado UMA vez por reunião (9.5)
-- ============================================================================
-- Achado B1 da auditoria: a chave de idempotência do agendamento é por
-- (reunião + grupo). Com dois pedidos simultâneos para a MESMA reunião em dois
-- grupos diferentes do cliente, as duas reservas passavam e o link saía duas
-- vezes. Este índice garante no banco: no máximo UMA linha 'pendente' ou
-- 'enviado' por (empresa, reunião). A edge function wa-auto-agendar trata a
-- violação (23505) como "envio já em andamento".
--
-- Colunas (migration 20261026120000): wa_auto_envios.tenant_id, tipo, status,
-- payload (jsonb) — o id da reunião fica em payload->>'meeting_id'.
--
-- Idempotente (IF NOT EXISTS). Se já houver duplicidade, para com erro claro em
-- vez de criar o índice pela metade.
--
-- Reversão:
--   DROP INDEX IF EXISTS public.uq_wa_auto_envios_agendamento_reuniao;
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.wa_auto_envios
     WHERE tipo = 'agendamento_link'
       AND status IN ('pendente', 'enviado')
       AND payload ? 'meeting_id'
     GROUP BY tenant_id, payload->>'meeting_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'wa_auto_envios tem mais de um link pendente/enviado para a mesma reunião; revise (marque os extras como falhou) antes de aplicar esta migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_auto_envios_agendamento_reuniao
  ON public.wa_auto_envios (tenant_id, (payload->>'meeting_id'))
  WHERE tipo = 'agendamento_link' AND status IN ('pendente', 'enviado');

COMMIT;
