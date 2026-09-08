-- Permite que o time de atendimento/gestão anexe novos comprovantes
-- pela tela de Onboarding (edição da venda pendente).
-- Antes só existia policy de SELECT; o upload era exclusivo do form
-- público via edge function com service_role.

DROP POLICY IF EXISTS "vendas_comprovantes_atendimento_insert" ON storage.objects;
CREATE POLICY "vendas_comprovantes_atendimento_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendas-comprovantes'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento'))
  );
