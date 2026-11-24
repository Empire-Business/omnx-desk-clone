-- ============================================================================
-- App Automações WhatsApp — fundação (etapa 9.1 do roadmap)
-- ============================================================================
-- Docs/prd.md §0.6 e ROADMAP-MODULARIZACAO.md Fase 9.
--
-- O que esta migration cria: o app na Loja e as tabelas de CONFIGURAÇÃO e
-- HISTÓRICO. Nenhuma automação envia nada ainda — os envios nascem nas etapas
-- 9.2 a 9.5. Tudo começa DESLIGADO por tenant (nada dispara sem o admin ligar).
--
--   wa_auto_config           — 1 linha por empresa: provedor, horários, destinos
--   wa_auto_gestores         — quem recebe o relatório diário (vários números)
--   wa_auto_regras_anomalia  — as 4 regras de alerta, ligáveis, com limiar
--   wa_auto_envios           — histórico de envios (auditoria e idempotência)
--
-- Segurança (revisão em modo design, 26/10/2026):
--   * tenant_id em tudo + trigger de carimbo + policy RESTRICTIVE (F2).
--   * Configuração só por quem tem 'automacoes-wa' · admin. O histórico é
--     lido com 'ver'. Ninguém logado ESCREVE em wa_auto_envios: só as edge
--     functions (service_role), para o front não forjar nem apagar histórico (F6/F7).
--   * Segredos NÃO moram aqui: ficam no Vault via tenant_integracoes (etapa 9.2).
--   * `payload` do histórico não recebe corpo de conversa nem token (F5).
--
-- Reversível: DROP TABLE das 4 tabelas (CASCADE) + DELETE do app em app_modules.
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) App no catálogo (nasce LIGADO, padrão fail-open do projeto; sem
--    configurar nada, não envia nada)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_modules (tenant_id, slug, nome, descricao, icone, categoria, enabled, ordem)
SELECT t.id,
       'automacoes-wa',
       'Automações WhatsApp',
       'Aviso diário aos gestores, resumo semanal das conversas e agendamento em duas etapas.',
       'Bot',
       'app',
       true,
       35
  FROM public.tenants t
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Tenant novo também ganha o app (mesma lista vigente + a linha nova).
CREATE OR REPLACE FUNCTION public.seed_app_modules_for_tenant(p_tenant UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.app_modules (tenant_id, slug, nome, descricao, icone, categoria, enabled, ordem)
  VALUES
    (p_tenant, 'atendimento', 'Atendimento', 'Tela inicial: demandas dos clientes e painel operacional, adaptados ao ramo da empresa.', 'LayoutDashboard', 'app', true, 10),
    (p_tenant, 'chat',        'OMNXChat',    'Central de conversas do WhatsApp.',                          'MessageSquare', 'app',       true,  20),
    (p_tenant, 'contratos',   'Contratos',   'Gestão de contratos, kanban e recebíveis.',                  'FileText',      'app',       true,  30),
    (p_tenant, 'automacoes-wa', 'Automações WhatsApp', 'Aviso diário aos gestores, resumo semanal das conversas e agendamento em duas etapas.', 'Bot', 'app', true, 35),
    (p_tenant, 'dashboard',   'Dashboard',   'Painel antigo (legado). Fora do menu; acessível por /dashboard-legado.', 'LayoutDashboard', 'nucleo', true, 90),
    (p_tenant, 'cobranca',    'Cobrança',    'Régua de cobrança e recuperação de débitos.',                'Banknote',      'arquivado', false, 40),
    (p_tenant, 'portal',      'Portal do Cliente', 'Área externa onde o cliente final acompanha entregas.', 'ExternalLink', 'arquivado', false, 50)
  ON CONFLICT (tenant_id, slug) DO NOTHING;
$fn$;

REVOKE ALL ON FUNCTION public.seed_app_modules_for_tenant(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Configuração (1 linha por empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_auto_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Qual WhatsApp envia. 'uazapi' = não oficial (já usado pelo Chat);
  -- 'zernio' = API oficial. A troca é por empresa.
  provider    TEXT NOT NULL DEFAULT 'uazapi' CHECK (provider IN ('uazapi', 'zernio')),
  -- Instância UAZAPI usada para enviar (whatsapp_instances.instance_id).
  uazapi_instance_id TEXT,

  -- Aviso diário ao gestor.
  relatorio_ativo BOOLEAN NOT NULL DEFAULT false,
  relatorio_hora  TIME NOT NULL DEFAULT '09:00',

  -- Resumo semanal das conversas. dia: 1 = segunda … 7 = domingo (ISO).
  resumo_ativo    BOOLEAN NOT NULL DEFAULT false,
  resumo_dia      SMALLINT NOT NULL DEFAULT 1 CHECK (resumo_dia BETWEEN 1 AND 7),
  resumo_hora     TIME NOT NULL DEFAULT '09:00',
  resumo_destino  TEXT NOT NULL DEFAULT 'grupo' CHECK (resumo_destino IN ('privado', 'grupo')),

  -- Agendamento em duas etapas (etapa 2 = enviar o link no grupo).
  agendamento_ativo BOOLEAN NOT NULL DEFAULT false,

  -- Nomes dos modelos aprovados na API oficial (usados só com provider='zernio').
  template_relatorio TEXT,
  template_resumo    TEXT,
  template_link      TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

COMMENT ON TABLE public.wa_auto_config IS
  'Configuração do app Automações WhatsApp (1 linha por empresa). Tudo nasce desligado. Sem segredos: tokens ficam no Vault via tenant_integracoes.';

-- A instância escolhida precisa ser da MESMA empresa: sem isto, um admin poderia
-- gravar o id de outra empresa e o envio sairia pelo WhatsApp dela.
CREATE OR REPLACE FUNCTION public.wa_auto_confere_instancia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.uazapi_instance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_instances wi
     WHERE wi.instance_id = NEW.uazapi_instance_id AND wi.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Instância de WhatsApp não encontrada nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS wa_auto_confere_instancia ON public.wa_auto_config;
CREATE TRIGGER wa_auto_confere_instancia
  BEFORE INSERT OR UPDATE OF uazapi_instance_id ON public.wa_auto_config
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_confere_instancia();

-- ---------------------------------------------------------------------------
-- 3) Gestores que recebem o relatório diário
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_auto_gestores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  -- E.164 (+5511999998888). A normalização acontece no front (lib/telefone);
  -- o CHECK é a rede de segurança para nada malformado chegar ao envio.
  telefone    TEXT NOT NULL CHECK (telefone ~ '^\+[1-9][0-9]{9,14}$'),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, telefone)
);

