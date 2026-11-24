-- Fecha consulta anônima da associação contact UUID -> client UUID.
-- Catálogo confirmou grants explícitos authenticated/service_role e owner postgres.
-- O helper é usado pelas policies do chat autenticado; corpo e políticas intactos.
-- Login/reset/meet/venda pública não usam o helper; portal exige autenticação.
-- Anon já não tem instância de chat autorizada; acesso direto continua negado.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.get_contact_client_id(uuid)
  FROM PUBLIC, anon;
COMMIT;
