-- ============================================================================
-- Multi-tenant — FASE A: adicionar tenant_id (ADITIVO, não muda acessos)
-- ============================================================================
-- docs/multi-tenant-roadmap.md → Fase A.
--
-- O que faz, em TODAS as tabelas de negócio que ainda não têm tenant_id:
--   1. ADD COLUMN tenant_id uuid REFERENCES tenants(id)  (nullable — sem lock de scan)
--   2. Trigger BEFORE INSERT que carimba tenant_id automático (fail-safe)
--   3. Backfill: preenche as linhas existentes com o tenant único do clone
--   4. Índice por tenant_id
--
-- NÃO mexe em RLS (isso é a Fase B). Como o RLS continua USING(true)/perfil, o
-- comportamento visível é EXATAMENTE o mesmo de antes — ninguém ganha nem perde
-- acesso. Reversível (basta dropar as colunas/triggers).
--
-- NOT NULL fica para a Fase A.2 (migration separada), depois de confirmar 0 nulos,
-- para não segurar ACCESS EXCLUSIVE em ~97 tabelas numa transação só.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- ============================================================================
SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Resolvedor do tenant "default" do clone.
-- Preferência: o tenant do usuário logado (get_user_tenant_id). Se for nulo
-- (service_role / edge function / trigger sem sessão) E houver exatamente UM
-- tenant, usa esse. Com >1 tenant e sessão nula, devolve NULL de propósito
-- (força quem insere a informar o tenant — fail-closed no futuro).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_tenant_default()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.get_user_tenant_id(),
    (SELECT t.id FROM public.tenants t
      WHERE (SELECT count(*) FROM public.tenants) = 1
      LIMIT 1)
  );
$$;

COMMENT ON FUNCTION public.resolve_tenant_default() IS
'Fase A multi-tenant: tenant do usuário logado, com fallback ao tenant único do clone. NULL se ambíguo (>1 tenant sem sessão).';

-- ---------------------------------------------------------------------------
-- Trigger genérico de carimbo. Só preenche quando veio NULL (respeita insert
-- que já traz tenant_id explícito, ex.: futura edge function multi-tenant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.resolve_tenant_default();
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Loop aditivo sobre as tabelas de negócio.
-- Exclui: backups (*_backup_*, *_dedup_*), a própria tenants, infra sem dados
-- de usuário (_webhook_debug, sync_monitor_estado) e as que já têm tenant_id.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_tenant uuid;
  t text;
  tabelas text[] := ARRAY[
    'api_keys','app_settings','audit_logs',
    'chat_contact_clients','chat_contacts','chat_conversation_user_prefs','chat_conversations',
    'chat_csat','chat_department_agents','chat_departments','chat_group_members',
    'chat_message_reads','chat_messages','chat_quick_replies','chat_templates','chat_weekly_reports',
    'client_alerts','client_assignments','client_contracts','client_interactions','client_notes','clients',
    'cobranca_devedores','cobranca_instances','cobranca_regua_passos','cobranca_reguas','cobranca_sends',
    'comissoes','comissoes_papeis',
    'contrato_anexos','contrato_modelos','contrato_pdf_extractions','contrato_tags',
    'contratos','contratos_audit_log','contratos_kanban_colunas',
    'deliverables','deliveries','delivery_approvals','delivery_comments','delivery_content_items','delivery_versions',
    'department_instance_assignments','dept_team_messages','email_queue','employee_positions',
    'estrategista_aliases','estrategista_comissao_override','extratos_mensais',
    'ia_bot_activation_rules','ia_bot_conversation_overrides','ia_bot_documents','ia_bot_execution_logs','ia_bots',
    'internal_conversation_members','internal_conversations','internal_message_reads','internal_messages',
    'internal_post_comments','internal_post_poll_votes','internal_post_reactions','internal_posts','internal_typing_indicators',
    'learning_enrollments','learning_lessons','learning_modules','learning_paths','learning_progress',
    'meeting_feedback','meetings','notifications','nps_responses','nps_surveys',
    'personal_notes','pj_entregas','pj_notas','pj_prestadores','products','produtos_comissao','push_subscriptions',
    'salario_fixo_itens',
    'sales_opportunities','sales_opportunity_checklist','sales_opportunity_events','sales_pipelines',
    'sales_stage_checklist_items','sales_stages',
    'social_snapshots','tags','user_instance_assignments','user_roles','users','vendas_pendentes',
    'wa_warmup_groups','wa_warmup_logs','webhook_logs','webhooks','whatsapp_instances'
  ];
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Nenhum tenant encontrado — abortando Fase A.';
  END IF;

  FOREACH t IN ARRAY tabelas LOOP
    -- pula tabela inexistente (defensivo entre ambientes)
    IF to_regclass('public.'||t) IS NULL THEN
      RAISE NOTICE 'tabela % inexistente, pulando', t;
      CONTINUE;
    END IF;

    -- 1. coluna (nullable + FK; NULL não dispara validação de scan)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id)', t);

    -- 2. trigger de carimbo (antes do backfill, pra cobrir inserts concorrentes)
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id()', t);

    -- 3. backfill das linhas existentes (só 1 tenant hoje)
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, v_tenant);

    -- 4. índice por tenant
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_'||t||'_tenant_id', t);
  END LOOP;
END;
$do$;

NOTIFY pgrst, 'reload schema';
