-- Correções da auditoria de segurança de 27/07/2026 (antes do merge em main).
-- Aplicadas em produção via Management API.

-- ─── P0: funções sensíveis executáveis por PUBLIC ─────────────────────────────
--
-- REVOKE ... FROM anon, authenticated NÃO remove o grant implícito de PUBLIC que o
-- Postgres dá a toda função nova. Resultado: get_omnx_bridge_credential_tenant
-- (criada na Onda 4) ficou executável por qualquer usuário logado — e por anon — e
-- ela RETORNA O SECRET da ponte Empire em texto plano.
--
-- PoC antes da correção: `SET ROLE authenticated;
--   SELECT * FROM get_omnx_bridge_credential_tenant('<tenant>','empire');`
-- executava sem erro. Depois: "permission denied for function".
--
-- Não houve vazamento real: tenant_integracoes está vazia, então a função retornava
-- 0 linhas. A falha era latente — passaria a vazar no instante do cadastro do secret.
-- A função equivalente antiga (get_omnx_bridge_credential) já estava correta e serviu
-- de referência do estado desejado.
REVOKE ALL ON FUNCTION public.get_omnx_bridge_credential_tenant(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_omnx_bridge_credential_tenant(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_omnx_bridge_credential_tenant(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_tenant_do_usuario(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_do_usuario(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_do_usuario(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.tg_set_data_assinatura() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_data_pagamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_permissoes_on_tenant_insert() FROM PUBLIC, anon, authenticated;

-- NOTA: tenant_do_anexo_contrato / tenant_do_comprovante_venda / tenant_do_anexo_reporte
-- e has_permissao CONTINUAM executáveis por authenticated de propósito — são avaliadas
-- dentro das policies RLS no contexto do próprio usuário. Revogá-las quebraria o acesso
-- ao storage para todo mundo. Elas devolvem apenas um tenant_id/booleano, não segredo.

-- ─── Recursão na RLS de `users` + escalonamento latente ───────────────────────
--
-- Achado PRÉ-EXISTENTE (não veio das 5 ondas), com dois lados:
--
-- 1. Funcional: users_update_self_or_admin fazia
--      (SELECT perfil FROM users WHERE id = auth.uid()) = 'admin'
--    consultando `users` DENTRO da policy de `users` -> recursão infinita (42P17).
--    TODO UPDATE em users falhava, inclusive para admin: a edição de colaboradores
--    estava quebrada em produção.
--
-- 2. Segurança: a policy permite editar a PRÓPRIA linha sem restringir COLUNAS. Não
--    era explorável porque a recursão derrubava todo UPDATE — mas quem corrigisse só
--    a recursão abriria escalonamento: UPDATE users SET perfil='admin' na própria
--    linha. Por isso os dois são corrigidos juntos.
DROP POLICY IF EXISTS users_update_self_or_admin ON public.users;
CREATE POLICY users_update_self_or_admin ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin());

-- RLS decide QUAIS LINHAS; para restringir QUAIS COLUNAS (e comparar com o valor
-- antigo) é preciso trigger.
CREATE OR REPLACE FUNCTION public.tg_users_bloqueia_autopromocao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Admin pode tudo; alterações via service_role (edge functions) não têm auth.uid().
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.perfil IS DISTINCT FROM OLD.perfil THEN
    RAISE EXCEPTION 'Só um administrador pode alterar o perfil de acesso.';
  END IF;
  IF NEW.acesso_contratos IS DISTINCT FROM OLD.acesso_contratos THEN
    RAISE EXCEPTION 'Só um administrador pode liberar o módulo Contratos.';
  END IF;
  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    RAISE EXCEPTION 'Só um administrador pode ativar ou inativar um colaborador.';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Não é permitido mudar um usuário de empresa.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_users_bloqueia_autopromocao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_bloqueia_autopromocao ON public.users;
CREATE TRIGGER trg_users_bloqueia_autopromocao
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_users_bloqueia_autopromocao();

-- Verificado com 4 testes sob o motor de RLS real:
--   1. admin edita colaborador ............................ PASSOU (restaurado)
--   2. gerente tenta perfil='admin' ....................... BLOQUEADO
--   3. gerente tenta acesso_contratos=true ................ BLOQUEADO
--   4. usuário edita o próprio nome ....................... PASSOU
