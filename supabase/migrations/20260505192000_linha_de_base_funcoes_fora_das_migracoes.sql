-- ============================================================================
-- Linha de base (parte 1b): funções que a produção criou fora das migrações
-- ============================================================================
-- Por quê: a migração 20260505192242 endurece (ALTER FUNCTION ... SET
-- search_path / REVOKE EXECUTE) 16 funções que nunca foram criadas por
-- migração (chat interno, reuniões, vínculo contato→cliente). Num projeto
-- Supabase novo ela parava com "function ... does not exist".
--
-- O que faz: cria cada função com a definição da produção em 19/05/2026
-- (supabase/SETUP_COMPLETE.sql), SÓ SE ela ainda não existir. Não troca
-- nenhuma função existente.
--
-- Produção: não muda nada (todas existem). Para alinhar o histórico:
--   supabase migration repair --status applied 20260505192000
-- ============================================================================

SET check_function_bodies = false;

-- public.auto_add_admins_to_dept_group()
DO $f$ BEGIN
  IF to_regprocedure('public.auto_add_admins_to_dept_group()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.auto_add_admins_to_dept_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo = 'department' THEN
    INSERT INTO internal_conversation_members (conversation_id, user_id, role)
    SELECT NEW.id, u.id, 'admin'
    FROM users u
    WHERE u.perfil = 'admin' AND u.ativo = true
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.auto_match_contacts_to_clients()
DO $f$ BEGIN
  IF to_regprocedure('public.auto_match_contacts_to_clients()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.auto_match_contacts_to_clients()
 RETURNS TABLE(contact_id uuid, contact_nome text, client_id uuid, client_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH normalized_clients AS (
    SELECT c.id, c.nome, REGEXP_REPLACE(c.telefone, '[^0-9]', '', 'g') as phone_digits
    FROM clients c
    WHERE c.telefone IS NOT NULL AND c.telefone != ''
  ),
  matches AS (
    SELECT DISTINCT ON (cc.id)
      cc.id as contact_id, cc.nome as contact_nome,
      nc.id as matched_client_id, nc.nome as client_nome
    FROM chat_contacts cc
    JOIN normalized_clients nc ON (
      RIGHT(REGEXP_REPLACE(cc.numero_whatsapp, '[^0-9]', '', 'g'), 11) = RIGHT(nc.phone_digits, 11)
    )
    WHERE cc.client_id IS NULL
    ORDER BY cc.id, nc.nome
  )
  UPDATE chat_contacts SET client_id = m.matched_client_id
  FROM matches m
  WHERE chat_contacts.id = m.contact_id
  RETURNING chat_contacts.id, chat_contacts.nome, chat_contacts.client_id, m.client_nome;
END;
$function$$def$;
  END IF;
END $f$;

-- public.clean_stale_typing()
DO $f$ BEGIN
  IF to_regprocedure('public.clean_stale_typing()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.clean_stale_typing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM internal_typing_indicators WHERE started_at < now() - interval '10 seconds';
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.compute_meeting_duration()
DO $f$ BEGIN
  IF to_regprocedure('public.compute_meeting_duration()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.compute_meeting_duration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.get_contact_client_id(uuid)
DO $f$ BEGIN
  IF to_regprocedure('public.get_contact_client_id(uuid)') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.get_contact_client_id(p_contact_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT client_id FROM chat_contacts WHERE id = p_contact_id;
$function$$def$;
  END IF;
END $f$;

-- public.get_internal_last_messages(uuid[])
DO $f$ BEGIN
  IF to_regprocedure('public.get_internal_last_messages(uuid[])') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.get_internal_last_messages(p_conv_ids uuid[])
 RETURNS TABLE(conversation_id uuid, id uuid, user_id uuid, conteudo text, tipo text, media_url text, criado_em timestamp with time zone, user_nome text, user_perfil text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.id,
    m.user_id,
    m.conteudo,
    m.tipo::text,
    m.media_url,
    m.criado_em,
    u.nome AS user_nome,
    u.perfil::text AS user_perfil
  FROM internal_messages m
  LEFT JOIN users u ON u.id = m.user_id
  WHERE m.conversation_id = ANY(p_conv_ids)
  ORDER BY m.conversation_id, m.criado_em DESC
$function$$def$;
  END IF;
END $f$;

-- public.get_internal_unread_counts(uuid)
DO $f$ BEGIN
  IF to_regprocedure('public.get_internal_unread_counts(uuid)') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.get_internal_unread_counts(p_user_id uuid)
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.conversation_id,
    COUNT(*) AS unread_count
  FROM internal_messages m
  JOIN internal_conversation_members mem
    ON mem.conversation_id = m.conversation_id AND mem.user_id = p_user_id
  LEFT JOIN internal_message_reads r
    ON r.conversation_id = m.conversation_id AND r.user_id = p_user_id
  WHERE m.user_id <> p_user_id
    AND m.criado_em > COALESCE(r.last_read_at, '1970-01-01T00:00:00Z'::timestamptz)
  GROUP BY m.conversation_id
$function$$def$;
  END IF;
END $f$;

-- public.match_contact_to_client(uuid, text)
DO $f$ BEGIN
  IF to_regprocedure('public.match_contact_to_client(uuid, text)') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.match_contact_to_client(p_contact_id uuid, p_whatsapp text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_digits text;
BEGIN
  -- Extract last 11 digits from the WhatsApp number
  v_digits := RIGHT(regexp_replace(p_whatsapp, '[^0-9]', '', 'g'), 11);
  
  IF length(v_digits) < 8 THEN
    RETURN NULL;
  END IF;

  -- Try to find a client whose phone matches
  SELECT c.id INTO v_client_id
  FROM clients c
  WHERE regexp_replace(c.telefone, '[^0-9]', '', 'g') != ''
    AND RIGHT(regexp_replace(c.telefone, '[^0-9]', '', 'g'), 11) = v_digits
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    UPDATE chat_contacts SET client_id = v_client_id WHERE id = p_contact_id AND client_id IS NULL;
  END IF;

  RETURN v_client_id;
END;
$function$$def$;
  END IF;
END $f$;

-- public.sync_dept_gerente_to_group()
DO $f$ BEGIN
  IF to_regprocedure('public.sync_dept_gerente_to_group()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.sync_dept_gerente_to_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Find department group
  SELECT id INTO v_conv_id
  FROM internal_conversations
  WHERE tipo = 'department' AND department_id = NEW.id;

  IF v_conv_id IS NOT NULL THEN
    -- Remove old gerente if changed
    IF OLD.gerente_id IS NOT NULL AND OLD.gerente_id IS DISTINCT FROM NEW.gerente_id THEN
      DELETE FROM internal_conversation_members
      WHERE conversation_id = v_conv_id AND user_id = OLD.gerente_id
        AND NOT EXISTS (
          SELECT 1 FROM chat_department_agents
          WHERE department_id = NEW.id AND user_id = OLD.gerente_id
        );
    END IF;

    -- Add new gerente
    IF NEW.gerente_id IS NOT NULL THEN
      INSERT INTO internal_conversation_members (conversation_id, user_id, role)
      VALUES (v_conv_id, NEW.gerente_id, 'admin')
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.sync_dept_group_members()
DO $f$ BEGIN
  IF to_regprocedure('public.sync_dept_group_members()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.sync_dept_group_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv_id UUID;
BEGIN
  -- Find the department group conversation
  SELECT id INTO conv_id FROM internal_conversations
  WHERE tipo = 'department' AND department_id = COALESCE(NEW.department_id, OLD.department_id);

  IF conv_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO internal_conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, NEW.user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    -- Don't remove admins (they stay in all groups)
    DELETE FROM internal_conversation_members
    WHERE conversation_id = conv_id AND user_id = OLD.user_id
      AND user_id NOT IN (SELECT id FROM users WHERE perfil = 'admin');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$$def$;
  END IF;
END $f$;

-- public.sync_user_metadata_perfil()
DO $f$ BEGIN
  IF to_regprocedure('public.sync_user_metadata_perfil()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.sync_user_metadata_perfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.perfil IS DISTINCT FROM OLD.perfil THEN
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('perfil', NEW.perfil)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.trg_auto_match_contact_client()
DO $f$ BEGIN
  IF to_regprocedure('public.trg_auto_match_contact_client()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.trg_auto_match_contact_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_client_id UUID;
BEGIN
  -- Only try if client_id is null
  IF NEW.client_id IS NOT NULL THEN RETURN NEW; END IF;
  
  -- Find matching client by phone (last 11 digits)
  SELECT c.id INTO matched_client_id
  FROM clients c
  WHERE c.telefone IS NOT NULL AND c.telefone != ''
    AND RIGHT(REGEXP_REPLACE(NEW.numero_whatsapp, '[^0-9]', '', 'g'), 11) = 
        RIGHT(REGEXP_REPLACE(c.telefone, '[^0-9]', '', 'g'), 11)
  LIMIT 1;
  
  IF matched_client_id IS NOT NULL THEN
    NEW.client_id := matched_client_id;
  END IF;
  
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.update_aguardando_resposta()
DO $f$ BEGIN
  IF to_regprocedure('public.update_aguardando_resposta()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.update_aguardando_resposta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.enviado_por_agente = false AND NEW.enviado_por_ia = false THEN
    -- Client message → mark as awaiting response
    UPDATE chat_conversations 
    SET aguardando_resposta = true, 
        ultima_msg_cliente_em = NEW.criado_em
    WHERE id = NEW.conversation_id;
  ELSE
    -- Agent or IA message → mark as responded
    UPDATE chat_conversations 
    SET aguardando_resposta = false
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.update_meetings_updated_at()
DO $f$ BEGIN
  IF to_regprocedure('public.update_meetings_updated_at()') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.update_meetings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$$def$;
  END IF;
END $f$;

-- public.user_can_access_client(uuid)
DO $f$ BEGIN
  IF to_regprocedure('public.user_can_access_client(uuid)') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.user_can_access_client(p_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- No client = Caixa Geral = everyone can access
    WHEN p_client_id IS NULL THEN true
    -- Admin/gerente/agente_chat/atendimento see everything
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid())
         IN ('admin', 'gerente', 'agente_chat', 'atendimento', 'admin_cobranca', 'agente_cobranca')
    THEN true
    -- Estrategista: only their assigned clients + NULL
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'estrategista'
    THEN EXISTS (
      SELECT 1 FROM client_assignments ca
      WHERE ca.user_id = auth.uid()
        AND ca.client_id = p_client_id
    )
    ELSE false
  END
$function$$def$;
  END IF;
END $f$;

-- public.user_can_access_instance(uuid)
DO $f$ BEGIN
  IF to_regprocedure('public.user_can_access_instance(uuid)') IS NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.user_can_access_instance(p_instance_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid())
         IN ('admin', 'gerente')
    THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.user_instance_assignments uia
      WHERE uia.user_id = auth.uid()
        AND uia.instance_id = p_instance_id
    )
  END
$function$$def$;
  END IF;
END $f$;
