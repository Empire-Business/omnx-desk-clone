-- ============================================================================
-- App Automações WhatsApp — gestão dos modelos (templates) do WhatsApp oficial
-- ============================================================================
-- docs/integracoes/zernio-templates.md §4. Usado pela edge function
-- wa-auto-templates (listar / status / criar — nunca apaga).
--
--   wa_auto_modelos          — último status conhecido de cada um dos 3 modelos do
--                              catálogo (relatório, resumo, link), por empresa. A tela
--                              lê daqui sem gastar chamada na Zernio; o botão
--                              "Atualizar status" chama a função, que regrava.
--   wa_auto_modelos_chamadas — contagem de chamadas à Zernio por empresa, para o
--                              limite (criar: 3/h; listar+status: 30/h). Só servidor.
--
-- Segurança:
--   * tenant_id em tudo + policy RESTRICTIVE de isolamento (F2).
--   * Leitura do status só para quem administra o app ('automacoes-wa' · admin).
--   * Ninguém logado ESCREVE: só a edge function (service_role). Sem segredo e
--     sem corpo cru da Zernio/Meta (o motivo de recusa já chega traduzido e curto).
--
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Reversão:
--   DROP TABLE IF EXISTS public.wa_auto_modelos_chamadas;
--   DROP TABLE IF EXISTS public.wa_auto_modelos;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_auto_modelos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Chave do catálogo fixo (_shared/wa-modelos-oficiais.ts).
  tipo          TEXT NOT NULL CHECK (tipo IN ('relatorio', 'resumo', 'link')),
  nome          TEXT NOT NULL CHECK (nome ~ '^[a-z][a-z0-9_]*$' AND length(nome) <= 512),
  idioma        TEXT NOT NULL CHECK (idioma ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  -- Id numérico do modelo na Meta (quando conhecido).
  meta_id       TEXT CHECK (meta_id IS NULL OR meta_id ~ '^[0-9]{1,40}$'),
  status        TEXT NOT NULL CHECK (status IN (
                  'APPROVED', 'PENDING', 'REJECTED', 'IN_APPEAL', 'PAUSED', 'DISABLED',
                  'PENDING_DELETION', 'NAO_CRIADO', 'DESCONHECIDO')),
  -- Motivo da recusa já traduzido para pt-BR (até 400 caracteres).
  motivo        TEXT CHECK (motivo IS NULL OR length(motivo) <= 400),
  qualidade     TEXT CHECK (qualidade IS NULL OR qualidade IN ('GREEN', 'YELLOW', 'RED', 'UNKNOWN')),
  -- O modelo com esse nome existe, mas o texto é diferente do catálogo (não usar).
  texto_diferente BOOLEAN NOT NULL DEFAULT false,
  consultado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo)
);

COMMENT ON TABLE public.wa_auto_modelos IS
  'Último status conhecido dos modelos do WhatsApp oficial (catálogo fixo do app Automações WhatsApp). Escrito só pela edge function wa-auto-templates.';

CREATE TABLE IF NOT EXISTS public.wa_auto_modelos_chamadas (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  acao        TEXT NOT NULL CHECK (acao IN ('listar', 'status', 'criar')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_auto_modelos_chamadas IS
  'Chamadas à Zernio feitas pela gestão de modelos, para o limite por empresa. Só service_role. A função apaga linhas com mais de 1 dia.';

CREATE INDEX IF NOT EXISTS idx_wa_auto_modelos_chamadas_tenant
  ON public.wa_auto_modelos_chamadas (tenant_id, acao, created_at DESC);

-- RLS
ALTER TABLE public.wa_auto_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_auto_modelos_chamadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_auto_modelos_tenant_isolation ON public.wa_auto_modelos;
CREATE POLICY wa_auto_modelos_tenant_isolation ON public.wa_auto_modelos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

DROP POLICY IF EXISTS wa_auto_modelos_select ON public.wa_auto_modelos;
CREATE POLICY wa_auto_modelos_select ON public.wa_auto_modelos
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'admin')));

DROP POLICY IF EXISTS wa_auto_modelos_chamadas_tenant_isolation ON public.wa_auto_modelos_chamadas;
CREATE POLICY wa_auto_modelos_chamadas_tenant_isolation ON public.wa_auto_modelos_chamadas
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));
-- Sem policy permissiva em wa_auto_modelos_chamadas: nenhum usuário logado lê ou escreve.

-- Lista de liberação: o front só LÊ o status; a contagem de chamadas é invisível.
REVOKE ALL ON public.wa_auto_modelos FROM anon, authenticated;
GRANT SELECT ON public.wa_auto_modelos TO authenticated;
REVOKE ALL ON public.wa_auto_modelos_chamadas FROM anon, authenticated;

COMMIT;
