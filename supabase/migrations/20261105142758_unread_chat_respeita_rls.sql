-- A contagem usa as mesmas RLS que a leitura normal do chat.
-- Catálogo confirmou SELECT authenticated em messages/conversations/reads,
-- USAGE private e EXECUTE do helper de contatos restritos.
-- UID nulo preserva owner/service; anon não possui EXECUTE desta assinatura.
-- Nenhum grant, filtro de negócio ou cálculo de contagem é modificado.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_unread_counts_for_user(p_user_id uuid, p_instance_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    m.conversation_id,
    count(*) AS unread_count
  FROM public.chat_messages m
  JOIN public.chat_conversations c ON c.id = m.conversation_id
  LEFT JOIN public.chat_message_reads r
    ON r.conversation_id = m.conversation_id
   AND r.user_id = p_user_id
  WHERE (auth.uid() IS NULL OR p_user_id = auth.uid())
    AND m.enviado_por_agente = false
    AND m.tipo != 'nota_interna'
    AND (r.last_read_at IS NULL OR m.criado_em > r.last_read_at)
    AND (p_instance_ids IS NULL OR c.instance_id = ANY(p_instance_ids))
    AND (auth.uid() IS NULL OR c.tenant_id = (SELECT public.get_user_tenant_id()))
    AND ((SELECT public.pode_ver_restrito())
         OR COALESCE(c.contact_id <> ALL ((SELECT private.chat_contatos_restritos_ids())::uuid[]), true))
  GROUP BY m.conversation_id
  HAVING count(*) > 0;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
