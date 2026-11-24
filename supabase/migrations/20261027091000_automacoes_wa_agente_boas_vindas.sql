-- Assistente da equipe no WhatsApp — boas-vindas (plano 1e).
--
-- A ação admin 'boas_vindas' (supabase/functions/_shared/wa-agente-admin-acoes.ts)
-- registra cada envio em wa_auto_envios com tipo 'agente_boas_vindas' e
-- chave_idempotencia 'agente_boas_vindas:<destino>' (sem data): a UNIQUE
-- (tenant_id, chave_idempotencia) garante UMA ÚNICA boas-vindas por pessoa/grupo.
--
-- Aqui só ampliamos o CHECK de tipo (migration 20261026120000) para aceitar o novo
-- tipo. Nada mais muda: RLS, RESTRICTIVE de grupo (20261026260000) e GRANTs seguem.
-- NÃO APLICADA — aplicar só com aprovação, depois de 20261027090000.
-- Rollback: voltar o CHECK para a lista antiga (apague antes as linhas
-- tipo = 'agente_boas_vindas', senão o CHECK antigo falha).

BEGIN;

ALTER TABLE public.wa_auto_envios DROP CONSTRAINT IF EXISTS wa_auto_envios_tipo_check;
ALTER TABLE public.wa_auto_envios
  ADD CONSTRAINT wa_auto_envios_tipo_check
  CHECK (tipo IN ('relatorio_diario', 'resumo_semanal', 'agendamento_link', 'teste', 'agente_boas_vindas'));

COMMIT;

NOTIFY pgrst, 'reload schema';
