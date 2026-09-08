-- Onda 3 (Fase 2 do roadmap) — camada de permissões por app.
-- Aplicada em produção em 27/07/2026 via Management API.
--
-- ADITIVA: o gate legado (users.perfil, acesso_contratos, modulo_acesso) continua
-- valendo até a última tela migrar. Ninguém ganha nem perde acesso nesta migration.
--
-- O "papel" aqui é users.perfil (texto) e não user_roles.role (enum de 3 valores),
-- porque é o perfil que carrega a granularidade real do gate atual: atendimento e
-- estrategista são ambos 'member' em user_roles, mas enxergam telas diferentes.

CREATE TABLE IF NOT EXISTS public.permissoes_app (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  perfil        text NOT NULL,
  -- Recurso, não só app: cobre telas do núcleo ('colaboradores') e sub-áreas
  -- ('contratos.onboarding'). '*' é curinga de "tudo".
  recurso       text NOT NULL,
  acao          text NOT NULL CHECK (acao IN ('ver','editar','admin')),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, perfil, recurso, acao)
);

CREATE INDEX IF NOT EXISTS ix_permissoes_app_tenant  ON public.permissoes_app (tenant_id);
CREATE INDEX IF NOT EXISTS ix_permissoes_app_lookup  ON public.permissoes_app (tenant_id, perfil);

-- Multi-tenant, como toda tabela nova do projeto.
DROP TRIGGER IF EXISTS set_tenant_id ON public.permissoes_app;
CREATE TRIGGER set_tenant_id BEFORE INSERT ON public.permissoes_app
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

DROP TRIGGER IF EXISTS permissoes_app_atualizado_em ON public.permissoes_app;
CREATE TRIGGER permissoes_app_atualizado_em BEFORE UPDATE ON public.permissoes_app
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_atualizado_em();

ALTER TABLE public.permissoes_app ENABLE ROW LEVEL SECURITY;

-- Leitura: todo usuário autenticado precisa ler as próprias permissões.
CREATE POLICY permissoes_app_select ON public.permissoes_app
  FOR SELECT TO authenticated USING (true);

-- Escrita: só admin.
CREATE POLICY permissoes_app_write_admin ON public.permissoes_app
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Restritiva: ninguém sai do próprio tenant.
CREATE POLICY tenant_isolation ON public.permissoes_app
  AS RESTRICTIVE FOR ALL TO public
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));
