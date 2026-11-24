-- Corrige: "permission denied for function ponte_crm_ligada" ao salvar o link do
-- Clicksign (e ao mudar status/data de assinatura do contrato, ou editar uma venda).
--
-- Causa: a migration 20261109100000_instalacao_do_zero (branch htai/app-instalavel)
-- recriou os gatilhos da ponte com WHEN (public.ponte_crm_ligada()) e tirou o EXECUTE
-- de authenticated. A condição WHEN roda com as permissões de quem fez a edição — não
-- do dono do gatilho — então todo usuário logado passou a ser barrado.
--
-- A função só devolve um booleano ("a ponte com o CRM está ligada?") e é SECURITY
-- DEFINER, então liberar o EXECUTE para authenticated não expõe dado nenhum.
-- Condicional: em bancos montados só pelo main a função não existe.

DO $do$
BEGIN
  IF to_regprocedure('public.ponte_crm_ligada()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.ponte_crm_ligada() TO authenticated, anon;
  END IF;
END
$do$;
