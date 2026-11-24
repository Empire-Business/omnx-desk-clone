-- ============================================================================
-- Linha de base (parte 4): objetos que a produção criou fora das migrações
-- depois de 19/05/2026
-- ============================================================================
-- Por quê: as migrações de multiempresa (20260723…) e da fase C (20260804…)
-- mexem em tabelas e funções que nunca tiveram migração: o módulo de
-- prestadores PJ (pj_prestadores, pj_entregas, pj_notas e o bucket pj-notas),
-- os papéis de comissão (comissoes_papeis e suas funções), a sequência e a
-- função de número de contrato, e algumas colunas. Num projeto Supabase novo a
-- cadeia parava em 20260804121000 e 20260804211000.
--
-- De onde veio cada definição: colunas e tipos do src/integrations/supabase/
-- types.ts (gerado da produção em 06/11/2026) e do uso nas migrações e na
-- função pj_registrar_nota (supabase/functions/_shared/fixtures/
-- human-rpc-production-base.json). Onde a produção não deixa ver o corpo da
-- função, a versão daqui é a regra documentada no código (comentários de
-- wa-agente-escopo.ts e das migrações). Nada aqui troca objeto existente:
-- tabela/coluna só se faltar, função só se não existir.
--
-- tenant_id NÃO entra aqui de propósito: a fase A (20260723120000) acrescenta
-- e preenche, a fase A2 põe NOT NULL e a fase B liga o isolamento, como foi na
-- produção.
--
-- Produção: não muda nada (tudo já existe). Para alinhar o histórico:
--   supabase migration repair --status applied 20260722235000
-- ============================================================================

