-- ============================================================================
-- Linha de base (parte 2): estrutura da produção em 19/05/2026
-- ============================================================================
-- Por quê: até 19/05/2026 parte do banco da produção foi criada fora das
-- migrações (chat interno, reuniões, colunas novas em tabelas antigas, buckets,
-- políticas). O retrato fiel desse momento é o supabase/SETUP_COMPLETE.sql,
-- gerado por introspecção da produção em 2026-05-19T14:00Z. Este arquivo é o
-- mesmo conteúdo, transformado para rodar POR CIMA das migrações anteriores:
--   • CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS para cada coluna;
--   • ADD CONSTRAINT dentro de bloco que ignora "já existe";
--   • CREATE INDEX IF NOT EXISTS;
--   • DROP POLICY/TRIGGER IF EXISTS antes de cada CREATE POLICY/TRIGGER;
--   • funções e views com CREATE OR REPLACE (versão da produção de 19/05).
-- Assim, um projeto Supabase novo montado só com supabase/migrations em ordem
-- chega a 19/05 igual à produção, e as migrações seguintes rodam por cima.
--
-- Produção: NÃO rode este arquivo lá (trocaria funções pela versão de 19/05).
-- A trava abaixo recusa qualquer banco que já passou dessa data (tem a coluna
-- clients.tenant_id, criada em 23/07/2026). Para alinhar o histórico:
--   supabase migration repair --status applied 20260519165000
--
-- Gerado mecanicamente a partir do SETUP_COMPLETE.sql; ver
-- docs/INSTALACAO-DO-ZERO.md (como foi feito e como ensaiar).
-- ============================================================================

DO $trava$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'tenant_id'
  ) THEN
    RAISE EXCEPTION 'Linha de base de 19/05/2026: este banco já está mais novo (clients.tenant_id existe). Não rode aqui; marque com: supabase migration repair --status applied 20260519165000';
  END IF;
END $trava$;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  CREATE TYPE public."app_role" AS ENUM ('admin', 'manager', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."employee_status" AS ENUM ('active', 'inactive', 'on_leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public."instance_categoria" AS ENUM ('suporte', 'financeiro', 'entrega');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SEQUENCE IF NOT EXISTS public."_webhook_debug_id_seq";
CREATE TABLE IF NOT EXISTS public."_webhook_debug" (
  "id" bigint DEFAULT nextval('_webhook_debug_id_seq'::regclass) NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "event_type" text,
  "instance" text,
  "chatid" text,
  "is_group" boolean,
  "body" jsonb
);
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "id" bigint DEFAULT nextval('_webhook_debug_id_seq'::regclass) NOT NULL;
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "event_type" text;
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "instance" text;
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "chatid" text;
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "is_group" boolean;
ALTER TABLE public."_webhook_debug" ADD COLUMN IF NOT EXISTS "body" jsonb;
CREATE TABLE IF NOT EXISTS public."api_keys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "permissoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "criado_por" uuid,
  "ativo" boolean DEFAULT true NOT NULL,
  "ultimo_uso" timestamp with time zone,
  "expira_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "key_hash" text NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "key_prefix" text NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "permissoes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "ultimo_uso" timestamp with time zone;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "expira_em" timestamp with time zone;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."api_keys" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."app_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "valor" text DEFAULT ''::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."app_settings" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."app_settings" ADD COLUMN IF NOT EXISTS "chave" text NOT NULL;
ALTER TABLE public."app_settings" ADD COLUMN IF NOT EXISTS "valor" text DEFAULT ''::text NOT NULL;
ALTER TABLE public."app_settings" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."app_settings" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "user_nome" text,
  "user_perfil" text,
  "acao" text NOT NULL,
  "entidade" text NOT NULL,
  "entidade_id" text,
  "detalhes" jsonb,
  "ip_address" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "user_nome" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "user_perfil" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "acao" text NOT NULL;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "entidade" text NOT NULL;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "entidade_id" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "detalhes" jsonb;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE public."audit_logs" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."chat_contact_clients" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."chat_contact_clients" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_contact_clients" ADD COLUMN IF NOT EXISTS "contact_id" uuid NOT NULL;
ALTER TABLE public."chat_contact_clients" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."chat_contact_clients" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."chat_contacts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "instance_id" uuid,
  "numero_whatsapp" text NOT NULL,
  "nome" text,
  "foto_url" text,
  "client_id" uuid,
  "bloqueado" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "group_size" integer
);
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "numero_whatsapp" text NOT NULL;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "foto_url" text;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "client_id" uuid;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "bloqueado" boolean DEFAULT false;
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_contacts" ADD COLUMN IF NOT EXISTS "group_size" integer;
CREATE TABLE IF NOT EXISTS public."chat_conversation_user_prefs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "arquivada" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."chat_conversation_user_prefs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_conversation_user_prefs" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."chat_conversation_user_prefs" ADD COLUMN IF NOT EXISTS "conversation_id" uuid NOT NULL;
ALTER TABLE public."chat_conversation_user_prefs" ADD COLUMN IF NOT EXISTS "arquivada" boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS public."chat_conversations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "instance_id" uuid,
  "contact_id" uuid,
  "department_id" uuid,
  "agente_id" uuid,
  "status" text DEFAULT 'aberta'::text,
  "protocolo" text DEFAULT ('P-'::text || substr((gen_random_uuid())::text, 1, 8)),
  "primeira_resposta_em" timestamp with time zone,
  "encerrada_em" timestamp with time zone,
  "sla_primeira_resposta_violado" boolean DEFAULT false,
  "sla_resolucao_violado" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "is_group" boolean DEFAULT false,
  "silenciado" boolean DEFAULT false,
  "sentimento" text,
  "resumo_ia" text,
  "automacao_pausada_ate" timestamp with time zone,
  "aguardando_resposta" boolean DEFAULT false,
  "ultima_msg_cliente_em" timestamp with time zone,
  "arquivada" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "contact_id" uuid;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "department_id" uuid;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "agente_id" uuid;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'aberta'::text;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "protocolo" text DEFAULT ('P-'::text || substr((gen_random_uuid())::text, 1, 8));
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "primeira_resposta_em" timestamp with time zone;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "encerrada_em" timestamp with time zone;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "sla_primeira_resposta_violado" boolean DEFAULT false;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "sla_resolucao_violado" boolean DEFAULT false;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "is_group" boolean DEFAULT false;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "silenciado" boolean DEFAULT false;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "sentimento" text;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "resumo_ia" text;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "automacao_pausada_ate" timestamp with time zone;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "aguardando_resposta" boolean DEFAULT false;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "ultima_msg_cliente_em" timestamp with time zone;
ALTER TABLE public."chat_conversations" ADD COLUMN IF NOT EXISTS "arquivada" boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS public."chat_csat" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid,
  "nota" integer,
  "comentario" text,
  "respondido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."chat_csat" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_csat" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
ALTER TABLE public."chat_csat" ADD COLUMN IF NOT EXISTS "nota" integer;
ALTER TABLE public."chat_csat" ADD COLUMN IF NOT EXISTS "comentario" text;
ALTER TABLE public."chat_csat" ADD COLUMN IF NOT EXISTS "respondido_em" timestamp with time zone;
ALTER TABLE public."chat_csat" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."chat_department_agents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "department_id" uuid,
  "user_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now(),
  "is_gerente" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."chat_department_agents" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_department_agents" ADD COLUMN IF NOT EXISTS "department_id" uuid;
ALTER TABLE public."chat_department_agents" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."chat_department_agents" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_department_agents" ADD COLUMN IF NOT EXISTS "is_gerente" boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS public."chat_departments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "instance_id" uuid,
  "distribuicao" text DEFAULT 'manual'::text,
  "sla_primeira_resposta_minutos" integer DEFAULT 60,
  "sla_resolucao_horas" integer DEFAULT 24,
  "mensagem_boas_vindas" text,
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now(),
  "horario_inicio" text,
  "horario_fim" text,
  "dias_atendimento" int4[] DEFAULT '{1,2,3,4,5}'::integer[],
  "mensagem_fora_horario" text,
  "gerente_id" uuid,
  "modulo_acesso" text
);
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "distribuicao" text DEFAULT 'manual'::text;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "sla_primeira_resposta_minutos" integer DEFAULT 60;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "sla_resolucao_horas" integer DEFAULT 24;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "mensagem_boas_vindas" text;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "horario_inicio" text;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "horario_fim" text;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "dias_atendimento" int4[] DEFAULT '{1,2,3,4,5}'::integer[];
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "mensagem_fora_horario" text;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "gerente_id" uuid;
ALTER TABLE public."chat_departments" ADD COLUMN IF NOT EXISTS "modulo_acesso" text;
CREATE TABLE IF NOT EXISTS public."chat_group_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "numero_whatsapp" text NOT NULL,
  "nome" text,
  "is_admin" boolean DEFAULT false,
  "is_super_admin" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "contact_id" uuid NOT NULL;
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "numero_whatsapp" text NOT NULL;
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false;
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean DEFAULT false;
ALTER TABLE public."chat_group_members" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."chat_message_reads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_read_message_id" uuid
);
ALTER TABLE public."chat_message_reads" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_message_reads" ADD COLUMN IF NOT EXISTS "conversation_id" uuid NOT NULL;
ALTER TABLE public."chat_message_reads" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."chat_message_reads" ADD COLUMN IF NOT EXISTS "last_read_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."chat_message_reads" ADD COLUMN IF NOT EXISTS "last_read_message_id" uuid;
CREATE TABLE IF NOT EXISTS public."chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid,
  "message_id_wpp" text,
  "tipo" text DEFAULT 'texto'::text,
  "conteudo" text,
  "media_url" text,
  "enviado_por_agente" boolean DEFAULT false,
  "agente_id" uuid,
  "enviado_por_ia" boolean DEFAULT false,
  "lida" boolean DEFAULT false,
  "status_envio" text DEFAULT 'enviada'::text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "reactions" jsonb DEFAULT '[]'::jsonb,
  "fonte_envio" text,
  "reply_to_id" uuid
);
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "message_id_wpp" text;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'texto'::text;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "conteudo" text;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "media_url" text;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "enviado_por_agente" boolean DEFAULT false;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "agente_id" uuid;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "enviado_por_ia" boolean DEFAULT false;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "lida" boolean DEFAULT false;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "status_envio" text DEFAULT 'enviada'::text;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "fonte_envio" text;
ALTER TABLE public."chat_messages" ADD COLUMN IF NOT EXISTS "reply_to_id" uuid;
CREATE TABLE IF NOT EXISTS public."chat_quick_replies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "titulo" text NOT NULL,
  "conteudo" text NOT NULL,
  "atalho" text,
  "categoria" text DEFAULT 'geral'::text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "atalho" text;
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "categoria" text DEFAULT 'geral'::text;
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_quick_replies" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."chat_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "categoria" text NOT NULL,
  "conteudo" text NOT NULL,
  "variaveis" text[] DEFAULT '{}'::text[] NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "categoria" text NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "variaveis" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."chat_templates" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."chat_weekly_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "semana_inicio" date NOT NULL,
  "estrategista_id" uuid,
  "client_id" uuid,
  "client_nome" text,
  "estrategista_nome" text,
  "resumo" text,
  "topicos" jsonb DEFAULT '[]'::jsonb,
  "objecoes" jsonb DEFAULT '[]'::jsonb,
  "alertas" jsonb DEFAULT '[]'::jsonb,
  "sentimento_geral" text,
  "total_mensagens" integer DEFAULT 0,
  "total_conversas" integer DEFAULT 0,
  "criado_em" timestamp with time zone DEFAULT now(),
  "contact_id" uuid,
  "nota_detalhada" text,
  "como_lidar" jsonb DEFAULT '[]'::jsonb,
  "proximos_passos" jsonb DEFAULT '[]'::jsonb,
  "clareza_posicionamento" text,
  "nivel_execucao" text,
  "nivel_confianca_cliente" text,
  "risco_abandono" text,
  "qualidade_consultoria_estrategista" smallint,
  "ia_score" smallint,
  "temas_tratados" text[] DEFAULT '{}'::text[],
  "direcionamentos_dados" text[] DEFAULT '{}'::text[],
  "entregaveis_pendentes" text[] DEFAULT '{}'::text[],
  "bloqueios" text[] DEFAULT '{}'::text[],
  "is_group" boolean DEFAULT false,
  "sugestoes_estrategista" text[] DEFAULT '{}'::text[]
);
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "semana_inicio" date NOT NULL;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "estrategista_id" uuid;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "client_id" uuid;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "client_nome" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "estrategista_nome" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "resumo" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "topicos" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "objecoes" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "alertas" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "sentimento_geral" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "total_mensagens" integer DEFAULT 0;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "total_conversas" integer DEFAULT 0;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "contact_id" uuid;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "nota_detalhada" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "como_lidar" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "proximos_passos" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "clareza_posicionamento" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "nivel_execucao" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "nivel_confianca_cliente" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "risco_abandono" text;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "qualidade_consultoria_estrategista" smallint;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "ia_score" smallint;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "temas_tratados" text[] DEFAULT '{}'::text[];
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "direcionamentos_dados" text[] DEFAULT '{}'::text[];
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "entregaveis_pendentes" text[] DEFAULT '{}'::text[];
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "bloqueios" text[] DEFAULT '{}'::text[];
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "is_group" boolean DEFAULT false;
ALTER TABLE public."chat_weekly_reports" ADD COLUMN IF NOT EXISTS "sugestoes_estrategista" text[] DEFAULT '{}'::text[];
CREATE TABLE IF NOT EXISTS public."client_alerts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "data_alerta" timestamp with time zone,
  "resolvido" boolean DEFAULT false NOT NULL,
  "resolvido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "data_alerta" timestamp with time zone;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "resolvido" boolean DEFAULT false NOT NULL;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "resolvido_em" timestamp with time zone;
ALTER TABLE public."client_alerts" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."client_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."client_assignments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."client_assignments" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."client_assignments" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."client_assignments" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."client_assignments" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."client_assignments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."client_contracts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "produto" text,
  "status" text DEFAULT 'ATIVO'::text,
  "especialista" text,
  "vendedor" text,
  "treinador" text,
  "funil" text,
  "valor_entrada" text,
  "num_parcelas" integer,
  "valor_parcela" text,
  "faturamento_bruto" text,
  "forma_pagamento" text,
  "data_assinatura" date,
  "data_pg_entrada" date,
  "plano_dias" integer,
  "data_vencimento" date,
  "data_renovacao" date,
  "link_clicksign" text,
  "bonus" text,
  "upgrade" text,
  "cancelamento" text,
  "seguidores_inicio" integer,
  "seguidores_fim" integer,
  "crescimento_seguidores" integer,
  "videos_postados" integer,
  "entregas_prazo" integer,
  "entregas_totais" integer,
  "nps" text,
  "semanas" integer,
  "venda_interna" boolean DEFAULT false,
  "venda_diretoria" boolean DEFAULT false,
  "financeiro_ok" boolean DEFAULT false,
  "email_enviado" boolean DEFAULT false,
  "comprovante_entrada" text,
  "notas" text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "produto" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ATIVO'::text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "especialista" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "vendedor" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "treinador" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "funil" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "valor_entrada" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "num_parcelas" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "valor_parcela" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "faturamento_bruto" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "forma_pagamento" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "data_assinatura" date;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "data_pg_entrada" date;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "plano_dias" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "data_vencimento" date;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "data_renovacao" date;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "link_clicksign" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "bonus" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "upgrade" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "cancelamento" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "seguidores_inicio" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "seguidores_fim" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "crescimento_seguidores" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "videos_postados" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "entregas_prazo" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "entregas_totais" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "nps" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "semanas" integer;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "venda_interna" boolean DEFAULT false;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "venda_diretoria" boolean DEFAULT false;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "financeiro_ok" boolean DEFAULT false;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "email_enviado" boolean DEFAULT false;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "comprovante_entrada" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "notas" text;
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."client_contracts" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."client_interactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "data_interacao" timestamp with time zone DEFAULT now() NOT NULL,
  "duracao_minutos" integer,
  "resultado" text,
  "proxima_acao" text,
  "proxima_acao_data" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "data_interacao" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "duracao_minutos" integer;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "resultado" text;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "proxima_acao" text;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "proxima_acao_data" timestamp with time zone;
ALTER TABLE public."client_interactions" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."client_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "author_id" uuid,
  "author_nome" text,
  "conteudo" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "author_id" uuid;
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "author_nome" text;
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."client_notes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."clients" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "razao_social" text,
  "cnpj" text,
  "email" text,
  "telefone" text,
  "segmento" text,
  "logo_url" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "endereco" text,
  "instagram" text,
  "faturamento" text,
  "posicionamento" text,
  "notas" text,
  "whatsapp" text,
  "nicho" text,
  "empresa" text,
  "nota" smallint
);
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "razao_social" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "cnpj" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "telefone" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "segmento" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "endereco" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "instagram" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "faturamento" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "posicionamento" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "notas" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "whatsapp" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "nicho" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "empresa" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "nota" smallint;
CREATE TABLE IF NOT EXISTS public."cobranca_devedores" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "instance_id" uuid,
  "regua_id" uuid,
  "nome" text NOT NULL,
  "numero_whatsapp" text NOT NULL,
  "valor_divida" numeric(10,2),
  "descricao_divida" text,
  "data_vencimento" date,
  "status" text DEFAULT 'ativa'::text,
  "passo_atual" integer DEFAULT 0,
  "proximo_envio_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "regua_id" uuid;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "numero_whatsapp" text NOT NULL;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "valor_divida" numeric(10,2);
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "descricao_divida" text;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "data_vencimento" date;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ativa'::text;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "passo_atual" integer DEFAULT 0;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "proximo_envio_em" timestamp with time zone;
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."cobranca_devedores" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."cobranca_instances" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "instance_id" text NOT NULL,
  "numero_whatsapp" text,
  "status" text DEFAULT 'desconectado'::text,
  "envios_hora_max" integer DEFAULT 60,
  "intervalo_min_segundos" integer DEFAULT 30,
  "intervalo_max_segundos" integer DEFAULT 120,
  "horario_inicio" time without time zone DEFAULT '08:00:00'::time without time zone,
  "horario_fim" time without time zone DEFAULT '20:00:00'::time without time zone,
  "dias_semana" int4[] DEFAULT '{1,2,3,4,5}'::integer[],
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "instance_id" text NOT NULL;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "numero_whatsapp" text;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'desconectado'::text;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "envios_hora_max" integer DEFAULT 60;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "intervalo_min_segundos" integer DEFAULT 30;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "intervalo_max_segundos" integer DEFAULT 120;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "horario_inicio" time without time zone DEFAULT '08:00:00'::time without time zone;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "horario_fim" time without time zone DEFAULT '20:00:00'::time without time zone;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "dias_semana" int4[] DEFAULT '{1,2,3,4,5}'::integer[];
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
ALTER TABLE public."cobranca_instances" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."cobranca_regua_passos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "regua_id" uuid,
  "ordem" integer NOT NULL,
  "dias_apos_anterior" integer DEFAULT 1,
  "mensagem_template" text NOT NULL,
  "usar_ia_variacao" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "regua_id" uuid;
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "ordem" integer NOT NULL;
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "dias_apos_anterior" integer DEFAULT 1;
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "mensagem_template" text NOT NULL;
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "usar_ia_variacao" boolean DEFAULT false;
ALTER TABLE public."cobranca_regua_passos" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."cobranca_reguas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."cobranca_reguas" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."cobranca_reguas" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."cobranca_reguas" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."cobranca_reguas" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
ALTER TABLE public."cobranca_reguas" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."cobranca_sends" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "devedor_id" uuid,
  "instance_id" uuid,
  "passo" integer NOT NULL,
  "mensagem_enviada" text NOT NULL,
  "status_envio" text DEFAULT 'enviado'::text,
  "enviado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "devedor_id" uuid;
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "passo" integer NOT NULL;
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "mensagem_enviada" text NOT NULL;
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "status_envio" text DEFAULT 'enviado'::text;
ALTER TABLE public."cobranca_sends" ADD COLUMN IF NOT EXISTS "enviado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."comissoes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contrato_id" uuid NOT NULL,
  "estrategista_id" uuid NOT NULL,
  "cliente_nome" text NOT NULL,
  "parcela_num" integer NOT NULL,
  "total_parcelas" integer NOT NULL,
  "mes_referencia" date NOT NULL,
  "valor_calculado" numeric(12,2) NOT NULL,
  "valor_final" numeric(12,2) NOT NULL,
  "status" text DEFAULT 'prevista'::text NOT NULL,
  "postergada_para" date,
  "extrato_id" uuid,
  "observacoes_gestor" text,
  "editado_por" uuid,
  "editado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "contrato_id" uuid NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "estrategista_id" uuid NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "cliente_nome" text NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "parcela_num" integer NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "total_parcelas" integer NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "mes_referencia" date NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "valor_calculado" numeric(12,2) NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "valor_final" numeric(12,2) NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'prevista'::text NOT NULL;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "postergada_para" date;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "extrato_id" uuid;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "observacoes_gestor" text;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "editado_por" uuid;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "editado_em" timestamp with time zone;
