-- ============================================================================
-- Linha de base (parte 3): reportes_erro antes do endurecimento
-- ============================================================================
-- Por quê: duas migrações dividem a mesma versão 20260723170000 e uma delas
-- (multitenant_reportes_erro_e_hardening) cria política em public.reportes_erro,
-- que só nasce em 20260723180000. Na produção a ordem real foi outra; num
-- projeto novo, aplicando por nome, a 170000 parava.
--
-- O que faz: o mesmo conteúdo de 20260723180000_create_reportes_erro.sql, que é
-- todo idempotente (IF NOT EXISTS / DROP ... IF EXISTS). Quando a 180000 rodar
-- depois, não muda nada.
--
-- Produção: não precisa rodar. Para alinhar o histórico:
--   supabase migration repair --status applied 20260723165000
-- ============================================================================

BEGIN;

-- Protocolo legível (ERR-00001, ERR-00002, ...) via sequência.
CREATE SEQUENCE IF NOT EXISTS public.reportes_erro_protocolo_seq;

CREATE TABLE IF NOT EXISTS public.reportes_erro (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  protocolo           TEXT NOT NULL UNIQUE
                        DEFAULT ('ERR-' || lpad(nextval('public.reportes_erro_protocolo_seq')::text, 5, '0')),

  -- Conteúdo do reporte (preenchido pelo usuário)
  titulo              TEXT NOT NULL,
  descricao           TEXT,
  passos              TEXT,                       -- passos para reproduzir
  resultado_esperado  TEXT,
  resultado_ocorrido  TEXT,
  impacto             TEXT NOT NULL DEFAULT 'medio'
                        CHECK (impacto IN ('baixo','medio','alto','critico')),
  categoria           TEXT NOT NULL DEFAULT 'bug'
                        CHECK (categoria IN ('bug','duvida','sugestao','outro')),
  modulo              TEXT,                        -- app/módulo afetado
  rota                TEXT,                        -- rota/URL afetada

  -- Contexto técnico capturado automaticamente (sem dados sensíveis)
  contexto            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Quem reportou (denormalizado p/ o painel não depender de join)
  reportado_por       UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  reportado_nome      TEXT,
  reportado_email     TEXT,

  -- Triagem interna
  status              TEXT NOT NULL DEFAULT 'recebido'
                        CHECK (status IN ('recebido','em_triagem','precisa_info','confirmado',
                                          'em_desenvolvimento','em_validacao','corrigido',
                                          'nao_reproduzido','duplicado','encerrado')),
  prioridade          TEXT NOT NULL DEFAULT 'media'
                        CHECK (prioridade IN ('baixa','media','alta')),
  resposta_interna    TEXT,
  resolvido_em        TIMESTAMPTZ,
  resolvido_versao    TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reportes_erro IS
  'Reportes de erro/feedback do usuário (multi-tenant). Usuário vê os próprios; admin tria todos do tenant.';

CREATE INDEX IF NOT EXISTS idx_reportes_erro_tenant  ON public.reportes_erro(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reportes_erro_status  ON public.reportes_erro(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reportes_erro_criado  ON public.reportes_erro(tenant_id, created_at DESC);

-- Carimba tenant_id automaticamente no INSERT (mesma função das demais tabelas).
DROP TRIGGER IF EXISTS set_tenant_id ON public.reportes_erro;
CREATE TRIGGER set_tenant_id
  BEFORE INSERT ON public.reportes_erro
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

-- Mantém updated_at atualizado.
CREATE OR REPLACE FUNCTION public.tg_reportes_erro_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reportes_erro_touch ON public.reportes_erro;
CREATE TRIGGER reportes_erro_touch
  BEFORE UPDATE ON public.reportes_erro
  FOR EACH ROW EXECUTE FUNCTION public.tg_reportes_erro_touch();

-- RLS ---------------------------------------------------------------------
ALTER TABLE public.reportes_erro ENABLE ROW LEVEL SECURITY;

-- Criar reporte: qualquer autenticado, no próprio tenant, como si mesmo.
DROP POLICY IF EXISTS reportes_erro_insert ON public.reportes_erro;
CREATE POLICY reportes_erro_insert ON public.reportes_erro
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND reportado_por = auth.uid()
  );

-- Ver reportes: os próprios (qualquer usuário) OU todos do tenant (admin).
DROP POLICY IF EXISTS reportes_erro_select ON public.reportes_erro;
CREATE POLICY reportes_erro_select ON public.reportes_erro
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND (reportado_por = auth.uid() OR public.is_admin())
  );

-- Triar (status/prioridade/resposta): só admin do próprio tenant.
DROP POLICY IF EXISTS reportes_erro_update_admin ON public.reportes_erro;
CREATE POLICY reportes_erro_update_admin ON public.reportes_erro
  FOR UPDATE
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin())
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin());

-- Excluir: só admin do próprio tenant.
DROP POLICY IF EXISTS reportes_erro_delete_admin ON public.reportes_erro;
CREATE POLICY reportes_erro_delete_admin ON public.reportes_erro
  FOR DELETE
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin());

COMMIT;
