-- ============================================================================
-- App Atendimento — 1ª versão: Social Media
-- ============================================================================
-- Fase 4 do roadmap da modularização (docs/reestruturacao/ROADMAP-MODULARIZACAO.md).
--
-- O que o app resolve: hoje o pedido de um cliente ("preciso de 4 reels essa
-- semana") vive no WhatsApp e some no meio da conversa. Não há onde registrar o
-- que foi pedido, quem está fazendo, para quando, nem se o cliente aprovou.
-- Este app dá endereço a isso: a DEMANDA.
--
-- Estrutura (tudo por tenant, RLS tenant_isolation no padrão do projeto):
--   atendimento_tipos       — tipos de solicitação (Reels, Carrossel, Story...)
--   atendimento_etapas      — etapas do fluxo, viram as colunas do kanban
--   atendimento_demandas    — a demanda em si
--   atendimento_comentarios — conversa da equipe dentro da demanda
--   atendimento_historico   — trilha de auditoria (etapa/responsável/prazo)
--
-- Por que tipos e etapas são TABELAS e não enum: o app precisa servir a outros
-- segmentos depois (clínica, escritório, agência). Trocando o seed de tipos e
-- etapas, o mesmo app atende outro segmento sem migration nova. Social Media é
-- só o primeiro conjunto semeado.
--
-- Reversível: DROP TABLE das 5 tabelas em ordem inversa (CASCADE).
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING em tudo.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Tipos de solicitação
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimento_tipos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  ordem       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

COMMENT ON TABLE public.atendimento_tipos IS
  'Tipos de solicitação do app Atendimento (ex: Reels, Carrossel). Configurável por tenant — é o que adapta o app ao segmento.';

-- ---------------------------------------------------------------------------
-- 2) Etapas do fluxo (colunas do kanban)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimento_etapas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  cor         TEXT NOT NULL DEFAULT 'slate',
  ordem       INT NOT NULL DEFAULT 0,
  -- Etapa final encerra a demanda: é o que faz o painel parar de cobrar prazo
  -- e o que alimenta a métrica de entregas concluídas.
  is_final    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

COMMENT ON TABLE public.atendimento_etapas IS
  'Etapas do fluxo de atendimento (colunas do kanban). Configurável por tenant. is_final = etapa que encerra a demanda.';

-- ---------------------------------------------------------------------------
-- 3) Demanda
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.atendimento_demandas_codigo_seq;

CREATE TABLE IF NOT EXISTS public.atendimento_demandas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Código legível para a equipe citar a demanda no WhatsApp sem colar um UUID.
  codigo        TEXT NOT NULL UNIQUE
                  DEFAULT ('DEM-' || lpad(nextval('public.atendimento_demandas_codigo_seq')::text, 5, '0')),

  cliente_id    UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  tipo_id       UUID REFERENCES public.atendimento_tipos(id) ON DELETE SET NULL,
  -- Etapa nunca é apagada com demanda dentro: a exclusão exige realocar antes
  -- (regra do brief §12, aplicada aqui pelo RESTRICT).
  etapa_id      UUID REFERENCES public.atendimento_etapas(id) ON DELETE RESTRICT,

  titulo        TEXT NOT NULL,
  descricao     TEXT,
  prioridade    TEXT NOT NULL DEFAULT 'media'
                  CHECK (prioridade IN ('baixa','media','alta','urgente')),
  prazo         DATE,
  responsavel_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Aprovação do cliente, separada da etapa: uma demanda pode estar "em revisão"
  -- e já ter voltado com pedido de ajuste — são duas informações diferentes.
  aprovacao     TEXT NOT NULL DEFAULT 'nao_enviado'
                  CHECK (aprovacao IN ('nao_enviado','aguardando','aprovado','ajustes')),
  aprovacao_obs TEXT,

  -- [{ storage_path, nome_original, mime_type, tamanho_bytes }]
  anexos        JSONB NOT NULL DEFAULT '[]'::jsonb,

  criado_por    UUID REFERENCES public.users(id) DEFAULT auth.uid(),
  concluida_em  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.atendimento_demandas IS
  'Demanda de atendimento (multi-tenant). Substitui o pedido solto no WhatsApp: tem dono, prazo, etapa e aprovação.';

