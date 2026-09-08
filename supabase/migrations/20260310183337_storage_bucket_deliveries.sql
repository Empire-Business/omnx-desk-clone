
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deliveries', 'deliveries', false,
  52428800,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "deliveries_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'deliveries');

CREATE POLICY "deliveries_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'deliveries'
    AND (SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista')
  );

CREATE POLICY "deliveries_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'deliveries'
    AND (SELECT perfil FROM public.users WHERE id = auth.uid()) IN ('admin','gerente','atendimento','estrategista')
  );
