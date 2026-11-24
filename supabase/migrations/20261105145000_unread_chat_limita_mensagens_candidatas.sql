-- Evita varrer o histórico inteiro antes de aplicar a leitura por usuário.
-- SECURITY INVOKER mantém as RLS de conversations, reads e messages em vigor.
-- Catálogo confirma UNIQUE reads(conversation_id, user_id): o LEFT JOIN não duplica conversas.
-- Índices existentes: idx_cmr_user_conv e idx_chat_messages_tenant_conv_criado.
-- EXPLAIN sem ANALYZE confirmou scans parametrizados; desempenho com RLS deve
-- ser confirmado pela sessão real da aplicação após a publicação.
-- A igualdade de tenant entre mensagem/conversa também exclui registros
-- inconsistentes no caminho service/owner sem sessão, sem elevar privilégios.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_unread_counts_for_user(p_user_id uuid, p_instance_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH conversas_visiveis AS MATERIALIZED (
    SELECT c.id, c.tenant_id
    FROM public.chat_conversations c
    WHERE ((SELECT auth.uid()) IS NULL OR p_user_id = (SELECT auth.uid()))
      AND (p_instance_ids IS NULL OR c.instance_id = ANY(p_instance_ids))
      AND ((SELECT auth.uid()) IS NULL OR c.tenant_id = (SELECT public.get_user_tenant_id()))
      AND ((SELECT public.pode_ver_restrito())
           OR COALESCE(c.contact_id <> ALL ((SELECT private.chat_contatos_restritos_ids())::uuid[]), true))
  ), leituras_do_usuario AS MATERIALIZED (
    SELECT r.conversation_id, r.last_read_at
    FROM public.chat_message_reads r
    WHERE r.user_id = p_user_id
      AND ((SELECT auth.uid()) IS NULL OR p_user_id = (SELECT auth.uid()))
  )
  SELECT c.id AS conversation_id, nao_lidas.unread_count
  FROM conversas_visiveis c
  LEFT JOIN leituras_do_usuario r ON r.conversation_id = c.id
  CROSS JOIN LATERAL (
    SELECT count(*) AS unread_count
    FROM (
      -- Sem leitura, datas nulas também eram contadas e continuam elegíveis.
      SELECT 1
      FROM public.chat_messages m
      WHERE r.last_read_at IS NULL
        AND m.tenant_id = c.tenant_id
        AND m.conversation_id = c.id
        AND m.enviado_por_agente = false
        AND m.tipo != 'nota_interna'
      UNION ALL
      -- Com leitura, o limite temporal participa da condição do índice.
      SELECT 1
      FROM public.chat_messages m
      WHERE r.last_read_at IS NOT NULL
        AND m.tenant_id = c.tenant_id
        AND m.conversation_id = c.id
        AND m.enviado_por_agente = false
        AND m.tipo != 'nota_interna'
        AND m.criado_em > r.last_read_at
    ) mensagens_candidatas
  ) nao_lidas
  WHERE nao_lidas.unread_count > 0;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
