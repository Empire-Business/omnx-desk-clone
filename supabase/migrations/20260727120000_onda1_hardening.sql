-- Onda 1 — hardening (segurança e higiene)
-- Aplicada em produção em 27/07/2026 via Management API.

-- 1) Teto de tamanho para o .docx dos modelos de contrato.
--    O arquivo vai em base64 (infla ~34%), então 7 MB de base64 ≈ 5 MB de arquivo real.
--    Sem isso, um upload grande vira uma linha gigante no Postgres.
ALTER TABLE public.contrato_modelos
  ADD CONSTRAINT contrato_modelos_arquivo_b64_max
  CHECK (arquivo_b64 IS NULL OR length(arquivo_b64) <= 7000000);

-- 2) app_modules: alinhar ao padrão do projeto (tenant_isolation RESTRICTIVE).
--    As duas policies eram PERMISSIVE; o isolamento funcionava, mas por OR entre
--    permissivas em vez do AND garantido pela restritiva.
DROP POLICY IF EXISTS tenant_isolation ON public.app_modules;
DROP POLICY IF EXISTS app_modules_write_admin ON public.app_modules;

-- Leitura: qualquer usuário do tenant (o menu depende disso); o tenant é filtrado
-- pela restritiva abaixo.
CREATE POLICY app_modules_select ON public.app_modules
  FOR SELECT TO authenticated
  USING (true);

-- Escrita: só admin.
CREATE POLICY app_modules_write_admin ON public.app_modules
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Restritiva: combina em AND com todas as acima — ninguém sai do próprio tenant.
CREATE POLICY tenant_isolation ON public.app_modules
  AS RESTRICTIVE FOR ALL TO public
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

-- Nota: os limites de storage.buckets (avatars 5 MB, contratos-anexos 20 MB,
-- vendas-comprovantes 10 MB + allowed_mime_types) foram aplicados no mesmo dia
-- via UPDATE em storage.buckets — não versionável como DDL de schema.
