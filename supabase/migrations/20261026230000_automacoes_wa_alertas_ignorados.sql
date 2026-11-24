-- ============================================================================
-- App Automações WhatsApp — alertas que o gestor mandou ignorar + janela do
-- "sem resposta"
-- ============================================================================
-- Contexto: o relatório diário com dados reais veio cheio de ruído (conversas
-- paradas há meses, cliente que já cancelou, contrato inadimplente de cliente
-- inativo). As regras AUTOMÁTICAS ficam no código (_shared/wa-alertas.ts); esta
-- migration cria o que depende do banco:
--
--   1) wa_auto_regras_anomalia.janela_dias — "sem resposta" só lista quem espera
--      entre o limiar (horas) e esta janela (padrão 7 dias). O que passou da
--      janela vira só uma contagem ("+ N conversas paradas há mais de 7 dias").
--
--   2) wa_auto_alertas_ignorados — o gestor marca, no painel
--      (/automacoes-wa/alertas), que um alerta não deve continuar:
--        resolvido    = some até haver NOVIDADE (igual a ate_novidade), mas fica
--                       registrado como "resolvido";
--        ate_novidade = some até o cliente mandar mensagem nova depois de
--                       created_at OU um contrato dele mudar de status / um
--                       contrato novo ser criado depois de created_at;
--        ate_data     = some até `ate` (obrigatório só neste modo);
--        sempre       = nunca mais alerta daquele tipo (ou de todos, tipo='todos')
--                       para aquele cliente/contato.
--      Alvo: client_id silencia TODOS os alertas do cliente (qualquer contato ou
--      conversa dele); só contact_id silencia os alertas daquele contato.
--      O front grava/apaga direto (RLS). Sem UPDATE: desfazer = DELETE.
--
-- Segurança:
--   * tenant_id carimbado (tg_set_tenant_id) + policy RESTRICTIVE de isolamento.
--   * SELECT com has_permissao('automacoes-wa','ver'); INSERT/DELETE com 'admin'
--     (mesmo nível das outras tabelas de configuração do app).
--   * Trigger confere que client_id/contact_id são DA MESMA empresa (mesma
--     mensagem de erro para "não existe" e "é de outra empresa": sem oráculo) e
--     carimba criado_por = auth.uid() e created_at = now() (o front não forja
--     autor nem "data do pedido", que decide quando uma novidade reabre o alerta).
--   * Sem texto livre além de `motivo` (≤ 200), que NUNCA vai para o WhatsApp.
--
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS). Sem regex com contador.
-- Reversão (manual):
--   DROP TABLE IF EXISTS public.wa_auto_alertas_ignorados;
--   DROP FUNCTION IF EXISTS public.wa_auto_alertas_ignorados_confere();
--   ALTER TABLE public.wa_auto_regras_anomalia DROP COLUMN IF EXISTS janela_dias;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Janela máxima do "sem resposta"
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_auto_regras_anomalia
  ADD COLUMN IF NOT EXISTS janela_dias INTEGER NOT NULL DEFAULT 7;

ALTER TABLE public.wa_auto_regras_anomalia DROP CONSTRAINT IF EXISTS wa_auto_regras_anomalia_janela_dias_check;
ALTER TABLE public.wa_auto_regras_anomalia
  ADD CONSTRAINT wa_auto_regras_anomalia_janela_dias_check CHECK (janela_dias BETWEEN 1 AND 90);

COMMENT ON COLUMN public.wa_auto_regras_anomalia.janela_dias IS
  'Só para sem_resposta: lista quem espera entre o limiar (horas) e esta janela (dias). Acima disso vira só contagem.';

