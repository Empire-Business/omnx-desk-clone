-- Mesma autorização da policy ALL existente, com conjunto não correlacionado.
-- Preserva ambos os helpers explícitos; a leitura de cv também mantém sua RLS.
-- Somente TRUE concede acesso: conversation_id NULL continua negado.
-- ALTER USING preserva roles/public, PERMISSIVE, comando ALL e WITH CHECK NULL
-- (que herda USING em INSERT/UPDATE). Policies tenant/restrito não são alteradas.
-- MATERIALIZED impede que o conjunto seja expandido por mensagem candidata.
-- EXPLAIN owner sem ANALYZE confirma CTE Scan/InitPlan, não desempenho RLS real.
BEGIN;
ALTER POLICY chat_messages_access ON public.chat_messages
USING (
  conversation_id IN (
    WITH permitidas AS MATERIALIZED (
      SELECT cv.id
      FROM public.chat_conversations cv
      WHERE public.user_can_access_instance(cv.instance_id)
        AND public.user_can_access_client(public.get_contact_client_id(cv.contact_id))
    )
    SELECT permitidas.id FROM permitidas
  )
);
COMMIT;