ALTER TABLE public."comissoes" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."company_areas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "position" text NOT NULL,
  "color" text DEFAULT '#7C3AED'::text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "type" text NOT NULL;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "position" text NOT NULL;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '#7C3AED'::text;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."company_areas" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."contrato_anexos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contrato_id" uuid NOT NULL,
  "nome_original" text NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" text,
  "tamanho_bytes" bigint,
  "categoria" text DEFAULT 'outro'::text NOT NULL,
  "enviado_por" uuid,
  "enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "contrato_id" uuid NOT NULL;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "nome_original" text NOT NULL;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "storage_path" text NOT NULL;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "tamanho_bytes" bigint;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "categoria" text DEFAULT 'outro'::text NOT NULL;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "enviado_por" uuid;
ALTER TABLE public."contrato_anexos" ADD COLUMN IF NOT EXISTS "enviado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."contrato_pdf_extractions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contrato_id" uuid NOT NULL,
  "anexo_id" uuid,
  "modelo" text NOT NULL,
  "dados_extraidos" jsonb NOT NULL,
  "tokens_input" integer,
  "tokens_output" integer,
  "aplicado_em" timestamp with time zone,
  "aplicado_por" uuid,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "contrato_id" uuid NOT NULL;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "anexo_id" uuid;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "modelo" text NOT NULL;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "dados_extraidos" jsonb NOT NULL;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "tokens_input" integer;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "tokens_output" integer;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "aplicado_em" timestamp with time zone;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "aplicado_por" uuid;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."contrato_pdf_extractions" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."contratos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cliente_id" uuid,
  "cliente_nome" text NOT NULL,
  "produto_id" uuid,
  "produto_nome" text,
  "estrategista_id" uuid,
  "data_fechamento" date NOT NULL,
  "valor_total" numeric(12,2) NOT NULL,
  "num_parcelas" integer DEFAULT 1 NOT NULL,
  "percentual_aplicado" numeric(6,3) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "observacoes" text,
  "notion_page_id" text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "whatsapp" text,
  "email" text,
  "cpf_cnpj" text,
  "empresa" text,
  "endereco" text,
  "instagram" text,
  "nicho" text,
  "posicionamento" text,
  "resumo" text,
  "faturamento" text,
  "valor_parcela" numeric(12,2),
  "entrada" numeric(12,2),
  "pg_entrada" text,
  "fat_bruto" numeric(12,2),
  "forma_pagamento" text,
  "link_clicksign" text,
  "vencimento" date,
  "plano_dias" integer,
  "semanas" integer,
  "renovacao" text,
  "vendedor" text,
  "treinador" text,
  "estrategista_nome_raw" text,
  "seguidores_inicio" numeric(12,2),
  "seguidores_fim" numeric(12,2),
  "crescimento_seguidores" numeric(12,2),
  "videos_postados" integer,
  "entregas_no_prazo" integer,
  "entregas_totais" integer,
  "nps_vip" text,
  "status_secundario" text,
  "bonus" text,
  "venda_interna" boolean,
  "venda_diretoria" boolean,
  "notion_numero" text,
  "notion_ultima_edicao" timestamp with time zone,
  "notion_raw" jsonb,
  "importado_em" timestamp with time zone
);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "cliente_id" uuid;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "cliente_nome" text NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "produto_id" uuid;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "produto_nome" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "estrategista_id" uuid;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "data_fechamento" date NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "valor_total" numeric(12,2) NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "num_parcelas" integer DEFAULT 1 NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "percentual_aplicado" numeric(6,3) DEFAULT 0 NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ativo'::text NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "observacoes" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "notion_page_id" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "whatsapp" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "cpf_cnpj" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "empresa" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "endereco" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "instagram" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "nicho" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "posicionamento" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "resumo" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "faturamento" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "valor_parcela" numeric(12,2);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "entrada" numeric(12,2);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "pg_entrada" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "fat_bruto" numeric(12,2);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "forma_pagamento" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "link_clicksign" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "vencimento" date;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "plano_dias" integer;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "semanas" integer;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "renovacao" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "vendedor" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "treinador" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "estrategista_nome_raw" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "seguidores_inicio" numeric(12,2);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "seguidores_fim" numeric(12,2);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "crescimento_seguidores" numeric(12,2);
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "videos_postados" integer;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "entregas_no_prazo" integer;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "entregas_totais" integer;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "nps_vip" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "status_secundario" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "bonus" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "venda_interna" boolean;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "venda_diretoria" boolean;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "notion_numero" text;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "notion_ultima_edicao" timestamp with time zone;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "notion_raw" jsonb;
ALTER TABLE public."contratos" ADD COLUMN IF NOT EXISTS "importado_em" timestamp with time zone;
CREATE TABLE IF NOT EXISTS public."contratos_audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contrato_id" uuid NOT NULL,
  "operacao" text NOT NULL,
  "campo" text,
  "valor_antigo" text,
  "valor_novo" text,
  "alterado_por" uuid,
  "alterado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "contrato_id" uuid NOT NULL;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "operacao" text NOT NULL;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "campo" text;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "valor_antigo" text;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "valor_novo" text;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "alterado_por" uuid;
ALTER TABLE public."contratos_audit_log" ADD COLUMN IF NOT EXISTS "alterado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."deliverables" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "tipo" text DEFAULT 'outro'::text NOT NULL,
  "descricao" text,
  "quantidade" integer DEFAULT 1 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "product_id" uuid NOT NULL;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'outro'::text NOT NULL;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "quantidade" integer DEFAULT 1 NOT NULL;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."deliverables" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."deliveries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "deliverable_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "status" text DEFAULT 'rascunho'::text NOT NULL,
  "responsavel_id" uuid,
  "prazo" date,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "deliverable_id" uuid NOT NULL;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'rascunho'::text NOT NULL;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "responsavel_id" uuid;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "prazo" date;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."deliveries" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."delivery_approvals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "delivery_id" uuid NOT NULL,
  "version_id" uuid NOT NULL,
  "aprovado_por" uuid,
  "aprovado" boolean NOT NULL,
  "notas" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "delivery_id" uuid NOT NULL;
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "version_id" uuid NOT NULL;
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "aprovado_por" uuid;
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "aprovado" boolean NOT NULL;
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "notas" text;
ALTER TABLE public."delivery_approvals" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."delivery_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "delivery_id" uuid NOT NULL,
  "version_id" uuid,
  "autor_id" uuid,
  "texto" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."delivery_comments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."delivery_comments" ADD COLUMN IF NOT EXISTS "delivery_id" uuid NOT NULL;
ALTER TABLE public."delivery_comments" ADD COLUMN IF NOT EXISTS "version_id" uuid;
ALTER TABLE public."delivery_comments" ADD COLUMN IF NOT EXISTS "autor_id" uuid;
ALTER TABLE public."delivery_comments" ADD COLUMN IF NOT EXISTS "texto" text NOT NULL;
ALTER TABLE public."delivery_comments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."delivery_content_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "url" text,
  "texto" text,
  "nome" text,
  "tamanho" bigint,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "version_id" uuid NOT NULL;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "url" text;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "texto" text;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "tamanho" bigint;
ALTER TABLE public."delivery_content_items" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."delivery_versions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "delivery_id" uuid NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "notas" text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."delivery_versions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."delivery_versions" ADD COLUMN IF NOT EXISTS "delivery_id" uuid NOT NULL;
ALTER TABLE public."delivery_versions" ADD COLUMN IF NOT EXISTS "versao" integer DEFAULT 1 NOT NULL;
ALTER TABLE public."delivery_versions" ADD COLUMN IF NOT EXISTS "notas" text;
ALTER TABLE public."delivery_versions" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."delivery_versions" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."department_instance_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "department_id" uuid NOT NULL,
  "instance_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."department_instance_assignments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."department_instance_assignments" ADD COLUMN IF NOT EXISTS "department_id" uuid NOT NULL;
ALTER TABLE public."department_instance_assignments" ADD COLUMN IF NOT EXISTS "instance_id" uuid NOT NULL;
ALTER TABLE public."department_instance_assignments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."dept_team_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "department_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "conteudo" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."dept_team_messages" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."dept_team_messages" ADD COLUMN IF NOT EXISTS "department_id" uuid NOT NULL;
ALTER TABLE public."dept_team_messages" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."dept_team_messages" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."dept_team_messages" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."email_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "destinatario_email" text NOT NULL,
  "destinatario_nome" text,
  "assunto" text NOT NULL,
  "corpo_html" text NOT NULL,
  "corpo_texto" text,
  "tipo" text DEFAULT 'transacional'::text NOT NULL,
  "referencia_tipo" text,
  "referencia_id" text,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "max_tentativas" integer DEFAULT 3 NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "erro" text,
  "enviado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "destinatario_email" text NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "destinatario_nome" text;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "assunto" text NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "corpo_html" text NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "corpo_texto" text;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'transacional'::text NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "referencia_tipo" text;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "referencia_id" text;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "tentativas" integer DEFAULT 0 NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "max_tentativas" integer DEFAULT 3 NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pendente'::text NOT NULL;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "erro" text;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "enviado_em" timestamp with time zone;
ALTER TABLE public."email_queue" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."employee_positions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "position_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."employee_positions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."employee_positions" ADD COLUMN IF NOT EXISTS "employee_id" uuid NOT NULL;
ALTER TABLE public."employee_positions" ADD COLUMN IF NOT EXISTS "position_id" uuid NOT NULL;
ALTER TABLE public."employee_positions" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false;
ALTER TABLE public."employee_positions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."employees" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid,
  "position_id" uuid,
  "manager_id" uuid,
  "status" public."employee_status" DEFAULT 'active'::employee_status,
  "admission_date" date,
  "phone" text,
  "work_email" text,
  "is_ceo" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "position_id" uuid;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "manager_id" uuid;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "status" public."employee_status" DEFAULT 'active'::employee_status;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "admission_date" date;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "work_email" text;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "is_ceo" boolean DEFAULT false;
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."employees" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."estrategista_aliases" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "alias_normalizado" text NOT NULL,
  "alias_original" text NOT NULL,
  "user_id" uuid NOT NULL,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."estrategista_aliases" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."estrategista_aliases" ADD COLUMN IF NOT EXISTS "alias_normalizado" text NOT NULL;
ALTER TABLE public."estrategista_aliases" ADD COLUMN IF NOT EXISTS "alias_original" text NOT NULL;
ALTER TABLE public."estrategista_aliases" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."estrategista_aliases" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."estrategista_aliases" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."estrategista_comissao_override" (
  "user_id" uuid NOT NULL,
  "produto_id" uuid NOT NULL,
  "percentual_custom" numeric(6,3) NOT NULL
);
ALTER TABLE public."estrategista_comissao_override" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."estrategista_comissao_override" ADD COLUMN IF NOT EXISTS "produto_id" uuid NOT NULL;
ALTER TABLE public."estrategista_comissao_override" ADD COLUMN IF NOT EXISTS "percentual_custom" numeric(6,3) NOT NULL;
CREATE TABLE IF NOT EXISTS public."extratos_mensais" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "estrategista_id" uuid NOT NULL,
  "estrategista_nome" text NOT NULL,
  "estrategista_doc" text,
  "mes_referencia" date NOT NULL,
  "total_bruto" numeric(12,2) DEFAULT 0 NOT NULL,
  "total_liquido" numeric(12,2) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'rascunho'::text NOT NULL,
  "aprovado_por" uuid,
  "aprovado_em" timestamp with time zone,
  "pago_em" timestamp with time zone,
  "observacoes" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "estrategista_id" uuid NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "estrategista_nome" text NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "estrategista_doc" text;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "mes_referencia" date NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "total_bruto" numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "total_liquido" numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'rascunho'::text NOT NULL;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "aprovado_por" uuid;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "aprovado_em" timestamp with time zone;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "pago_em" timestamp with time zone;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "observacoes" text;
ALTER TABLE public."extratos_mensais" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."ia_bot_activation_rules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bot_id" uuid,
  "tipo" text NOT NULL,
  "valor" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."ia_bot_activation_rules" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."ia_bot_activation_rules" ADD COLUMN IF NOT EXISTS "bot_id" uuid;
ALTER TABLE public."ia_bot_activation_rules" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."ia_bot_activation_rules" ADD COLUMN IF NOT EXISTS "valor" text;
ALTER TABLE public."ia_bot_activation_rules" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."ia_bot_conversation_overrides" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bot_id" uuid,
  "conversation_id" uuid,
  "pausado" boolean DEFAULT false,
  "pausado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."ia_bot_conversation_overrides" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."ia_bot_conversation_overrides" ADD COLUMN IF NOT EXISTS "bot_id" uuid;
ALTER TABLE public."ia_bot_conversation_overrides" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
ALTER TABLE public."ia_bot_conversation_overrides" ADD COLUMN IF NOT EXISTS "pausado" boolean DEFAULT false;
ALTER TABLE public."ia_bot_conversation_overrides" ADD COLUMN IF NOT EXISTS "pausado_por" uuid;
ALTER TABLE public."ia_bot_conversation_overrides" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."ia_bot_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bot_id" uuid,
  "nome" text NOT NULL,
  "tipo" text DEFAULT 'texto'::text,
  "conteudo" text,
  "url" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "bot_id" uuid;
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'texto'::text;
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "conteudo" text;
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "url" text;
ALTER TABLE public."ia_bot_documents" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."ia_bot_execution_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bot_id" uuid,
  "conversation_id" uuid,
  "message_id" uuid,
  "tokens_input" integer,
  "tokens_output" integer,
  "tools_executadas" jsonb,
  "escalada" boolean DEFAULT false,
  "erro" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "bot_id" uuid;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "message_id" uuid;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "tokens_input" integer;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "tokens_output" integer;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "tools_executadas" jsonb;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "escalada" boolean DEFAULT false;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "erro" text;
ALTER TABLE public."ia_bot_execution_logs" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."ia_bots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "instance_id" uuid,
  "department_id" uuid,
  "modelo_openrouter" text DEFAULT 'anthropic/claude-haiku-4-5-20251001'::text NOT NULL,
  "system_prompt" text,
  "temperatura" numeric(3,2) DEFAULT 0.7,
  "ativo" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "department_id" uuid;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "modelo_openrouter" text DEFAULT 'anthropic/claude-haiku-4-5-20251001'::text NOT NULL;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "system_prompt" text;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "temperatura" numeric(3,2) DEFAULT 0.7;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT false;
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."ia_bots" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."internal_conversation_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."internal_conversation_members" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_conversation_members" ADD COLUMN IF NOT EXISTS "conversation_id" uuid NOT NULL;
ALTER TABLE public."internal_conversation_members" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_conversation_members" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'member'::text;
ALTER TABLE public."internal_conversation_members" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."internal_conversations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "nome" text,
  "descricao" text,
  "department_id" uuid,
  "fixado" boolean DEFAULT false,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "nome" text;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "department_id" uuid;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "fixado" boolean DEFAULT false;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."internal_conversations" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."internal_message_reads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."internal_message_reads" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_message_reads" ADD COLUMN IF NOT EXISTS "conversation_id" uuid NOT NULL;
ALTER TABLE public."internal_message_reads" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_message_reads" ADD COLUMN IF NOT EXISTS "last_read_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."internal_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "conteudo" text NOT NULL,
  "tipo" text DEFAULT 'texto'::text,
  "media_url" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "conversation_id" uuid NOT NULL;
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'texto'::text;
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "media_url" text;
ALTER TABLE public."internal_messages" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."internal_post_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "conteudo" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."internal_post_comments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_post_comments" ADD COLUMN IF NOT EXISTS "post_id" uuid NOT NULL;
ALTER TABLE public."internal_post_comments" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_post_comments" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."internal_post_comments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."internal_post_poll_votes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "option_index" integer NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."internal_post_poll_votes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_post_poll_votes" ADD COLUMN IF NOT EXISTS "post_id" uuid NOT NULL;
ALTER TABLE public."internal_post_poll_votes" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_post_poll_votes" ADD COLUMN IF NOT EXISTS "option_index" integer NOT NULL;
ALTER TABLE public."internal_post_poll_votes" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."internal_post_reactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text DEFAULT '👍'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."internal_post_reactions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_post_reactions" ADD COLUMN IF NOT EXISTS "post_id" uuid NOT NULL;
ALTER TABLE public."internal_post_reactions" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_post_reactions" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT '👍'::text NOT NULL;
ALTER TABLE public."internal_post_reactions" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."internal_posts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "department_id" uuid,
  "conteudo" text NOT NULL,
  "fixado" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "imagem_url" text,
  "video_url" text,
  "arquivo_url" text,
  "arquivo_nome" text,
  "categoria" text,
  "poll_options" jsonb
);
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "department_id" uuid;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "conteudo" text NOT NULL;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "fixado" boolean DEFAULT false;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "imagem_url" text;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "video_url" text;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "arquivo_url" text;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "arquivo_nome" text;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "categoria" text;
ALTER TABLE public."internal_posts" ADD COLUMN IF NOT EXISTS "poll_options" jsonb;
CREATE TABLE IF NOT EXISTS public."internal_typing_indicators" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."internal_typing_indicators" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."internal_typing_indicators" ADD COLUMN IF NOT EXISTS "conversation_id" uuid NOT NULL;
ALTER TABLE public."internal_typing_indicators" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."internal_typing_indicators" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."learning_enrollments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "path_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."learning_enrollments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."learning_enrollments" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."learning_enrollments" ADD COLUMN IF NOT EXISTS "path_id" uuid NOT NULL;
ALTER TABLE public."learning_enrollments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."learning_lessons" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "module_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "tipo" text DEFAULT 'video'::text NOT NULL,
  "conteudo_url" text,
  "conteudo_texto" text,
  "duracao_minutos" integer,
  "ordem" integer DEFAULT 0,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "module_id" uuid NOT NULL;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'video'::text NOT NULL;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "conteudo_url" text;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "conteudo_texto" text;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "duracao_minutos" integer;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0;
ALTER TABLE public."learning_lessons" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."learning_modules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "path_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "ordem" integer DEFAULT 0,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."learning_modules" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."learning_modules" ADD COLUMN IF NOT EXISTS "path_id" uuid NOT NULL;
ALTER TABLE public."learning_modules" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."learning_modules" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."learning_modules" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0;
ALTER TABLE public."learning_modules" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."learning_paths" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "tipo" text DEFAULT 'interno'::text NOT NULL,
  "thumbnail_url" text,
  "ativo" boolean DEFAULT true,
  "ordem" integer DEFAULT 0,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'interno'::text NOT NULL;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "thumbnail_url" text;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0;
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."learning_paths" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."learning_progress" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "lesson_id" uuid NOT NULL,
  "concluido" boolean DEFAULT false,
  "concluido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."learning_progress" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."learning_progress" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."learning_progress" ADD COLUMN IF NOT EXISTS "lesson_id" uuid NOT NULL;
ALTER TABLE public."learning_progress" ADD COLUMN IF NOT EXISTS "concluido" boolean DEFAULT false;
ALTER TABLE public."learning_progress" ADD COLUMN IF NOT EXISTS "concluido_em" timestamp with time zone;
ALTER TABLE public."learning_progress" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."meeting_feedback" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid,
  "livekit_room_name" text NOT NULL,
  "rating" smallint,
  "comment" text,
  "respondent_name" text,
  "respondent_role" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "meeting_id" uuid;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "livekit_room_name" text NOT NULL;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "rating" smallint;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "respondent_name" text;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "respondent_role" text;