-- ---------------------------------------------------------------------------
-- 2) Alertas ignorados pelo gestor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_auto_alertas_ignorados (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  client_id   UUID NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id  UUID NULL REFERENCES public.chat_contacts(id) ON DELETE CASCADE,
  modo        TEXT NOT NULL,
  ate         TIMESTAMPTZ NULL,
  motivo      TEXT NULL,
  criado_por  UUID NULL DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_tipo_check;
ALTER TABLE public.wa_auto_alertas_ignorados
  ADD CONSTRAINT wa_auto_alertas_ignorados_tipo_check
  CHECK (tipo IN ('sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume', 'todos'));

ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_modo_check;
ALTER TABLE public.wa_auto_alertas_ignorados
  ADD CONSTRAINT wa_auto_alertas_ignorados_modo_check
  CHECK (modo IN ('resolvido', 'ate_data', 'ate_novidade', 'sempre'));

-- `ate` obrigatório em ate_data e proibido nos outros modos (sem ambiguidade).
ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_ate_check;
ALTER TABLE public.wa_auto_alertas_ignorados
  ADD CONSTRAINT wa_auto_alertas_ignorados_ate_check
  CHECK ((modo = 'ate_data') = (ate IS NOT NULL));

ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_motivo_check;
ALTER TABLE public.wa_auto_alertas_ignorados
  ADD CONSTRAINT wa_auto_alertas_ignorados_motivo_check
  CHECK (motivo IS NULL OR length(motivo) <= 200);

ALTER TABLE public.wa_auto_alertas_ignorados DROP CONSTRAINT IF EXISTS wa_auto_alertas_ignorados_alvo_check;
ALTER TABLE public.wa_auto_alertas_ignorados
  ADD CONSTRAINT wa_auto_alertas_ignorados_alvo_check
  CHECK (client_id IS NOT NULL OR contact_id IS NOT NULL);

COMMENT ON TABLE public.wa_auto_alertas_ignorados IS
  'Alertas do relatório diário que o gestor mandou não repetir (resolvido / até data / até novidade / sempre). Lido pela coleta (wa-relatorio-dados) com tenant_id explícito.';

CREATE INDEX IF NOT EXISTS idx_wa_auto_alertas_ignorados_cliente
  ON public.wa_auto_alertas_ignorados (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_wa_auto_alertas_ignorados_contato
  ON public.wa_auto_alertas_ignorados (tenant_id, contact_id);

-- Cliente/contato precisam ser da MESMA empresa; autor e data vêm do servidor.
CREATE OR REPLACE FUNCTION public.wa_auto_alertas_ignorados_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada.' USING ERRCODE = 'check_violation';
  END IF;
  -- Usuário logado só grava na própria empresa: recusa já aqui (antes do RLS) com
  -- a mesma resposta, para não revelar se um id existe em outra empresa.
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Cliente ou contato não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Cliente ou contato não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chat_contacts ct WHERE ct.id = NEW.contact_id AND ct.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Cliente ou contato não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  -- Quem está logado grava como ele mesmo; o servidor (sem sessão) fica NULL.
  NEW.criado_por := auth.uid();
  NEW.created_at := now();
  NEW.motivo := NULLIF(btrim(NEW.motivo), '');
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.wa_auto_alertas_ignorados_confere() FROM PUBLIC, anon, authenticated;

-- Triggers BEFORE disparam em ordem alfabética: set_tenant_id_* (carimbo) antes
-- de wa_auto_alertas_ignorados_confere (que precisa do tenant_id).
DROP TRIGGER IF EXISTS set_tenant_id_wa_auto_alertas_ignorados ON public.wa_auto_alertas_ignorados;
CREATE TRIGGER set_tenant_id_wa_auto_alertas_ignorados
  BEFORE INSERT ON public.wa_auto_alertas_ignorados
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

DROP TRIGGER IF EXISTS wa_auto_alertas_ignorados_confere ON public.wa_auto_alertas_ignorados;
CREATE TRIGGER wa_auto_alertas_ignorados_confere
  BEFORE INSERT ON public.wa_auto_alertas_ignorados
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_alertas_ignorados_confere();

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_auto_alertas_ignorados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_auto_alertas_ignorados_tenant_isolation ON public.wa_auto_alertas_ignorados;
CREATE POLICY wa_auto_alertas_ignorados_tenant_isolation ON public.wa_auto_alertas_ignorados
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

DROP POLICY IF EXISTS wa_auto_alertas_ignorados_select ON public.wa_auto_alertas_ignorados;
CREATE POLICY wa_auto_alertas_ignorados_select ON public.wa_auto_alertas_ignorados
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'ver')));

DROP POLICY IF EXISTS wa_auto_alertas_ignorados_insert ON public.wa_auto_alertas_ignorados;
CREATE POLICY wa_auto_alertas_ignorados_insert ON public.wa_auto_alertas_ignorados
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_permissao('automacoes-wa', 'admin')));

DROP POLICY IF EXISTS wa_auto_alertas_ignorados_delete ON public.wa_auto_alertas_ignorados;
CREATE POLICY wa_auto_alertas_ignorados_delete ON public.wa_auto_alertas_ignorados
  FOR DELETE TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'admin')));

-- Lista de liberação: sem UPDATE (desfazer = apagar) e sem TRUNCATE.
REVOKE ALL ON public.wa_auto_alertas_ignorados FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.wa_auto_alertas_ignorados TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
