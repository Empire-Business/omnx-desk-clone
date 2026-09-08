-- Fase C.2 — isolamento por tenant no Storage.
--
-- Dois furos achados no teste com 2º tenant (04/08/2026):
--
-- 1. As RESTRICTIVE existentes liberavam quando o dono era indeterminado
--    (`tenant_do_X(name) IS NULL`). Arquivo órfão — o registro na tabela sumiu,
--    mas o arquivo continua no bucket — virava público entre tenants. Comprovado
--    baixando um comprovante de venda da Aliança com um admin de outro tenant.
--    Agora o indeterminado só libera para quem subiu o arquivo (owner), o que
--    preserva o fluxo "sobe arquivo -> grava registro depois".
--
-- 2. Os buckets `deliveries` e `pj-notas` não tinham isolamento nenhum.

-- ---------------------------------------------------------------------------
-- Resolvedores de tenant para os buckets que faltavam
-- ---------------------------------------------------------------------------

-- Path: deliveries/{delivery_id}/{version_id}/{arquivo}
CREATE OR REPLACE FUNCTION public.tenant_do_arquivo_delivery(p_object_name text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.tenant_id
    FROM public.deliveries d
   WHERE d.id = NULLIF((storage.foldername(p_object_name))[2], '')::uuid
   LIMIT 1;
$function$;

-- Path: {prestador_id}/{arquivo}
CREATE OR REPLACE FUNCTION public.tenant_do_arquivo_pj_nota(p_object_name text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.tenant_id
    FROM public.pj_prestadores p
   WHERE p.id = NULLIF((storage.foldername(p_object_name))[1], '')::uuid
   LIMIT 1;
$function$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation_contratos_anexos   ON storage.objects;
DROP POLICY IF EXISTS tenant_isolation_reportes_anexos    ON storage.objects;
DROP POLICY IF EXISTS tenant_isolation_vendas_comprovantes ON storage.objects;

CREATE POLICY tenant_isolation_contratos_anexos ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id <> 'contratos-anexos'
    OR public.tenant_do_anexo_contrato(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_anexo_contrato(name) IS NULL AND owner = (SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id <> 'contratos-anexos'
    OR public.tenant_do_anexo_contrato(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_anexo_contrato(name) IS NULL AND owner = (SELECT auth.uid()))
  );

CREATE POLICY tenant_isolation_reportes_anexos ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id <> 'reportes-anexos'
    OR public.tenant_do_anexo_reporte(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_anexo_reporte(name) IS NULL AND owner = (SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id <> 'reportes-anexos'
    OR public.tenant_do_anexo_reporte(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_anexo_reporte(name) IS NULL AND owner = (SELECT auth.uid()))
  );

CREATE POLICY tenant_isolation_vendas_comprovantes ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id <> 'vendas-comprovantes'
    OR public.tenant_do_comprovante_venda(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_comprovante_venda(name) IS NULL AND owner = (SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id <> 'vendas-comprovantes'
    OR public.tenant_do_comprovante_venda(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_comprovante_venda(name) IS NULL AND owner = (SELECT auth.uid()))
  );

CREATE POLICY tenant_isolation_deliveries ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id <> 'deliveries'
    OR public.tenant_do_arquivo_delivery(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_arquivo_delivery(name) IS NULL AND owner = (SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id <> 'deliveries'
    OR public.tenant_do_arquivo_delivery(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_arquivo_delivery(name) IS NULL AND owner = (SELECT auth.uid()))
  );

CREATE POLICY tenant_isolation_pj_notas ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id <> 'pj-notas'
    OR public.tenant_do_arquivo_pj_nota(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_arquivo_pj_nota(name) IS NULL AND owner = (SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id <> 'pj-notas'
    OR public.tenant_do_arquivo_pj_nota(name) = (SELECT public.get_user_tenant_id())
    OR (public.tenant_do_arquivo_pj_nota(name) IS NULL AND owner = (SELECT auth.uid()))
  );
