-- Catálogo LIVE e consumidores revisados em 2026-11-05:
-- as primeiras 3 RPCs não têm consumidores src/Edge/scripts, callers SQL ou jobs cron.
-- seed_tenant só é chamado pelo provision-tenant com service_role; nenhum caller humano.
-- Mantém corpos, owner postgres e EXECUTE explícito de service_role.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.get_internal_unread_counts(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_internal_last_messages(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_match_contacts_to_clients()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_tenant(uuid)
  FROM PUBLIC, anon, authenticated;

-- Impede autoinscrição em conversa privada pela API direta. Admin/gerente já
-- possuem acesso amplo às conversas na RLS existente. SELECT não é alterado.
-- Triggers SECURITY DEFINER que sincronizam departamentos mantêm seu acesso.
CREATE POLICY internal_members_insert_gestor
ON public.internal_conversation_members AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (SELECT public.get_user_tenant_id())
  AND (SELECT public.is_admin_or_manager())
);
CREATE POLICY internal_members_update_gestor
ON public.internal_conversation_members AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  tenant_id = (SELECT public.get_user_tenant_id())
  AND (SELECT public.is_admin_or_manager())
)
WITH CHECK (
  tenant_id = (SELECT public.get_user_tenant_id())
  AND (SELECT public.is_admin_or_manager())
);
CREATE POLICY internal_members_delete_gestor
ON public.internal_conversation_members AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  tenant_id = (SELECT public.get_user_tenant_id())
  AND (SELECT public.is_admin_or_manager())
);
COMMIT;