CREATE INDEX IF NOT EXISTS idx_atend_demandas_tenant      ON public.atendimento_demandas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_atend_demandas_etapa       ON public.atendimento_demandas(tenant_id, etapa_id);
CREATE INDEX IF NOT EXISTS idx_atend_demandas_cliente     ON public.atendimento_demandas(tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_atend_demandas_responsavel ON public.atendimento_demandas(tenant_id, responsavel_id);
CREATE INDEX IF NOT EXISTS idx_atend_demandas_prazo       ON public.atendimento_demandas(tenant_id, prazo);

-- ---------------------------------------------------------------------------
-- 4) Comentários
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimento_comentarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  demanda_id  UUID NOT NULL REFERENCES public.atendimento_demandas(id) ON DELETE CASCADE,
  autor_id    UUID REFERENCES public.users(id) DEFAULT auth.uid(),
  texto       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atend_coment_demanda ON public.atendimento_comentarios(demanda_id, created_at);

-- ---------------------------------------------------------------------------
-- 5) Histórico (trilha de auditoria)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimento_historico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  demanda_id  UUID NOT NULL REFERENCES public.atendimento_demandas(id) ON DELETE CASCADE,
  autor_id    UUID REFERENCES public.users(id) DEFAULT auth.uid(),
  campo       TEXT NOT NULL,          -- 'etapa' | 'responsavel' | 'prazo' | 'prioridade' | 'aprovacao'
  valor_de    TEXT,
  valor_para  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atend_hist_demanda ON public.atendimento_historico(demanda_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers: tenant_id automático + updated_at + histórico + conclusão
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['atendimento_tipos','atendimento_etapas','atendimento_demandas',
                           'atendimento_comentarios','atendimento_historico']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_tenant_id BEFORE INSERT ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id()', t);
  END LOOP;
END $$;

-- updated_at + carimbo de conclusão quando entra numa etapa final.
CREATE OR REPLACE FUNCTION public.tg_atendimento_demanda_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE v_final boolean;
BEGIN
  NEW.updated_at := now();

  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    SELECT is_final INTO v_final FROM public.atendimento_etapas WHERE id = NEW.etapa_id;
    IF COALESCE(v_final, false) THEN
      NEW.concluida_em := COALESCE(NEW.concluida_em, now());
    ELSE
      -- Voltou para uma etapa de trabalho: deixa de estar concluída.
      NEW.concluida_em := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS atendimento_demanda_touch ON public.atendimento_demandas;
CREATE TRIGGER atendimento_demanda_touch
  BEFORE UPDATE ON public.atendimento_demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_atendimento_demanda_touch();

-- Registra no histórico o que mudou. Sem isso, "quem moveu essa demanda?" não
-- tem resposta — e é a primeira pergunta quando um prazo estoura.
CREATE OR REPLACE FUNCTION public.tg_atendimento_demanda_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    INSERT INTO public.atendimento_historico (tenant_id, demanda_id, campo, valor_de, valor_para)
    VALUES (NEW.tenant_id, NEW.id, 'etapa',
            (SELECT nome FROM public.atendimento_etapas WHERE id = OLD.etapa_id),
            (SELECT nome FROM public.atendimento_etapas WHERE id = NEW.etapa_id));
  END IF;

  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    INSERT INTO public.atendimento_historico (tenant_id, demanda_id, campo, valor_de, valor_para)
    VALUES (NEW.tenant_id, NEW.id, 'responsavel',
            (SELECT nome FROM public.users WHERE id = OLD.responsavel_id),
            (SELECT nome FROM public.users WHERE id = NEW.responsavel_id));
  END IF;

  IF NEW.prazo IS DISTINCT FROM OLD.prazo THEN
    INSERT INTO public.atendimento_historico (tenant_id, demanda_id, campo, valor_de, valor_para)
    VALUES (NEW.tenant_id, NEW.id, 'prazo', OLD.prazo::text, NEW.prazo::text);
  END IF;

  IF NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN
    INSERT INTO public.atendimento_historico (tenant_id, demanda_id, campo, valor_de, valor_para)
    VALUES (NEW.tenant_id, NEW.id, 'prioridade', OLD.prioridade, NEW.prioridade);
  END IF;

  IF NEW.aprovacao IS DISTINCT FROM OLD.aprovacao THEN
    INSERT INTO public.atendimento_historico (tenant_id, demanda_id, campo, valor_de, valor_para)
    VALUES (NEW.tenant_id, NEW.id, 'aprovacao', OLD.aprovacao, NEW.aprovacao);
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS atendimento_demanda_historico ON public.atendimento_demandas;
CREATE TRIGGER atendimento_demanda_historico
  AFTER UPDATE ON public.atendimento_demandas
  FOR EACH ROW EXECUTE FUNCTION public.tg_atendimento_demanda_historico();

-- ---------------------------------------------------------------------------
-- RLS — isolamento por tenant em todas as 5 tabelas
-- ---------------------------------------------------------------------------
ALTER TABLE public.atendimento_tipos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_etapas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_demandas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_historico   ENABLE ROW LEVEL SECURITY;

-- Tipos e etapas: todo mundo do tenant lê (precisa para montar a tela);
-- só admin configura.
DROP POLICY IF EXISTS atendimento_tipos_select ON public.atendimento_tipos;
CREATE POLICY atendimento_tipos_select ON public.atendimento_tipos
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS atendimento_tipos_write_admin ON public.atendimento_tipos;
CREATE POLICY atendimento_tipos_write_admin ON public.atendimento_tipos
  FOR ALL TO authenticated
  USING      (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin())
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin());

