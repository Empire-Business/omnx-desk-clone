-- ============================================================================
-- Fecha dois vazamentos para anon (achado da revisão da Vera, 20/11/2026)
-- ============================================================================
-- Entra na fila normal de instalação e de atualização do app; nada é aplicado em
-- produção por esta migração.
--
-- 1) private.chat_contatos_restritos_ids() e private.chat_conversas_restritas_ids()
--    são SECURITY DEFINER e a 20261026260000 deu EXECUTE a anon. Sem sessão, a
--    empresa da sessão é NULL e a condição `t.tid IS NULL OR c.tenant_id = t.tid`
--    devolvia os ids de contatos e de conversas restritas de TODAS as empresas:
--    bastava chamar a RPC com a chave anon.
--
--    Agora, sem empresa na sessão, as duas devolvem vazio (`t.tid IS NOT NULL`).
--    Com sessão nada muda — a condição que sobra é a mesma de antes
--    (c.tenant_id = t.tid), então as políticas que usam as funções avaliam igual
--    para quem está logado.
--
--    Para anon as políticas não abrem nada: as permissivas das tabelas de conversa
--    passam por auth.uid() (user_can_access_instance(), user_can_access_client(),
--    users.id = auth.uid()), que é NULL sem sessão. Conferido no ensaio: anon lê
--    zero linha em chat_conversations e chat_messages antes e depois daqui.
--
--    O GRANT EXECUTE de anon NÃO é revogado nesta migração: revogar depende do ok
--    do Bruno, porque algum serviço pode chamar a chave anon.
--
-- 2) public.department_instance_assignments tinha
--      department_instance_assignments_select: PERMISSIVE FOR SELECT TO public
--      USING (true)
--    e anon lia a tabela inteira. A política passa a valer para authenticated, com
--    o escopo de empresa explícito. Para quem tem sessão a visão é a mesma de
--    antes: a política restritiva da fase B já limitava por
--    tenant_id = get_user_tenant_id().
--
-- Idempotente: pode rodar de novo sem erro, em instalação nova ou já migrada.
-- Roda tudo numa transação com lock_timeout de 5 s (mesmo padrão da
-- 20261026255000): o DROP/CREATE POLICY do item 2 pega AccessExclusiveLock em
-- department_instance_assignments e, sem o limite, uma consulta longa enfileiraria
-- as leituras da tabela atrás do lock.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) Sem sessão, sem ids de outro tenant -------------------------------------

CREATE OR REPLACE FUNCTION private.chat_contatos_restritos_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH t AS (SELECT public.get_user_tenant_id() AS tid)
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[])
    FROM public.chat_contacts c, t
   WHERE c.restrito_admin
     AND t.tid IS NOT NULL
     AND c.tenant_id = t.tid
$fn$;

CREATE OR REPLACE FUNCTION private.chat_conversas_restritas_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH t AS (SELECT public.get_user_tenant_id() AS tid)
  SELECT COALESCE(array_agg(cv.id), '{}'::uuid[])
    FROM public.chat_contacts c
    JOIN public.chat_conversations cv ON cv.contact_id = c.id
    CROSS JOIN t
   WHERE c.restrito_admin
     AND t.tid IS NOT NULL
     AND c.tenant_id = t.tid
$fn$;

COMMENT ON FUNCTION private.chat_contatos_restritos_ids() IS
  'Ids de contatos restritos da empresa da sessão. Sem sessão: vazio (nunca de outro tenant).';
COMMENT ON FUNCTION private.chat_conversas_restritas_ids() IS
  'Ids de conversas de contatos restritos da empresa da sessão. Sem sessão: vazio.';

-- O ACL fica como está (anon mantém EXECUTE, por decisão pendente do Bruno);
-- CREATE OR REPLACE não mexe em ACL, então não há REVOKE/GRANT aqui de propósito.

-- 2) department_instance_assignments: anon não lê -----------------------------

DROP POLICY IF EXISTS "department_instance_assignments_select" ON public."department_instance_assignments";
CREATE POLICY "department_instance_assignments_select" ON public."department_instance_assignments"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

COMMIT;
