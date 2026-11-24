-- ============================================================================
-- Linha de base (parte 1): tabelas que a produção criou fora das migrações
-- ============================================================================
-- Por quê: a produção nasceu no editor do Lovable/SQL Editor e algumas tabelas
-- foram criadas à mão, sem migração. As migrações seguintes (20260408000001,
-- 20260505192242, 20260507000002/4/5) já usam essas tabelas, então um projeto
-- Supabase NOVO, montado só com supabase/migrations em ordem, parava aqui.
--
-- O que faz: cria as tabelas no formato da produção (snapshot de 19/05/2026,
-- supabase/SETUP_COMPLETE.sql), só se ainda não existirem. Chaves estrangeiras,
-- índices, políticas e o resto entram na linha de base de 19/05
-- (20260519165000_linha_de_base_producao_2026_05_19.sql).
--
-- Produção: não precisa rodar (as tabelas já existem; seria tudo "já existe").
-- Para alinhar o histórico, marque como aplicada:
--   supabase migration repair --status applied 20260408000000
-- ============================================================================

CREATE TABLE IF NOT EXISTS public."chat_message_reads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_read_message_id" uuid
);

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

CREATE TABLE IF NOT EXISTS public."internal_post_poll_votes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "option_index" integer NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."chat_contact_clients" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);

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

DO $c$ BEGIN
  ALTER TABLE public.chat_message_reads ADD CONSTRAINT chat_message_reads_pkey PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition OR duplicate_object OR duplicate_table THEN NULL; END $c$;
DO $c$ BEGIN
  ALTER TABLE public.chat_message_reads ADD CONSTRAINT chat_message_reads_conversation_id_user_id_key UNIQUE (conversation_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $c$;
DO $c$ BEGIN
  ALTER TABLE public.internal_posts ADD CONSTRAINT internal_posts_pkey PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition OR duplicate_object OR duplicate_table THEN NULL; END $c$;
DO $c$ BEGIN
  ALTER TABLE public.internal_post_poll_votes ADD CONSTRAINT internal_post_poll_votes_pkey PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition OR duplicate_object OR duplicate_table THEN NULL; END $c$;
DO $c$ BEGIN
  ALTER TABLE public.internal_post_poll_votes ADD CONSTRAINT internal_post_poll_votes_post_id_user_id_key UNIQUE (post_id, user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $c$;
DO $c$ BEGIN
  ALTER TABLE public.chat_contact_clients ADD CONSTRAINT chat_contact_clients_pkey PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition OR duplicate_object OR duplicate_table THEN NULL; END $c$;
DO $c$ BEGIN
  ALTER TABLE public.chat_weekly_reports ADD CONSTRAINT chat_weekly_reports_pkey PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition OR duplicate_object OR duplicate_table THEN NULL; END $c$;

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_post_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_contact_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_weekly_reports ENABLE ROW LEVEL SECURITY;
