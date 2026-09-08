-- ============================================================================
-- Multi-tenant — FASE A.2 (OPCIONAL): tornar tenant_id NOT NULL
-- ============================================================================
-- ⚠️ NÃO aplicada automaticamente. Hardening opcional.
--
-- Depois das Fases A e B, tenant_id já é sempre preenchido (trigger BEFORE INSERT)
-- e as leituras/gravações são isoladas por tenant (policy RESTRICTIVE). O NOT NULL
-- é defesa extra contra inserts via service_role (que BYPASSA RLS) que esqueçam de
-- informar o tenant — nesses casos o trigger ainda carimba, mas o NOT NULL garante.
--
-- Por que não veio junto: SET NOT NULL faz um scan com ACCESS EXCLUSIVE em cada
-- tabela. Em ~98 tabelas numa transação só, isso segura escrita por alguns
-- segundos. Aplique fora de horário de pico, e de preferência confirme antes:
--
--   SELECT relname FROM ( ... tabelas ... ) WHERE EXISTS (linha com tenant_id IS NULL)
--
-- Caminho de baixo lock (recomendado por tabela grande): adicionar CHECK NOT VALID,
-- VALIDATE, e só então SET NOT NULL — omitido aqui por simplicidade; com 0 nulos
-- confirmados, o SET NOT NULL direto é rápido nas tabelas pequenas.
--
-- Idempotente-ish: SET NOT NULL é no-op se a coluna já for NOT NULL.
-- ============================================================================
SET search_path = public, pg_catalog;

DO $do$
DECLARE
  t text;
  n_nulos bigint;
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
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL', t) INTO n_nulos;
    IF n_nulos > 0 THEN
      RAISE EXCEPTION 'tabela % tem % linhas com tenant_id NULL — rode o backfill antes', t, n_nulos;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
  END LOOP;
END;
$do$;