COMMENT ON TABLE public.wa_auto_gestores IS
  'Números de gestores que recebem o relatório diário no WhatsApp. Máximo de 10 por empresa (trigger).';

-- Limite por empresa: um cadastro errado não vira disparo para dezenas de números.
CREATE OR REPLACE FUNCTION public.wa_auto_limita_gestores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Trava por empresa: duas inserções simultâneas não furam o limite.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));
  IF (SELECT count(*) FROM public.wa_auto_gestores WHERE tenant_id = NEW.tenant_id) >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 gestores por empresa atingido.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS wa_auto_limita_gestores ON public.wa_auto_gestores;
-- Depois do carimbo de tenant (ordem alfabética dos triggers BEFORE: set_tenant_id_* < wa_*).
CREATE TRIGGER wa_auto_limita_gestores
  BEFORE INSERT ON public.wa_auto_gestores
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_limita_gestores();

-- ---------------------------------------------------------------------------
-- 4) Regras de anomalia (4 por empresa, cada uma ligável)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_auto_regras_anomalia (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume')),
  ativo       BOOLEAN NOT NULL DEFAULT false,
  -- Significado depende do tipo: sem_resposta = horas; queda_volume = % abaixo
  -- da média; os demais ignoram o limiar. Padrões em lib/automacoesWa.ts.
  limiar      NUMERIC NOT NULL DEFAULT 0 CHECK (limiar >= 0 AND limiar <= 10000),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo)
);

COMMENT ON TABLE public.wa_auto_regras_anomalia IS
  'Regras de alerta do relatório diário. Nascem desligadas; o admin liga e ajusta o limiar na tela.';