DROP POLICY IF EXISTS atendimento_etapas_select ON public.atendimento_etapas;
CREATE POLICY atendimento_etapas_select ON public.atendimento_etapas
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS atendimento_etapas_write_admin ON public.atendimento_etapas;
CREATE POLICY atendimento_etapas_write_admin ON public.atendimento_etapas
  FOR ALL TO authenticated
  USING      (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin())
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin());

-- Demandas: quem tem permissão no recurso 'atendimento' opera; ver exige 'ver',
-- criar/editar exige 'editar'. Admin passa sempre (has_permissao já garante).
DROP POLICY IF EXISTS atendimento_demandas_select ON public.atendimento_demandas;
CREATE POLICY atendimento_demandas_select ON public.atendimento_demandas
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND public.has_permissao('atendimento','ver')
  );

DROP POLICY IF EXISTS atendimento_demandas_insert ON public.atendimento_demandas;
CREATE POLICY atendimento_demandas_insert ON public.atendimento_demandas
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND public.has_permissao('atendimento','editar')
  );

DROP POLICY IF EXISTS atendimento_demandas_update ON public.atendimento_demandas;
CREATE POLICY atendimento_demandas_update ON public.atendimento_demandas
  FOR UPDATE TO authenticated
  USING      (tenant_id = (SELECT public.get_user_tenant_id()) AND public.has_permissao('atendimento','editar'))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.has_permissao('atendimento','editar'));

-- Excluir demanda: só admin. Apagar histórico de trabalho não é operação de rotina.
DROP POLICY IF EXISTS atendimento_demandas_delete_admin ON public.atendimento_demandas;
CREATE POLICY atendimento_demandas_delete_admin ON public.atendimento_demandas
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.is_admin());

-- Comentários: lê quem lê a demanda; escreve quem edita; apaga o próprio autor.
DROP POLICY IF EXISTS atendimento_comentarios_select ON public.atendimento_comentarios;
CREATE POLICY atendimento_comentarios_select ON public.atendimento_comentarios
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.has_permissao('atendimento','ver'));