ALTER TABLE public."meeting_feedback" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."meetings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text,
  "client_id" uuid,
  "conversation_id" uuid,
  "contact_id" uuid,
  "meeting_type" text DEFAULT 'sales_call'::text,
  "status" text DEFAULT 'scheduled'::text,
  "meeting_link" text,
  "livekit_room_name" text NOT NULL,
  "recording_url" text,
  "recording_status" text DEFAULT 'pending'::text,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "created_by" uuid,
  "participants" jsonb DEFAULT '[]'::jsonb,
  "transcriptions" jsonb DEFAULT '[]'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "ai_title" text,
  "ai_summary" text,
  "ai_action_items" jsonb DEFAULT '[]'::jsonb,
  "ai_generated_at" timestamp with time zone,
  "duration_seconds" integer,
  "participants_count" integer DEFAULT 0,
  "scheduled_at" timestamp with time zone,
  "scheduled_duration_min" integer DEFAULT 30,
  "guest_name" text,
  "guest_phone" text
);
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "client_id" uuid;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "conversation_id" uuid;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "contact_id" uuid;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "meeting_type" text DEFAULT 'sales_call'::text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'scheduled'::text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "meeting_link" text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "livekit_room_name" text NOT NULL;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "recording_url" text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "recording_status" text DEFAULT 'pending'::text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "ended_at" timestamp with time zone;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "participants" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "transcriptions" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "ai_title" text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "ai_summary" text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "ai_action_items" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "ai_generated_at" timestamp with time zone;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "participants_count" integer DEFAULT 0;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "scheduled_duration_min" integer DEFAULT 30;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "guest_name" text;
ALTER TABLE public."meetings" ADD COLUMN IF NOT EXISTS "guest_phone" text;
CREATE TABLE IF NOT EXISTS public."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "mensagem" text,
  "lida" boolean DEFAULT false,
  "link" text,
  "metadata" jsonb,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "mensagem" text;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "lida" boolean DEFAULT false;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "link" text;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."nps_responses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "survey_id" uuid NOT NULL,
  "respondido_por" uuid,
  "nota" integer NOT NULL,
  "comentario" text,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."nps_responses" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."nps_responses" ADD COLUMN IF NOT EXISTS "survey_id" uuid NOT NULL;
ALTER TABLE public."nps_responses" ADD COLUMN IF NOT EXISTS "respondido_por" uuid;
ALTER TABLE public."nps_responses" ADD COLUMN IF NOT EXISTS "nota" integer NOT NULL;
ALTER TABLE public."nps_responses" ADD COLUMN IF NOT EXISTS "comentario" text;
ALTER TABLE public."nps_responses" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."nps_surveys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "delivery_id" uuid,
  "enviado_em" timestamp with time zone DEFAULT now(),
  "respondido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."nps_surveys" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."nps_surveys" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."nps_surveys" ADD COLUMN IF NOT EXISTS "delivery_id" uuid;
ALTER TABLE public."nps_surveys" ADD COLUMN IF NOT EXISTS "enviado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."nps_surveys" ADD COLUMN IF NOT EXISTS "respondido_em" timestamp with time zone;
ALTER TABLE public."nps_surveys" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."personal_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "content" text DEFAULT ''::text NOT NULL,
  "tipo" text DEFAULT 'texto'::text NOT NULL,
  "media_url" text,
  "pinned" boolean DEFAULT false NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "title" text,
  "color" text DEFAULT 'default'::text,
  "reminder_at" timestamp with time zone
);
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "content" text DEFAULT ''::text NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'texto'::text NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "media_url" text;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "color" text DEFAULT 'default'::text;
ALTER TABLE public."personal_notes" ADD COLUMN IF NOT EXISTS "reminder_at" timestamp with time zone;
CREATE TABLE IF NOT EXISTS public."positions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "subarea_id" uuid,
  "area_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "responsibilities" text[],
  "goals" text[],
  "level" integer DEFAULT 1,
  "sort_order" integer DEFAULT 0,
  "reports_to_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "subarea_id" uuid;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "area_id" uuid;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "responsibilities" text[];
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "goals" text[];
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "level" integer DEFAULT 1;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "reports_to_id" uuid;
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."positions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid,
  "nome" text NOT NULL,
  "descricao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "client_id" uuid;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."produtos_comissao" (
  "produto_id" uuid NOT NULL,
  "percentual_padrao" numeric(6,3) DEFAULT 0 NOT NULL,
  "parcelas_padrao" integer DEFAULT 1 NOT NULL,
  "observacoes" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_por" uuid,
  "tipo_comissao" text DEFAULT 'percentual'::text NOT NULL,
  "valor_comissao_padrao" numeric(12,2) DEFAULT 0 NOT NULL,
  "valor_bonus" numeric(12,2) DEFAULT 0 NOT NULL,
  "bonus_condicional" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "produto_id" uuid NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "percentual_padrao" numeric(6,3) DEFAULT 0 NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "parcelas_padrao" integer DEFAULT 1 NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "observacoes" text;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "atualizado_por" uuid;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "tipo_comissao" text DEFAULT 'percentual'::text NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "valor_comissao_padrao" numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "valor_bonus" numeric(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public."produtos_comissao" ADD COLUMN IF NOT EXISTS "bonus_condicional" boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS public."profiles" (
  "user_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "full_name" text,
  "avatar_url" text,
  "phone" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."push_subscriptions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."push_subscriptions" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."push_subscriptions" ADD COLUMN IF NOT EXISTS "endpoint" text NOT NULL;
ALTER TABLE public."push_subscriptions" ADD COLUMN IF NOT EXISTS "p256dh" text NOT NULL;
ALTER TABLE public."push_subscriptions" ADD COLUMN IF NOT EXISTS "auth" text NOT NULL;
ALTER TABLE public."push_subscriptions" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."salario_fixo_itens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "extrato_id" uuid NOT NULL,
  "cliente_id" uuid,
  "cliente_nome" text NOT NULL,
  "descricao" text,
  "valor" numeric(12,2) NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL
);
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "extrato_id" uuid NOT NULL;
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "cliente_id" uuid;
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "cliente_nome" text NOT NULL;
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "valor" numeric(12,2) NOT NULL;
ALTER TABLE public."salario_fixo_itens" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0 NOT NULL;
CREATE TABLE IF NOT EXISTS public."sales_opportunities" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "stage_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "produto" text,
  "product_id" uuid,
  "valor" numeric(14,2),
  "responsavel_id" uuid,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "notas" text,
  "fechada_em" timestamp with time zone,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "stage_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "titulo" text NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "produto" text;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "valor" numeric(14,2);
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "responsavel_id" uuid;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'aberta'::text NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "notas" text;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "fechada_em" timestamp with time zone;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."sales_opportunities" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."sales_opportunity_checklist" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "marcada" boolean DEFAULT false NOT NULL,
  "marcada_em" timestamp with time zone,
  "marcada_por" uuid
);
ALTER TABLE public."sales_opportunity_checklist" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."sales_opportunity_checklist" ADD COLUMN IF NOT EXISTS "opportunity_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunity_checklist" ADD COLUMN IF NOT EXISTS "item_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunity_checklist" ADD COLUMN IF NOT EXISTS "marcada" boolean DEFAULT false NOT NULL;
ALTER TABLE public."sales_opportunity_checklist" ADD COLUMN IF NOT EXISTS "marcada_em" timestamp with time zone;
ALTER TABLE public."sales_opportunity_checklist" ADD COLUMN IF NOT EXISTS "marcada_por" uuid;
CREATE TABLE IF NOT EXISTS public."sales_opportunity_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "payload" jsonb,
  "autor_id" uuid,
  "autor_nome" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "opportunity_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "autor_id" uuid;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "autor_nome" text;
ALTER TABLE public."sales_opportunity_events" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."sales_pipelines" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "ordem" integer DEFAULT 0 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "descricao" text;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0 NOT NULL;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."sales_pipelines" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."sales_stage_checklist_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "stage_id" uuid NOT NULL,
  "label" text NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."sales_stage_checklist_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."sales_stage_checklist_items" ADD COLUMN IF NOT EXISTS "stage_id" uuid NOT NULL;
ALTER TABLE public."sales_stage_checklist_items" ADD COLUMN IF NOT EXISTS "label" text NOT NULL;
ALTER TABLE public."sales_stage_checklist_items" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0 NOT NULL;
ALTER TABLE public."sales_stage_checklist_items" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."sales_stages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "cor" text,
  "status_final" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid NOT NULL;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "ordem" integer DEFAULT 0 NOT NULL;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "cor" text;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "status_final" text;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."sales_stages" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."social_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "platform" text NOT NULL,
  "username" text NOT NULL,
  "followers" integer,
  "full_name" text,
  "profile_pic_url" text,
  "last_post_at" timestamp with time zone,
  "last_post_caption" text,
  "last_post_url" text,
  "raw" jsonb,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "client_id" uuid NOT NULL;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "username" text NOT NULL;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "followers" integer;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "profile_pic_url" text;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "last_post_at" timestamp with time zone;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "last_post_caption" text;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "last_post_url" text;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "raw" jsonb;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "fetched_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."social_snapshots" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."subareas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "area_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "area_id" uuid NOT NULL;
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "color" text;
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."subareas" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."tenants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo_url" text,
  "primary_color" text DEFAULT '#7C3AED'::text,
  "secondary_color" text,
  "favicon_url" text,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "logo_dark_url" text,
  "custom_domain" text
);
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "slug" text NOT NULL;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "primary_color" text DEFAULT '#7C3AED'::text;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "secondary_color" text;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "favicon_url" text;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "logo_dark_url" text;
ALTER TABLE public."tenants" ADD COLUMN IF NOT EXISTS "custom_domain" text;
CREATE TABLE IF NOT EXISTS public."user_instance_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "instance_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."user_instance_assignments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."user_instance_assignments" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."user_instance_assignments" ADD COLUMN IF NOT EXISTS "instance_id" uuid NOT NULL;
ALTER TABLE public."user_instance_assignments" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."user_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" public."app_role" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "user_id" uuid NOT NULL;
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "role" public."app_role" NOT NULL;
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
CREATE TABLE IF NOT EXISTS public."users" (
  "id" uuid NOT NULL,
  "nome" text NOT NULL,
  "email" text NOT NULL,
  "perfil" text NOT NULL,
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now(),
  "department_id" uuid,
  "foto_url" text,
  "tipo_consultor" text,
  "salario_fixo_mensal" numeric(12,2),
  "cnpj_cpf" text,
  "ativo_comissoes" boolean DEFAULT true,
  "acesso_contratos" boolean DEFAULT false NOT NULL,
  "last_seen_at" timestamp with time zone,
  "inativacao_motivo" text,
  "inativacao_em" timestamp with time zone,
  "inativacao_por" uuid
);
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "id" uuid NOT NULL;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "perfil" text NOT NULL;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "department_id" uuid;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "foto_url" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "tipo_consultor" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "salario_fixo_mensal" numeric(12,2);
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "cnpj_cpf" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "ativo_comissoes" boolean DEFAULT true;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "acesso_contratos" boolean DEFAULT false NOT NULL;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "inativacao_motivo" text;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "inativacao_em" timestamp with time zone;
ALTER TABLE public."users" ADD COLUMN IF NOT EXISTS "inativacao_por" uuid;
CREATE TABLE IF NOT EXISTS public."vendas_pendentes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "closer_nome" text NOT NULL,
  "closer_email" text NOT NULL,
  "cliente_nome" text NOT NULL,
  "cliente_cpf_cnpj" text,
  "cliente_email" text,
  "cliente_whatsapp" text NOT NULL,
  "produto_id" uuid,
  "produto_nome" text,
  "pagamentos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "comprovantes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "observacoes" text,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "atendido_por" uuid,
  "atendido_em" timestamp with time zone,
  "ip_origem" text,
  "user_agent" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "cliente_razao_social" text,
  "cliente_instagram" text,
  "cliente_endereco" text
);
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "closer_nome" text NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "closer_email" text NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_nome" text NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_cpf_cnpj" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_email" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_whatsapp" text NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "produto_id" uuid;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "produto_nome" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "pagamentos" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "comprovantes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "observacoes" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pendente'::text NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "atendido_por" uuid;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "atendido_em" timestamp with time zone;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "ip_origem" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_razao_social" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_instagram" text;
ALTER TABLE public."vendas_pendentes" ADD COLUMN IF NOT EXISTS "cliente_endereco" text;
CREATE TABLE IF NOT EXISTS public."wa_warmup_groups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "wa_chatid" text NOT NULL,
  "instance_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "frases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "intervalo_min_seg" integer DEFAULT 480 NOT NULL,
  "intervalo_max_seg" integer DEFAULT 1500 NOT NULL,
  "horario_inicio" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
  "horario_fim" time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL,
  "ativo" boolean DEFAULT false NOT NULL,
  "ultima_mensagem_em" timestamp with time zone,
  "proxima_mensagem_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "usar_ia" boolean DEFAULT false NOT NULL,
  "tema" text DEFAULT 'EXCLUSIVAMENTE Clube de Regatas Vasco da Gama (futebol, história, jogadores, jogos, torcida, São Januário, Cruz de Malta) — não fale de outros times nem de outros assuntos'::text NOT NULL,
  "personalidades" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pesos" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "wa_chatid" text NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "instance_ids" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "frases" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "intervalo_min_seg" integer DEFAULT 480 NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "intervalo_max_seg" integer DEFAULT 1500 NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "horario_inicio" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "horario_fim" time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT false NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "ultima_mensagem_em" timestamp with time zone;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "proxima_mensagem_em" timestamp with time zone;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "usar_ia" boolean DEFAULT false NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "tema" text DEFAULT 'EXCLUSIVAMENTE Clube de Regatas Vasco da Gama (futebol, história, jogadores, jogos, torcida, São Januário, Cruz de Malta) — não fale de outros times nem de outros assuntos'::text NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "personalidades" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public."wa_warmup_groups" ADD COLUMN IF NOT EXISTS "pesos" jsonb DEFAULT '{}'::jsonb NOT NULL;
CREATE TABLE IF NOT EXISTS public."wa_warmup_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "instance_id" text NOT NULL,
  "mensagem" text NOT NULL,
  "uazapi_response" jsonb,
  "sucesso" boolean DEFAULT true NOT NULL,
  "enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "group_id" uuid NOT NULL;
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "instance_id" text NOT NULL;
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "mensagem" text NOT NULL;
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "uazapi_response" jsonb;
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "sucesso" boolean DEFAULT true NOT NULL;
ALTER TABLE public."wa_warmup_logs" ADD COLUMN IF NOT EXISTS "enviado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."webhook_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "webhook_id" uuid NOT NULL,
  "evento" text NOT NULL,
  "payload" jsonb,
  "status_code" integer,
  "response_body" text,
  "duracao_ms" integer,
  "sucesso" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "webhook_id" uuid NOT NULL;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "evento" text NOT NULL;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "status_code" integer;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "response_body" text;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "duracao_ms" integer;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "sucesso" boolean DEFAULT false NOT NULL;
