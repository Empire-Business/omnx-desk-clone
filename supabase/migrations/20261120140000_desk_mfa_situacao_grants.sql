-- ============================================================================
-- desk_mfa_situacao(): EXECUTE volta para authenticated e service_role
-- ============================================================================
-- O DEFEITO
-- A 20261109140000 criou a função e fechou o acesso como manda a regra da casa:
--   REVOKE ALL ON FUNCTION public.desk_mfa_situacao() FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.desk_mfa_situacao() TO authenticated, service_role;
-- A 20261119180100 refez o corpo das duas funções com CREATE OR REPLACE, que NÃO
-- mexe em ACL: onde a 20261109140000 nunca rodou (no SaaS da empresa, onde a pilha
-- de licença HTAI não existe), a função ficou com o EXECUTE de fábrica para PUBLIC.
--
-- O QUE SE VIU NA PRODUÇÃO (seu-projeto-supabase, SaaS)
--   proacl = =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- Ou seja: anon podia chamar a RPC. Hoje ela devolve, para quem não está logado,
--   {"aal":"aal1","exigida":false,"pendente":false,"superadmin":false}
-- então não vaza nada — mas a permissão tem de voltar ao certo, porque a resposta
-- de hoje não é garantia da de amanhã: basta a função passar a devolver algum dado
-- do usuário para o buraco abrir.
--
-- O CONSERTO
-- Reaplica o fecho da 20261109140000. Idempotente (REVOKE/GRANT podem repetir) e
-- válido nos dois caminhos, com licença e sem: se a função não existir, só registra
-- e sai. Não muda o corpo nem a decisão da função; a 20261119180100 continua sendo
-- a dona do conteúdo.
--
-- Junto veio o conserto da própria 20261119180100, para que instalação nova já saia
-- certa pelos dois caminhos (lá o REVOKE/GRANT é repetido depois do CREATE OR
-- REPLACE). Quem já aplicou a versão anterior não perde nada: esta migração fecha o
-- acesso de qualquer jeito.
-- ============================================================================

DO $do$
DECLARE
  v_acl text;
BEGIN
  IF to_regprocedure('public.desk_mfa_situacao()') IS NULL THEN
    RAISE NOTICE '201400: desk_mfa_situacao() não existe neste banco, nada a ajustar';
    RETURN;
  END IF;

  EXECUTE 'REVOKE ALL ON FUNCTION public.desk_mfa_situacao() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.desk_mfa_situacao() TO authenticated, service_role';

  SELECT coalesce(array_to_string(p.proacl, ' | '), '')
    INTO v_acl
    FROM pg_proc p
   WHERE p.oid = 'public.desk_mfa_situacao()'::regprocedure;

  -- Se ainda houver EXECUTE para PUBLIC (o "=X/" sem dono) ou para anon, a migração
  -- falha em vez de passar em silêncio: permissão errada aqui é buraco de acesso.
  IF v_acl ~ '(^|[ |])=' OR v_acl ~ '(^|[ |])anon=' THEN
    RAISE EXCEPTION '201400: desk_mfa_situacao() continua aberta para PUBLIC/anon (acl: %)', v_acl;
  END IF;

  RAISE NOTICE '201400: desk_mfa_situacao() com EXECUTE só para authenticated e service_role (acl: %)', v_acl;
END
$do$;

NOTIFY pgrst, 'reload schema';
