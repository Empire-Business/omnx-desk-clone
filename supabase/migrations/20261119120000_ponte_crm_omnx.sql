-- ============================================================================
-- Ponte de vendas Desk <-> CRM OMNX (omnx-sdria) — contrato v1
-- ============================================================================
-- O que muda:
--   1. tenant_integracoes aceita provider 'crm_omnx' (segredo no cofre, base_url =
--      URL completa do receptor do CRM, só https).
--   2. vendas_pendentes ganha origem ('formulario'|'crm'), crm_venda_id (único por
--      tenant), crm_sincronizado_em e crm_sincronizacao_erro.
--   3. crm_eventos_recebidos: idempotência dos eventos que chegam do CRM (event_id
--      repetido devolve a mesma resposta).
--   4. crm_omnx_aplicar_venda(): grava a venda vinda do CRM numa transação só, com
--      app.skip_crm_notify ligado localmente — a escrita não volta ao CRM (sem eco).
--   5. Gatilhos que chamam a função crm-omnx-notificar (pg_net + x-notify-secret,
--      mesmo padrão dos gatilhos da ponte Empire) quando:
--        - entra venda com origem <> 'crm';
--        - muda um campo de dados enviado ao CRM ou o status da venda;
--        - muda status, status_secundario, link_clicksign ou data_assinatura do contrato.
--      Só disparam se o tenant tiver 'crm_omnx' ativo. Disjuntor:
--        SET LOCAL app.skip_crm_notify = 'on';
--
-- Os gatilhos da ponte Empire (trg_ghl_marcar_assinada, trg_venda_ressincronizar_crm,
-- trg_contrato_ressincronizar_venda_crm) não são tocados.
--
-- Rollback (na ordem):
--   drop trigger if exists trg_crm_omnx_venda_insert on public.vendas_pendentes;
--   drop trigger if exists trg_crm_omnx_venda_update on public.vendas_pendentes;
--   drop trigger if exists trg_crm_omnx_contrato on public.contratos;
--   drop function if exists public.tg_crm_omnx_venda(), public.tg_crm_omnx_contrato(),
--     public.crm_omnx_chamar_notificar(jsonb), public.crm_omnx_ativo(uuid),
--     public.crm_omnx_aplicar_venda(uuid, text, text, jsonb, boolean, jsonb, uuid);
--   drop table if exists public.crm_eventos_recebidos;
--   (colunas novas de vendas_pendentes podem ficar; são opcionais)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Provider 'crm_omnx'
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.tenant_integracoes'::regclass
       AND con.contype = 'c'
       AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'public.tenant_integracoes'::regclass
                                  AND attname = 'provider')]::int2[]
  LOOP
    EXECUTE format('ALTER TABLE public.tenant_integracoes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.tenant_integracoes
  ADD CONSTRAINT tenant_integracoes_provider_check
  CHECK (provider IN ('empire', 'uazapi', 'zernio', 'crm_omnx'));

-- Mesma assinatura e mesmas guardas da versão de 20261026140000; acrescenta
-- 'crm_omnx' (segredo de no mínimo 32 caracteres e endereço https obrigatório).
CREATE OR REPLACE FUNCTION public.save_omnx_integracao_secret(
  p_provider text,
  p_secret   text,
  p_base_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant       uuid;
  v_is_admin     boolean;
  v_secret_id    uuid;
  v_existing     public.tenant_integracoes%ROWTYPE;
  v_new_version  integer;
  v_base_url     text;
  v_metadata     jsonb;
  v_rotulo       text;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('empire', 'uazapi', 'zernio', 'crm_omnx') THEN
    RAISE EXCEPTION 'provider inválido: %', p_provider;
  END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) = 0 THEN
    RAISE EXCEPTION 'secret vazio';
  END IF;
  IF length(p_secret) > 4096 THEN
    RAISE EXCEPTION 'secret grande demais';
  END IF;

  -- Guarda de admin INALTERADA em relação à versão original.
  SELECT (perfil = 'admin') INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'apenas admin pode configurar integrações';
  END IF;

  v_tenant := public.resolve_tenant_do_clone();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'não foi possível resolver o tenant desta conta';
  END IF;

  v_base_url := NULLIF(trim(COALESCE(p_base_url, '')), '');
  IF v_base_url IS NOT NULL AND p_provider IN ('uazapi', 'zernio') THEN
    v_base_url := regexp_replace(v_base_url, '/+$', '');
    IF NOT public.wa_base_url_permitida(p_provider, v_base_url) THEN
      RAISE EXCEPTION 'endereço da API não permitido para %', p_provider
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_provider = 'crm_omnx' THEN
    IF length(trim(p_secret)) < 32 THEN
      RAISE EXCEPTION 'o segredo do CRM precisa ter pelo menos 32 caracteres';
    END IF;
    -- Na primeira conexão o endereço do receptor é obrigatório; na rotação pode
    -- vir vazio (mantém o atual).
    IF v_base_url IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.tenant_integracoes
       WHERE tenant_id = v_tenant AND provider = 'crm_omnx' AND base_url IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'informe o endereço do receptor do CRM';
    END IF;
    IF v_base_url IS NOT NULL AND v_base_url !~* '^https://[a-z0-9.-]+(:[0-9]+)?/[^[:space:]]*$' THEN
      RAISE EXCEPTION 'o endereço do receptor do CRM precisa começar com https://'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_metadata := COALESCE(p_metadata, '{}'::jsonb);
  IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'metadata inválido';
  END IF;
  IF p_provider = 'zernio' THEN
    -- Toda chamada da Zernio leva o accountId da conta WhatsApp conectada.
    IF COALESCE(v_metadata->>'account_id', '') !~ '^[A-Za-z0-9_-]{1,128}$' THEN
      RAISE EXCEPTION 'informe o código da conta (account_id) da Zernio';
    END IF;
    v_metadata := jsonb_build_object('account_id', v_metadata->>'account_id');
  ELSIF p_provider IN ('uazapi', 'crm_omnx') THEN
    v_metadata := '{}'::jsonb;  -- nada além do segredo por enquanto
  END IF;

  v_rotulo := CASE p_provider
    WHEN 'empire'   THEN 'Secret da ponte omnx-desk → Empire'
    WHEN 'uazapi'   THEN 'Token da instância UAZAPI (Automações WhatsApp)'
    WHEN 'zernio'   THEN 'Chave da API Zernio (Automações WhatsApp)'
    WHEN 'crm_omnx' THEN 'Segredo da ponte de vendas omnx-desk ↔ CRM OMNX'
  END;

  SELECT * INTO v_existing
  FROM public.tenant_integracoes
  WHERE tenant_id = v_tenant AND provider = p_provider;

  IF FOUND AND v_existing.secret_key_id IS NOT NULL THEN
    -- rotação: atualiza o segredo existente no Vault
    PERFORM vault.update_secret(
      v_existing.secret_key_id,
      trim(p_secret),
      'omnx_integracao:' || p_provider || ':' || v_tenant::text
    );
    v_secret_id   := v_existing.secret_key_id;
    v_new_version := v_existing.rotation_version + 1;
  ELSE
    v_secret_id := vault.create_secret(
      trim(p_secret),
      'omnx_integracao:' || p_provider || ':' || v_tenant::text || ':' || gen_random_uuid()::text,
      v_rotulo
    );
    v_new_version := COALESCE(v_existing.rotation_version, 0) + 1;
  END IF;

  INSERT INTO public.tenant_integracoes AS ti (tenant_id, provider, secret_key_id, base_url, metadata, rotation_version, is_active)
  VALUES (v_tenant, p_provider, v_secret_id, v_base_url, v_metadata, v_new_version, true)
  ON CONFLICT (tenant_id, provider) DO UPDATE
    SET secret_key_id    = EXCLUDED.secret_key_id,
        base_url         = COALESCE(EXCLUDED.base_url, ti.base_url),
        metadata         = EXCLUDED.metadata,
        rotation_version = EXCLUDED.rotation_version,
        is_active        = true,
        updated_at       = now();

  RETURN v_new_version; -- nunca retorna o segredo
END;
$$;

REVOKE ALL ON FUNCTION public.save_omnx_integracao_secret(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_omnx_integracao_secret(text, text, text, jsonb) TO authenticated, service_role;

-- O tenant tem a ponte com o CRM OMNX ligada?
CREATE OR REPLACE FUNCTION public.crm_omnx_ativo(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tenant_integracoes
     WHERE tenant_id = p_tenant_id
       AND provider = 'crm_omnx'
       AND is_active
       AND secret_key_id IS NOT NULL
       AND base_url IS NOT NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.crm_omnx_ativo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_omnx_ativo(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Colunas em vendas_pendentes
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendas_pendentes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'formulario',
  ADD COLUMN IF NOT EXISTS crm_venda_id text,
  ADD COLUMN IF NOT EXISTS crm_sincronizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS crm_sincronizacao_erro text;

ALTER TABLE public.vendas_pendentes DROP CONSTRAINT IF EXISTS vendas_pendentes_origem_check;
ALTER TABLE public.vendas_pendentes
  ADD CONSTRAINT vendas_pendentes_origem_check CHECK (origem IN ('formulario', 'crm'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_vendas_pendentes_tenant_crm_venda
  ON public.vendas_pendentes (tenant_id, crm_venda_id)
  WHERE crm_venda_id IS NOT NULL;

COMMENT ON COLUMN public.vendas_pendentes.origem IS
  'De onde a venda veio: formulario (closer pelo formulário público) ou crm (CRM OMNX).';
COMMENT ON COLUMN public.vendas_pendentes.crm_venda_id IS
  'Id da venda no CRM OMNX (omnx-sdria). Único por tenant.';
COMMENT ON COLUMN public.vendas_pendentes.crm_sincronizado_em IS
  'Última vez que a venda ficou igual no CRM OMNX (envio aceito ou chegada do CRM).';
COMMENT ON COLUMN public.vendas_pendentes.crm_sincronizacao_erro IS
  'Último resultado não aplicado no CRM OMNX: cliente_nao_encontrado_no_crm, cliente_ambiguo_no_crm ou erro técnico. Null quando sincronizou.';

-- ---------------------------------------------------------------------------
-- 3) Idempotência dos eventos do CRM
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_eventos_recebidos (
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id      text NOT NULL,
  crm_venda_id  text,
  desk_venda_id uuid,
  resposta      jsonb NOT NULL,
  recebido_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_eventos_recebidos_venda
  ON public.crm_eventos_recebidos (tenant_id, crm_venda_id, recebido_em DESC);

COMMENT ON TABLE public.crm_eventos_recebidos IS
  'Eventos crm.venda.sincronizada já processados (idempotência por event_id). Só service_role escreve.';

ALTER TABLE public.crm_eventos_recebidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_eventos_recebidos FROM anon, authenticated;

DROP POLICY IF EXISTS crm_eventos_recebidos_admin_select ON public.crm_eventos_recebidos;
CREATE POLICY crm_eventos_recebidos_admin_select ON public.crm_eventos_recebidos
  FOR SELECT TO authenticated
  USING (
    (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'admin'
    AND tenant_id = public.get_user_tenant_id()
  );
GRANT SELECT ON public.crm_eventos_recebidos TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Gravação da venda vinda do CRM (chamada só pela função crm-venda-receber)
-- ---------------------------------------------------------------------------
-- p_dados: colunas já mapeadas (vendaCrmParaColunas em _shared/crm-omnx.ts).
--   Valor null = "o CRM não informou": na criação vira o padrão; na atualização
--   mantém o que está no Desk. Status nunca regride: venda existente não tem o
--   status mexido; venda nova nasce 'pendente' (o gatilho existente cria o contrato
--   rascunho).
-- p_criar: false quando o CRM manda venda não ganha que o Desk ainda não conhece —
--   nesse caso nada é criado.
-- p_contrato: {status, link, assinado_em}. 'signed' com link preenche
--   contratos.link_clicksign/data_assinatura só se estiverem vazios.
-- p_desk_venda_id (contrato v1.1): venda do Desk que o CRM já ligou a esta venda
--   (ex.: veio do formulário). Procurada primeiro (mesmo tenant), depois por
--   crm_venda_id; achada pelo id do Desk, recebe o crm_venda_id. Evita duplicar.
-- p_dados sem as chaves pagador_*: o CRM não tem dados de pagador -> não mexe.
-- Retorno: {status: created|updated|unchanged, desk_venda_id, desk_contrato_id,
--   duplicado: bool}. event_id repetido devolve a resposta gravada.
CREATE OR REPLACE FUNCTION public.crm_omnx_aplicar_venda(
  p_tenant_id    uuid,
  p_event_id     text,
  p_crm_venda_id text,
  p_dados        jsonb,
  p_criar        boolean DEFAULT true,
  p_contrato     jsonb DEFAULT NULL,
  p_desk_venda_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_resp       jsonb;
  v_venda      public.vendas_pendentes%ROWTYPE;
  v_id         uuid;
  v_status     text;
  v_antes      jsonb;
  v_depois     jsonb;
  v_contrato   uuid;
  v_link       text;
  v_assinado   date;
  v_contrato_n int := 0;
  v_crm_id     text;
  v_pagador    boolean := p_dados ? 'pagador_diferente';
BEGIN
  IF p_tenant_id IS NULL OR p_event_id IS NULL OR p_crm_venda_id IS NULL THEN
    RAISE EXCEPTION 'tenant, event_id e crm_venda_id são obrigatórios';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'dados inválidos';
  END IF;

  -- Serializa o mesmo evento e a mesma venda (duas entregas simultâneas).
  PERFORM pg_advisory_xact_lock(hashtextextended('crm_evento:' || p_tenant_id::text || ':' || p_event_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('crm_venda:' || p_tenant_id::text || ':' || p_crm_venda_id, 0));

  SELECT resposta INTO v_resp
    FROM public.crm_eventos_recebidos
   WHERE tenant_id = p_tenant_id AND event_id = p_event_id;
  IF FOUND THEN
    RETURN v_resp || jsonb_build_object('duplicado', true);
  END IF;

  -- Escrita vinda do CRM não volta ao CRM (gatilhos crm_omnx olham este disjuntor).
  PERFORM set_config('app.skip_crm_notify', 'on', true);

  -- 1º pelo id do Desk que o CRM já conhece; 2º pelo id da venda no CRM.
  IF p_desk_venda_id IS NOT NULL THEN
    SELECT * INTO v_venda
      FROM public.vendas_pendentes
     WHERE id = p_desk_venda_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  END IF;
  IF v_venda.id IS NULL THEN
    SELECT * INTO v_venda
      FROM public.vendas_pendentes
     WHERE tenant_id = p_tenant_id AND crm_venda_id = p_crm_venda_id
     FOR UPDATE;
  END IF;

  IF v_venda.id IS NOT NULL THEN
    -- Grava o crm_venda_id na linha achada, a não ser que outra venda deste tenant
    -- já esteja ligada a ele (duplicata antiga: não quebra, mantém como está).
    IF v_venda.crm_venda_id IS DISTINCT FROM p_crm_venda_id AND NOT EXISTS (
      SELECT 1 FROM public.vendas_pendentes
       WHERE tenant_id = p_tenant_id AND crm_venda_id = p_crm_venda_id AND id <> v_venda.id
    ) THEN
      v_crm_id := p_crm_venda_id;
    ELSE
      v_crm_id := v_venda.crm_venda_id;
    END IF;
  END IF;

  IF v_venda.id IS NULL THEN
    IF NOT COALESCE(p_criar, true) THEN
      v_status := 'unchanged';
    ELSE
      INSERT INTO public.vendas_pendentes (
        tenant_id, origem, crm_venda_id, crm_sincronizado_em, status,
        closer_nome, closer_email,
        cliente_nome, cliente_razao_social, cliente_cpf_cnpj, cliente_email, cliente_whatsapp,
        cliente_instagram, cliente_cep, cliente_logradouro, cliente_numero, cliente_complemento,
        cliente_bairro, cliente_municipio, cliente_uf,
        produto_nome, valor_total_venda, pagamentos, observacoes,
        pagador_diferente, pagador_nome, pagador_cpf_cnpj, pagador_relacao
      ) VALUES (
        p_tenant_id, 'crm', p_crm_venda_id, now(), 'pendente',
        COALESCE(NULLIF(p_dados->>'closer_nome', ''), 'CRM'),
        COALESCE(NULLIF(lower(p_dados->>'closer_email'), ''), 'crm@omnx.pro'),
        p_dados->>'cliente_nome',
        p_dados->>'cliente_razao_social',
        p_dados->>'cliente_cpf_cnpj',
        p_dados->>'cliente_email',
        COALESCE(p_dados->>'cliente_whatsapp', ''),
        p_dados->>'cliente_instagram',
        p_dados->>'cliente_cep',
        p_dados->>'cliente_logradouro',
        p_dados->>'cliente_numero',
        p_dados->>'cliente_complemento',
        p_dados->>'cliente_bairro',
        p_dados->>'cliente_municipio',
        p_dados->>'cliente_uf',
        p_dados->>'produto_nome',
        (p_dados->>'valor_total_venda')::numeric,
        COALESCE(NULLIF(p_dados->'pagamentos', 'null'::jsonb), '[]'::jsonb),
        p_dados->>'observacoes',
        COALESCE((p_dados->>'pagador_diferente')::boolean, false),
        p_dados->>'pagador_nome',
        p_dados->>'pagador_cpf_cnpj',
        p_dados->>'pagador_relacao'
      )
      RETURNING id INTO v_id;
      v_status := 'created';
    END IF;
  ELSE
    v_id := v_venda.id;
    v_antes := to_jsonb(v_venda) - ARRAY['atualizado_em', 'crm_sincronizado_em', 'crm_sincronizacao_erro'];

    UPDATE public.vendas_pendentes vp SET
      closer_nome          = COALESCE(NULLIF(p_dados->>'closer_nome', ''), vp.closer_nome),
      closer_email         = COALESCE(NULLIF(lower(p_dados->>'closer_email'), ''), vp.closer_email),
      cliente_nome         = COALESCE(NULLIF(p_dados->>'cliente_nome', ''), vp.cliente_nome),
      cliente_razao_social = COALESCE(p_dados->>'cliente_razao_social', vp.cliente_razao_social),
      cliente_cpf_cnpj     = COALESCE(p_dados->>'cliente_cpf_cnpj', vp.cliente_cpf_cnpj),
      cliente_email        = COALESCE(p_dados->>'cliente_email', vp.cliente_email),
      cliente_whatsapp     = COALESCE(NULLIF(p_dados->>'cliente_whatsapp', ''), vp.cliente_whatsapp),
      cliente_instagram    = COALESCE(p_dados->>'cliente_instagram', vp.cliente_instagram),
      cliente_cep          = COALESCE(p_dados->>'cliente_cep', vp.cliente_cep),
      cliente_logradouro   = COALESCE(p_dados->>'cliente_logradouro', vp.cliente_logradouro),
      cliente_numero       = COALESCE(p_dados->>'cliente_numero', vp.cliente_numero),
      cliente_complemento  = COALESCE(p_dados->>'cliente_complemento', vp.cliente_complemento),
      cliente_bairro       = COALESCE(p_dados->>'cliente_bairro', vp.cliente_bairro),
      cliente_municipio    = COALESCE(p_dados->>'cliente_municipio', vp.cliente_municipio),
      cliente_uf           = COALESCE(p_dados->>'cliente_uf', vp.cliente_uf),
      produto_nome         = COALESCE(p_dados->>'produto_nome', vp.produto_nome),
      valor_total_venda    = COALESCE((p_dados->>'valor_total_venda')::numeric, vp.valor_total_venda),
      pagamentos           = COALESCE(NULLIF(p_dados->'pagamentos', 'null'::jsonb), vp.pagamentos),
      observacoes          = COALESCE(p_dados->>'observacoes', vp.observacoes),
      -- Pagador: só quando o CRM mandou; aí os campos mudam juntos.
      pagador_diferente    = CASE WHEN v_pagador THEN COALESCE((p_dados->>'pagador_diferente')::boolean, false) ELSE vp.pagador_diferente END,
      pagador_nome         = CASE WHEN v_pagador THEN p_dados->>'pagador_nome' ELSE vp.pagador_nome END,
      pagador_cpf_cnpj     = CASE WHEN v_pagador THEN p_dados->>'pagador_cpf_cnpj' ELSE vp.pagador_cpf_cnpj END,
      pagador_relacao      = CASE WHEN v_pagador THEN p_dados->>'pagador_relacao' ELSE vp.pagador_relacao END,
      pagador_observacao   = CASE WHEN v_pagador AND NOT COALESCE((p_dados->>'pagador_diferente')::boolean, false)
                                  THEN NULL ELSE vp.pagador_observacao END,
      crm_venda_id         = v_crm_id,
      crm_sincronizado_em  = now(),
      crm_sincronizacao_erro = NULL
    WHERE vp.id = v_id
    RETURNING to_jsonb(vp) - ARRAY['atualizado_em', 'crm_sincronizado_em', 'crm_sincronizacao_erro']
      INTO v_depois;

    v_status := CASE WHEN v_antes IS NOT DISTINCT FROM v_depois THEN 'unchanged' ELSE 'updated' END;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT id INTO v_contrato FROM public.contratos WHERE venda_pendente_id = v_id LIMIT 1;

    -- Contrato assinado no CRM: completa link e data só onde estão vazios.
    v_link := NULLIF(btrim(COALESCE(p_contrato->>'link', '')), '');
    IF v_contrato IS NOT NULL AND p_contrato->>'status' = 'signed' AND v_link IS NOT NULL THEN
      -- Data impossível (ex.: 2026-02-30) não derruba a gravação: fica sem data.
      BEGIN
        v_assinado := CASE WHEN (p_contrato->>'assinado_em') ~ '^\d{4}-\d{2}-\d{2}'
                           THEN left(p_contrato->>'assinado_em', 10)::date END;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        v_assinado := NULL;
      END;
      UPDATE public.contratos c SET
        link_clicksign  = COALESCE(NULLIF(btrim(COALESCE(c.link_clicksign, '')), ''), v_link),
        data_assinatura = COALESCE(c.data_assinatura, v_assinado)
      WHERE c.id = v_contrato
        AND (NULLIF(btrim(COALESCE(c.link_clicksign, '')), '') IS NULL
             OR (c.data_assinatura IS NULL AND v_assinado IS NOT NULL));
      GET DIAGNOSTICS v_contrato_n = ROW_COUNT;
      IF v_contrato_n > 0 AND v_status = 'unchanged' THEN
        v_status := 'updated';
      END IF;
    END IF;
  END IF;

  v_resp := jsonb_build_object(
    'ok', true,
    'status', v_status,
    'desk_venda_id', v_id,
    'desk_contrato_id', v_contrato
  );

  INSERT INTO public.crm_eventos_recebidos (tenant_id, event_id, crm_venda_id, desk_venda_id, resposta)
  VALUES (p_tenant_id, p_event_id, p_crm_venda_id, v_id, v_resp)
  ON CONFLICT (tenant_id, event_id) DO NOTHING;

  RETURN v_resp || jsonb_build_object('duplicado', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_omnx_aplicar_venda(uuid, text, text, jsonb, boolean, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_omnx_aplicar_venda(uuid, text, text, jsonb, boolean, jsonb, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Gatilhos -> crm-omnx-notificar
-- ---------------------------------------------------------------------------
-- Chamada assíncrona (pg_net envia depois do commit). Endereço e chave anon vêm de
-- app_url_funcoes()/app_chave_anon() quando existem (instalação do zero); senão,
-- os mesmos valores fixos dos gatilhos da ponte Empire. A autorização real é o
-- header x-notify-secret, conferido na função por notify_secret_matches.
CREATE OR REPLACE FUNCTION public.crm_omnx_chamar_notificar(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, vault, net, pg_temp
AS $$
DECLARE
  v_secret text;
  v_url    text;
  v_anon   text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'notify_webhook_secret';
  IF v_secret IS NULL THEN
    RETURN;  -- sem segredo não há como chamar: nunca quebra a escrita
  END IF;

  IF to_regprocedure('public.app_url_funcoes(text)') IS NOT NULL THEN
    v_url := public.app_url_funcoes('crm-omnx-notificar');
  ELSE
    v_url := 'https://seu-projeto-supabase.supabase.co/functions/v1/crm-omnx-notificar';
  END IF;
  IF to_regprocedure('public.app_chave_anon()') IS NOT NULL THEN
    v_anon := public.app_chave_anon();
  ELSE
    v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho';
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-notify-secret', v_secret
    ),
    body := p_body,
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.crm_omnx_chamar_notificar(jsonb) FROM PUBLIC, anon, authenticated;

-- Venda: INSERT (origem <> 'crm') e UPDATE de campo enviado ao CRM ou do status.
-- Sem WHEN no CREATE TRIGGER de propósito: WHEN roda com a permissão de quem edita
-- (ver 20261113120000); a checagem fica aqui dentro, como SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.tg_crm_omnx_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  IF coalesce(current_setting('app.skip_crm_notify', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.origem = 'crm' THEN
      RETURN NEW;  -- veio do CRM: não volta para lá
    END IF;
    IF NOT public.crm_omnx_ativo(NEW.tenant_id) THEN
      RETURN NEW;
    END IF;
    PERFORM public.crm_omnx_chamar_notificar(
      jsonb_build_object('venda_id', NEW.id, 'evento', 'desk.venda.registrada'));
    RETURN NEW;
  END IF;

  -- UPDATE: só os campos que vão ao CRM (os mesmos da ponte Empire em
  -- 20260804214000, mais os que a forma comum da venda leva) e o status. Colunas de
  -- controle (crm_*, ghl_*, sincronizado_em, comprovantes) ficam de fora — gravar o
  -- resultado do envio não redispara o gatilho.
  v_antes := jsonb_build_object(
    'status',               OLD.status,
    'cliente_nome',         OLD.cliente_nome,
    'cliente_razao_social', OLD.cliente_razao_social,
    'cliente_cpf_cnpj',     OLD.cliente_cpf_cnpj,
    'cliente_email',        OLD.cliente_email,
    'cliente_whatsapp',     OLD.cliente_whatsapp,
    'cliente_instagram',    OLD.cliente_instagram,
    'cliente_logradouro',   OLD.cliente_logradouro,
    'cliente_endereco',     OLD.cliente_endereco,
    'cliente_numero',       OLD.cliente_numero,
    'cliente_complemento',  OLD.cliente_complemento,
    'cliente_bairro',       OLD.cliente_bairro,
    'cliente_municipio',    OLD.cliente_municipio,
    'cliente_uf',           OLD.cliente_uf,
    'cliente_cep',          OLD.cliente_cep,
    'produto_nome',         OLD.produto_nome,
    'valor_total_venda',    OLD.valor_total_venda,
    'observacoes',          OLD.observacoes,
    'closer_nome',          OLD.closer_nome,
    'closer_email',         OLD.closer_email,
    'pagamentos',           OLD.pagamentos,
    'pagador_diferente',    OLD.pagador_diferente,
    'pagador_nome',         OLD.pagador_nome,
    'pagador_cpf_cnpj',     OLD.pagador_cpf_cnpj,
    'pagador_relacao',      OLD.pagador_relacao
  );
  v_depois := jsonb_build_object(
    'status',               NEW.status,
    'cliente_nome',         NEW.cliente_nome,
    'cliente_razao_social', NEW.cliente_razao_social,
    'cliente_cpf_cnpj',     NEW.cliente_cpf_cnpj,
    'cliente_email',        NEW.cliente_email,
    'cliente_whatsapp',     NEW.cliente_whatsapp,
    'cliente_instagram',    NEW.cliente_instagram,
    'cliente_logradouro',   NEW.cliente_logradouro,
    'cliente_endereco',     NEW.cliente_endereco,
    'cliente_numero',       NEW.cliente_numero,
    'cliente_complemento',  NEW.cliente_complemento,
    'cliente_bairro',       NEW.cliente_bairro,
    'cliente_municipio',    NEW.cliente_municipio,
    'cliente_uf',           NEW.cliente_uf,
    'cliente_cep',          NEW.cliente_cep,
    'produto_nome',         NEW.produto_nome,
    'valor_total_venda',    NEW.valor_total_venda,
    'observacoes',          NEW.observacoes,
    'closer_nome',          NEW.closer_nome,
    'closer_email',         NEW.closer_email,
    'pagamentos',           NEW.pagamentos,
    'pagador_diferente',    NEW.pagador_diferente,
    'pagador_nome',         NEW.pagador_nome,
    'pagador_cpf_cnpj',     NEW.pagador_cpf_cnpj,
    'pagador_relacao',      NEW.pagador_relacao
  );
  IF v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NEW;
  END IF;
  IF NOT public.crm_omnx_ativo(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  PERFORM public.crm_omnx_chamar_notificar(
    jsonb_build_object('venda_id', NEW.id, 'evento', 'desk.venda.atualizada'));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_crm_omnx_venda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crm_omnx_venda_insert ON public.vendas_pendentes;
CREATE TRIGGER trg_crm_omnx_venda_insert
  AFTER INSERT ON public.vendas_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_omnx_venda();

DROP TRIGGER IF EXISTS trg_crm_omnx_venda_update ON public.vendas_pendentes;
CREATE TRIGGER trg_crm_omnx_venda_update
  AFTER UPDATE ON public.vendas_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_omnx_venda();

-- Contrato: status, status_secundario, link do Clicksign ou data de assinatura.
CREATE OR REPLACE FUNCTION public.tg_crm_omnx_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('app.skip_crm_notify', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- O CRM conhece a venda, não o contrato solto.
  IF NEW.venda_pendente_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- O rascunho criado junto com a venda já vai no evento desk.venda.registrada.
    IF NULLIF(btrim(COALESCE(NEW.link_clicksign, '')), '') IS NULL
       AND NEW.data_assinatura IS NULL
       AND COALESCE(NEW.status, 'rascunho') = 'rascunho' THEN
      RETURN NEW;
    END IF;
  ELSIF OLD.status            IS NOT DISTINCT FROM NEW.status
    AND OLD.status_secundario IS NOT DISTINCT FROM NEW.status_secundario
    AND OLD.link_clicksign    IS NOT DISTINCT FROM NEW.link_clicksign
    AND OLD.data_assinatura   IS NOT DISTINCT FROM NEW.data_assinatura
  THEN
    RETURN NEW;
  END IF;

  IF NOT public.crm_omnx_ativo(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  PERFORM public.crm_omnx_chamar_notificar(jsonb_build_object('contrato_id', NEW.id));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_crm_omnx_contrato() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crm_omnx_contrato ON public.contratos;
CREATE TRIGGER trg_crm_omnx_contrato
  AFTER INSERT OR UPDATE OF status, status_secundario, link_clicksign, data_assinatura
  ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_omnx_contrato();

COMMIT;
