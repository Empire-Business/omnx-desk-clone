-- =====================================================================
-- Defesa em profundidade: marca views públicas como security_invoker.
-- =====================================================================
-- Postgres cria views como security_definer por padrão — owner=postgres
-- bypassa RLS. Se a view tem GRANT pra authenticated/anon, qualquer user
-- consegue ler linhas que o RLS da tabela base esconderia.
-- security_invoker=true faz a view rodar com os privilégios de quem
-- consulta, respeitando o RLS da tabela base.
-- =====================================================================

ALTER VIEW public.users_legacy           SET (security_invoker = true);
ALTER VIEW public.v_alertas_estrategista SET (security_invoker = true);
ALTER VIEW public.v_contratos_alertas    SET (security_invoker = true);
