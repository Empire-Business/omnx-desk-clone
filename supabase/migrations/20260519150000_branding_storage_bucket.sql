-- =====================================================================
-- Bucket público "branding" pra logos/favicon do tenant.
-- =====================================================================
-- Usado pela tela "Marca" em Configurações.
-- Público (leitura anônima) porque o branding precisa aparecer no /login,
-- antes do user autenticar. Escrita restrita a admin.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding', 'branding', true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/svg+xml','image/webp','image/x-icon','image/vnd.microsoft.icon']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "branding_storage_select" ON storage.objects;
CREATE POLICY "branding_storage_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding_storage_insert" ON storage.objects;
CREATE POLICY "branding_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "branding_storage_update" ON storage.objects;
CREATE POLICY "branding_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "branding_storage_delete" ON storage.objects;
CREATE POLICY "branding_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin'
  );
