-- Exigência de troca NO PRÓXIMO LOGIN: a marcação não altera auth.users nem revoga sessões.
-- A tabela nasce vazia; a operação autorizada marca somente os cinco usuários identificados.
-- Conclusão ocorre exclusivamente no backend após Auth self-update confirmado (não por hash/metadado).
BEGIN;
CREATE TABLE public.desk_password_requirements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  requirement_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  required_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT desk_password_requirement_order CHECK (completed_at IS NULL OR completed_at >= required_at)
);
ALTER TABLE public.desk_password_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desk_password_requirements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desk_password_requirements TO service_role;
COMMENT ON TABLE public.desk_password_requirements IS 'Marcador administrativo de troca no próximo login. Nunca contém senha/hash. Nova marcação exige novo requirement_id; nenhuma escrita pelo usuário.';

-- Sem parâmetros: o usuário nunca escolhe identidade/sessão e não pode limpar o marcador.
-- Lê auth.sessions.created_at, nunca JWT.iat (renovação de token não é novo login).
CREATE OR REPLACE FUNCTION public.desk_password_change_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sid_text text := auth.jwt()->>'session_id';
  v_sid uuid;
  v_created timestamptz;
  v_tenant uuid;
  v_required timestamptz;
  v_active boolean := false;
BEGIN
  IF v_user IS NULL OR v_sid_text IS NULL OR v_sid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('state','invalid_session','requirement_active',false,'session_id',null);
  END IF;
  v_sid := v_sid_text::uuid;
  SELECT u.tenant_id INTO v_tenant FROM public.users u
  JOIN public.profiles p ON p.user_id=u.id AND p.tenant_id=u.tenant_id
  WHERE u.id=v_user AND u.ativo IS DISTINCT FROM false;
  SELECT s.created_at INTO v_created FROM auth.sessions s
  WHERE s.id=v_sid AND s.user_id=v_user AND (s.not_after IS NULL OR s.not_after > now());
  IF v_tenant IS NULL OR v_created IS NULL THEN
    RETURN jsonb_build_object('state','invalid_session','requirement_active',false,'session_id',v_sid);
  END IF;
  SELECT r.required_at INTO v_required FROM public.desk_password_requirements r
  WHERE r.user_id=v_user AND r.completed_at IS NULL;
  v_active := FOUND;
  -- Uma mudança de empresa não apaga a exigência da identidade; somente Auth confirmado conclui.
  RETURN jsonb_build_object('state', CASE WHEN v_active AND v_created >= v_required THEN 'password_change_required' ELSE 'ok' END,
    'requirement_active',v_active,'session_id',v_sid);
END;
$$;
REVOKE ALL ON FUNCTION public.desk_password_change_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desk_password_change_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.desk_password_session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT (public.desk_password_change_status()->>'state')='ok' $$;
REVOKE ALL ON FUNCTION public.desk_password_session_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desk_password_session_allowed() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.tenant_id FROM public.profiles p
  JOIN public.users u ON u.id=p.user_id AND u.tenant_id=p.tenant_id
  WHERE p.user_id=auth.uid() AND u.ativo IS DISTINCT FROM false
    AND public.desk_password_session_allowed()
$$;

-- As políticas permissivas existentes continuam iguais. Este AND também cobre Storage
-- com acesso por proprietário/perfil sem get_user_tenant_id. Não se aplica a anon/serviço.
CREATE POLICY desk_password_change_gate ON storage.objects AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((SELECT public.desk_password_session_allowed()))
  WITH CHECK ((SELECT public.desk_password_session_allowed()));

-- RPCs SECURITY DEFINER de leitura acessíveis diretamente: guardas de sessão não dependem
-- de RLS nas tabelas lidas pelo dono. Preserva os contratos e o caminho técnico existente.
CREATE OR REPLACE FUNCTION public.get_agent_tma(p_agent_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(tma_minutos numeric, total_conversas bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF auth.role()='authenticated' AND NOT public.desk_password_session_allowed() THEN RETURN; END IF;
  RETURN QUERY SELECT ROUND(AVG(EXTRACT(EPOCH FROM (c.primeira_resposta_em-c.criado_em))/60)::NUMERIC,1),COUNT(*)
  FROM public.chat_conversations c WHERE c.agente_id=p_agent_id AND c.primeira_resposta_em IS NOT NULL
    AND c.criado_em>=now()-make_interval(days=>p_days);
END;
$$;
CREATE OR REPLACE FUNCTION public.get_client_last_contact(p_client_ids uuid[])
RETURNS TABLE(client_id uuid, ultimo_contato timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF auth.role()='authenticated' AND NOT public.desk_password_session_allowed() THEN RETURN; END IF;
  RETURN QUERY SELECT cc.client_id,MAX(cv.atualizado_em) FROM public.chat_contacts cc
  JOIN public.chat_conversations cv ON cv.contact_id=cc.id
  WHERE cc.client_id=ANY(p_client_ids) AND cv.status!='encerrada' GROUP BY cc.client_id
  UNION ALL SELECT unnest(p_client_ids),NULL::timestamptz WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_contacts cc2 JOIN public.chat_conversations cv2 ON cv2.contact_id=cc2.id
    WHERE cc2.client_id=ANY(p_client_ids));
END;
$$;
CREATE OR REPLACE FUNCTION public.get_contact_client_id(p_contact_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT client_id FROM public.chat_contacts WHERE id=p_contact_id
    AND (auth.role() IS DISTINCT FROM 'authenticated' OR public.desk_password_session_allowed())
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