DROP POLICY IF EXISTS atendimento_comentarios_insert ON public.atendimento_comentarios;
CREATE POLICY atendimento_comentarios_insert ON public.atendimento_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND public.has_permissao('atendimento','editar')
    AND autor_id = auth.uid()
  );

DROP POLICY IF EXISTS atendimento_comentarios_delete ON public.atendimento_comentarios;
CREATE POLICY atendimento_comentarios_delete ON public.atendimento_comentarios
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND (autor_id = auth.uid() OR public.is_admin())
  );

-- Histórico: leitura apenas. Quem escreve é o trigger (SECURITY DEFINER).
DROP POLICY IF EXISTS atendimento_historico_select ON public.atendimento_historico;
CREATE POLICY atendimento_historico_select ON public.atendimento_historico
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.has_permissao('atendimento','ver'));

-- ---------------------------------------------------------------------------
-- Permissões do app novo (recurso 'atendimento')
-- ---------------------------------------------------------------------------
-- Quem trabalha com social media hoje: atendimento e estrategista operam;
-- gerente opera; admin já passa por '*'. Ninguém mais enxerga o app.
--
-- ATENÇÃO — 'ver' e 'editar' são semeados JUNTOS de propósito. has_permissao()
-- compara a ação exata (`pa.acao = p_acao OR pa.acao = 'admin'`), então quem tem
-- só 'editar' NÃO passa numa checagem de 'ver'. A escada "admin ⊃ editar ⊃ ver"
-- descrita no roadmap não existe na função. Semear as duas linhas é a correção
-- local e sem risco; mudar has_permissao() mexeria no gate de todos os apps já
-- em produção e fica como task própria da Fase 2.
INSERT INTO public.permissoes_app (tenant_id, perfil, recurso, acao)
SELECT t.id, v.perfil, v.recurso, v.acao
  FROM public.tenants t
 CROSS JOIN (VALUES
    ('gerente',      'atendimento', 'ver'),
    ('gerente',      'atendimento', 'editar'),
    ('estrategista', 'atendimento', 'ver'),
    ('estrategista', 'atendimento', 'editar'),
    ('atendimento',  'atendimento', 'ver'),
    ('atendimento',  'atendimento', 'editar')
 ) AS v(perfil, recurso, acao)
ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;

