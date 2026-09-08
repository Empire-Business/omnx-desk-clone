-- Fase C.2b — ajuste da C.2: o upload tinha quebrado.
--
-- A policy anterior era FOR ALL e exigia, no caso "dono indeterminado",
-- `owner = auth.uid()`. No INSERT o owner ainda não está gravado na linha que o
-- WITH CHECK avalia, então todo upload novo caía em
-- "new row violates row-level security policy".
--
-- Separando por comando cada regra faz o que precisa:
--   INSERT  -> aceita arquivo ainda sem registro (é o fluxo normal: sobe o
--              arquivo, grava a linha depois). Não dá para sobrescrever arquivo
--              alheio: o path já existente falha por conflito, e UPDATE é barrado.
--   SELECT  -> só o próprio tenant; se o dono for indeterminado (órfão), só quem
--   UPDATE     subiu o arquivo. Foi assim que um comprovante órfão da Aliança
--   DELETE     virou download livre para outro tenant no teste de 04/08/2026.

DO $$
DECLARE
  b RECORD;
  v_dono TEXT;
  v_meu  TEXT := '(SELECT public.get_user_tenant_id())';
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

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON storage.objects', b.sufixo);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_insert ON storage.objects', b.sufixo);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_select ON storage.objects', b.sufixo);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_update ON storage.objects', b.sufixo);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s_delete ON storage.objects', b.sufixo);

    -- entrada: arquivo sem registro ainda é permitido (upload -> grava depois)
    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_insert ON storage.objects
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (bucket_id <> %L OR %s IS NULL OR %s = %s)
    $p$, b.sufixo, b.bucket, v_dono, v_dono, v_meu);

    -- leitura/alteração/remoção: só o próprio tenant; órfão, só o dono do upload
    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_select ON storage.objects
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (bucket_id <> %L OR %s = %s OR (%s IS NULL AND owner = (SELECT auth.uid())))
    $p$, b.sufixo, b.bucket, v_dono, v_meu, v_dono);

    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_update ON storage.objects
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (bucket_id <> %L OR %s = %s OR (%s IS NULL AND owner = (SELECT auth.uid())))
        WITH CHECK (bucket_id <> %L OR %s = %s OR (%s IS NULL AND owner = (SELECT auth.uid())))
    $p$, b.sufixo, b.bucket, v_dono, v_meu, v_dono, b.bucket, v_dono, v_meu, v_dono);

    EXECUTE format($p$
      CREATE POLICY tenant_isolation_%s_delete ON storage.objects
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (bucket_id <> %L OR %s = %s OR (%s IS NULL AND owner = (SELECT auth.uid())))
    $p$, b.sufixo, b.bucket, v_dono, v_meu, v_dono);
  END LOOP;
END $$;