ALTER TABLE public."webhook_logs" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."webhooks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "url" text NOT NULL,
  "secret" text NOT NULL,
  "eventos" text[] DEFAULT '{}'::text[] NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "url" text NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "secret" text NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "eventos" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "criado_por" uuid;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."webhooks" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE IF NOT EXISTS public."whatsapp_instances" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "numero_whatsapp" text,
  "instance_id" text NOT NULL,
  "webhook_url" text,
  "status" text DEFAULT 'desconectado'::text,
  "qr_code" text,
  "departamento_padrao_id" uuid,
  "auto_reply_fora_horario" boolean DEFAULT false,
  "mensagem_fora_horario" text,
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now(),
  "categoria" public."instance_categoria",
  "cor" text,
  "ocultar_grupos" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "nome" text NOT NULL;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "numero_whatsapp" text;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "instance_id" text NOT NULL;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "webhook_url" text;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'desconectado'::text;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "qr_code" text;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "departamento_padrao_id" uuid;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "auto_reply_fora_horario" boolean DEFAULT false;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "mensagem_fora_horario" text;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "criado_em" timestamp with time zone DEFAULT now();
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "categoria" public."instance_categoria";
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "cor" text;
ALTER TABLE public."whatsapp_instances" ADD COLUMN IF NOT EXISTS "ocultar_grupos" boolean DEFAULT false NOT NULL;
DO $c$ BEGIN
  ALTER TABLE _webhook_debug ADD CONSTRAINT "_webhook_debug_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE api_keys ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT "app_settings_chave_key" UNIQUE (chave);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE audit_logs ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contact_clients ADD CONSTRAINT "chat_contact_clients_contact_id_client_id_key" UNIQUE (contact_id, client_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contact_clients ADD CONSTRAINT "chat_contact_clients_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contacts ADD CONSTRAINT "chat_contacts_instance_id_numero_whatsapp_key" UNIQUE (instance_id, numero_whatsapp);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contacts ADD CONSTRAINT "chat_contacts_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversation_user_prefs ADD CONSTRAINT "chat_conversation_user_prefs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversation_user_prefs ADD CONSTRAINT "chat_conversation_user_prefs_user_id_conversation_id_key" UNIQUE (user_id, conversation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_protocolo_key" UNIQUE (protocolo);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_csat ADD CONSTRAINT "chat_csat_conversation_id_key" UNIQUE (conversation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_csat ADD CONSTRAINT "chat_csat_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_department_agents ADD CONSTRAINT "chat_department_agents_department_id_user_id_key" UNIQUE (department_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_department_agents ADD CONSTRAINT "chat_department_agents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_departments ADD CONSTRAINT "chat_departments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_group_members ADD CONSTRAINT "chat_group_members_contact_id_numero_whatsapp_key" UNIQUE (contact_id, numero_whatsapp);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_group_members ADD CONSTRAINT "chat_group_members_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_message_reads ADD CONSTRAINT "chat_message_reads_conversation_id_user_id_key" UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_message_reads ADD CONSTRAINT "chat_message_reads_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_message_id_wpp_key" UNIQUE (message_id_wpp);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_quick_replies ADD CONSTRAINT "chat_quick_replies_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_templates ADD CONSTRAINT "chat_templates_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_alerts ADD CONSTRAINT "client_alerts_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_assignments ADD CONSTRAINT "client_assignments_client_id_user_id_tipo_key" UNIQUE (client_id, user_id, tipo);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_assignments ADD CONSTRAINT "client_assignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_contracts ADD CONSTRAINT "client_contracts_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_interactions ADD CONSTRAINT "client_interactions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_notes ADD CONSTRAINT "client_notes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT "clients_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_devedores ADD CONSTRAINT "cobranca_devedores_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_instances ADD CONSTRAINT "cobranca_instances_instance_id_key" UNIQUE (instance_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_instances ADD CONSTRAINT "cobranca_instances_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_regua_passos ADD CONSTRAINT "cobranca_regua_passos_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_reguas ADD CONSTRAINT "cobranca_reguas_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_sends ADD CONSTRAINT "cobranca_sends_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE comissoes ADD CONSTRAINT "comissoes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE company_areas ADD CONSTRAINT "company_areas_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE company_areas ADD CONSTRAINT "company_areas_tenant_id_type_key" UNIQUE (tenant_id, type);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_anexos ADD CONSTRAINT "contrato_anexos_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_pdf_extractions ADD CONSTRAINT "contrato_pdf_extractions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_notion_page_id_key" UNIQUE (notion_page_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos_audit_log ADD CONSTRAINT "contratos_audit_log_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliverables ADD CONSTRAINT "deliverables_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliveries ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_approvals ADD CONSTRAINT "delivery_approvals_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_comments ADD CONSTRAINT "delivery_comments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_content_items ADD CONSTRAINT "delivery_content_items_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_versions ADD CONSTRAINT "delivery_versions_delivery_id_versao_key" UNIQUE (delivery_id, versao);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_versions ADD CONSTRAINT "delivery_versions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE department_instance_assignments ADD CONSTRAINT "department_instance_assignments_department_id_instance_id_key" UNIQUE (department_id, instance_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE department_instance_assignments ADD CONSTRAINT "department_instance_assignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE dept_team_messages ADD CONSTRAINT "dept_team_messages_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE email_queue ADD CONSTRAINT "email_queue_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_employee_id_position_id_key" UNIQUE (employee_id, position_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_aliases ADD CONSTRAINT "estrategista_aliases_alias_normalizado_key" UNIQUE (alias_normalizado);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_aliases ADD CONSTRAINT "estrategista_aliases_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_comissao_override ADD CONSTRAINT "estrategista_comissao_override_pkey" PRIMARY KEY (user_id, produto_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE extratos_mensais ADD CONSTRAINT "extratos_mensais_estrategista_id_mes_referencia_key" UNIQUE (estrategista_id, mes_referencia);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE extratos_mensais ADD CONSTRAINT "extratos_mensais_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_activation_rules ADD CONSTRAINT "ia_bot_activation_rules_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_conversation_overrides ADD CONSTRAINT "ia_bot_conversation_overrides_bot_id_conversation_id_key" UNIQUE (bot_id, conversation_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_conversation_overrides ADD CONSTRAINT "ia_bot_conversation_overrides_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_documents ADD CONSTRAINT "ia_bot_documents_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_execution_logs ADD CONSTRAINT "ia_bot_execution_logs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bots ADD CONSTRAINT "ia_bots_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversation_members ADD CONSTRAINT "internal_conversation_members_conversation_id_user_id_key" UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversation_members ADD CONSTRAINT "internal_conversation_members_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversations ADD CONSTRAINT "internal_conversations_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_message_reads ADD CONSTRAINT "internal_message_reads_conversation_id_user_id_key" UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_message_reads ADD CONSTRAINT "internal_message_reads_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_messages ADD CONSTRAINT "internal_messages_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_comments ADD CONSTRAINT "internal_post_comments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_poll_votes ADD CONSTRAINT "internal_post_poll_votes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_poll_votes ADD CONSTRAINT "internal_post_poll_votes_post_id_user_id_key" UNIQUE (post_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_reactions ADD CONSTRAINT "internal_post_reactions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_reactions ADD CONSTRAINT "internal_post_reactions_post_id_user_id_key" UNIQUE (post_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_posts ADD CONSTRAINT "internal_posts_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_typing_indicators ADD CONSTRAINT "internal_typing_indicators_conversation_id_user_id_key" UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_typing_indicators ADD CONSTRAINT "internal_typing_indicators_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_user_id_path_id_key" UNIQUE (user_id, path_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_lessons ADD CONSTRAINT "learning_lessons_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_modules ADD CONSTRAINT "learning_modules_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_paths ADD CONSTRAINT "learning_paths_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_progress ADD CONSTRAINT "learning_progress_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_progress ADD CONSTRAINT "learning_progress_user_id_lesson_id_key" UNIQUE (user_id, lesson_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meeting_feedback ADD CONSTRAINT "meeting_feedback_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_livekit_room_name_key" UNIQUE (livekit_room_name);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_responses ADD CONSTRAINT "nps_responses_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_surveys ADD CONSTRAINT "nps_surveys_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE personal_notes ADD CONSTRAINT "personal_notes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE products ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE produtos_comissao ADD CONSTRAINT "produtos_comissao_pkey" PRIMARY KEY (produto_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE (user_id, endpoint);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE salario_fixo_itens ADD CONSTRAINT "salario_fixo_itens_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_checklist ADD CONSTRAINT "sales_opportunity_checklist_opportunity_id_item_id_key" UNIQUE (opportunity_id, item_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_checklist ADD CONSTRAINT "sales_opportunity_checklist_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_events ADD CONSTRAINT "sales_opportunity_events_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_pipelines ADD CONSTRAINT "sales_pipelines_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_stage_checklist_items ADD CONSTRAINT "sales_stage_checklist_items_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_stages ADD CONSTRAINT "sales_stages_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE social_snapshots ADD CONSTRAINT "social_snapshots_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE subareas ADD CONSTRAINT "subareas_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT "tenants_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT "tenants_slug_key" UNIQUE (slug);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_instance_assignments ADD CONSTRAINT "user_instance_assignments_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_instance_assignments ADD CONSTRAINT "user_instance_assignments_user_id_instance_id_key" UNIQUE (user_id, instance_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_roles ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_key" UNIQUE (user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_email_key" UNIQUE (email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE vendas_pendentes ADD CONSTRAINT "vendas_pendentes_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE wa_warmup_groups ADD CONSTRAINT "wa_warmup_groups_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE wa_warmup_logs ADD CONSTRAINT "wa_warmup_logs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE webhook_logs ADD CONSTRAINT "webhook_logs_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE webhooks ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE whatsapp_instances ADD CONSTRAINT "whatsapp_instances_instance_id_key" UNIQUE (instance_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE whatsapp_instances ADD CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE api_keys ADD CONSTRAINT "api_keys_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE audit_logs ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contact_clients ADD CONSTRAINT "chat_contact_clients_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contact_clients ADD CONSTRAINT "chat_contact_clients_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES chat_contacts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contacts ADD CONSTRAINT "chat_contacts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_contacts ADD CONSTRAINT "chat_contacts_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversation_user_prefs ADD CONSTRAINT "chat_conversation_user_prefs_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversation_user_prefs ADD CONSTRAINT "chat_conversation_user_prefs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_agente_id_fkey" FOREIGN KEY (agente_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES chat_contacts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_csat ADD CONSTRAINT "chat_csat_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_department_agents ADD CONSTRAINT "chat_department_agents_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_department_agents ADD CONSTRAINT "chat_department_agents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_departments ADD CONSTRAINT "chat_departments_gerente_id_fkey" FOREIGN KEY (gerente_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_departments ADD CONSTRAINT "chat_departments_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_group_members ADD CONSTRAINT "chat_group_members_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES chat_contacts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_message_reads ADD CONSTRAINT "chat_message_reads_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_message_reads ADD CONSTRAINT "chat_message_reads_last_read_message_id_fkey" FOREIGN KEY (last_read_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_message_reads ADD CONSTRAINT "chat_message_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_agente_id_fkey" FOREIGN KEY (agente_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_quick_replies ADD CONSTRAINT "chat_quick_replies_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_templates ADD CONSTRAINT "chat_templates_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES chat_contacts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_estrategista_id_fkey" FOREIGN KEY (estrategista_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_alerts ADD CONSTRAINT "client_alerts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_alerts ADD CONSTRAINT "client_alerts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_assignments ADD CONSTRAINT "client_assignments_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_assignments ADD CONSTRAINT "client_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_contracts ADD CONSTRAINT "client_contracts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_interactions ADD CONSTRAINT "client_interactions_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_interactions ADD CONSTRAINT "client_interactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_notes ADD CONSTRAINT "client_notes_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_notes ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_devedores ADD CONSTRAINT "cobranca_devedores_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES cobranca_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_devedores ADD CONSTRAINT "cobranca_devedores_regua_id_fkey" FOREIGN KEY (regua_id) REFERENCES cobranca_reguas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_regua_passos ADD CONSTRAINT "cobranca_regua_passos_regua_id_fkey" FOREIGN KEY (regua_id) REFERENCES cobranca_reguas(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_sends ADD CONSTRAINT "cobranca_sends_devedor_id_fkey" FOREIGN KEY (devedor_id) REFERENCES cobranca_devedores(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_sends ADD CONSTRAINT "cobranca_sends_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES cobranca_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE comissoes ADD CONSTRAINT "comissoes_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE comissoes ADD CONSTRAINT "comissoes_editado_por_fkey" FOREIGN KEY (editado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE comissoes ADD CONSTRAINT "comissoes_estrategista_id_fkey" FOREIGN KEY (estrategista_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE comissoes ADD CONSTRAINT "comissoes_extrato_id_fkey" FOREIGN KEY (extrato_id) REFERENCES extratos_mensais(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE company_areas ADD CONSTRAINT "company_areas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_anexos ADD CONSTRAINT "contrato_anexos_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_anexos ADD CONSTRAINT "contrato_anexos_enviado_por_fkey" FOREIGN KEY (enviado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_pdf_extractions ADD CONSTRAINT "contrato_pdf_extractions_anexo_id_fkey" FOREIGN KEY (anexo_id) REFERENCES contrato_anexos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_pdf_extractions ADD CONSTRAINT "contrato_pdf_extractions_aplicado_por_fkey" FOREIGN KEY (aplicado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_pdf_extractions ADD CONSTRAINT "contrato_pdf_extractions_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_pdf_extractions ADD CONSTRAINT "contrato_pdf_extractions_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_estrategista_id_fkey" FOREIGN KEY (estrategista_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos_audit_log ADD CONSTRAINT "contratos_audit_log_alterado_por_fkey" FOREIGN KEY (alterado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos_audit_log ADD CONSTRAINT "contratos_audit_log_contrato_id_fkey" FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliverables ADD CONSTRAINT "deliverables_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliveries ADD CONSTRAINT "deliveries_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliveries ADD CONSTRAINT "deliveries_deliverable_id_fkey" FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliveries ADD CONSTRAINT "deliveries_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_approvals ADD CONSTRAINT "delivery_approvals_aprovado_por_fkey" FOREIGN KEY (aprovado_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_approvals ADD CONSTRAINT "delivery_approvals_delivery_id_fkey" FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_approvals ADD CONSTRAINT "delivery_approvals_version_id_fkey" FOREIGN KEY (version_id) REFERENCES delivery_versions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_comments ADD CONSTRAINT "delivery_comments_autor_id_fkey" FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_comments ADD CONSTRAINT "delivery_comments_delivery_id_fkey" FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_comments ADD CONSTRAINT "delivery_comments_version_id_fkey" FOREIGN KEY (version_id) REFERENCES delivery_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_content_items ADD CONSTRAINT "delivery_content_items_version_id_fkey" FOREIGN KEY (version_id) REFERENCES delivery_versions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_versions ADD CONSTRAINT "delivery_versions_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_versions ADD CONSTRAINT "delivery_versions_delivery_id_fkey" FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE department_instance_assignments ADD CONSTRAINT "department_instance_assignments_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE department_instance_assignments ADD CONSTRAINT "department_instance_assignments_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE dept_team_messages ADD CONSTRAINT "dept_team_messages_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE dept_team_messages ADD CONSTRAINT "dept_team_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employee_positions ADD CONSTRAINT "employee_positions_position_id_fkey" FOREIGN KEY (position_id) REFERENCES positions(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES employees(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY (position_id) REFERENCES positions(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_aliases ADD CONSTRAINT "estrategista_aliases_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_aliases ADD CONSTRAINT "estrategista_aliases_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_comissao_override ADD CONSTRAINT "estrategista_comissao_override_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE estrategista_comissao_override ADD CONSTRAINT "estrategista_comissao_override_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE extratos_mensais ADD CONSTRAINT "extratos_mensais_aprovado_por_fkey" FOREIGN KEY (aprovado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE extratos_mensais ADD CONSTRAINT "extratos_mensais_estrategista_id_fkey" FOREIGN KEY (estrategista_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_activation_rules ADD CONSTRAINT "ia_bot_activation_rules_bot_id_fkey" FOREIGN KEY (bot_id) REFERENCES ia_bots(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_conversation_overrides ADD CONSTRAINT "ia_bot_conversation_overrides_bot_id_fkey" FOREIGN KEY (bot_id) REFERENCES ia_bots(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_conversation_overrides ADD CONSTRAINT "ia_bot_conversation_overrides_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_conversation_overrides ADD CONSTRAINT "ia_bot_conversation_overrides_pausado_por_fkey" FOREIGN KEY (pausado_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_documents ADD CONSTRAINT "ia_bot_documents_bot_id_fkey" FOREIGN KEY (bot_id) REFERENCES ia_bots(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_execution_logs ADD CONSTRAINT "ia_bot_execution_logs_bot_id_fkey" FOREIGN KEY (bot_id) REFERENCES ia_bots(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_execution_logs ADD CONSTRAINT "ia_bot_execution_logs_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_execution_logs ADD CONSTRAINT "ia_bot_execution_logs_message_id_fkey" FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bots ADD CONSTRAINT "ia_bots_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bots ADD CONSTRAINT "ia_bots_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversation_members ADD CONSTRAINT "internal_conversation_members_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES internal_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversation_members ADD CONSTRAINT "internal_conversation_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversations ADD CONSTRAINT "internal_conversations_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversations ADD CONSTRAINT "internal_conversations_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_message_reads ADD CONSTRAINT "internal_message_reads_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES internal_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_message_reads ADD CONSTRAINT "internal_message_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_messages ADD CONSTRAINT "internal_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES internal_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_messages ADD CONSTRAINT "internal_messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_comments ADD CONSTRAINT "internal_post_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES internal_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_comments ADD CONSTRAINT "internal_post_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_poll_votes ADD CONSTRAINT "internal_post_poll_votes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES internal_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_poll_votes ADD CONSTRAINT "internal_post_poll_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_reactions ADD CONSTRAINT "internal_post_reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES internal_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_post_reactions ADD CONSTRAINT "internal_post_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_posts ADD CONSTRAINT "internal_posts_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_posts ADD CONSTRAINT "internal_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_typing_indicators ADD CONSTRAINT "internal_typing_indicators_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES internal_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_typing_indicators ADD CONSTRAINT "internal_typing_indicators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_path_id_fkey" FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_lessons ADD CONSTRAINT "learning_lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_modules ADD CONSTRAINT "learning_modules_path_id_fkey" FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_progress ADD CONSTRAINT "learning_progress_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_progress ADD CONSTRAINT "learning_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meeting_feedback ADD CONSTRAINT "meeting_feedback_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES chat_contacts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_responses ADD CONSTRAINT "nps_responses_respondido_por_fkey" FOREIGN KEY (respondido_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_responses ADD CONSTRAINT "nps_responses_survey_id_fkey" FOREIGN KEY (survey_id) REFERENCES nps_surveys(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_surveys ADD CONSTRAINT "nps_surveys_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_surveys ADD CONSTRAINT "nps_surveys_delivery_id_fkey" FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE personal_notes ADD CONSTRAINT "personal_notes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_reports_to_id_fkey" FOREIGN KEY (reports_to_id) REFERENCES positions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_subarea_id_fkey" FOREIGN KEY (subarea_id) REFERENCES subareas(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE products ADD CONSTRAINT "products_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE produtos_comissao ADD CONSTRAINT "produtos_comissao_atualizado_por_fkey" FOREIGN KEY (atualizado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE produtos_comissao ADD CONSTRAINT "produtos_comissao_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT "profiles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE salario_fixo_itens ADD CONSTRAINT "salario_fixo_itens_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE salario_fixo_itens ADD CONSTRAINT "salario_fixo_itens_extrato_id_fkey" FOREIGN KEY (extrato_id) REFERENCES extratos_mensais(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES sales_pipelines(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES sales_stages(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_checklist ADD CONSTRAINT "sales_opportunity_checklist_item_id_fkey" FOREIGN KEY (item_id) REFERENCES sales_stage_checklist_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_checklist ADD CONSTRAINT "sales_opportunity_checklist_marcada_por_fkey" FOREIGN KEY (marcada_por) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_checklist ADD CONSTRAINT "sales_opportunity_checklist_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES sales_opportunities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_events ADD CONSTRAINT "sales_opportunity_events_autor_id_fkey" FOREIGN KEY (autor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_events ADD CONSTRAINT "sales_opportunity_events_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_events ADD CONSTRAINT "sales_opportunity_events_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES sales_opportunities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_pipelines ADD CONSTRAINT "sales_pipelines_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_stage_checklist_items ADD CONSTRAINT "sales_stage_checklist_items_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES sales_stages(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_stages ADD CONSTRAINT "sales_stages_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES sales_pipelines(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE social_snapshots ADD CONSTRAINT "social_snapshots_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE subareas ADD CONSTRAINT "subareas_area_id_fkey" FOREIGN KEY (area_id) REFERENCES company_areas(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE subareas ADD CONSTRAINT "subareas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_instance_assignments ADD CONSTRAINT "user_instance_assignments_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_instance_assignments ADD CONSTRAINT "user_instance_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE user_roles ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY (department_id) REFERENCES chat_departments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_inativacao_por_fkey" FOREIGN KEY (inativacao_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE vendas_pendentes ADD CONSTRAINT "vendas_pendentes_atendido_por_fkey" FOREIGN KEY (atendido_por) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE vendas_pendentes ADD CONSTRAINT "vendas_pendentes_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE wa_warmup_logs ADD CONSTRAINT "wa_warmup_logs_group_id_fkey" FOREIGN KEY (group_id) REFERENCES wa_warmup_groups(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE webhook_logs ADD CONSTRAINT "webhook_logs_webhook_id_fkey" FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE webhooks ADD CONSTRAINT "webhooks_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES users(id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_conversations ADD CONSTRAINT "chat_conversations_status_check" CHECK ((status = ANY (ARRAY['aberta'::text, 'em_atendimento'::text, 'aguardando'::text, 'encerrada'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_csat ADD CONSTRAINT "chat_csat_nota_check" CHECK (((nota >= 1) AND (nota <= 5)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_departments ADD CONSTRAINT "chat_departments_distribuicao_check" CHECK ((distribuicao = ANY (ARRAY['manual'::text, 'round_robin'::text, 'menor_carga'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_status_envio_check" CHECK ((status_envio = ANY (ARRAY['enviando'::text, 'enviada'::text, 'entregue'::text, 'lida'::text, 'falha'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_tipo_check" CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'video'::text, 'audio'::text, 'documento'::text, 'sticker'::text, 'localizacao'::text, 'contato'::text, 'sistema'::text, 'nota_interna'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_templates ADD CONSTRAINT "chat_templates_categoria_check" CHECK ((categoria = ANY (ARRAY['saudacao'::text, 'encerramento'::text, 'csat'::text, 'informativo'::text, 'cobranca'::text, 'outro'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_clareza_posicionamento_check" CHECK ((clareza_posicionamento = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_ia_score_check" CHECK (((ia_score >= 0) AND (ia_score <= 100)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_nivel_confianca_cliente_check" CHECK ((nivel_confianca_cliente = ANY (ARRAY['baixo'::text, 'medio'::text, 'alto'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_nivel_execucao_check" CHECK ((nivel_execucao = ANY (ARRAY['baixo'::text, 'medio'::text, 'alto'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_qualidade_consultoria_estrategista_check" CHECK (((qualidade_consultoria_estrategista >= 1) AND (qualidade_consultoria_estrategista <= 5)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_risco_abandono_check" CHECK ((risco_abandono = ANY (ARRAY['baixo'::text, 'medio'::text, 'alto'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE chat_weekly_reports ADD CONSTRAINT "chat_weekly_reports_sentimento_geral_check" CHECK ((sentimento_geral = ANY (ARRAY['positivo'::text, 'neutro'::text, 'negativo'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_assignments ADD CONSTRAINT "client_assignments_tipo_check" CHECK ((tipo = ANY (ARRAY['estrategista'::text, 'atendimento'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE client_interactions ADD CONSTRAINT "client_interactions_tipo_check" CHECK ((tipo = ANY (ARRAY['ligacao'::text, 'reuniao'::text, 'email'::text, 'whatsapp'::text, 'visita'::text, 'outro'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT "clients_nota_check" CHECK (((nota IS NULL) OR ((nota >= 1) AND (nota <= 10))));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_devedores ADD CONSTRAINT "cobranca_devedores_status_check" CHECK ((status = ANY (ARRAY['ativa'::text, 'pausada'::text, 'encerrada'::text, 'pago'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_instances ADD CONSTRAINT "cobranca_instances_status_check" CHECK ((status = ANY (ARRAY['conectado'::text, 'desconectado'::text, 'aguardando_qr'::text, 'banido'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE cobranca_sends ADD CONSTRAINT "cobranca_sends_status_envio_check" CHECK ((status_envio = ANY (ARRAY['enviando'::text, 'enviado'::text, 'falha'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE comissoes ADD CONSTRAINT "comissoes_status_check" CHECK ((status = ANY (ARRAY['prevista'::text, 'aprovada'::text, 'paga'::text, 'cancelada'::text, 'postergada'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE company_areas ADD CONSTRAINT "company_areas_position_check" CHECK (("position" = ANY (ARRAY['left'::text, 'right'::text, 'bottom'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE company_areas ADD CONSTRAINT "company_areas_type_check" CHECK ((type = ANY (ARRAY['acquisition'::text, 'delivery'::text, 'operation'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contrato_anexos ADD CONSTRAINT "contrato_anexos_categoria_check" CHECK ((categoria = ANY (ARRAY['contrato'::text, 'comprovante_entrada'::text, 'nota_fiscal'::text, 'outro'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_num_parcelas_check" CHECK ((num_parcelas >= 1));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'ativo'::text, 'cancelado'::text, 'concluido'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos ADD CONSTRAINT "contratos_valor_total_check" CHECK ((valor_total >= (0)::numeric));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE contratos_audit_log ADD CONSTRAINT "contratos_audit_log_operacao_check" CHECK ((operacao = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliverables ADD CONSTRAINT "deliverables_tipo_check" CHECK ((tipo = ANY (ARRAY['post_feed'::text, 'stories'::text, 'reels'::text, 'video'::text, 'copy'::text, 'arte'::text, 'relatorio'::text, 'outro'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE deliveries ADD CONSTRAINT "deliveries_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'aguardando_aprovacao'::text, 'em_revisao'::text, 'aprovado'::text, 'reprovado'::text, 'publicado'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE delivery_content_items ADD CONSTRAINT "delivery_content_items_tipo_check" CHECK ((tipo = ANY (ARRAY['imagem'::text, 'video'::text, 'documento'::text, 'link'::text, 'texto'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE email_queue ADD CONSTRAINT "email_queue_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviado'::text, 'erro'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE extratos_mensais ADD CONSTRAINT "extratos_mensais_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'aprovado'::text, 'pago'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_activation_rules ADD CONSTRAINT "ia_bot_activation_rules_tipo_check" CHECK ((tipo = ANY (ARRAY['fora_horario'::text, 'palavra_chave'::text, 'sempre'::text, 'novo_contato'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE ia_bot_documents ADD CONSTRAINT "ia_bot_documents_tipo_check" CHECK ((tipo = ANY (ARRAY['texto'::text, 'pdf'::text, 'url'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversation_members ADD CONSTRAINT "internal_conversation_members_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_conversations ADD CONSTRAINT "internal_conversations_tipo_check" CHECK ((tipo = ANY (ARRAY['direct'::text, 'group'::text, 'department'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE internal_messages ADD CONSTRAINT "internal_messages_tipo_check" CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'documento'::text, 'sistema'::text, 'conversa'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_lessons ADD CONSTRAINT "learning_lessons_tipo_check" CHECK ((tipo = ANY (ARRAY['video'::text, 'texto'::text, 'pdf'::text, 'link'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE learning_paths ADD CONSTRAINT "learning_paths_tipo_check" CHECK ((tipo = ANY (ARRAY['interno'::text, 'cliente'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meeting_feedback ADD CONSTRAINT "meeting_feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_recording_status_check" CHECK ((recording_status = ANY (ARRAY['pending'::text, 'recording'::text, 'completed'::text, 'failed'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE meetings ADD CONSTRAINT "meetings_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE nps_responses ADD CONSTRAINT "nps_responses_nota_check" CHECK (((nota >= 0) AND (nota <= 10)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE personal_notes ADD CONSTRAINT "personal_notes_tipo_check" CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'documento'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_area_or_subarea" CHECK (((area_id IS NOT NULL) OR (subarea_id IS NOT NULL)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE positions ADD CONSTRAINT "positions_no_self_reference" CHECK (((reports_to_id IS NULL) OR (reports_to_id <> id)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE produtos_comissao ADD CONSTRAINT "produtos_comissao_parcelas_padrao_check" CHECK ((parcelas_padrao >= 1));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE produtos_comissao ADD CONSTRAINT "produtos_comissao_tipo_comissao_check" CHECK ((tipo_comissao = ANY (ARRAY['valor_fixo'::text, 'percentual'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunities ADD CONSTRAINT "sales_opportunities_status_check" CHECK ((status = ANY (ARRAY['aberta'::text, 'ganha'::text, 'perdida'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_opportunity_events ADD CONSTRAINT "sales_opportunity_events_tipo_check" CHECK ((tipo = ANY (ARRAY['criada'::text, 'moveu_etapa'::text, 'checkbox_marcada'::text, 'checkbox_desmarcada'::text, 'nota'::text, 'ganha'::text, 'perdida'::text, 'reaberta'::text, 'editada'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE sales_stages ADD CONSTRAINT "sales_stages_status_final_check" CHECK (((status_final = ANY (ARRAY['ganho'::text, 'perdido'::text])) OR (status_final IS NULL)));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE social_snapshots ADD CONSTRAINT "social_snapshots_platform_check" CHECK ((platform = 'instagram'::text));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_perfil_check" CHECK ((perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text, 'atendimento'::text, 'estrategista'::text, 'cliente'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE users ADD CONSTRAINT "users_tipo_consultor_check" CHECK ((tipo_consultor = ANY (ARRAY['comissao'::text, 'salario_fixo'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE vendas_pendentes ADD CONSTRAINT "vendas_pendentes_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'em_atendimento'::text, 'concluida'::text, 'descartada'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
DO $c$ BEGIN
  ALTER TABLE whatsapp_instances ADD CONSTRAINT "whatsapp_instances_status_check" CHECK ((status = ANY (ARRAY['conectado'::text, 'desconectado'::text, 'aguardando_qr'::text, 'banido'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $c$;
CREATE INDEX IF NOT EXISTS idx_audit_logs_acao ON public.audit_logs USING btree (acao);
CREATE INDEX IF NOT EXISTS idx_audit_logs_criado_em ON public.audit_logs USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entidade ON public.audit_logs USING btree (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_contact_clients_client ON public.chat_contact_clients USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_chat_contact_clients_contact ON public.chat_contact_clients USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_chat_contacts_client_id ON public.chat_contacts USING btree (client_id);
CREATE INDEX IF NOT EXISTS chat_conversations_agente_idx ON public.chat_conversations USING btree (agente_id);
CREATE INDEX IF NOT EXISTS chat_conversations_status_idx ON public.chat_conversations USING btree (status);
CREATE INDEX IF NOT EXISTS cda_user_gerente_idx ON public.chat_department_agents USING btree (user_id, is_gerente);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_contact_id ON public.chat_group_members USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_cmr_user_conv ON public.chat_message_reads USING btree (user_id, conversation_id);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON public.chat_messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS chat_messages_criado_em_idx ON public.chat_messages USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reactions ON public.chat_messages USING gin (reactions) WHERE (reactions <> '[]'::jsonb);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to ON public.chat_messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS chat_weekly_reports_unique_idx ON public.chat_weekly_reports USING btree (semana_inicio, estrategista_id, COALESCE((client_id)::text, (contact_id)::text));
CREATE INDEX IF NOT EXISTS idx_weekly_reports_client ON public.chat_weekly_reports USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_estrategista ON public.chat_weekly_reports USING btree (estrategista_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_semana ON public.chat_weekly_reports USING btree (semana_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_client_alerts_client ON public.client_alerts USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_client_alerts_pending ON public.client_alerts USING btree (user_id) WHERE (resolvido = false);
CREATE INDEX IF NOT EXISTS idx_client_alerts_user ON public.client_alerts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_client_interactions_client ON public.client_interactions USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_client_interactions_data ON public.client_interactions USING btree (data_interacao DESC);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON public.client_notes USING btree (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cobranca_devedores_proximo_envio_idx ON public.cobranca_devedores USING btree (proximo_envio_em) WHERE (status = 'ativa'::text);
CREATE INDEX IF NOT EXISTS cobranca_devedores_status_idx ON public.cobranca_devedores USING btree (status);
CREATE INDEX IF NOT EXISTS idx_comissoes_estrat_mes ON public.comissoes USING btree (estrategista_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_comissoes_extrato ON public.comissoes USING btree (extrato_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON public.comissoes USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_comissoes_contrato_mes_parcela ON public.comissoes USING btree (contrato_id, mes_referencia, parcela_num);
CREATE INDEX IF NOT EXISTS idx_company_areas_tenant ON public.company_areas USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_anexos_contrato ON public.contrato_anexos USING btree (contrato_id);
CREATE INDEX IF NOT EXISTS idx_pdf_ext_contrato ON public.contrato_pdf_extractions USING btree (contrato_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_contratos_data ON public.contratos USING btree (data_fechamento);
CREATE INDEX IF NOT EXISTS idx_contratos_email ON public.contratos USING btree (email);
CREATE INDEX IF NOT EXISTS idx_contratos_estrategista ON public.contratos USING btree (estrategista_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status_sec ON public.contratos USING btree (status_secundario);
CREATE INDEX IF NOT EXISTS idx_audit_contrato ON public.contratos_audit_log USING btree (contrato_id, alterado_em DESC);
CREATE INDEX IF NOT EXISTS idx_email_queue_criado_em ON public.email_queue USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue USING btree (status) WHERE (status = 'pendente'::text);
CREATE INDEX IF NOT EXISTS idx_employee_positions_employee ON public.employee_positions USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_positions_position ON public.employee_positions USING btree (position_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON public.employees USING btree (manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_position ON public.employees USING btree (position_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees USING btree (status);
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON public.employees USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON public.employees USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_estrategista_aliases_user ON public.estrategista_aliases USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_internal_members_user ON public.internal_conversation_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_internal_conv_department ON public.internal_conversations USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_internal_conv_tipo ON public.internal_conversations USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_internal_messages_conv_criado ON public.internal_messages USING btree (conversation_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_internal_post_comments_post ON public.internal_post_comments USING btree (post_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_internal_post_reactions_post ON public.internal_post_reactions USING btree (post_id);
CREATE INDEX IF NOT EXISTS idx_internal_posts_dept ON public.internal_posts USING btree (department_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_feedback_meeting ON public.meeting_feedback USING btree (meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_feedback_room ON public.meeting_feedback USING btree (livekit_room_name);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON public.meetings USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_meetings_conversation ON public.meetings USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON public.meetings USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_room ON public.meetings USING btree (livekit_room_name);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON public.meetings USING btree (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings USING btree (status);
CREATE INDEX IF NOT EXISTS notifications_criado_em_idx ON public.notifications USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS notifications_user_id_lida_idx ON public.notifications USING btree (user_id, lida);
CREATE INDEX IF NOT EXISTS personal_notes_user_created_idx ON public.personal_notes USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS personal_notes_user_id_idx ON public.personal_notes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_positions_area ON public.positions USING btree (area_id);
CREATE INDEX IF NOT EXISTS idx_positions_reports_to ON public.positions USING btree (reports_to_id);
CREATE INDEX IF NOT EXISTS idx_positions_subarea ON public.positions USING btree (subarea_id);
CREATE INDEX IF NOT EXISTS idx_positions_tenant ON public.positions USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_catalogo_nome ON public.products USING btree (lower(nome)) WHERE (client_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_salfix_extrato ON public.salario_fixo_itens USING btree (extrato_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_client ON public.sales_opportunities USING btree (client_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sales_opps_pipeline ON public.sales_opportunities USING btree (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_sales_opp_checklist_opp ON public.sales_opportunity_checklist USING btree (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_sales_events_client ON public.sales_opportunity_events USING btree (client_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sales_events_opp ON public.sales_opportunity_events USING btree (opportunity_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sales_stage_checklist_stage ON public.sales_stage_checklist_items USING btree (stage_id, ordem);
CREATE INDEX IF NOT EXISTS idx_sales_stages_pipeline ON public.sales_stages USING btree (pipeline_id, ordem);
CREATE INDEX IF NOT EXISTS social_snapshots_client_platform_fetched_idx ON public.social_snapshots USING btree (client_id, platform, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_subareas_area ON public.subareas USING btree (area_id);
CREATE INDEX IF NOT EXISTS idx_subareas_tenant ON public.subareas USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_key ON public.tenants USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_user_instance_assignments_instance ON public.user_instance_assignments USING btree (instance_id);
CREATE INDEX IF NOT EXISTS idx_user_instance_assignments_user ON public.user_instance_assignments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_users_acesso_contratos ON public.users USING btree (acesso_contratos) WHERE (acesso_contratos = true);
CREATE INDEX IF NOT EXISTS idx_vendas_pendentes_criado ON public.vendas_pendentes USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_vendas_pendentes_status ON public.vendas_pendentes USING btree (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_warmup_logs_group_time ON public.wa_warmup_logs USING btree (group_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_criado_em ON public.webhook_logs USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON public.webhook_logs USING btree (webhook_id);
CREATE OR REPLACE FUNCTION public.aprovar_extrato_mes(p_estrategista_id uuid, p_mes date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_perfil TEXT;
  v_extrato_id UUID;
  v_total NUMERIC(12,2);
  u RECORD;
BEGIN
  SELECT perfil INTO v_perfil FROM public.users WHERE id = v_uid;
  IF v_perfil NOT IN ('admin','gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem aprovar extratos';
  END IF;

  SELECT * INTO u FROM public.users WHERE id = p_estrategista_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estrategista não encontrado'; END IF;

  -- soma das comissões previstas e ainda não vinculadas
  SELECT COALESCE(SUM(valor_final), 0) INTO v_total
    FROM public.comissoes
   WHERE estrategista_id = p_estrategista_id
     AND mes_referencia = date_trunc('month', p_mes)::date
     AND status = 'prevista';

  -- upsert do extrato
  INSERT INTO public.extratos_mensais (
    estrategista_id, estrategista_nome, estrategista_doc,
    mes_referencia, total_bruto, total_liquido,
    status, aprovado_por, aprovado_em
  ) VALUES (
    p_estrategista_id, u.nome, u.cnpj_cpf,
    date_trunc('month', p_mes)::date, v_total, v_total,
    'aprovado', v_uid, now()
  )
  ON CONFLICT (estrategista_id, mes_referencia) DO UPDATE
    SET total_bruto = EXCLUDED.total_bruto,
        total_liquido = EXCLUDED.total_liquido,
        status = 'aprovado',
        aprovado_por = v_uid,
        aprovado_em = now()
  RETURNING id INTO v_extrato_id;

  -- vincula as linhas previstas e marca como aprovadas
  UPDATE public.comissoes
     SET status = 'aprovada',
         extrato_id = v_extrato_id
   WHERE estrategista_id = p_estrategista_id
     AND mes_referencia = date_trunc('month', p_mes)::date
     AND status = 'prevista';

  RETURN v_extrato_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.audit_contratos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID;
  v_campos TEXT[] := ARRAY[
    'cliente_nome','produto_nome','estrategista_id','data_fechamento','vencimento',
    'valor_total','valor_parcela','num_parcelas','percentual_aplicado',
    'status','status_secundario','observacoes','whatsapp','email','cpf_cnpj',
    'empresa','endereco','instagram','nicho','vendedor','treinador',
    'entrada','pg_entrada','forma_pagamento','link_clicksign','bonus',
    'venda_interna','venda_diretoria'
  ];
  v_campo TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  v_user := COALESCE(auth.uid(), NULL);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por)
    VALUES (NEW.id, 'INSERT', v_user);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por)
    VALUES (OLD.id, 'DELETE', v_user);
    RETURN OLD;
  END IF;

  -- UPDATE: registra apenas os campos que mudaram
  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_campo, v_campo)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.contratos_audit_log (contrato_id, operacao, campo, valor_antigo, valor_novo, alterado_por)
      VALUES (NEW.id, 'UPDATE', v_campo, v_old, v_new, v_user);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_add_admins_to_dept_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo = 'department' THEN
    INSERT INTO internal_conversation_members (conversation_id, user_id, role)
    SELECT NEW.id, u.id, 'admin'
    FROM users u
    WHERE u.perfil = 'admin' AND u.ativo = true
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_match_contacts_to_clients()
 RETURNS TABLE(contact_id uuid, contact_nome text, client_id uuid, client_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH normalized_clients AS (
    SELECT c.id, c.nome, REGEXP_REPLACE(c.telefone, '[^0-9]', '', 'g') as phone_digits
    FROM clients c
    WHERE c.telefone IS NOT NULL AND c.telefone != ''
  ),
  matches AS (
    SELECT DISTINCT ON (cc.id)
      cc.id as contact_id, cc.nome as contact_nome,
      nc.id as matched_client_id, nc.nome as client_nome
    FROM chat_contacts cc
    JOIN normalized_clients nc ON (
      RIGHT(REGEXP_REPLACE(cc.numero_whatsapp, '[^0-9]', '', 'g'), 11) = RIGHT(nc.phone_digits, 11)
    )
    WHERE cc.client_id IS NULL
    ORDER BY cc.id, nc.nome
  )
  UPDATE chat_contacts SET client_id = m.matched_client_id
  FROM matches m
  WHERE chat_contacts.id = m.contact_id
  RETURNING chat_contacts.id, chat_contacts.nome, chat_contacts.client_id, m.client_nome;
END;
$function$;
CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  pc RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  i INT;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Contratos do Notion: não recalcula valores, só reatribui estrategista das previstas
  IF c.notion_page_id IS NOT NULL THEN
    IF c.estrategista_id IS NOT NULL THEN
      UPDATE public.comissoes
         SET estrategista_id = c.estrategista_id,
             cliente_nome    = c.cliente_nome
       WHERE contrato_id = p_contrato_id
         AND status = 'prevista'
         AND estrategista_id IS DISTINCT FROM c.estrategista_id;
    END IF;
    RETURN;
  END IF;

  DELETE FROM public.comissoes
   WHERE contrato_id = p_contrato_id AND status = 'prevista';

  IF c.status <> 'ativo' THEN RETURN; END IF;
  IF c.num_parcelas IS NULL OR c.num_parcelas < 1 THEN RETURN; END IF;
  IF c.estrategista_id IS NULL THEN RETURN; END IF;

  v_offset := CASE WHEN EXTRACT(DAY FROM c.data_fechamento) <= 15 THEN 1 ELSE 2 END;
  v_primeiro_mes := date_trunc('month', c.data_fechamento + (v_offset || ' months')::interval)::date;

  v_valor_parcela := round(c.valor_total / c.num_parcelas, 2);

  SELECT tipo_comissao, valor_comissao_padrao, percentual_padrao
    INTO pc
    FROM public.produtos_comissao
   WHERE produto_id = c.produto_id;

  IF FOUND AND pc.tipo_comissao = 'valor_fixo' THEN
    v_valor_comissao := pc.valor_comissao_padrao;
  ELSIF FOUND AND pc.tipo_comissao = 'percentual' THEN
    v_valor_comissao := round(v_valor_parcela * (pc.percentual_padrao / 100.0), 2);
  ELSE
    v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);
  END IF;

  FOR i IN 1..c.num_parcelas LOOP
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      i, c.num_parcelas,
      (v_primeiro_mes + ((i - 1) || ' months')::interval)::date,
      v_valor_comissao, v_valor_comissao, 'prevista'
    );
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.check_employee_self_management()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Um funcionário não pode ser seu próprio gestor';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.check_position_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  visited_ids UUID[];
  current_id  UUID;
BEGIN
  IF NEW.reports_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reports_to_id = NEW.id THEN
    RAISE EXCEPTION 'Um cargo não pode reportar para si mesmo';
  END IF;

  visited_ids := ARRAY[NEW.id];
  current_id  := NEW.reports_to_id;

  WHILE current_id IS NOT NULL LOOP
    IF current_id = ANY(visited_ids) THEN
      RAISE EXCEPTION 'Ciclo detectado na hierarquia de cargos';
    END IF;
    visited_ids := array_append(visited_ids, current_id);
    SELECT reports_to_id INTO current_id FROM public.positions WHERE id = current_id;
  END LOOP;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.clean_stale_typing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM internal_typing_indicators WHERE started_at < now() - interval '10 seconds';
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.compute_meeting_duration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_agent_tma(p_agent_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(tma_minutos numeric, total_conversas bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (c.primeira_resposta_em - c.criado_em)) / 60)::NUMERIC, 1),
    COUNT(*)
  FROM chat_conversations c
  WHERE c.agente_id = p_agent_id
    AND c.primeira_resposta_em IS NOT NULL
    AND c.criado_em >= now() - make_interval(days => p_days);
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_client_last_contact(p_client_ids uuid[])
 RETURNS TABLE(client_id uuid, ultimo_contato timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cc.client_id,
    MAX(cv.atualizado_em) AS ultimo_contato
  FROM chat_contacts cc
  JOIN chat_conversations cv ON cv.contact_id = cc.id
  WHERE cc.client_id = ANY(p_client_ids)
    AND cv.status != 'encerrada'
  GROUP BY cc.client_id

  UNION ALL

  -- Include clients with no conversation (return null)
  SELECT unnest(p_client_ids), NULL::TIMESTAMPTZ
  WHERE NOT EXISTS (
    SELECT 1 FROM chat_contacts cc2
    JOIN chat_conversations cv2 ON cv2.contact_id = cc2.id
    WHERE cc2.client_id = ANY(p_client_ids)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_contact_client_id(p_contact_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT client_id FROM chat_contacts WHERE id = p_contact_id;
$function$;
CREATE OR REPLACE FUNCTION public.get_internal_last_messages(p_conv_ids uuid[])
 RETURNS TABLE(conversation_id uuid, id uuid, user_id uuid, conteudo text, tipo text, media_url text, criado_em timestamp with time zone, user_nome text, user_perfil text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.id,
    m.user_id,
    m.conteudo,
    m.tipo::text,
    m.media_url,
    m.criado_em,
    u.nome AS user_nome,
    u.perfil::text AS user_perfil
  FROM internal_messages m
  LEFT JOIN users u ON u.id = m.user_id
  WHERE m.conversation_id = ANY(p_conv_ids)
  ORDER BY m.conversation_id, m.criado_em DESC
$function$;
CREATE OR REPLACE FUNCTION public.get_internal_unread_counts(p_user_id uuid)
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.conversation_id,
    COUNT(*) AS unread_count
  FROM internal_messages m
  JOIN internal_conversation_members mem
    ON mem.conversation_id = m.conversation_id AND mem.user_id = p_user_id
  LEFT JOIN internal_message_reads r
    ON r.conversation_id = m.conversation_id AND r.user_id = p_user_id
  WHERE m.user_id <> p_user_id
    AND m.criado_em > COALESCE(r.last_read_at, '1970-01-01T00:00:00Z'::timestamptz)
  GROUP BY m.conversation_id
$function$;
CREATE OR REPLACE FUNCTION public.get_my_gerente_dept_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY(
    SELECT department_id
    FROM chat_department_agents
    WHERE user_id = auth.uid()
    AND is_gerente = true
  );
$function$;
CREATE OR REPLACE FUNCTION public.get_tenant_by_domain(p_domain text)
 RETURNS TABLE(id uuid, name text, slug text, logo_url text, logo_dark_url text, favicon_url text, primary_color text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, slug, logo_url, logo_dark_url, favicon_url, primary_color
  FROM public.tenants
  WHERE custom_domain IS NOT NULL
    AND LOWER(custom_domain) = LOWER(p_domain)
  LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.get_unread_counts_for_user(p_user_id uuid, p_instance_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(conversation_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.conversation_id,
    count(*) as unread_count
  from chat_messages m
  join chat_conversations c on c.id = m.conversation_id
  left join chat_message_reads r
    on r.conversation_id = m.conversation_id
    and r.user_id = p_user_id
  where
    m.enviado_por_agente = false
    and m.tipo != 'nota_interna'
    and (r.last_read_at is null or m.criado_em > r.last_read_at)
    and (p_instance_ids is null or c.instance_id = any(p_instance_ids))
  group by m.conversation_id
  having count(*) > 0;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perfil      TEXT;
  v_nome        TEXT;
  v_role        public.app_role;
  v_position_id UUID;
  v_employee_id UUID;
  v_tenant_id   UUID := '00000000-0000-0000-0000-000000000001';
  v_has_admin   BOOLEAN;
  v_new_tenant  UUID;
  v_email_local TEXT;
BEGIN
  v_nome   := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'cliente');

  -- ── Branch admin-first (fresh clone OMNX) ─────────────────────
  -- Se ainda não existe nenhum admin no banco, esse signup é o primeiro
  -- user do clone: cria tenant novo + marca como admin e retorna.
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
    INTO v_has_admin;

  IF NOT v_has_admin THEN
    v_email_local := split_part(COALESCE(NEW.email, 'tenant'), '@', 1);

    INSERT INTO public.tenants (name, slug, primary_color)
    VALUES (
      COALESCE(v_nome, v_email_local, 'Minha Empresa'),
      v_email_local || '-' || substring(NEW.id::text, 1, 8),
      '#0B57D0'
    )
    RETURNING id INTO v_new_tenant;

    INSERT INTO public.users (id, nome, email, perfil)
    VALUES (NEW.id, v_nome, NEW.email, 'admin')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, tenant_id, full_name)
    VALUES (NEW.id, v_new_tenant, v_nome)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END IF;

  -- ── Fluxo legacy (dual-write inalterado) ──────────────────────
  INSERT INTO public.users (id, nome, email, perfil)
  VALUES (NEW.id, v_nome, NEW.email, v_perfil)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, tenant_id, full_name)
  VALUES (NEW.id, v_tenant_id, v_nome)
  ON CONFLICT (user_id) DO NOTHING;

  v_position_id := NULL;
  CASE v_perfil
    WHEN 'admin'           THEN v_role := 'admin';   v_position_id := '00000000-0000-0000-0003-000000000001';
    WHEN 'gerente'         THEN v_role := 'manager'; v_position_id := '00000000-0000-0000-0003-000000000002';
    WHEN 'admin_cobranca'  THEN v_role := 'manager'; v_position_id := '00000000-0000-0000-0003-000000000007';
    WHEN 'estrategista'    THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000003';
    WHEN 'atendimento'     THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000004';
    WHEN 'agente_chat'     THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000005';
    WHEN 'agente_cobranca' THEN v_role := 'member';  v_position_id := '00000000-0000-0000-0003-000000000006';
    WHEN 'cliente'         THEN v_role := 'member';  v_position_id := NULL;
    ELSE                        v_role := 'member';  v_position_id := NULL;
  END CASE;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  IF v_position_id IS NOT NULL THEN
    INSERT INTO public.employees (tenant_id, user_id, position_id, status, work_email)
    VALUES (v_tenant_id, NEW.id, v_position_id, 'active', NEW.email)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_employee_id;

    IF v_employee_id IS NULL THEN
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE user_id = NEW.id AND tenant_id = v_tenant_id
      LIMIT 1;
    END IF;

    IF v_employee_id IS NOT NULL THEN
      INSERT INTO public.employee_positions (employee_id, position_id, is_primary)
      VALUES (v_employee_id, v_position_id, true)
      ON CONFLICT (employee_id, position_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'admin')
$function$;
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR public.is_manager()
$function$;
CREATE OR REPLACE FUNCTION public.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'manager')
$function$;
CREATE OR REPLACE FUNCTION public.match_contact_to_client(p_contact_id uuid, p_whatsapp text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_digits text;
BEGIN
  -- Extract last 11 digits from the WhatsApp number
  v_digits := RIGHT(regexp_replace(p_whatsapp, '[^0-9]', '', 'g'), 11);
  
  IF length(v_digits) < 8 THEN
    RETURN NULL;
  END IF;

  -- Try to find a client whose phone matches
  SELECT c.id INTO v_client_id
  FROM clients c
  WHERE regexp_replace(c.telefone, '[^0-9]', '', 'g') != ''
    AND RIGHT(regexp_replace(c.telefone, '[^0-9]', '', 'g'), 11) = v_digits
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    UPDATE chat_contacts SET client_id = v_client_id WHERE id = p_contact_id AND client_id IS NULL;
  END IF;

  RETURN v_client_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.pode_gerir_contratos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND (perfil IN ('admin','gerente') OR acesso_contratos = true)
  );
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_dept_gerente_to_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Find department group
  SELECT id INTO v_conv_id
  FROM internal_conversations
  WHERE tipo = 'department' AND department_id = NEW.id;

  IF v_conv_id IS NOT NULL THEN
    -- Remove old gerente if changed
    IF OLD.gerente_id IS NOT NULL AND OLD.gerente_id IS DISTINCT FROM NEW.gerente_id THEN
      DELETE FROM internal_conversation_members
      WHERE conversation_id = v_conv_id AND user_id = OLD.gerente_id
        AND NOT EXISTS (
          SELECT 1 FROM chat_department_agents
          WHERE department_id = NEW.id AND user_id = OLD.gerente_id
        );
    END IF;

    -- Add new gerente
    IF NEW.gerente_id IS NOT NULL THEN
      INSERT INTO internal_conversation_members (conversation_id, user_id, role)
      VALUES (v_conv_id, NEW.gerente_id, 'admin')
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_dept_group_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv_id UUID;
BEGIN
  -- Find the department group conversation
  SELECT id INTO conv_id FROM internal_conversations
  WHERE tipo = 'department' AND department_id = COALESCE(NEW.department_id, OLD.department_id);

  IF conv_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO internal_conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, NEW.user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    -- Don't remove admins (they stay in all groups)
    DELETE FROM internal_conversation_members
    WHERE conversation_id = conv_id AND user_id = OLD.user_id
      AND user_id NOT IN (SELECT id FROM users WHERE perfil = 'admin');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_user_metadata_perfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.perfil IS DISTINCT FROM OLD.perfil THEN
    UPDATE auth.users 
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('perfil', NEW.perfil)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_vendas_pendentes_updated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_auto_match_contact_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_client_id UUID;
BEGIN
  -- Only try if client_id is null
  IF NEW.client_id IS NOT NULL THEN RETURN NEW; END IF;
  
  -- Find matching client by phone (last 11 digits)
  SELECT c.id INTO matched_client_id
  FROM clients c
  WHERE c.telefone IS NOT NULL AND c.telefone != ''
    AND RIGHT(REGEXP_REPLACE(NEW.numero_whatsapp, '[^0-9]', '', 'g'), 11) = 
        RIGHT(REGEXP_REPLACE(c.telefone, '[^0-9]', '', 'g'), 11)
  LIMIT 1;
  
  IF matched_client_id IS NOT NULL THEN
    NEW.client_id := matched_client_id;
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_calcular_comissoes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.calcular_comissoes_contrato(NEW.id);
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_aguardando_resposta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.enviado_por_agente = false AND NEW.enviado_por_ia = false THEN
    -- Client message → mark as awaiting response
    UPDATE chat_conversations 
    SET aguardando_resposta = true, 
        ultima_msg_cliente_em = NEW.criado_em
    WHERE id = NEW.conversation_id;
  ELSE
    -- Agent or IA message → mark as responded
    UPDATE chat_conversations 
    SET aguardando_resposta = false
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_app_settings_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_meetings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.user_can_access_client(p_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- No client = Caixa Geral = everyone can access
    WHEN p_client_id IS NULL THEN true
    -- Admin/gerente/agente_chat/atendimento see everything
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid())
         IN ('admin', 'gerente', 'agente_chat', 'atendimento', 'admin_cobranca', 'agente_cobranca')
    THEN true
    -- Estrategista: only their assigned clients + NULL
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'estrategista'
    THEN EXISTS (
      SELECT 1 FROM client_assignments ca
      WHERE ca.user_id = auth.uid()
        AND ca.client_id = p_client_id
    )
    ELSE false
  END
$function$;
CREATE OR REPLACE FUNCTION public.user_can_access_instance(p_instance_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid())
         IN ('admin', 'gerente')
    THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.user_instance_assignments uia
      WHERE uia.user_id = auth.uid()
        AND uia.instance_id = p_instance_id
    )
  END
$function$;
CREATE OR REPLACE VIEW public."users_legacy" AS
 SELECT u.id,
    u.nome,
    u.email,
        CASE
            WHEN (ur.role = 'admin'::app_role) THEN 'admin'::text
            WHEN ((ur.role = 'manager'::app_role) AND (p.title ~~* '%cobranca%'::text)) THEN 'admin_cobranca'::text
            WHEN (ur.role = 'manager'::app_role) THEN 'gerente'::text
            WHEN (p.title = 'Estrategista'::text) THEN 'estrategista'::text
            WHEN (p.title = 'Atendente'::text) THEN 'atendimento'::text
            WHEN (p.title = 'Agente de Chat'::text) THEN 'agente_chat'::text
            WHEN (p.title = 'Agente de Cobrança'::text) THEN 'agente_cobranca'::text
            ELSE 'cliente'::text
        END AS perfil_derivado,
    u.perfil AS perfil_legado,
    u.ativo,
    u.criado_em
   FROM (((users u
     LEFT JOIN user_roles ur ON ((ur.user_id = u.id)))
     LEFT JOIN employees e ON ((e.user_id = u.id)))
     LEFT JOIN positions p ON ((p.id = e.position_id)));
CREATE OR REPLACE VIEW public."v_alertas_estrategista" AS
 SELECT id AS estrategista_id,
    nome AS estrategista_nome,
    COALESCE(( SELECT count(*) AS count
           FROM (deliveries d
             JOIN contratos c ON (((c.cliente_id = d.client_id) AND (c.estrategista_id = u.id))))
          WHERE ((d.prazo IS NOT NULL) AND (d.prazo < CURRENT_DATE) AND (d.status <> ALL (ARRAY['publicado'::text, 'aprovado'::text])))), (0)::bigint) AS entregas_atrasadas,
    0 AS chat_negativo,
    NULL::integer AS ranking_pos
   FROM users u
  WHERE ((tipo_consultor IS NOT NULL) AND (COALESCE(ativo_comissoes, true) = true));
CREATE OR REPLACE VIEW public."v_contratos_alertas" AS
 SELECT id AS contrato_id,
    cliente_nome,
    estrategista_id,
    status_secundario,
    vencimento,
    num_parcelas,
        CASE
            WHEN (vencimento IS NOT NULL) THEN ((vencimento + (((num_parcelas - 1) || ' months'::text))::interval))::date
            ELSE NULL::date
        END AS ultimo_vencimento,
    atualizado_em
   FROM contratos c
  WHERE (status = 'ativo'::text);
CREATE OR REPLACE VIEW public."v_dept_member_metrics" AS
 SELECT cda.department_id,
    u.id AS user_id,
    u.nome AS user_nome,
    u.perfil AS user_perfil,
    cda.is_gerente,
    COALESCE(( SELECT count(*) AS count
           FROM (chat_messages cm
             JOIN chat_conversations cc ON ((cc.id = cm.conversation_id)))
          WHERE ((cm.agente_id = u.id) AND (cc.department_id = cda.department_id) AND (cm.enviado_por_agente = true) AND (cm.criado_em >= CURRENT_DATE))), (0)::bigint) AS msgs_hoje,
    COALESCE(( SELECT count(*) AS count
           FROM (chat_messages cm
             JOIN chat_conversations cc ON ((cc.id = cm.conversation_id)))
          WHERE ((cm.agente_id = u.id) AND (cc.department_id = cda.department_id) AND (cm.enviado_por_agente = true) AND (cm.criado_em >= date_trunc('week'::text, CURRENT_TIMESTAMP)))), (0)::bigint) AS msgs_semana,
    COALESCE(( SELECT count(*) AS count
           FROM chat_conversations cc
          WHERE ((cc.agente_id = u.id) AND (cc.department_id = cda.department_id) AND (cc.status = ANY (ARRAY['aberta'::text, 'em_atendimento'::text, 'aguardando'::text])))), (0)::bigint) AS conversas_abertas
   FROM (chat_department_agents cda
     JOIN users u ON ((u.id = cda.user_id)));
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Trigger em auth.* requer privilégio: %', SQLERRM;
END $$;
DROP TRIGGER IF EXISTS tr_app_settings_updated ON app_settings;
CREATE TRIGGER tr_app_settings_updated BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_app_settings_timestamp();
DROP TRIGGER IF EXISTS trg_auto_match_contact ON chat_contacts;
CREATE TRIGGER trg_auto_match_contact BEFORE INSERT ON chat_contacts FOR EACH ROW EXECUTE FUNCTION trg_auto_match_contact_client();
DROP TRIGGER IF EXISTS trg_sync_dept_group_members ON chat_department_agents;
CREATE TRIGGER trg_sync_dept_group_members AFTER INSERT OR DELETE ON chat_department_agents FOR EACH ROW EXECUTE FUNCTION sync_dept_group_members();
DROP TRIGGER IF EXISTS trg_sync_dept_gerente ON chat_departments;
CREATE TRIGGER trg_sync_dept_gerente AFTER UPDATE OF gerente_id ON chat_departments FOR EACH ROW EXECUTE FUNCTION sync_dept_gerente_to_group();
DROP TRIGGER IF EXISTS trg_update_aguardando_resposta ON chat_messages;
CREATE TRIGGER trg_update_aguardando_resposta AFTER INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION update_aguardando_resposta();
DROP TRIGGER IF EXISTS client_contracts_atualizado_em ON client_contracts;
CREATE TRIGGER client_contracts_atualizado_em BEFORE UPDATE ON client_contracts FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
DROP TRIGGER IF EXISTS set_client_notes_updated_at ON client_notes;
CREATE TRIGGER set_client_notes_updated_at BEFORE UPDATE ON client_notes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS clients_atualizado_em ON clients;
CREATE TRIGGER clients_atualizado_em BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
DROP TRIGGER IF EXISTS trg_company_areas_updated_at ON company_areas;
CREATE TRIGGER trg_company_areas_updated_at BEFORE UPDATE ON company_areas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS contratos_audit_trg ON contratos;
CREATE TRIGGER contratos_audit_trg AFTER INSERT OR DELETE OR UPDATE ON contratos FOR EACH ROW EXECUTE FUNCTION audit_contratos();
DROP TRIGGER IF EXISTS contratos_calc_comissoes_ins ON contratos;
CREATE TRIGGER contratos_calc_comissoes_ins AFTER INSERT ON contratos FOR EACH ROW EXECUTE FUNCTION trg_calcular_comissoes();
DROP TRIGGER IF EXISTS contratos_calc_comissoes_upd ON contratos;
CREATE TRIGGER contratos_calc_comissoes_upd AFTER UPDATE OF data_fechamento, valor_total, num_parcelas, percentual_aplicado, status, produto_id, estrategista_id ON contratos FOR EACH ROW EXECUTE FUNCTION trg_calcular_comissoes();
DROP TRIGGER IF EXISTS contratos_set_updated ON contratos;
CREATE TRIGGER contratos_set_updated BEFORE UPDATE ON contratos FOR EACH ROW EXECUTE FUNCTION tg_set_atualizado_em();
DROP TRIGGER IF EXISTS deliverables_atualizado_em ON deliverables;
CREATE TRIGGER deliverables_atualizado_em BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
DROP TRIGGER IF EXISTS deliveries_atualizado_em ON deliveries;
CREATE TRIGGER deliveries_atualizado_em BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
DROP TRIGGER IF EXISTS trg_employees_self_management ON employees;
CREATE TRIGGER trg_employees_self_management BEFORE INSERT OR UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION check_employee_self_management();
DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_auto_add_admins_dept_group ON internal_conversations;
CREATE TRIGGER trg_auto_add_admins_dept_group AFTER INSERT ON internal_conversations FOR EACH ROW EXECUTE FUNCTION auto_add_admins_to_dept_group();
DROP TRIGGER IF EXISTS trg_clean_stale_typing ON internal_typing_indicators;
CREATE TRIGGER trg_clean_stale_typing BEFORE INSERT ON internal_typing_indicators FOR EACH STATEMENT EXECUTE FUNCTION clean_stale_typing();
DROP TRIGGER IF EXISTS trg_meetings_duration ON meetings;
CREATE TRIGGER trg_meetings_duration BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION compute_meeting_duration();
DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_meetings_updated_at();
DROP TRIGGER IF EXISTS trg_check_position_cycle ON positions;
CREATE TRIGGER trg_check_position_cycle BEFORE INSERT OR UPDATE OF reports_to_id ON positions FOR EACH ROW EXECUTE FUNCTION check_position_cycle();
DROP TRIGGER IF EXISTS trg_positions_updated_at ON positions;
CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS products_atualizado_em ON products;
CREATE TRIGGER products_atualizado_em BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_sales_opps_updated_at ON sales_opportunities;
CREATE TRIGGER set_sales_opps_updated_at BEFORE UPDATE ON sales_opportunities FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_sales_pipelines_updated_at ON sales_pipelines;
CREATE TRIGGER set_sales_pipelines_updated_at BEFORE UPDATE ON sales_pipelines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_sales_stages_updated_at ON sales_stages;
CREATE TRIGGER set_sales_stages_updated_at BEFORE UPDATE ON sales_stages FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS trg_subareas_updated_at ON subareas;
CREATE TRIGGER trg_subareas_updated_at BEFORE UPDATE ON subareas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS sync_perfil_to_auth ON users;
CREATE TRIGGER sync_perfil_to_auth AFTER UPDATE OF perfil ON users FOR EACH ROW EXECUTE FUNCTION sync_user_metadata_perfil();
DROP TRIGGER IF EXISTS trg_vendas_pendentes_updated ON vendas_pendentes;
CREATE TRIGGER trg_vendas_pendentes_updated BEFORE UPDATE ON vendas_pendentes FOR EACH ROW EXECUTE FUNCTION tg_vendas_pendentes_updated();
ALTER VIEW public."users_legacy" SET (security_invoker = true);
ALTER VIEW public."v_alertas_estrategista" SET (security_invoker = true);
ALTER VIEW public."v_contratos_alertas" SET (security_invoker = true);
ALTER VIEW public."v_dept_member_metrics" SET (security_invoker = true);
-- Storage: buckets + policies. Em projetos novos a schema `storage` pode
-- ainda não estar provisionada quando este SETUP roda via Mgmt API. Por
-- isso envolvemos em um DO block que checa primeiro. Se não estiver pronta,
-- o cliente roda este bloco manualmente depois (via SQL Editor).
DO $do_storage$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    RAISE NOTICE 'Storage schema não está pronta — pulando bucket/policy seeding. Reaplique este SETUP depois do storage subir.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('branding', 'branding', true, 5242880, ARRAY['image/jpeg','image/png','image/svg+xml','image/webp','image/x-icon','image/vnd.microsoft.icon']) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('chat-media', 'chat-media', true, 52428800, ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/ogg','audio/wav','audio/webm','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','text/plain','text/csv']) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('contratos-anexos', 'contratos-anexos', false, NULL, NULL) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('deliveries', 'deliveries', false, 52428800, ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('vendas-comprovantes', 'vendas-comprovantes', false, NULL, NULL) ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS "Public avatar read" ON storage.objects;
  CREATE POLICY "Public avatar read" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'avatars'::text));
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS "anexos_storage_admin" ON storage.objects;
CREATE POLICY "anexos_storage_admin" ON storage.objects AS PERMISSIVE FOR ALL TO authenticated USING (((bucket_id = 'contratos-anexos'::text) AND pode_gerir_contratos())) WITH CHECK (((bucket_id = 'contratos-anexos'::text) AND pode_gerir_contratos()));
DROP POLICY IF EXISTS "anexos_storage_estrategista_read" ON storage.objects;
CREATE POLICY "anexos_storage_estrategista_read" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'contratos-anexos'::text) AND (EXISTS ( SELECT 1
   FROM (contrato_anexos a
     JOIN contratos c ON ((c.id = a.contrato_id)))
  WHERE ((a.storage_path = objects.name) AND (c.estrategista_id = auth.uid()))))));
DROP POLICY IF EXISTS "auth_upload_chat_media" ON storage.objects;
CREATE POLICY "auth_upload_chat_media" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'chat-media'::text));
DROP POLICY IF EXISTS "branding_storage_delete" ON storage.objects;
CREATE POLICY "branding_storage_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'branding'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)));
DROP POLICY IF EXISTS "branding_storage_insert" ON storage.objects;
CREATE POLICY "branding_storage_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'branding'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)));
DROP POLICY IF EXISTS "branding_storage_select" ON storage.objects;
CREATE POLICY "branding_storage_select" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'branding'::text));
DROP POLICY IF EXISTS "branding_storage_update" ON storage.objects;
CREATE POLICY "branding_storage_update" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'branding'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)));
DROP POLICY IF EXISTS "deliveries_storage_delete" ON storage.objects;
CREATE POLICY "deliveries_storage_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'deliveries'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text]))));
DROP POLICY IF EXISTS "deliveries_storage_insert" ON storage.objects;
CREATE POLICY "deliveries_storage_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'deliveries'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text]))));
DROP POLICY IF EXISTS "deliveries_storage_select" ON storage.objects;
CREATE POLICY "deliveries_storage_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'deliveries'::text));
DROP POLICY IF EXISTS "public_read_chat_media" ON storage.objects;
CREATE POLICY "public_read_chat_media" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'chat-media'::text));
DROP POLICY IF EXISTS "vendas_comprovantes_atendimento_read" ON storage.objects;
CREATE POLICY "vendas_comprovantes_atendimento_read" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'vendas-comprovantes'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])))))));
END $do_storage$;
ALTER TABLE public."_webhook_debug" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_contact_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_conversation_user_prefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_csat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_department_agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_message_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_quick_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_weekly_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."client_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."client_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."client_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."client_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."client_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cobranca_devedores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cobranca_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cobranca_regua_passos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cobranca_reguas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cobranca_sends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."comissoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."company_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contrato_anexos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contrato_pdf_extractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contratos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contratos_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deliverables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_content_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."department_instance_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dept_team_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."estrategista_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."estrategista_comissao_override" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."extratos_mensais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ia_bot_activation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ia_bot_conversation_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ia_bot_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ia_bot_execution_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ia_bots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_conversation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_message_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_post_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_post_poll_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_post_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."internal_typing_indicators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."learning_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."learning_lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."learning_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."learning_paths" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."learning_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nps_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nps_surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."personal_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."produtos_comissao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."salario_fixo_itens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_opportunity_checklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_opportunity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_pipelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_stage_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subareas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_instance_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vendas_pendentes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wa_warmup_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wa_warmup_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."webhook_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."whatsapp_instances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_api_keys" ON public."api_keys";
CREATE POLICY "admin_manage_api_keys" ON public."api_keys" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "Admins can insert app_settings" ON public."app_settings";
CREATE POLICY "Admins can insert app_settings" ON public."app_settings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "Admins can read app_settings" ON public."app_settings";
CREATE POLICY "Admins can read app_settings" ON public."app_settings" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "Admins can update app_settings" ON public."app_settings";
CREATE POLICY "Admins can update app_settings" ON public."app_settings" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "admin_view_audit_logs" ON public."audit_logs";
CREATE POLICY "admin_view_audit_logs" ON public."audit_logs" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "auth_insert_audit_logs" ON public."audit_logs";
CREATE POLICY "auth_insert_audit_logs" ON public."audit_logs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)));
DROP POLICY IF EXISTS "Authenticated users can read chat_contact_clients" ON public."chat_contact_clients";
CREATE POLICY "Authenticated users can read chat_contact_clients" ON public."chat_contact_clients" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chat_contact_clients_delete" ON public."chat_contact_clients";
CREATE POLICY "chat_contact_clients_delete" ON public."chat_contact_clients" AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "chat_contact_clients_insert" ON public."chat_contact_clients";
CREATE POLICY "chat_contact_clients_insert" ON public."chat_contact_clients" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "chat_contact_clients_update" ON public."chat_contact_clients";
CREATE POLICY "chat_contact_clients_update" ON public."chat_contact_clients" AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "chat_contacts_access" ON public."chat_contacts";
CREATE POLICY "chat_contacts_access" ON public."chat_contacts" AS PERMISSIVE FOR ALL TO public USING (user_can_access_client(client_id));
DROP POLICY IF EXISTS "users manage own prefs" ON public."chat_conversation_user_prefs";
CREATE POLICY "users manage own prefs" ON public."chat_conversation_user_prefs" AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "chat_conversations_access" ON public."chat_conversations";
CREATE POLICY "chat_conversations_access" ON public."chat_conversations" AS PERMISSIVE FOR ALL TO public USING ((user_can_access_instance(instance_id) AND user_can_access_client(get_contact_client_id(contact_id))));
DROP POLICY IF EXISTS "chat_csat_access" ON public."chat_csat";
CREATE POLICY "chat_csat_access" ON public."chat_csat" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente_chat'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "admin_all_dept_agents" ON public."chat_department_agents";
CREATE POLICY "admin_all_dept_agents" ON public."chat_department_agents" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)) WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "gerente_own_dept_agents" ON public."chat_department_agents";
CREATE POLICY "gerente_own_dept_agents" ON public."chat_department_agents" AS PERMISSIVE FOR ALL TO public USING (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'gerente'::text) AND (department_id = ANY (get_my_gerente_dept_ids())))) WITH CHECK (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'gerente'::text) AND (department_id = ANY (get_my_gerente_dept_ids()))));
DROP POLICY IF EXISTS "own_dept_agents" ON public."chat_department_agents";
CREATE POLICY "own_dept_agents" ON public."chat_department_agents" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "team_read_dept_agents" ON public."chat_department_agents";
CREATE POLICY "team_read_dept_agents" ON public."chat_department_agents" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "admin_all_departments" ON public."chat_departments";
CREATE POLICY "admin_all_departments" ON public."chat_departments" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)) WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "chat_read_departments" ON public."chat_departments";
CREATE POLICY "chat_read_departments" ON public."chat_departments" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente_chat'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "gerente_own_departments" ON public."chat_departments";
CREATE POLICY "gerente_own_departments" ON public."chat_departments" AS PERMISSIVE FOR ALL TO public USING (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'gerente'::text) AND (id = ANY (get_my_gerente_dept_ids())))) WITH CHECK (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'gerente'::text) AND (id = ANY (get_my_gerente_dept_ids()))));
DROP POLICY IF EXISTS "team_read_departments" ON public."chat_departments";
CREATE POLICY "team_read_departments" ON public."chat_departments" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'agente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "authenticated can read group members" ON public."chat_group_members";
CREATE POLICY "authenticated can read group members" ON public."chat_group_members" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "service role can manage group members" ON public."chat_group_members";
CREATE POLICY "service role can manage group members" ON public."chat_group_members" AS PERMISSIVE FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "users_own_reads" ON public."chat_message_reads";
CREATE POLICY "users_own_reads" ON public."chat_message_reads" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "chat_messages_access" ON public."chat_messages";
CREATE POLICY "chat_messages_access" ON public."chat_messages" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM chat_conversations cv
  WHERE ((cv.id = chat_messages.conversation_id) AND user_can_access_instance(cv.instance_id) AND user_can_access_client(get_contact_client_id(cv.contact_id))))));
DROP POLICY IF EXISTS "chat_team_quick_replies" ON public."chat_quick_replies";
CREATE POLICY "chat_team_quick_replies" ON public."chat_quick_replies" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "admin_manage_templates" ON public."chat_templates";
CREATE POLICY "admin_manage_templates" ON public."chat_templates" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "agents_view_templates" ON public."chat_templates";
CREATE POLICY "agents_view_templates" ON public."chat_templates" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE (users.id = auth.uid()))));
DROP POLICY IF EXISTS "admins_gerentes_read_weekly_reports" ON public."chat_weekly_reports";
CREATE POLICY "admins_gerentes_read_weekly_reports" ON public."chat_weekly_reports" AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))) OR (estrategista_id = auth.uid())));
DROP POLICY IF EXISTS "service_role_all_weekly_reports" ON public."chat_weekly_reports";
CREATE POLICY "service_role_all_weekly_reports" ON public."chat_weekly_reports" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
DROP POLICY IF EXISTS "users_own_alerts_delete" ON public."client_alerts";
CREATE POLICY "users_own_alerts_delete" ON public."client_alerts" AS PERMISSIVE FOR DELETE TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "users_own_alerts_insert" ON public."client_alerts";
CREATE POLICY "users_own_alerts_insert" ON public."client_alerts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "users_own_alerts_select" ON public."client_alerts";
CREATE POLICY "users_own_alerts_select" ON public."client_alerts" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "users_own_alerts_update" ON public."client_alerts";
CREATE POLICY "users_own_alerts_update" ON public."client_alerts" AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "client_assignments_all" ON public."client_assignments";
CREATE POLICY "client_assignments_all" ON public."client_assignments" AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text]))) WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "client_assignments_select" ON public."client_assignments";
CREATE POLICY "client_assignments_select" ON public."client_assignments" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin/gerente can delete client_contracts" ON public."client_contracts";
CREATE POLICY "Admin/gerente can delete client_contracts" ON public."client_contracts" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "Admin/gerente can insert client_contracts" ON public."client_contracts";
CREATE POLICY "Admin/gerente can insert client_contracts" ON public."client_contracts" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "Admin/gerente can update client_contracts" ON public."client_contracts";
CREATE POLICY "Admin/gerente can update client_contracts" ON public."client_contracts" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "Authenticated users can read client_contracts" ON public."client_contracts";
CREATE POLICY "Authenticated users can read client_contracts" ON public."client_contracts" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_manage_interactions" ON public."client_interactions";
CREATE POLICY "authenticated_manage_interactions" ON public."client_interactions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text]))))));
DROP POLICY IF EXISTS "client_notes_delete" ON public."client_notes";
CREATE POLICY "client_notes_delete" ON public."client_notes" AS PERMISSIVE FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))));
DROP POLICY IF EXISTS "client_notes_insert" ON public."client_notes";
CREATE POLICY "client_notes_insert" ON public."client_notes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = client_notes.client_id) AND (ca.user_id = auth.uid()) AND (ca.tipo = 'estrategista'::text)))))))));
DROP POLICY IF EXISTS "client_notes_select" ON public."client_notes";
CREATE POLICY "client_notes_select" ON public."client_notes" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = client_notes.client_id) AND (ca.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "client_notes_update" ON public."client_notes";
CREATE POLICY "client_notes_update" ON public."client_notes" AS PERMISSIVE FOR UPDATE TO authenticated USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))));
DROP POLICY IF EXISTS "clients_insert" ON public."clients";
CREATE POLICY "clients_insert" ON public."clients" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text, 'agente'::text])));
DROP POLICY IF EXISTS "clients_select" ON public."clients";
CREATE POLICY "clients_select" ON public."clients" AS PERMISSIVE FOR SELECT TO public USING (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text, 'agente'::text])) OR (id IN ( SELECT client_assignments.client_id
   FROM client_assignments
  WHERE ((client_assignments.user_id = auth.uid()) AND (client_assignments.ativo = true))))));
DROP POLICY IF EXISTS "clients_update" ON public."clients";
CREATE POLICY "clients_update" ON public."clients" AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])) OR (EXISTS ( SELECT 1
   FROM client_assignments ca
  WHERE ((ca.client_id = clients.id) AND (ca.user_id = auth.uid()) AND (ca.ativo = true)))))) WITH CHECK (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])) OR (EXISTS ( SELECT 1
   FROM client_assignments ca
  WHERE ((ca.client_id = clients.id) AND (ca.user_id = auth.uid()) AND (ca.ativo = true))))));
DROP POLICY IF EXISTS "cobranca_team_devedores" ON public."cobranca_devedores";
CREATE POLICY "cobranca_team_devedores" ON public."cobranca_devedores" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text])));
DROP POLICY IF EXISTS "cobranca_team_instances" ON public."cobranca_instances";
CREATE POLICY "cobranca_team_instances" ON public."cobranca_instances" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text])));
DROP POLICY IF EXISTS "cobranca_team_passos" ON public."cobranca_regua_passos";
CREATE POLICY "cobranca_team_passos" ON public."cobranca_regua_passos" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text])));
DROP POLICY IF EXISTS "cobranca_team_reguas" ON public."cobranca_reguas";
CREATE POLICY "cobranca_team_reguas" ON public."cobranca_reguas" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text])));
DROP POLICY IF EXISTS "cobranca_team_sends" ON public."cobranca_sends";
CREATE POLICY "cobranca_team_sends" ON public."cobranca_sends" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'agente'::text])));
DROP POLICY IF EXISTS "comissoes_admin_write" ON public."comissoes";
CREATE POLICY "comissoes_admin_write" ON public."comissoes" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "comissoes_self_read" ON public."comissoes";
CREATE POLICY "comissoes_self_read" ON public."comissoes" AS PERMISSIVE FOR SELECT TO authenticated USING ((((estrategista_id = auth.uid()) AND (status = ANY (ARRAY['aprovada'::text, 'paga'::text]))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))));
DROP POLICY IF EXISTS "company_areas_admin_write" ON public."company_areas";
CREATE POLICY "company_areas_admin_write" ON public."company_areas" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "company_areas_read_all" ON public."company_areas";
CREATE POLICY "company_areas_read_all" ON public."company_areas" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "anexos_admin_all" ON public."contrato_anexos";
CREATE POLICY "anexos_admin_all" ON public."contrato_anexos" AS PERMISSIVE FOR ALL TO authenticated USING (pode_gerir_contratos()) WITH CHECK (pode_gerir_contratos());
DROP POLICY IF EXISTS "anexos_estrategista_read" ON public."contrato_anexos";
CREATE POLICY "anexos_estrategista_read" ON public."contrato_anexos" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contratos c
  WHERE ((c.id = contrato_anexos.contrato_id) AND (c.estrategista_id = auth.uid())))));
DROP POLICY IF EXISTS "pdf_ext_gerir_all" ON public."contrato_pdf_extractions";
CREATE POLICY "pdf_ext_gerir_all" ON public."contrato_pdf_extractions" AS PERMISSIVE FOR ALL TO authenticated USING (pode_gerir_contratos()) WITH CHECK (pode_gerir_contratos());
DROP POLICY IF EXISTS "contratos_admin_write" ON public."contratos";
CREATE POLICY "contratos_admin_write" ON public."contratos" AS PERMISSIVE FOR ALL TO authenticated USING (pode_gerir_contratos()) WITH CHECK (pode_gerir_contratos());
DROP POLICY IF EXISTS "contratos_select" ON public."contratos";
CREATE POLICY "contratos_select" ON public."contratos" AS PERMISSIVE FOR SELECT TO authenticated USING (((estrategista_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))));
DROP POLICY IF EXISTS "audit_admin_read" ON public."contratos_audit_log";
CREATE POLICY "audit_admin_read" ON public."contratos_audit_log" AS PERMISSIVE FOR SELECT TO authenticated USING (pode_gerir_contratos());
DROP POLICY IF EXISTS "deliverables_delete" ON public."deliverables";
CREATE POLICY "deliverables_delete" ON public."deliverables" AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "deliverables_insert" ON public."deliverables";
CREATE POLICY "deliverables_insert" ON public."deliverables" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "deliverables_select" ON public."deliverables";
CREATE POLICY "deliverables_select" ON public."deliverables" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "deliverables_update" ON public."deliverables";
CREATE POLICY "deliverables_update" ON public."deliverables" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "deliveries_insert" ON public."deliveries";
CREATE POLICY "deliveries_insert" ON public."deliveries" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "deliveries_select" ON public."deliveries";
CREATE POLICY "deliveries_select" ON public."deliveries" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "deliveries_update" ON public."deliveries";
CREATE POLICY "deliveries_update" ON public."deliveries" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "approvals_insert" ON public."delivery_approvals";
CREATE POLICY "approvals_insert" ON public."delivery_approvals" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "approvals_select" ON public."delivery_approvals";
CREATE POLICY "approvals_select" ON public."delivery_approvals" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "comments_insert" ON public."delivery_comments";
CREATE POLICY "comments_insert" ON public."delivery_comments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "comments_select" ON public."delivery_comments";
CREATE POLICY "comments_select" ON public."delivery_comments" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "content_delete" ON public."delivery_content_items";
CREATE POLICY "content_delete" ON public."delivery_content_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "content_insert" ON public."delivery_content_items";
CREATE POLICY "content_insert" ON public."delivery_content_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "content_select" ON public."delivery_content_items";
CREATE POLICY "content_select" ON public."delivery_content_items" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "versions_insert" ON public."delivery_versions";
CREATE POLICY "versions_insert" ON public."delivery_versions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "versions_select" ON public."delivery_versions";
CREATE POLICY "versions_select" ON public."delivery_versions" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "department_instance_assignments_delete" ON public."department_instance_assignments";
CREATE POLICY "department_instance_assignments_delete" ON public."department_instance_assignments" AS PERMISSIVE FOR DELETE TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "department_instance_assignments_insert" ON public."department_instance_assignments";
CREATE POLICY "department_instance_assignments_insert" ON public."department_instance_assignments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "department_instance_assignments_select" ON public."department_instance_assignments";
CREATE POLICY "department_instance_assignments_select" ON public."department_instance_assignments" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "team_msg_delete" ON public."dept_team_messages";
CREATE POLICY "team_msg_delete" ON public."dept_team_messages" AS PERMISSIVE FOR DELETE TO public USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM chat_department_agents
  WHERE ((chat_department_agents.department_id = dept_team_messages.department_id) AND (chat_department_agents.user_id = auth.uid()) AND (chat_department_agents.is_gerente = true)))) OR (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text)));
DROP POLICY IF EXISTS "team_msg_insert" ON public."dept_team_messages";
CREATE POLICY "team_msg_insert" ON public."dept_team_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = auth.uid()) AND ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text) OR (EXISTS ( SELECT 1
   FROM chat_department_agents
  WHERE ((chat_department_agents.department_id = dept_team_messages.department_id) AND (chat_department_agents.user_id = auth.uid())))))));
DROP POLICY IF EXISTS "team_msg_read" ON public."dept_team_messages";
CREATE POLICY "team_msg_read" ON public."dept_team_messages" AS PERMISSIVE FOR SELECT TO public USING (((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text) OR (EXISTS ( SELECT 1
   FROM chat_department_agents
  WHERE ((chat_department_agents.department_id = dept_team_messages.department_id) AND (chat_department_agents.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "admin_view_email_queue" ON public."email_queue";
CREATE POLICY "admin_view_email_queue" ON public."email_queue" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "service_role_manage_email_queue" ON public."email_queue";
CREATE POLICY "service_role_manage_email_queue" ON public."email_queue" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "employee_positions_admin_manager_write" ON public."employee_positions";
CREATE POLICY "employee_positions_admin_manager_write" ON public."employee_positions" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_manager()) WITH CHECK (is_admin_or_manager());
DROP POLICY IF EXISTS "employee_positions_read_all" ON public."employee_positions";
CREATE POLICY "employee_positions_read_all" ON public."employee_positions" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "employees_admin_manager_write" ON public."employees";
CREATE POLICY "employees_admin_manager_write" ON public."employees" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin_or_manager()) WITH CHECK (is_admin_or_manager());
DROP POLICY IF EXISTS "employees_read_all" ON public."employees";
CREATE POLICY "employees_read_all" ON public."employees" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "aliases_admin_all" ON public."estrategista_aliases";
CREATE POLICY "aliases_admin_all" ON public."estrategista_aliases" AS PERMISSIVE FOR ALL TO authenticated USING (pode_gerir_contratos()) WITH CHECK (pode_gerir_contratos());
DROP POLICY IF EXISTS "ov_admin_write" ON public."estrategista_comissao_override";
CREATE POLICY "ov_admin_write" ON public."estrategista_comissao_override" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "ov_select_self_or_admin" ON public."estrategista_comissao_override";
CREATE POLICY "ov_select_self_or_admin" ON public."estrategista_comissao_override" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))));
DROP POLICY IF EXISTS "extratos_admin_write" ON public."extratos_mensais";
CREATE POLICY "extratos_admin_write" ON public."extratos_mensais" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "extratos_self_read" ON public."extratos_mensais";
CREATE POLICY "extratos_self_read" ON public."extratos_mensais" AS PERMISSIVE FOR SELECT TO authenticated USING ((((estrategista_id = auth.uid()) AND (status = ANY (ARRAY['aprovado'::text, 'pago'::text]))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))));
DROP POLICY IF EXISTS "admin_manage_bot_rules" ON public."ia_bot_activation_rules";
CREATE POLICY "admin_manage_bot_rules" ON public."ia_bot_activation_rules" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "admin_manage_bot_overrides" ON public."ia_bot_conversation_overrides";
CREATE POLICY "admin_manage_bot_overrides" ON public."ia_bot_conversation_overrides" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "admin_manage_bot_docs" ON public."ia_bot_documents";
CREATE POLICY "admin_manage_bot_docs" ON public."ia_bot_documents" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "admin_read_bot_logs" ON public."ia_bot_execution_logs";
CREATE POLICY "admin_read_bot_logs" ON public."ia_bot_execution_logs" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "admin_manage_bots" ON public."ia_bots";
CREATE POLICY "admin_manage_bots" ON public."ia_bots" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "internal_members_delete" ON public."internal_conversation_members";
CREATE POLICY "internal_members_delete" ON public."internal_conversation_members" AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_members_insert" ON public."internal_conversation_members";
CREATE POLICY "internal_members_insert" ON public."internal_conversation_members" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_members_select" ON public."internal_conversation_members";
CREATE POLICY "internal_members_select" ON public."internal_conversation_members" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_conv_insert" ON public."internal_conversations";
CREATE POLICY "internal_conv_insert" ON public."internal_conversations" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_conv_select" ON public."internal_conversations";
CREATE POLICY "internal_conv_select" ON public."internal_conversations" AS PERMISSIVE FOR SELECT TO public USING (((criado_por = auth.uid()) OR (EXISTS ( SELECT 1
   FROM internal_conversation_members icm
  WHERE ((icm.conversation_id = internal_conversations.id) AND (icm.user_id = auth.uid())))) OR (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text]))));
DROP POLICY IF EXISTS "internal_conv_update" ON public."internal_conversations";
CREATE POLICY "internal_conv_update" ON public."internal_conversations" AS PERMISSIVE FOR UPDATE TO public USING (((EXISTS ( SELECT 1
   FROM internal_conversation_members icm
  WHERE ((icm.conversation_id = internal_conversations.id) AND (icm.user_id = auth.uid())))) OR (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text]))));
DROP POLICY IF EXISTS "internal_reads_own" ON public."internal_message_reads";
CREATE POLICY "internal_reads_own" ON public."internal_message_reads" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "internal_messages_insert" ON public."internal_messages";
CREATE POLICY "internal_messages_insert" ON public."internal_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_messages_select" ON public."internal_messages";
CREATE POLICY "internal_messages_select" ON public."internal_messages" AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM internal_conversation_members icm
  WHERE ((icm.conversation_id = internal_messages.conversation_id) AND (icm.user_id = auth.uid())))) OR (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text]))));
DROP POLICY IF EXISTS "internal_post_comments_delete" ON public."internal_post_comments";
CREATE POLICY "internal_post_comments_delete" ON public."internal_post_comments" AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "internal_post_comments_insert" ON public."internal_post_comments";
CREATE POLICY "internal_post_comments_insert" ON public."internal_post_comments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "internal_post_comments_select" ON public."internal_post_comments";
CREATE POLICY "internal_post_comments_select" ON public."internal_post_comments" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "poll_votes_authenticated" ON public."internal_post_poll_votes";
CREATE POLICY "poll_votes_authenticated" ON public."internal_post_poll_votes" AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_post_reactions_delete" ON public."internal_post_reactions";
CREATE POLICY "internal_post_reactions_delete" ON public."internal_post_reactions" AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "internal_post_reactions_insert" ON public."internal_post_reactions";
CREATE POLICY "internal_post_reactions_insert" ON public."internal_post_reactions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "internal_post_reactions_select" ON public."internal_post_reactions";
CREATE POLICY "internal_post_reactions_select" ON public."internal_post_reactions" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_posts_delete" ON public."internal_posts";
CREATE POLICY "internal_posts_delete" ON public."internal_posts" AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "internal_posts_insert" ON public."internal_posts";
CREATE POLICY "internal_posts_insert" ON public."internal_posts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "internal_posts_select" ON public."internal_posts";
CREATE POLICY "internal_posts_select" ON public."internal_posts" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "internal_posts_update" ON public."internal_posts";
CREATE POLICY "internal_posts_update" ON public."internal_posts" AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can manage own typing" ON public."internal_typing_indicators";
CREATE POLICY "Users can manage own typing" ON public."internal_typing_indicators" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can see typing in their conversations" ON public."internal_typing_indicators";
CREATE POLICY "Users can see typing in their conversations" ON public."internal_typing_indicators" AS PERMISSIVE FOR SELECT TO public USING ((conversation_id IN ( SELECT internal_conversation_members.conversation_id
   FROM internal_conversation_members
  WHERE (internal_conversation_members.user_id = auth.uid()))));
DROP POLICY IF EXISTS "own_enrollments" ON public."learning_enrollments";
CREATE POLICY "own_enrollments" ON public."learning_enrollments" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "admin_manage_lessons" ON public."learning_lessons";
CREATE POLICY "admin_manage_lessons" ON public."learning_lessons" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "read_lessons" ON public."learning_lessons";
CREATE POLICY "read_lessons" ON public."learning_lessons" AS PERMISSIVE FOR SELECT TO public USING ((module_id IN ( SELECT learning_modules.id
   FROM learning_modules)));
DROP POLICY IF EXISTS "admin_manage_modules" ON public."learning_modules";
CREATE POLICY "admin_manage_modules" ON public."learning_modules" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "read_modules" ON public."learning_modules";
CREATE POLICY "read_modules" ON public."learning_modules" AS PERMISSIVE FOR SELECT TO public USING ((path_id IN ( SELECT learning_paths.id
   FROM learning_paths)));
DROP POLICY IF EXISTS "admin_manage_paths" ON public."learning_paths";
CREATE POLICY "admin_manage_paths" ON public."learning_paths" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "client_read_client_paths" ON public."learning_paths";
CREATE POLICY "client_read_client_paths" ON public."learning_paths" AS PERMISSIVE FOR SELECT TO public USING (((tipo = 'cliente'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'cliente'::text)));
DROP POLICY IF EXISTS "team_read_internal_paths" ON public."learning_paths";
CREATE POLICY "team_read_internal_paths" ON public."learning_paths" AS PERMISSIVE FOR SELECT TO public USING (((tipo = 'interno'::text) AND (( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'estrategista'::text, 'atendimento'::text]))));
DROP POLICY IF EXISTS "own_progress" ON public."learning_progress";
CREATE POLICY "own_progress" ON public."learning_progress" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "feedback_anon_insert" ON public."meeting_feedback";
CREATE POLICY "feedback_anon_insert" ON public."meeting_feedback" AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "feedback_auth_insert" ON public."meeting_feedback";
CREATE POLICY "feedback_auth_insert" ON public."meeting_feedback" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "feedback_auth_read" ON public."meeting_feedback";
CREATE POLICY "feedback_auth_read" ON public."meeting_feedback" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "meetings_auth_delete" ON public."meetings";
CREATE POLICY "meetings_auth_delete" ON public."meetings" AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text))))));
DROP POLICY IF EXISTS "meetings_auth_insert" ON public."meetings";
CREATE POLICY "meetings_auth_insert" ON public."meetings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "meetings_auth_read" ON public."meetings";
CREATE POLICY "meetings_auth_read" ON public."meetings" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "meetings_auth_update" ON public."meetings";
CREATE POLICY "meetings_auth_update" ON public."meetings" AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "users_own_notifications" ON public."notifications";
CREATE POLICY "users_own_notifications" ON public."notifications" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "client_insert_own_response" ON public."nps_responses";
CREATE POLICY "client_insert_own_response" ON public."nps_responses" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((respondido_por = auth.uid()));
DROP POLICY IF EXISTS "client_read_own_response" ON public."nps_responses";
CREATE POLICY "client_read_own_response" ON public."nps_responses" AS PERMISSIVE FOR SELECT TO public USING ((respondido_por = auth.uid()));
DROP POLICY IF EXISTS "team_read_nps_responses" ON public."nps_responses";
CREATE POLICY "team_read_nps_responses" ON public."nps_responses" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "admin_manage_nps_surveys" ON public."nps_surveys";
CREATE POLICY "admin_manage_nps_surveys" ON public."nps_surveys" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "client_own_surveys" ON public."nps_surveys";
CREATE POLICY "client_own_surveys" ON public."nps_surveys" AS PERMISSIVE FOR SELECT TO public USING ((client_id IN ( SELECT ca.client_id
   FROM client_assignments ca
  WHERE (ca.user_id = auth.uid()))));
DROP POLICY IF EXISTS "team_read_nps_surveys" ON public."nps_surveys";
CREATE POLICY "team_read_nps_surveys" ON public."nps_surveys" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "personal_notes_own" ON public."personal_notes";
CREATE POLICY "personal_notes_own" ON public."personal_notes" AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "positions_admin_write" ON public."positions";
CREATE POLICY "positions_admin_write" ON public."positions" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "positions_read_all" ON public."positions";
CREATE POLICY "positions_read_all" ON public."positions" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "products_insert" ON public."products";
CREATE POLICY "products_insert" ON public."products" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "products_select" ON public."products";
CREATE POLICY "products_select" ON public."products" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "products_update" ON public."products";
CREATE POLICY "products_update" ON public."products" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text, 'estrategista'::text])));
DROP POLICY IF EXISTS "produtos_comissao_admin_write" ON public."produtos_comissao";
CREATE POLICY "produtos_comissao_admin_write" ON public."produtos_comissao" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "produtos_comissao_select_auth" ON public."produtos_comissao";
CREATE POLICY "produtos_comissao_select_auth" ON public."produtos_comissao" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_admin_read_all" ON public."profiles";
CREATE POLICY "profiles_admin_read_all" ON public."profiles" AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "profiles_admin_write" ON public."profiles";
CREATE POLICY "profiles_admin_write" ON public."profiles" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "profiles_read_own" ON public."profiles";
CREATE POLICY "profiles_read_own" ON public."profiles" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Service role reads all push subscriptions" ON public."push_subscriptions";
CREATE POLICY "Service role reads all push subscriptions" ON public."push_subscriptions" AS PERMISSIVE FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public."push_subscriptions";
CREATE POLICY "Users manage own push subscriptions" ON public."push_subscriptions" AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "salfix_admin_write" ON public."salario_fixo_itens";
CREATE POLICY "salfix_admin_write" ON public."salario_fixo_itens" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "salfix_select" ON public."salario_fixo_itens";
CREATE POLICY "salfix_select" ON public."salario_fixo_itens" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM extratos_mensais e
  WHERE ((e.id = salario_fixo_itens.extrato_id) AND (((e.estrategista_id = auth.uid()) AND (e.status = ANY (ARRAY['aprovado'::text, 'pago'::text]))) OR (EXISTS ( SELECT 1
           FROM users
          WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))))))));
DROP POLICY IF EXISTS "sales_opportunities_delete" ON public."sales_opportunities";
CREATE POLICY "sales_opportunities_delete" ON public."sales_opportunities" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))));
DROP POLICY IF EXISTS "sales_opportunities_insert" ON public."sales_opportunities";
CREATE POLICY "sales_opportunities_insert" ON public."sales_opportunities" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = sales_opportunities.client_id) AND (ca.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "sales_opportunities_select" ON public."sales_opportunities";
CREATE POLICY "sales_opportunities_select" ON public."sales_opportunities" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = sales_opportunities.client_id) AND (ca.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "sales_opportunities_update" ON public."sales_opportunities";
CREATE POLICY "sales_opportunities_update" ON public."sales_opportunities" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = sales_opportunities.client_id) AND (ca.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "sales_opp_checklist_select" ON public."sales_opportunity_checklist";
CREATE POLICY "sales_opp_checklist_select" ON public."sales_opportunity_checklist" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM sales_opportunities o
  WHERE ((o.id = sales_opportunity_checklist.opportunity_id) AND (EXISTS ( SELECT 1
           FROM users u
          WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
                   FROM client_assignments ca
                  WHERE ((ca.client_id = o.client_id) AND (ca.user_id = auth.uid()))))))))))));