-- Tenant novo nasce com as mesmas permissões (reescreve o seed da Onda 3
-- acrescentando as 3 linhas de 'atendimento' — nada foi removido).
CREATE OR REPLACE FUNCTION public.seed_permissoes_on_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.permissoes_app (tenant_id, perfil, recurso, acao)
  SELECT NEW.id, v.perfil, v.recurso, v.acao
    FROM (VALUES
      ('admin',        '*',                    'admin'),
      ('gerente',      'dashboard',            'ver'),
      ('gerente',      'contratos',            'editar'),
      ('gerente',      'contratos.onboarding', 'editar'),
      ('gerente',      'chat',                 'editar'),
      ('gerente',      'clientes',             'editar'),
      ('gerente',      'colaboradores',        'ver'),
      ('gerente',      'cobranca',             'ver'),
      ('gerente',      'atendimento',          'ver'),
      ('gerente',      'atendimento',          'editar'),
      ('estrategista', 'dashboard',            'ver'),
      ('estrategista', 'clientes',             'editar'),
      ('estrategista', 'chat',                 'editar'),
      ('estrategista', 'atendimento',          'ver'),
      ('estrategista', 'atendimento',          'editar'),
      ('atendimento',  'dashboard',            'ver'),
      ('atendimento',  'clientes',             'ver'),
      ('atendimento',  'chat',                 'editar'),
      ('atendimento',  'contratos.onboarding', 'editar'),
      ('atendimento',  'atendimento',          'ver'),
      ('atendimento',  'atendimento',          'editar'),
      ('cliente',      'portal',               'ver'),
      ('admin_cobranca',  'cobranca',          'admin'),
      ('admin_cobranca',  'dashboard',         'ver'),
      ('agente_cobranca', 'cobranca',          'editar'),
      ('agente_chat',     'chat',              'editar')
    ) AS v(perfil, recurso, acao)
  ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed do segmento Social Media (tipos + etapas) para os tenants existentes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_atendimento_social_media(p_tenant UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.atendimento_tipos (tenant_id, nome, descricao, ordem)
  VALUES
    (p_tenant, 'Reels',      'Vídeo curto para o feed.',                 10),
    (p_tenant, 'Carrossel',  'Post de múltiplas imagens.',               20),
    (p_tenant, 'Story',      'Publicação temporária.',                   30),
    (p_tenant, 'Post único', 'Imagem única no feed.',                    40),
    (p_tenant, 'Campanha',   'Conjunto de peças com um objetivo comum.', 50),
    (p_tenant, 'Outro',      'Qualquer demanda fora dos tipos acima.',   60)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  INSERT INTO public.atendimento_etapas (tenant_id, nome, cor, ordem, is_final)
  VALUES
    (p_tenant, 'Solicitado',           'slate',   10, false),
    (p_tenant, 'Em produção',          'blue',    20, false),
    (p_tenant, 'Em revisão interna',   'amber',   30, false),
    (p_tenant, 'Aguardando aprovação', 'violet',  40, false),
    (p_tenant, 'Aprovado',             'emerald', 50, false),
    (p_tenant, 'Publicado',            'green',   60, true)
  ON CONFLICT (tenant_id, nome) DO NOTHING;
END;
$$;

-- Tenant novo já nasce com o fluxo de Social Media pronto.
CREATE OR REPLACE FUNCTION public.tg_seed_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_atendimento_social_media(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_atendimento_on_tenant_insert ON public.tenants;
CREATE TRIGGER seed_atendimento_on_tenant_insert
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_atendimento();

-- Backfill dos tenants já existentes.
SELECT public.seed_atendimento_social_media(t.id) FROM public.tenants t;

-- ---------------------------------------------------------------------------
-- Anexos da demanda: bucket privado, isolado por tenant
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'atendimento-anexos', 'atendimento-anexos', false, 20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
        'video/mp4','video/quicktime','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Caminho: atendimento/{demanda_id}/arquivo — o dono sai da demanda.
CREATE OR REPLACE FUNCTION public.tenant_do_anexo_atendimento(p_object_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT d.tenant_id
    FROM public.atendimento_demandas d
   WHERE (storage.foldername(p_object_name))[2] = d.id::text
   LIMIT 1;
$$;

-- Toda função nova nasce executável por PUBLIC no Postgres — e REVOKE de
-- anon/authenticated não tira esse grant implícito. Foi assim que a auditoria
-- de 27/07 achou um P0. Função sensível revoga de PUBLIC explicitamente.
REVOKE ALL ON FUNCTION public.tenant_do_anexo_atendimento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_do_anexo_atendimento(text) TO authenticated;

DROP POLICY IF EXISTS atendimento_anexos_insert ON storage.objects;
CREATE POLICY atendimento_anexos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'atendimento-anexos'
    AND public.has_permissao('atendimento','editar')
  );

DROP POLICY IF EXISTS atendimento_anexos_select ON storage.objects;
CREATE POLICY atendimento_anexos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'atendimento-anexos'
    AND public.has_permissao('atendimento','ver')
    AND public.tenant_do_anexo_atendimento(name) = (SELECT public.get_user_tenant_id())
  );

DROP POLICY IF EXISTS atendimento_anexos_delete ON storage.objects;
CREATE POLICY atendimento_anexos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'atendimento-anexos'
    AND public.has_permissao('atendimento','editar')
    AND public.tenant_do_anexo_atendimento(name) = (SELECT public.get_user_tenant_id())
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
