-- ============================================================================
-- Observabilidade — logs estruturados por módulo (§19 do brief)
-- ============================================================================
-- Problema que resolve: hoje um app degradando só aparece quando alguém
-- reclama. Não existe registro de erro por módulo, então ninguém sabe se o Chat
-- falhou 3 vezes ou 300 nesta semana — e a decisão de onde mexer vira palpite.
--
-- O que é (e o que NÃO é): um registro enxuto de EVENTOS por app —
-- principalmente erro — para responder "o que está quebrando, onde e desde
-- quando". Não é APM, não guarda trace nem corpo de requisição, e não substitui
-- o reporte do usuário: o reporte é o que a pessoa VIU, isto é o que o sistema
-- SENTIU.
--
-- Privacidade: `detalhe` é JSONB de campos escolhidos no código, já mascarados
-- pelo mesmo `redigir()` da captura de reportes. Nunca corpo de mensagem, nunca
-- dado de cliente. Log é a última coisa que alguém lembra de proteger, então a
-- regra aqui é não coletar em vez de coletar e limpar depois.
--
-- Reversível: DROP TABLE public.app_logs CASCADE;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Qual app/módulo emitiu. Bate com o slug de app_modules quando existe
  -- ('chat', 'contratos', 'atendimento'); 'nucleo' para o que não é app.
  app         TEXT NOT NULL DEFAULT 'nucleo',
  nivel       TEXT NOT NULL DEFAULT 'erro' CHECK (nivel IN ('erro', 'aviso', 'info')),
  -- Nome curto e ESTÁVEL do que aconteceu ('query_falhou', 'erro_nao_tratado').
  -- Estável porque é por ele que se agrupa: mensagem livre não agrupa.
  evento      TEXT NOT NULL,
  mensagem    TEXT,
  rota        TEXT,
  detalhe     JSONB NOT NULL DEFAULT '{}'::jsonb,
  duracao_ms  INTEGER,

  user_id     UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_logs IS
  'Eventos estruturados por app (erro/aviso/info). Sem dados de cliente. Base do painel de saúde.';

-- Índices pensados nas duas perguntas do painel: "erros por app na janela X" e
-- "os últimos erros".
CREATE INDEX IF NOT EXISTS idx_app_logs_tenant_data ON public.app_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_app_nivel   ON public.app_logs(tenant_id, app, nivel, created_at DESC);

-- Carimbo de tenant no INSERT, como todas as tabelas do projeto.
DROP TRIGGER IF EXISTS set_tenant_id_app_logs ON public.app_logs;
CREATE TRIGGER set_tenant_id_app_logs
  BEFORE INSERT ON public.app_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

-- Isolamento por empresa, RESTRICTIVE como o padrão do projeto: vale em AND com
-- qualquer policy permissiva, então nenhuma policy futura consegue furar.
DROP POLICY IF EXISTS app_logs_tenant_isolation ON public.app_logs;
CREATE POLICY app_logs_tenant_isolation ON public.app_logs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT get_user_tenant_id()));

-- Qualquer usuário logado ESCREVE (é o app dele que está falhando)...
DROP POLICY IF EXISTS app_logs_insert ON public.app_logs;
CREATE POLICY app_logs_insert ON public.app_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ...mas só admin LÊ. Log de erro expõe rota e comportamento interno; não é
-- material para todo mundo, e ler não ajuda quem não vai corrigir.
DROP POLICY IF EXISTS app_logs_select_admin ON public.app_logs;
CREATE POLICY app_logs_select_admin ON public.app_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Resumo por app para o painel: uma RPC em vez de puxar as linhas todas.
-- Com milhares de eventos, contar no cliente é baixar tudo à toa.
CREATE OR REPLACE FUNCTION public.resumo_saude_apps(p_horas integer DEFAULT 24)
RETURNS TABLE (app text, erros bigint, avisos bigint, ultimo timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER  -- de propósito: a RLS acima é quem decide o que a pessoa vê
SET search_path = 'public'
AS $$
  SELECT l.app,
         count(*) FILTER (WHERE l.nivel = 'erro')  AS erros,
         count(*) FILTER (WHERE l.nivel = 'aviso') AS avisos,
         max(l.created_at)                         AS ultimo
    FROM public.app_logs l
   WHERE l.created_at >= now() - make_interval(hours => p_horas)
   GROUP BY l.app
   ORDER BY erros DESC, l.app;
$$;

REVOKE ALL ON FUNCTION public.resumo_saude_apps(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumo_saude_apps(integer) TO authenticated;

COMMIT;
