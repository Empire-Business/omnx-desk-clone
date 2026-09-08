-- =====================================================================
-- Correções do Supabase Security Advisor
--   1. Habilita RLS na tabela public._webhook_debug
--   2. Converte view public.users_legacy para SECURITY INVOKER
--   3. Converte view public.v_contratos_alertas para SECURITY INVOKER
-- =====================================================================

-- 1. _webhook_debug — habilita RLS (nenhuma policy = acesso negado;
--    edge functions com service_role continuam bypassando)
ALTER TABLE IF EXISTS public._webhook_debug ENABLE ROW LEVEL SECURITY;

-- 2 + 3. Views passam a respeitar as policies do usuário que consulta,
--    em vez do criador da view.
ALTER VIEW IF EXISTS public.users_legacy        SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_contratos_alertas SET (security_invoker = true);
