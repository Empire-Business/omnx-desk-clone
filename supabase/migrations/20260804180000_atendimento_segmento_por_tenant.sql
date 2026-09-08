-- ============================================================================
-- Segmento de atendimento por empresa + seed por segmento
-- ============================================================================
-- Pedido do usuário (04/08/2026): "cada empresa vai ter uma demanda, o cara pode
-- ser de uma clínica e ter abas e métricas diferentes".
--
-- O que muda entre ramos não é o motor da demanda — é o **vocabulário** (peça vs
-- paciente vs processo), as **abas** que fazem sentido e as **métricas** que
-- importam. Uma clínica não tem "aguardando aprovação do cliente"; um escritório
-- vive de prazo. Por isso o segmento vira dado da empresa, e a interface se
-- adapta a partir dele (catálogo em `src/lib/atendimentoSegmentos.ts`).
--
-- Fica em `tenants` e não numa tabela de config do app porque é característica
-- da empresa: se amanhã outro módulo precisar saber o ramo do cliente, já está lá.
--
-- Aplicada em produção em 04/08/2026 via Management API.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS atendimento_segmento TEXT NOT NULL DEFAULT 'social_media';

COMMENT ON COLUMN public.tenants.atendimento_segmento IS
  'Segmento do app Atendimento (social_media | clinica | escritorio). Define abas, métricas e o vocabulário da interface.';

-- Valor fora da lista deixaria a tela sem abas nenhuma — o CHECK evita isso.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_atendimento_segmento_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_atendimento_segmento_check
    CHECK (atendimento_segmento IN ('social_media', 'clinica', 'escritorio'));

