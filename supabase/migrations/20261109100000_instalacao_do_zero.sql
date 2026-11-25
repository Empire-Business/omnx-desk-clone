-- ============================================================================
-- Instalação do zero: ajustes para o app rodar no Supabase do cliente
-- ============================================================================
-- Tudo aqui é idempotente e foi escrito para NÃO mudar a produção da empresa:
-- onde o comportamento muda, a decisão depende de o banco ser novo (sem
-- nenhuma conta em auth.users) ou de a empresa ter a integração configurada.
--
--   1. app_url_funcoes(): endereço das funções deste projeto, lido do cofre
--      ('project_url'), com o endereço atual como reserva. Usado pelos
--      agendamentos novos; os antigos continuam como estão.
--   2. Segredo 'notify_webhook_secret' no cofre, se faltar (os gatilhos do banco
--      mandam e as funções conferem por notify_secret_matches; o valor nunca sai
--      do banco).
--   3. Integrações internas da empresa (ponte com o CRM/GHL) desligadas num
--      banco novo: os gatilhos ganham uma condição WHEN e o monitor diário só
--      chama a função quando a ponte está ligada. Na produção a chave nasce
--      ligada e nada muda. Ligar depois: cadastrar a ponte em Configurações >
--      Integrações (tenant_integracoes 'empire' ativa) ou
--      update public.integracoes_internas set ligado = true where chave = 'crm_empresa';
--   4. contratos-alerts agendado de novo com o cabeçalho x-cron-secret (a função
--      exige desde 05/11/2026; o agendamento antigo só mandava a chave anon).
--   5. Primeiro acesso: num banco novo, a primeira conta vira administradora da
--      empresa principal (a "mestre" criada pela semente), com o nome que ela
--      informar (raw_user_meta_data.empresa) ou o nome dela. Antes, criava uma
--      segunda empresa e a mestre ficava vazia.
--   6. Banco novo: tira dados de exemplo da empresa que vieram em migrações
--      antigas (grupo de aquecimento com números internos e catálogo de
--      produtos), só se ninguém usou.
--
-- Para aplicar na produção (opcional): nada muda de comportamento; o item 4
-- passa a mandar o segredo que a função já exige. Antes, confira se o job
-- 'contratos-alerts-daily-9am-brt' da produção já foi corrigido à mão.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Banco novo?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.htai_banco_novo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM auth.users);
$$;
REVOKE EXECUTE ON FUNCTION public.htai_banco_novo() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Endereço das funções deste projeto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_url_funcoes(p_funcao text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_base text;
BEGIN
  IF p_funcao IS NULL OR p_funcao !~ '^[a-z0-9][a-z0-9-]{0,62}$' THEN
    RAISE EXCEPTION 'nome de função inválido';
  END IF;
  SELECT rtrim(decrypted_secret, '/') INTO v_base
    FROM vault.decrypted_secrets
   WHERE name = 'project_url'
   LIMIT 1;
  IF v_base IS NULL OR v_base !~ '^https://' THEN
    -- Reserva: o endereço deste projeto (o empacotador troca pelo do cliente).
    v_base := 'https://seu-projeto-supabase.supabase.co';
  END IF;
  RETURN v_base || '/functions/v1/' || p_funcao;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_url_funcoes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_url_funcoes(text) TO service_role;

-- Chave pública (anon) para passar pelo gateway das funções com verify_jwt.
CREATE OR REPLACE FUNCTION public.app_chave_anon()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  IF v IS NULL OR length(v) < 20 THEN
    v := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho';
  END IF;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_chave_anon() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_chave_anon() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Segredo das chamadas internas (gatilho → função)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_webhook_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'notify_webhook_secret',
      'Segredo das chamadas do banco às funções (cabeçalho x-notify-secret).'
    );
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. Integrações internas da empresa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integracoes_internas (
  chave         text PRIMARY KEY,
  ligado        boolean NOT NULL,
  descricao     text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integracoes_internas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracoes_internas FROM anon, authenticated;

-- Banco com contas (produção) = ligada, como sempre foi. Banco novo = desligada.
INSERT INTO public.integracoes_internas (chave, ligado, descricao)
VALUES ('crm_empresa', NOT public.htai_banco_novo(),
        'Ponte de vendas e contratos com o CRM interno (GHL): gatilhos e monitor diário.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ponte_crm_ligada()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT coalesce((SELECT ligado FROM public.integracoes_internas WHERE chave = 'crm_empresa'), true)
      OR EXISTS (SELECT 1 FROM public.tenant_integracoes WHERE provider = 'empire' AND is_active);
$$;
-- O WHEN dos gatilhos abaixo roda como o usuário que edita o contrato/venda,
-- então o usuário logado (authenticated) precisa poder executar esta função.
REVOKE EXECUTE ON FUNCTION public.ponte_crm_ligada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponte_crm_ligada() TO authenticated, service_role;

-- Gatilhos da ponte: mesma definição de antes + WHEN (ponte ligada).
DROP TRIGGER IF EXISTS trg_ghl_marcar_assinada ON public.contratos;
CREATE TRIGGER trg_ghl_marcar_assinada
  AFTER INSERT OR UPDATE OF link_clicksign ON public.contratos
  FOR EACH ROW WHEN (public.ponte_crm_ligada())
  EXECUTE FUNCTION public.tg_ghl_marcar_assinada();

DROP TRIGGER IF EXISTS trg_venda_ressincronizar_crm ON public.vendas_pendentes;
CREATE TRIGGER trg_venda_ressincronizar_crm
  AFTER UPDATE ON public.vendas_pendentes
  FOR EACH ROW WHEN (public.ponte_crm_ligada())
  EXECUTE FUNCTION public.tg_venda_ressincronizar_crm();

DROP TRIGGER IF EXISTS trg_contrato_ressincronizar_venda_crm ON public.contratos;
CREATE TRIGGER trg_contrato_ressincronizar_venda_crm
  AFTER INSERT OR UPDATE OF status, link_clicksign, data_assinatura ON public.contratos
  FOR EACH ROW WHEN (public.ponte_crm_ligada())
  EXECUTE FUNCTION public.tg_contrato_ressincronizar_venda_crm();

-- Monitor diário da ponte: só chama a função com a ponte ligada.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendas-sync-monitor-daily-9am-brt') THEN
    PERFORM cron.unschedule('vendas-sync-monitor-daily-9am-brt');
  END IF;
END
$do$;

SELECT cron.schedule(
  'vendas-sync-monitor-daily-9am-brt',
  '0 12 * * *',
  $cron$
  SELECT net.http_post(
    url := public.app_url_funcoes('vendas-sync-monitor'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.app_chave_anon()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE public.ponte_crm_ligada();
  $cron$
);

-- ---------------------------------------------------------------------------
-- 4. contratos-alerts com o segredo do agendador
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contratos-alerts-daily-9am-brt') THEN
    PERFORM cron.unschedule('contratos-alerts-daily-9am-brt');
  END IF;
END
$do$;

SELECT cron.schedule(
  'contratos-alerts-daily-9am-brt',
  '0 12 * * *',
  $cron$
  SELECT net.http_post(
    url := public.app_url_funcoes('contratos-alerts'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret';
  $cron$
);

-- ---------------------------------------------------------------------------
-- 5. Primeiro acesso: a primeira conta assume a empresa principal
-- ---------------------------------------------------------------------------
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
  v_master      UUID := '00000000-0000-0000-0000-000000000001';
  v_tenant_id   UUID;
  v_has_admin   BOOLEAN;
  v_new_tenant  UUID;
  v_email_local TEXT;
  v_qtd_tenants INT;
  v_empresa     TEXT;
BEGIN
  v_nome   := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email);
  v_perfil := COALESCE(NEW.raw_user_meta_data->>'perfil', 'cliente');
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id','')::uuid;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;

  -- Instância recém-criada: o 1º usuário vira admin.
  IF NOT v_has_admin THEN
    v_email_local := split_part(COALESCE(NEW.email, 'tenant'), '@', 1);
    v_empresa := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'empresa', '')), '');

    -- Instalação do zero: a semente já criou a empresa principal (mestre), vazia.
    -- A primeira conta assume essa empresa em vez de criar uma segunda.
    SELECT t.id INTO v_new_tenant
      FROM public.tenants t
     WHERE t.is_master
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = t.id)
     LIMIT 1;

    IF v_new_tenant IS NOT NULL THEN
      UPDATE public.tenants
         SET name = COALESCE(v_empresa, v_nome, v_email_local, 'Minha Empresa'),
             slug = lower(regexp_replace(v_email_local, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(NEW.id::text, 1, 8)
       WHERE id = v_new_tenant;
      v_tenant_id := v_new_tenant;
      v_perfil := 'admin';
      -- segue para o caminho comum (cria users, profiles, user_roles e o cargo)
    ELSE
      INSERT INTO public.tenants (name, slug, primary_color)
      VALUES (
        COALESCE(v_empresa, v_nome, v_email_local, 'Minha Empresa'),
        v_email_local || '-' || substring(NEW.id::text, 1, 8),
        '#0B57D0'
      )
      RETURNING id INTO v_new_tenant;

      INSERT INTO public.users (id, nome, email, perfil, tenant_id)
      VALUES (NEW.id, v_nome, NEW.email, 'admin', v_new_tenant)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (user_id, tenant_id, full_name)
      VALUES (NEW.id, v_new_tenant, v_nome)
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.user_roles (user_id, role, tenant_id)
      VALUES (NEW.id, 'admin', v_new_tenant)
      ON CONFLICT (user_id) DO NOTHING;

      RETURN NEW;
    END IF;
  END IF;

  -- Sem empresa informada: só resolve sozinho se não houver ambiguidade.
  IF v_tenant_id IS NULL THEN
    SELECT count(*) INTO v_qtd_tenants FROM public.tenants;
    IF v_qtd_tenants = 1 THEN
      SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
    ELSE
      RAISE EXCEPTION
        'Cadastro sem empresa definida: informe tenant_id em raw_user_meta_data (a instância tem % empresas).',
        v_qtd_tenants;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    RAISE EXCEPTION 'Empresa % não existe.', v_tenant_id;
  END IF;

  INSERT INTO public.users (id, nome, email, perfil, tenant_id)
  VALUES (NEW.id, v_nome, NEW.email, v_perfil, v_tenant_id)
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

  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, v_role, v_tenant_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Os cargos-semente (00000000-0000-0000-0003-...) só existem no tenant mestre.
  IF v_position_id IS NOT NULL AND v_tenant_id = v_master THEN
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
      INSERT INTO public.employee_positions (employee_id, position_id, is_primary, tenant_id)
      VALUES (v_employee_id, v_position_id, true, v_tenant_id)
      ON CONFLICT (employee_id, position_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Banco novo: sem dados de exemplo da empresa
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF public.htai_banco_novo() THEN
    -- Grupo de aquecimento semeado com grupo e números internos da empresa.
    IF to_regclass('public.wa_warmup_groups') IS NOT NULL THEN
      DELETE FROM public.wa_warmup_groups g
       WHERE NOT EXISTS (SELECT 1 FROM public.wa_warmup_logs l WHERE l.group_id = g.id);
    END IF;
    -- Catálogo de produtos da empresa (20260512120000), se ninguém usou.
    DELETE FROM public.produtos_comissao pc
     USING public.products p
     WHERE pc.produto_id = p.id
       AND p.client_id IS NULL
       AND p.descricao = 'Oferta comercial — catálogo'
       AND NOT EXISTS (SELECT 1 FROM public.contratos c WHERE c.produto_id = p.id);
    DELETE FROM public.products p
     WHERE p.client_id IS NULL
       AND p.descricao = 'Oferta comercial — catálogo'
       AND NOT EXISTS (SELECT 1 FROM public.contratos c WHERE c.produto_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.produtos_comissao pc WHERE pc.produto_id = p.id);
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 7. Agendamentos que a produção criou à mão (fora das migrações)
--    Regra: se já existe um job chamando a função, não cria outro. Para as
--    duas funções que passaram a exigir o segredo do agendador
--    (cobranca-scheduler e chat-broadcast-scheduler), o job existente recebe
--    o cabeçalho x-cron-secret, mantendo horário e estado.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  j record;
  v_funcao text;
  v_tem boolean;
BEGIN
  -- 7.1 Cobrança e disparos: acrescenta o segredo em jobs existentes.
  FOREACH v_funcao IN ARRAY ARRAY['cobranca-scheduler', 'chat-broadcast-scheduler'] LOOP
    FOR j IN SELECT jobid, command FROM cron.job WHERE command LIKE '%/functions/v1/' || v_funcao || '%' LOOP
      IF position('x-cron-secret' IN j.command) = 0 THEN
        PERFORM cron.alter_job(j.jobid, command := format($job$
  SELECT net.http_post(
    url := public.app_url_funcoes(%L),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret';
$job$, v_funcao));
      END IF;
    END LOOP;
  END LOOP;

  -- 7.2 Régua de cobrança a cada 5 min (só se não houver job para ela).
  SELECT EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%/functions/v1/cobranca-scheduler%'
                  OR command LIKE '%app_url_funcoes(''cobranca-scheduler'')%') INTO v_tem;
  IF NOT v_tem THEN
    PERFORM cron.schedule('cobranca-scheduler-every-5min', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := public.app_url_funcoes('cobranca-scheduler'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret';
$job$);
  END IF;

  -- 7.3 Monitor de SLA do chat a cada 5 min (na produção já existe com este nome).
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-sla-monitor-every-5min'
                  OR command LIKE '%/functions/v1/chat-sla-monitor%') THEN
    PERFORM cron.schedule('chat-sla-monitor-every-5min', '*/5 * * * *', $job$
  SELECT net.http_post(
    url := public.app_url_funcoes('chat-sla-monitor'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
    body := '{}'::jsonb
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'wa_auto_cron_secret';
$job$);
  END IF;

  -- 7.4 Instagram dos clientes: fechamento semanal.
  --     Usam CRON_SECRET (segredo das funções); o instalador grava o mesmo valor
  --     no cofre como 'cron_secret'. Sem ele no cofre, o job não chama nada.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-stats-weekly-close'
                  OR command LIKE '%/functions/v1/instagram-stats-batch%') THEN
    PERFORM cron.schedule('instagram-stats-weekly-close', '0 9 * * 1', $job$
  SELECT net.http_post(
    url := public.app_url_funcoes('instagram-stats-batch'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'cron_secret';
$job$);
  END IF;
  -- instagram-alerts não é agendado: a função usa latest_instagram_snapshots,
  -- que não existe em migração nenhuma (decisão do dono de 09/11/2026: fica fora
  -- do pacote instalável). Na produção o job que já existe não é tocado.
END
$do$;
