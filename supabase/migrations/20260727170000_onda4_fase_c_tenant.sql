-- Onda 4 (Fase C do multi-tenant) — edge functions e storage cientes de tenant.
-- Aplicada em produção em 27/07/2026 via Management API.

-- ─── 1. Credencial da ponte Empire POR TENANT ─────────────────────────────────
--
-- A função existente (get_omnx_bridge_credential) tem um limite embutido:
--   IF v_count <> 1 THEN RETURN;
-- ou seja, ela só funciona enquanto houver exatamente UMA integração ativa no banco.
-- No dia em que a 2ª empresa cadastrar a ponte, ela passa a retornar vazio e a
-- integração cai para TODO MUNDO. Esta versão recebe o tenant e resolve o dele.
CREATE OR REPLACE FUNCTION public.get_omnx_bridge_credential_tenant(
  p_tenant_id uuid,
  p_provider  text DEFAULT 'empire'
)
RETURNS TABLE(secret text, base_url text, tenant_id uuid, rotation_version integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT ds.decrypted_secret, ti.base_url, ti.tenant_id, ti.rotation_version
      FROM public.tenant_integracoes ti
      JOIN vault.decrypted_secrets ds ON ds.id = ti.secret_key_id
     WHERE ti.provider  = p_provider
       AND ti.tenant_id = p_tenant_id
       AND ti.is_active = true
       AND ti.secret_key_id IS NOT NULL
     LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_omnx_bridge_credential_tenant(uuid, text) FROM anon, authenticated;

-- Tenant de um usuário sem depender da sessão (a edge function usa service_role,
-- então get_user_tenant_id() não serve — não há auth.uid()).
CREATE OR REPLACE FUNCTION public.get_tenant_do_usuario(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_do_usuario(uuid) FROM anon;

-- ─── 2. Isolamento por tenant no storage ──────────────────────────────────────
--
-- As policies de storage.objects não tinham NENHUM filtro por tenant: um admin da
-- empresa B conseguiria ler os anexos de contrato da empresa A. Hoje não vaza nada
-- porque só existe um tenant, mas quebraria no dia da segunda empresa.
--
-- Abordagem: em vez de reescrever os caminhos dos arquivos (refatoração ampla e
-- arriscada, espalhada por vários pontos de upload), o tenant do objeto é resolvido
-- pela ENTIDADE DONA. Nenhum path muda, nenhum upload existente quebra.
CREATE OR REPLACE FUNCTION public.tenant_do_anexo_contrato(p_object_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT c.tenant_id
    FROM public.contrato_anexos a
    JOIN public.contratos c ON c.id = a.contrato_id
   WHERE a.storage_path = p_object_name
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.tenant_do_comprovante_venda(p_object_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT v.tenant_id
    FROM public.vendas_pendentes v
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.comprovantes, '[]'::jsonb)) c
   WHERE c->>'storage_path' = p_object_name
   LIMIT 1;
$$;

-- RESTRICTIVE: combina em AND com as policies existentes, sem substituir nenhuma.
-- Objeto de outro tenant fica inacessível; objeto sem dono registrado continua
-- acessível como hoje (há 9 comprovantes órfãos, resquício de upload interrompido —
-- bloqueá-los seria mudar comportamento sem necessidade).
-- Verificado: 0 objetos ficariam inacessíveis para o tenant atual.
CREATE POLICY tenant_isolation_contratos_anexos ON storage.objects
  AS RESTRICTIVE FOR ALL TO public
  USING (
    bucket_id <> 'contratos-anexos'
    OR public.tenant_do_anexo_contrato(name) IS NULL
    OR public.tenant_do_anexo_contrato(name) = (SELECT public.get_user_tenant_id())
  );

CREATE POLICY tenant_isolation_vendas_comprovantes ON storage.objects
  AS RESTRICTIVE FOR ALL TO public
  USING (
    bucket_id <> 'vendas-comprovantes'
    OR public.tenant_do_comprovante_venda(name) IS NULL
    OR public.tenant_do_comprovante_venda(name) = (SELECT public.get_user_tenant_id())
  );