DROP POLICY IF EXISTS "sales_opp_checklist_write" ON public."sales_opportunity_checklist";
CREATE POLICY "sales_opp_checklist_write" ON public."sales_opportunity_checklist" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM sales_opportunities o
  WHERE ((o.id = sales_opportunity_checklist.opportunity_id) AND (EXISTS ( SELECT 1
           FROM users u
          WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
                   FROM client_assignments ca
                  WHERE ((ca.client_id = o.client_id) AND (ca.user_id = auth.uid())))))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_opportunities o
  WHERE ((o.id = sales_opportunity_checklist.opportunity_id) AND (EXISTS ( SELECT 1
           FROM users u
          WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
                   FROM client_assignments ca
                  WHERE ((ca.client_id = o.client_id) AND (ca.user_id = auth.uid()))))))))))));
DROP POLICY IF EXISTS "sales_opp_events_insert" ON public."sales_opportunity_events";
CREATE POLICY "sales_opp_events_insert" ON public."sales_opportunity_events" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = sales_opportunity_events.client_id) AND (ca.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "sales_opp_events_select" ON public."sales_opportunity_events";
CREATE POLICY "sales_opp_events_select" ON public."sales_opportunity_events" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND ((u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = sales_opportunity_events.client_id) AND (ca.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "sales_pipelines_select" ON public."sales_pipelines";
CREATE POLICY "sales_pipelines_select" ON public."sales_pipelines" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sales_pipelines_write" ON public."sales_pipelines";
CREATE POLICY "sales_pipelines_write" ON public."sales_pipelines" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text]))))));
DROP POLICY IF EXISTS "sales_stage_checklist_items_select" ON public."sales_stage_checklist_items";
CREATE POLICY "sales_stage_checklist_items_select" ON public."sales_stage_checklist_items" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sales_stage_checklist_items_write" ON public."sales_stage_checklist_items";
CREATE POLICY "sales_stage_checklist_items_write" ON public."sales_stage_checklist_items" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text]))))));
DROP POLICY IF EXISTS "sales_stages_select" ON public."sales_stages";
CREATE POLICY "sales_stages_select" ON public."sales_stages" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sales_stages_write" ON public."sales_stages";
CREATE POLICY "sales_stages_write" ON public."sales_stages" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text]))))));
DROP POLICY IF EXISTS "social_snapshots_select" ON public."social_snapshots";
CREATE POLICY "social_snapshots_select" ON public."social_snapshots" AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.perfil = ANY (ARRAY['admin'::text, 'gerente'::text]))))) OR (EXISTS ( SELECT 1
   FROM client_assignments ca
  WHERE ((ca.client_id = social_snapshots.client_id) AND (ca.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "subareas_admin_write" ON public."subareas";
CREATE POLICY "subareas_admin_write" ON public."subareas" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "subareas_read_all" ON public."subareas";
CREATE POLICY "subareas_read_all" ON public."subareas" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tenants_admin_all" ON public."tenants";
CREATE POLICY "tenants_admin_all" ON public."tenants" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "tenants_read_all" ON public."tenants";
CREATE POLICY "tenants_read_all" ON public."tenants" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_manage_instance_assignments" ON public."user_instance_assignments";
CREATE POLICY "admin_manage_instance_assignments" ON public."user_instance_assignments" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = ANY (ARRAY['admin'::text, 'gerente'::text])));
DROP POLICY IF EXISTS "own_instance_assignments" ON public."user_instance_assignments";
CREATE POLICY "own_instance_assignments" ON public."user_instance_assignments" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "user_roles_admin_read_all" ON public."user_roles";
CREATE POLICY "user_roles_admin_read_all" ON public."user_roles" AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "user_roles_admin_write" ON public."user_roles";
CREATE POLICY "user_roles_admin_write" ON public."user_roles" AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "user_roles_read_own" ON public."user_roles";
CREATE POLICY "user_roles_read_own" ON public."user_roles" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "service_insert" ON public."users";
CREATE POLICY "service_insert" ON public."users" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
DROP POLICY IF EXISTS "users_select" ON public."users";
CREATE POLICY "users_select" ON public."users" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
DROP POLICY IF EXISTS "users_update_self_or_admin" ON public."users";
CREATE POLICY "users_update_self_or_admin" ON public."users" AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = auth.uid()) OR (( SELECT users_1.perfil
   FROM users users_1
  WHERE (users_1.id = auth.uid())) = 'admin'::text))) WITH CHECK (((id = auth.uid()) OR (( SELECT users_1.perfil
   FROM users users_1
  WHERE (users_1.id = auth.uid())) = 'admin'::text)));
