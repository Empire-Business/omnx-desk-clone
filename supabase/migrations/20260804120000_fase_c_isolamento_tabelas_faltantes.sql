-- Fase C.1 — fecha as tabelas que ficaram de fora do isolamento por tenant.
--
-- Achado no teste com um 2º tenant real (04/08/2026): um admin de outro tenant
-- lia (e em employees/company_areas até escrevia) dados alheios, porque estas
-- 6 tabelas nunca ganharam a policy RESTRICTIVE `tenant_isolation` das outras 91.
--
-- O padrão é o mesmo já usado no resto do schema: a RESTRICTIVE entra em AND
-- com as regras de perfil que já existem, então ninguém perde acesso ao que é
-- do seu próprio tenant.

-- ---------------------------------------------------------------------------
-- 1) As 6 tabelas sem tenant_isolation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees', 'positions', 'company_areas', 'subareas',
    'profiles', 'tenant_integracoes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        AS RESTRICTIVE FOR ALL TO authenticated
        USING (tenant_id = (SELECT public.get_user_tenant_id()))
        WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))
    $f$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) tenants — cada um enxerga a própria empresa; o admin do mestre enxerga todas
--    (é ele quem opera a tela /empresas). O provisionamento roda por service_role
--    na edge function `provision-tenant`, que não passa por RLS.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenants_read_all ON public.tenants;
DROP POLICY IF EXISTS tenants_admin_all ON public.tenants;

CREATE POLICY tenants_read_own ON public.tenants
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_user_tenant_id()) OR public.is_master_admin());

-- Antes, `is_admin()` sozinho deixava um admin qualquer reescrever a marca
-- (nome, cores, logo, custom_domain) de QUALQUER empresa.
CREATE POLICY tenants_admin_write ON public.tenants
  FOR ALL TO authenticated
  USING (
    (public.is_admin() AND id = (SELECT public.get_user_tenant_id()))
    OR public.is_master_admin()
  )
  WITH CHECK (
    (public.is_admin() AND id = (SELECT public.get_user_tenant_id()))
    OR public.is_master_admin()
  );
