-- Fase C — cinto de segurança do app de Atendimento
--
-- As 5 tabelas do app nasceram com o filtro de tenant DENTRO de cada policy
-- PERMISSIVE (tenant_id = get_user_tenant_id() AND has_permissao(...)). Isso isola
-- hoje, mas policies PERMISSIVE se somam com OR: basta alguém criar amanhã mais uma
-- policy sem o filtro para o isolamento cair sozinho.
--
-- As outras 98 tabelas do sistema têm, além disso, uma policy RESTRICTIVE chamada
-- tenant_isolation, que entra em AND com todas as demais e não depende de ninguém
-- lembrar do filtro. Esta migration coloca as 5 tabelas do Atendimento no mesmo
-- padrão.
--
-- É aditivo: não muda quem consegue ver o quê hoje, porque a condição já era exigida
-- por cada policy individualmente. Fecha a porta para o futuro.
--
-- Não afeta o trigger de histórico (tg_atendimento_demanda_historico): ele é
-- SECURITY DEFINER e roda como owner, que não passa por RLS.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'atendimento_demandas',
    'atendimento_tipos',
    'atendimento_etapas',
    'atendimento_comentarios',
    'atendimento_historico'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING      (tenant_id = (SELECT public.get_user_tenant_id()))
      WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))
    $f$, t);
  END LOOP;
END $$;