SET check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- 1. Prestadores PJ (módulo sem tela no app; usado por RPC e pelo storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pj_prestadores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  nome            text NOT NULL,
  razao_social    text,
  cnpj            text,
  chave_pix       text,
  dados_bancarios text,
  tipo            text NOT NULL DEFAULT 'pj',
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pj_entregas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id   uuid NOT NULL REFERENCES public.pj_prestadores(id) ON DELETE CASCADE,
  titulo         text NOT NULL,
  descricao      text,
  competencia    text,
  valor          numeric(12,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'aguardando_nota',
  motivo_recusa  text,
  aprovado_em    timestamptz,
  aprovado_por   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  pago_em        timestamptz,
  criado_por     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pj_notas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id     uuid NOT NULL REFERENCES public.pj_entregas(id) ON DELETE CASCADE,
  prestador_id   uuid NOT NULL REFERENCES public.pj_prestadores(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  nome_original  text,
  mime_type      text,
  tamanho_bytes  bigint,
  enviado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pj_prestadores_user ON public.pj_prestadores(user_id);
CREATE INDEX IF NOT EXISTS idx_pj_entregas_prestador ON public.pj_entregas(prestador_id);
CREATE INDEX IF NOT EXISTS idx_pj_notas_entrega ON public.pj_notas(entrega_id);

-- RLS ligado e sem política permissiva: só funções SECURITY DEFINER e o
-- service_role mexem. A fase B acrescenta o isolamento por empresa.
ALTER TABLE public.pj_prestadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pj_entregas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pj_notas       ENABLE ROW LEVEL SECURITY;

-- O prestador logado é dono deste cadastro?
DO $f$ BEGIN
  IF to_regprocedure('public.pj_owns_prestador(uuid)') IS NULL THEN
    EXECUTE $def$
      CREATE FUNCTION public.pj_owns_prestador(p uuid)
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO public, pg_temp
      AS $body$
        SELECT EXISTS (
          SELECT 1 FROM public.pj_prestadores
          WHERE id = p AND user_id = auth.uid() AND ativo
        );
      $body$;
    $def$;
    REVOKE EXECUTE ON FUNCTION public.pj_owns_prestador(uuid) FROM PUBLIC, anon;
  END IF;
END $f$;

-- Bucket privado das notas fiscais dos prestadores (políticas na fase C).
DO $b$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('pj-notas', 'pj-notas', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $b$;

-- ---------------------------------------------------------------------------
-- 2. Papéis de comissão
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissoes_papeis (
  user_id        uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  papel          text NOT NULL CHECK (papel IN ('admin', 'revisor', 'estrategista')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comissoes_papeis ENABLE ROW LEVEL SECURITY;

-- Papel padrão de comissão a partir do perfil do usuário (NULL = sem papel).
DO $f$ BEGIN
  IF to_regprocedure('public.comissoes_papel_do_perfil(text)') IS NULL THEN
    EXECUTE $def$
      CREATE FUNCTION public.comissoes_papel_do_perfil(p_perfil text)
      RETURNS text
      LANGUAGE sql IMMUTABLE
      AS $body$
        SELECT CASE lower(coalesce(p_perfil, ''))
          WHEN 'admin'        THEN 'admin'
          WHEN 'gerente'      THEN 'revisor'
          WHEN 'estrategista' THEN 'estrategista'
          ELSE NULL
        END;
      $body$;
    $def$;
  END IF;
END $f$;

-- Gestor de comissões: perfil admin/gerente ou papel admin/revisor (mesma regra
-- de supabase/functions/_shared/wa-agente-escopo.ts).
DO $f$ BEGIN
  IF to_regprocedure('public.is_comissoes_gestor()') IS NULL THEN
    EXECUTE $def$
      CREATE FUNCTION public.is_comissoes_gestor()
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO public, pg_temp
      AS $body$
        SELECT EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.perfil IN ('admin', 'gerente')
        ) OR EXISTS (
          SELECT 1 FROM public.comissoes_papeis p
          WHERE p.user_id = auth.uid() AND p.papel IN ('admin', 'revisor')
        );
      $body$;
    $def$;
    REVOKE EXECUTE ON FUNCTION public.is_comissoes_gestor() FROM PUBLIC, anon;
  END IF;
END $f$;

DO $f$ BEGIN
  IF to_regprocedure('public.is_comissoes_admin()') IS NULL THEN
    EXECUTE $def$
      CREATE FUNCTION public.is_comissoes_admin()
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO public, pg_temp
      AS $body$
        SELECT EXISTS (
          SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.perfil = 'admin'
        ) OR EXISTS (
          SELECT 1 FROM public.comissoes_papeis p WHERE p.user_id = auth.uid() AND p.papel = 'admin'
        );
      $body$;
    $def$;
    REVOKE EXECUTE ON FUNCTION public.is_comissoes_admin() FROM PUBLIC, anon;
  END IF;
END $f$;

-- ---------------------------------------------------------------------------
-- 3. Número de contrato (resto de um módulo antigo: na produção a função existe
--    sem gatilho ligado; a migração 20260804211000 só fixa o search_path dela)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.contratos_numero_seq;

DO $f$ BEGIN
  IF to_regprocedure('public.set_contrato_numero()') IS NULL THEN
    EXECUTE $def$
      CREATE FUNCTION public.set_contrato_numero()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        -- Sem coluna de número em contratos hoje: não altera a linha.
        RETURN NEW;
      END;
      $body$;
    $def$;
  END IF;
END $f$;

-- ---------------------------------------------------------------------------
-- 4. Conferência do segredo das chamadas internas (gatilho do banco → função)
--    Os gatilhos mandam o segredo do cofre 'notify_webhook_secret' no cabeçalho
--    x-notify-secret; as funções conferem por esta RPC (só service_role).
-- ---------------------------------------------------------------------------
DO $f$ BEGIN
  IF to_regprocedure('public.notify_secret_matches(text)') IS NULL THEN
    EXECUTE $def$
      CREATE FUNCTION public.notify_secret_matches(candidate text)
      RETURNS boolean
      LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path TO public, pg_temp
      AS $body$
      DECLARE
        v_segredo text;
      BEGIN
        IF candidate IS NULL OR length(candidate) < 16 OR length(candidate) > 512 THEN
          RETURN false;
        END IF;
        SELECT decrypted_secret INTO v_segredo
          FROM vault.decrypted_secrets
         WHERE name = 'notify_webhook_secret'
         LIMIT 1;
        IF v_segredo IS NULL OR length(v_segredo) < 16 THEN
          RETURN false;  -- sem segredo no cofre, ninguém entra
        END IF;
        RETURN extensions.digest(candidate, 'sha256') = extensions.digest(v_segredo, 'sha256');
      END;
      $body$;
    $def$;
    REVOKE EXECUTE ON FUNCTION public.notify_secret_matches(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.notify_secret_matches(text) TO service_role;
  END IF;
END $f$;

-- ---------------------------------------------------------------------------
-- 5. Colunas que o app usa e nenhuma migração criou
-- ---------------------------------------------------------------------------
ALTER TABLE public.users             ADD COLUMN IF NOT EXISTS chave_pix text;
ALTER TABLE public.extratos_mensais  ADD COLUMN IF NOT EXISTS estrategista_pix text;
ALTER TABLE public.comissoes         ADD COLUMN IF NOT EXISTS eh_bonus boolean NOT NULL DEFAULT false;
ALTER TABLE public.vendas_pendentes  ADD COLUMN IF NOT EXISTS historico_edicoes jsonb NOT NULL DEFAULT '[]'::jsonb;