DROP POLICY IF EXISTS "vendas_pendentes_atendimento_all" ON public."vendas_pendentes";
CREATE POLICY "vendas_pendentes_atendimento_all" ON public."vendas_pendentes" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = ANY (ARRAY['admin'::text, 'gerente'::text, 'atendimento'::text]))))));
DROP POLICY IF EXISTS "admin_all_warmup_groups" ON public."wa_warmup_groups";
CREATE POLICY "admin_all_warmup_groups" ON public."wa_warmup_groups" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "admin_read_warmup_logs" ON public."wa_warmup_logs";
CREATE POLICY "admin_read_warmup_logs" ON public."wa_warmup_logs" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "admin_view_webhook_logs" ON public."webhook_logs";
CREATE POLICY "admin_view_webhook_logs" ON public."webhook_logs" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "admin_manage_webhooks" ON public."webhooks";
CREATE POLICY "admin_manage_webhooks" ON public."webhooks" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.perfil = 'admin'::text)))));
DROP POLICY IF EXISTS "admin_manage_instances" ON public."whatsapp_instances";
CREATE POLICY "admin_manage_instances" ON public."whatsapp_instances" AS PERMISSIVE FOR ALL TO public USING ((( SELECT users.perfil
   FROM users
  WHERE (users.id = auth.uid())) = 'admin'::text));
DROP POLICY IF EXISTS "chat_read_instances" ON public."whatsapp_instances";
CREATE POLICY "chat_read_instances" ON public."whatsapp_instances" AS PERMISSIVE FOR SELECT TO public USING (user_can_access_instance(id));
-- GRANTs essenciais pro service_role (Edge Functions)
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role, postgres;
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
-- Garantia pra tabelas/funções criadas no futuro
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role, postgres;
