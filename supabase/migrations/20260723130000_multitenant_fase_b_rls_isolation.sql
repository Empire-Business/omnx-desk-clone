-- ============================================================================
-- Multi-tenant — FASE B: isolamento por RLS (policy RESTRICTIVE por tenant)
-- ============================================================================
-- docs/multi-tenant-roadmap.md → Fase B, com abordagem mais segura que a original:
--
-- Em vez de REESCREVER as ~150 policies existentes (uma a uma, alto risco de
-- quebrar o app), adicionamos UMA policy RESTRICTIVE de isolamento por tabela.
-- Policies RESTRICTIVE combinam em AND com as permissivas existentes:
--
--     acesso_final = (regras de perfil atuais)  AND  (tenant do usuário == linha)
--
-- Resultado: tudo que funciona hoje continua funcionando (mesma empresa, mesmo
-- tenant), e passa a ser IMPOSSÍVEL um usuário do tenant A ver/gravar linha do
-- tenant B — mesmo que alguma policy permissiva seja USING(true).
--
-- Pré-requisitos (garantidos antes desta migration):
--   - Fase A aplicada: todas as tabelas têm tenant_id preenchido + trigger.
--   - Todo auth.user tem profile com tenant_id (get_user_tenant_id() nunca NULL
--     para usuário real) — senão o usuário ficaria sem acesso.
--
-- service_role (edge functions) tem BYPASSRLS → não é afetado. anon não recebe
-- policy permissiva nessas tabelas → segue sem acesso. A restrictive é TO
-- authenticated de propósito (não apertar portais anônimos existentes).
--
-- WITH CHECK: no INSERT o trigger BEFORE já carimba tenant_id = tenant do usuário
-- (avaliado antes do WITH CHECK do RLS), então passa. Bloqueia gravar/mover linha
-- para outro tenant.
--
-- Reversível: DROP POLICY tenant_isolation em cada tabela.
-- Idempotente: DROP POLICY IF EXISTS antes do CREATE.
-- ============================================================================
SET search_path = public, pg_catalog;

DO $do$
DECLARE
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
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         AS RESTRICTIVE
         FOR ALL
         TO authenticated
         USING (tenant_id = (SELECT public.get_user_tenant_id()))
         WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))', t);
  END LOOP;
END;
$do$;

NOTIFY pgrst, 'reload schema';
