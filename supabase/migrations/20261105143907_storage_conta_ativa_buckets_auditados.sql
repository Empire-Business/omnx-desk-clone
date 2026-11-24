-- Gate de atividade apenas nos 5 buckets com bypass autenticado comprovado.
-- Não substitui policies de negócio/tenant/ownership nem concede acesso.
-- Ativos continuam sujeitos às regras existentes; anon e service não são alvo.
-- URLs públicas já emitidas de avatars/chat-media permanecem públicas.
-- get_user_tenant_id exige users/profiles coerentes e ativo IS DISTINCT FROM false.
BEGIN;
CREATE POLICY desk_conta_ativa_buckets_auditados
ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  bucket_id NOT IN ('avatars', 'chat-media', 'deliveries', 'reportes-anexos', 'pj-notas')
  OR (SELECT public.get_user_tenant_id()) IS NOT NULL
)
WITH CHECK (
  bucket_id NOT IN ('avatars', 'chat-media', 'deliveries', 'reportes-anexos', 'pj-notas')
  OR (SELECT public.get_user_tenant_id()) IS NOT NULL
);
COMMIT;