-- ---------------------------------------------------------------------------
-- 5) Histórico de envios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_auto_envios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('relatorio_diario', 'resumo_semanal', 'agendamento_link', 'teste')),
  provider    TEXT NOT NULL CHECK (provider IN ('uazapi', 'zernio')),
  destino     TEXT NOT NULL,
  -- Nome mostrado no histórico (gestor, cliente ou grupo). Nunca conteúdo de conversa.
  destino_nome TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou', 'simulado')),
  erro        TEXT,
  -- Uma chave por (tipo + destino + janela) impede o mesmo aviso sair duas vezes
  -- num retry ou em duas execuções do agendador (F6).
  chave_idempotencia TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wa_auto_envios IS
  'Histórico de envios do app Automações WhatsApp. Escrito só pelo servidor. Sem token, sem corpo de conversa. Retenção prevista: 90 dias.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_auto_envios_idem
  ON public.wa_auto_envios (tenant_id, chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_auto_envios_tenant_data
  ON public.wa_auto_envios (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6) Carimbo de tenant, updated_at, RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_auto_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_auto_config', 'wa_auto_gestores', 'wa_auto_regras_anomalia', 'wa_auto_envios']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_%1$s ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_%1$s BEFORE INSERT ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id()', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Isolamento por empresa, RESTRICTIVE: vale em AND com qualquer outra policy.
    EXECUTE format('DROP POLICY IF EXISTS %1$s_tenant_isolation ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_tenant_isolation ON public.%1$s AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (tenant_id = (SELECT get_user_tenant_id())) '
      'WITH CHECK (tenant_id = (SELECT get_user_tenant_id()))', t);
  END LOOP;
END
$do$;

DROP TRIGGER IF EXISTS wa_auto_config_touch ON public.wa_auto_config;
CREATE TRIGGER wa_auto_config_touch BEFORE UPDATE ON public.wa_auto_config
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_touch_updated_at();
DROP TRIGGER IF EXISTS wa_auto_regras_touch ON public.wa_auto_regras_anomalia;
CREATE TRIGGER wa_auto_regras_touch BEFORE UPDATE ON public.wa_auto_regras_anomalia
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_touch_updated_at();

-- Configuração, gestores e regras: leitura e escrita só para quem administra o app.
DO $do$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_auto_config', 'wa_auto_gestores', 'wa_auto_regras_anomalia']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_admin ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY %1$s_admin ON public.%1$s FOR ALL TO authenticated '
      'USING ((SELECT public.has_permissao(''automacoes-wa'', ''admin''))) '
      'WITH CHECK ((SELECT public.has_permissao(''automacoes-wa'', ''admin'')))', t);
  END LOOP;
END
$do$;

-- Histórico: só leitura para o front.
DROP POLICY IF EXISTS wa_auto_envios_select ON public.wa_auto_envios;
CREATE POLICY wa_auto_envios_select ON public.wa_auto_envios
  FOR SELECT TO authenticated
  USING ((SELECT public.has_permissao('automacoes-wa', 'ver')));
-- Lista de liberação: o front só lê o histórico.
REVOKE ALL ON public.wa_auto_envios FROM anon, authenticated;
GRANT SELECT ON public.wa_auto_envios TO authenticated;
REVOKE ALL ON public.wa_auto_config, public.wa_auto_gestores,
              public.wa_auto_regras_anomalia FROM anon;

-- ---------------------------------------------------------------------------
-- 7) Regras iniciais (desligadas) para empresas existentes e novas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_wa_auto_for_tenant(p_tenant UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.wa_auto_config (tenant_id) VALUES (p_tenant)
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO public.wa_auto_regras_anomalia (tenant_id, tipo, ativo, limiar)
  VALUES
    (p_tenant, 'sem_resposta',         false, 4),   -- horas sem resposta
    (p_tenant, 'sentimento_negativo',  false, 0),
    (p_tenant, 'pendencia',            false, 0),
    (p_tenant, 'queda_volume',         false, 50)   -- % abaixo da média
  ON CONFLICT (tenant_id, tipo) DO NOTHING;
$fn$;

REVOKE ALL ON FUNCTION public.seed_wa_auto_for_tenant(UUID) FROM PUBLIC, anon, authenticated;

SELECT public.seed_wa_auto_for_tenant(id) FROM public.tenants;

CREATE OR REPLACE FUNCTION public.seed_wa_auto_on_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.seed_wa_auto_for_tenant(NEW.id);
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.seed_wa_auto_on_tenant_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS seed_wa_auto_on_tenant_insert ON public.tenants;
CREATE TRIGGER seed_wa_auto_on_tenant_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_wa_auto_on_tenant_insert();

-- Permissões: o curinga ('*','admin') do perfil admin já cobre o recurso novo.
-- Nenhum outro perfil recebe acesso — quem precisar, o admin libera em /admin.

COMMIT;

NOTIFY pgrst, 'reload schema';
