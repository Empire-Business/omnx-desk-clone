-- Onda 5 — pendências menores da Fase 5 (reporte de erros).
-- Aplicada em produção em 27/07/2026 via Management API.
-- §14.2 anexos, §14.5 acompanhamento pelo usuário, §14.6 vínculo com task.

ALTER TABLE public.reportes_erro
  -- [{ storage_path, nome_original, mime_type, tamanho_bytes }]
  ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Resposta que o AUTOR do reporte enxerga. Diferente de resposta_interna,
  -- que é nota de triagem e continua privada da equipe.
  ADD COLUMN IF NOT EXISTS resposta_usuario text,
  -- §14.6: não existe módulo de tarefas no app, então o vínculo é um link para
  -- onde a task realmente vive (issue, board externo).
  ADD COLUMN IF NOT EXISTS link_externo text;

COMMENT ON COLUMN public.reportes_erro.resposta_usuario IS
  'Resposta visível ao autor do reporte. resposta_interna continua privada da equipe.';

-- Bucket dos anexos: privado, 5 MB, só imagem e PDF (é print de tela, não repositório).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reportes-anexos', 'reportes-anexos', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O caminho é reportes/{reporte_id}/..., então o dono do arquivo sai do reporte.
CREATE OR REPLACE FUNCTION public.tenant_do_anexo_reporte(p_object_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT r.tenant_id
    FROM public.reportes_erro r
   WHERE (storage.foldername(p_object_name))[2] = r.id::text
   LIMIT 1;
$$;

DROP POLICY IF EXISTS reportes_anexos_insert ON storage.objects;
CREATE POLICY reportes_anexos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reportes-anexos');

-- Quem enviou vê o próprio anexo; admin vê todos do tenant.
DROP POLICY IF EXISTS reportes_anexos_select ON storage.objects;
CREATE POLICY reportes_anexos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'reportes-anexos'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM public.reportes_erro r
         WHERE (storage.foldername(objects.name))[2] = r.id::text
           AND r.reportado_por = auth.uid()
      )
    )
  );

-- Isolamento por tenant, no mesmo padrão dos outros buckets de negócio.
DROP POLICY IF EXISTS tenant_isolation_reportes_anexos ON storage.objects;
CREATE POLICY tenant_isolation_reportes_anexos ON storage.objects
  AS RESTRICTIVE FOR ALL TO public
  USING (
    bucket_id <> 'reportes-anexos'
    OR public.tenant_do_anexo_reporte(name) IS NULL
    OR public.tenant_do_anexo_reporte(name) = (SELECT public.get_user_tenant_id())
  );