-- ---------------------------------------------------------------------------
-- Seed de tipos e etapas conforme o segmento
-- ---------------------------------------------------------------------------
-- Substitui seed_atendimento_social_media, que só sabia um ramo.
--
-- ADITIVA de propósito (ON CONFLICT DO NOTHING, sem DELETE): trocar de segmento
-- não pode apagar etapa que ainda tem demanda dentro — isso deixaria trabalho
-- órfão. O admin remove à mão o que não usa, e a FK RESTRICT impede que ele
-- apague uma etapa ocupada por engano.
CREATE OR REPLACE FUNCTION public.seed_atendimento_segmento(p_tenant UUID, p_segmento TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- SECURITY DEFINER bypassa a RLS, então a checagem precisa ser explícita:
  -- sem ela, qualquer usuário logado reescreveria o fluxo de trabalho da empresa
  -- chamando a RPC direto, sem passar pela tela.
  IF p_tenant IS DISTINCT FROM (SELECT public.get_user_tenant_id()) OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Sem permissão para configurar o segmento desta empresa.';
  END IF;

  IF p_segmento = 'clinica' THEN
    INSERT INTO public.atendimento_tipos (tenant_id, nome, descricao, ordem) VALUES
      (p_tenant, 'Primeira consulta', 'Primeiro atendimento do paciente.', 10),
      (p_tenant, 'Retorno',           'Acompanhamento de um atendimento anterior.', 20),
      (p_tenant, 'Exame',             'Solicitação ou leitura de exame.', 30),
      (p_tenant, 'Procedimento',      'Procedimento agendado.', 40),
      (p_tenant, 'Outro',             'Qualquer atendimento fora dos tipos acima.', 50)
    ON CONFLICT (tenant_id, nome) DO NOTHING;

    INSERT INTO public.atendimento_etapas (tenant_id, nome, cor, ordem, is_final) VALUES
      (p_tenant, 'Agendado',          'slate', 10, false),
      (p_tenant, 'Em atendimento',    'blue',  20, false),
      (p_tenant, 'Aguardando exame',  'amber', 30, false),
      (p_tenant, 'Concluído',         'green', 40, true)
    ON CONFLICT (tenant_id, nome) DO NOTHING;

  ELSIF p_segmento = 'escritorio' THEN
    INSERT INTO public.atendimento_tipos (tenant_id, nome, descricao, ordem) VALUES
      (p_tenant, 'Petição',    'Peça processual.', 10),
      (p_tenant, 'Parecer',    'Análise ou opinião técnica.', 20),
      (p_tenant, 'Reunião',    'Encontro com o cliente.', 30),
      (p_tenant, 'Diligência', 'Providência externa.', 40),
      (p_tenant, 'Outro',      'Qualquer demanda fora dos tipos acima.', 50)
    ON CONFLICT (tenant_id, nome) DO NOTHING;

    INSERT INTO public.atendimento_etapas (tenant_id, nome, cor, ordem, is_final) VALUES
      (p_tenant, 'Recebida',          'slate',  10, false),
      (p_tenant, 'Em elaboração',     'blue',   20, false),
      (p_tenant, 'Em revisão',        'amber',  30, false),
      (p_tenant, 'Aguardando cliente','violet', 40, false),
      (p_tenant, 'Concluída',         'green',  50, true)
    ON CONFLICT (tenant_id, nome) DO NOTHING;

  ELSE
    -- social_media (padrão)
    INSERT INTO public.atendimento_tipos (tenant_id, nome, descricao, ordem) VALUES
      (p_tenant, 'Reels',      'Vídeo curto para o feed.',                 10),
      (p_tenant, 'Carrossel',  'Post de múltiplas imagens.',               20),
      (p_tenant, 'Story',      'Publicação temporária.',                   30),
      (p_tenant, 'Post único', 'Imagem única no feed.',                    40),
      (p_tenant, 'Campanha',   'Conjunto de peças com um objetivo comum.', 50),
      (p_tenant, 'Outro',      'Qualquer demanda fora dos tipos acima.',   60)
    ON CONFLICT (tenant_id, nome) DO NOTHING;

    INSERT INTO public.atendimento_etapas (tenant_id, nome, cor, ordem, is_final) VALUES
      (p_tenant, 'Solicitado',           'slate',   10, false),
      (p_tenant, 'Em produção',          'blue',    20, false),
      (p_tenant, 'Em revisão interna',   'amber',   30, false),
      (p_tenant, 'Aguardando aprovação', 'violet',  40, false),
      (p_tenant, 'Aprovado',             'emerald', 50, false),
      (p_tenant, 'Publicado',            'green',   60, true)
    ON CONFLICT (tenant_id, nome) DO NOTHING;
  END IF;
END;
$fn$;

-- Toda função nova nasce executável por PUBLIC no Postgres, e REVOKE de
-- authenticated não tira esse grant (lição do P0 de 27/07).
REVOKE ALL ON FUNCTION public.seed_atendimento_segmento(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_atendimento_segmento(uuid, text) TO authenticated;

-- Tenant novo nasce em social_media. O seed do trigger insere direto porque
-- roda dentro do INSERT do provisionamento, onde não há usuário logado para
-- passar na checagem de admin da função acima.
CREATE OR REPLACE FUNCTION public.tg_seed_atendimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.atendimento_tipos (tenant_id, nome, descricao, ordem)
  VALUES
    (NEW.id, 'Reels',      'Vídeo curto para o feed.',                 10),
    (NEW.id, 'Carrossel',  'Post de múltiplas imagens.',               20),
    (NEW.id, 'Story',      'Publicação temporária.',                   30),
    (NEW.id, 'Post único', 'Imagem única no feed.',                    40),
    (NEW.id, 'Campanha',   'Conjunto de peças com um objetivo comum.', 50),
    (NEW.id, 'Outro',      'Qualquer demanda fora dos tipos acima.',   60)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  INSERT INTO public.atendimento_etapas (tenant_id, nome, cor, ordem, is_final)
  VALUES
    (NEW.id, 'Solicitado',           'slate',   10, false),
    (NEW.id, 'Em produção',          'blue',    20, false),
    (NEW.id, 'Em revisão interna',   'amber',   30, false),
    (NEW.id, 'Aguardando aprovação', 'violet',  40, false),
    (NEW.id, 'Aprovado',             'emerald', 50, false),
    (NEW.id, 'Publicado',            'green',   60, true)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP FUNCTION IF EXISTS public.seed_atendimento_social_media(uuid);

NOTIFY pgrst, 'reload schema';
