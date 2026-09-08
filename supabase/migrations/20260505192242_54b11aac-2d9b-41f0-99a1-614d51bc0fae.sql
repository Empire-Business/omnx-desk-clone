
-- 1. Privilege escalation fix
DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update_self_or_admin"
ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid() OR (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin')
WITH CHECK (id = auth.uid() OR (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin');

-- 2. Anonymous public read on meetings
DROP POLICY IF EXISTS "meetings_anon_read_by_room" ON public.meetings;

-- 3. Tighten permissive policies
DROP POLICY IF EXISTS "Authenticated users can do anything on poll votes" ON public.internal_post_poll_votes;
CREATE POLICY "poll_votes_authenticated" ON public.internal_post_poll_votes
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert chat_contact_clients" ON public.chat_contact_clients;
DROP POLICY IF EXISTS "Authenticated users can update chat_contact_clients" ON public.chat_contact_clients;
DROP POLICY IF EXISTS "Authenticated users can delete chat_contact_clients" ON public.chat_contact_clients;
CREATE POLICY "chat_contact_clients_insert" ON public.chat_contact_clients
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "chat_contact_clients_update" ON public.chat_contact_clients
FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "chat_contact_clients_delete" ON public.chat_contact_clients
FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "approvals_insert" ON public.delivery_approvals;
CREATE POLICY "approvals_insert" ON public.delivery_approvals
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "comments_insert" ON public.delivery_comments;
CREATE POLICY "comments_insert" ON public.delivery_comments
FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "system_insert_audit_logs" ON public.audit_logs;
CREATE POLICY "auth_insert_audit_logs" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "system_manage_email_queue" ON public.email_queue;
CREATE POLICY "service_role_manage_email_queue" ON public.email_queue
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Function search_path hardening
ALTER FUNCTION public.match_contact_to_client(uuid, text) SET search_path = public;
ALTER FUNCTION public.sync_user_metadata_perfil() SET search_path = public;
ALTER FUNCTION public.user_can_access_client(uuid) SET search_path = public;
ALTER FUNCTION public.sync_dept_group_members() SET search_path = public;
ALTER FUNCTION public.sync_dept_gerente_to_group() SET search_path = public;
ALTER FUNCTION public.auto_match_contacts_to_clients() SET search_path = public;
ALTER FUNCTION public.trg_auto_match_contact_client() SET search_path = public;
ALTER FUNCTION public.get_unread_counts_for_user(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.get_contact_client_id(uuid) SET search_path = public;
ALTER FUNCTION public.user_can_access_instance(uuid) SET search_path = public;
ALTER FUNCTION public.auto_add_admins_to_dept_group() SET search_path = public;
ALTER FUNCTION public.update_aguardando_resposta() SET search_path = public;
ALTER FUNCTION public.update_meetings_updated_at() SET search_path = public;
ALTER FUNCTION public.clean_stale_typing() SET search_path = public;
ALTER FUNCTION public.compute_meeting_duration() SET search_path = public;
ALTER FUNCTION public.get_internal_unread_counts(uuid) SET search_path = public;
ALTER FUNCTION public.get_internal_last_messages(uuid[]) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_atualizado_em() SET search_path = public;
ALTER FUNCTION public.update_app_settings_timestamp() SET search_path = public;

-- 5. Revoke EXECUTE on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.match_contact_to_client(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_match_contacts_to_clients() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_user_metadata_perfil() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_dept_group_members() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_dept_gerente_to_group() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_match_contact_client() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_add_admins_to_dept_group() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_aguardando_resposta() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_meetings_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clean_stale_typing() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_meeting_duration() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_atualizado_em() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_app_settings_timestamp() FROM anon, authenticated;

-- 6. View as security_invoker
ALTER VIEW IF EXISTS public.v_dept_member_metrics SET (security_invoker = true);
