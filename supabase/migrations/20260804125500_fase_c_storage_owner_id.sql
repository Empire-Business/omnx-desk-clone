-- Fase C.2c — usa owner_id além de owner.
--
-- A versão atual do Storage grava o autor do upload em `owner_id` (text) e deixa
-- a coluna legada `owner` (uuid) nula. Como a C.2b só olhava `owner`, quem subia
-- um arquivo não conseguia lê-lo de volta enquanto o registro correspondente não
-- existisse. Aqui a regra passa a aceitar as duas colunas.

CREATE OR REPLACE FUNCTION public.storage_autor_do_upload(p_owner uuid, p_owner_id text)
RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT COALESCE(
    p_owner,
    CASE WHEN p_owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN p_owner_id::uuid END
  );
$function$;

DO $$
DECLARE
  b RECORD;
  v_dono TEXT;
  v_meu  TEXT := '(SELECT public.get_user_tenant_id())';
  v_eu   TEXT := 'public.storage_autor_do_upload(owner, owner_id) = (SELECT auth.uid())';
BEGIN
  FOR b IN
    SELECT * FROM (VALUES
      ('contratos-anexos',    'tenant_do_anexo_contrato',     'contratos_anexos'),
      ('reportes-anexos',     'tenant_do_anexo_reporte',      'reportes_anexos'),
      ('vendas-comprovantes', 'tenant_do_comprovante_venda',  'vendas_comprovantes'),
      ('deliveries',          'tenant_do_arquivo_delivery',   'deliveries'),
      ('pj-notas',            'tenant_do_arquivo_pj_nota',    'pj_notas')
    ) AS t(bucket, fn, sufixo)
  LOOP
    v_dono := format('public.%I(name)', b.fn);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_select ON storage.objects', b.sufixo);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_update ON storage.objects', b.sufixo);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_delete ON storage.objects', b.sufixo);

    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_select ON storage.objects
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (bucket_id <> %L OR %s = %s OR (%s IS NULL AND %s))
    $p$, b.sufixo, b.bucket, v_dono, v_meu, v_dono, v_eu);

    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_update ON storage.objects
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (bucket_id <> %L OR %s = %s OR (%s IS NULL AND %s))
        WITH CHECK (bucket_id <> %L OR %s = %s OR (%s IS NULL AND %s))
    $p$, b.sufixo, b.bucket, v_dono, v_meu, v_dono, v_eu,
                  b.bucket, v_dono, v_meu, v_dono, v_eu);

    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_delete ON storage.objects
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (bucket_id <> %L OR %s = %s OR (%s IS NULL AND %s))
    $p$, b.sufixo, b.bucket, v_dono, v_meu, v_dono, v_eu);
  END LOOP;
END $$;
