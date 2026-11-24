-- LOCAL PREPARADA. Não executada. Responsabilidade operacional != contrato/comissão.
-- Membership atual é removida no encerramento; histórico próprio retém o snapshot.
-- Sem backfill de eventos, sem datas históricas inventadas, sem cleanup de inativos.
-- Retenção: histórico/estado impedem hard-delete do cliente (FK NO ACTION).
-- DELETE de users/clients com memberships também passa pelo guard e pode ser recusado.
-- Legado válido é auditado/serializado, mas NÃO possui o CAS/idempotência da RPC.
BEGIN;

DROP TRIGGER IF EXISTS trg_sync_estrategista_contratos ON public.client_assignments;
DROP TRIGGER IF EXISTS trg_sync_contrato_estrategista_to_assignment ON public.contratos;

CREATE TABLE public.client_assignment_state (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE NO ACTION,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  revisao bigint NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  historico_desde timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, client_id)
);
CREATE TABLE public.client_assignment_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE NO ACTION,
  ator_id uuid NOT NULL, -- snapshot, sem FK/cascata de usuário
  idempotencia uuid NOT NULL,
  pedido jsonb NOT NULL CHECK (jsonb_typeof(pedido) = 'object'),
  acao text NOT NULL CHECK (acao IN ('adicionar','trocar','encerrar')),
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 3 AND 500),
  origem text NOT NULL DEFAULT 'desk_rpc' CHECK (origem = 'desk_rpc'),
  transacao bigint NOT NULL DEFAULT txid_current(),
  criada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  resposta jsonb,
  UNIQUE (tenant_id, client_id, ator_id, idempotencia)
);
CREATE UNIQUE INDEX client_assignment_operation_pending
  ON public.client_assignment_operations (tenant_id, client_id, transacao) WHERE resposta IS NULL;
CREATE TABLE public.client_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE NO ACTION,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE NO ACTION,
  revisao bigint NOT NULL CHECK (revisao > 0),
  operacao_id uuid NOT NULL, -- correlação; legado gera UUID próprio
  acao text NOT NULL CHECK (acao IN ('adicionar','trocar','encerrar')),
  origem text NOT NULL CHECK (origem IN ('desk_rpc','legado_dml')),
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 3 AND 500),
  ator_id uuid NOT NULL,
  ator_nome text NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  antes jsonb,
  depois jsonb,
  CHECK (antes IS NOT NULL OR depois IS NOT NULL),
  CHECK (antes IS NULL OR jsonb_typeof(antes) = 'object'),
  CHECK (depois IS NULL OR jsonb_typeof(depois) = 'object'),
  UNIQUE (tenant_id, client_id, revisao)
);
COMMENT ON TABLE public.client_assignment_events IS
  'Append-only. Histórico registrado a partir desta atualização; nenhum evento legado é inventado. Snapshots sem FK de usuário/assignment. Retenção impede hard-delete do cliente.';
COMMENT ON TABLE public.client_assignment_state IS
  'Revisão monotônica da responsabilidade operacional por cliente; ausência legada significa revisão 0, não histórico reconstruído.';

ALTER TABLE public.client_assignment_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assignment_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assignment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_assignment_state, public.client_assignment_operations,
  public.client_assignment_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.client_assignment_state, public.client_assignment_events TO authenticated, service_role;

-- Preserva os ramos de perfis existentes; só a membership de estrategista passa
-- a exigir tenant e ativo. Legados inativos não são apagados por esta migration.
CREATE OR REPLACE FUNCTION public.user_can_access_client(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_client_id IS NULL THEN true
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid())
      IN ('admin','gerente','agente_chat','atendimento','admin_cobranca','agente_cobranca') THEN true
    WHEN (SELECT perfil FROM public.users WHERE id = auth.uid()) = 'estrategista' THEN EXISTS (
      SELECT 1 FROM public.client_assignments ca
       WHERE ca.user_id = auth.uid() AND ca.client_id = p_client_id
         AND ca.tenant_id = public.get_user_tenant_id() AND ca.ativo IS TRUE
    )
    ELSE false
  END
$fn$;

CREATE FUNCTION public.client_assignment_pode_ler(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u JOIN public.clients c ON c.tenant_id = u.tenant_id
     WHERE u.id = auth.uid() AND u.tenant_id = public.get_user_tenant_id()
       AND u.ativo IS TRUE AND u.perfil <> 'cliente' AND c.id = p_client_id
  ) AND (public.has_permissao('clientes','ver') OR public.has_permissao('clientes.atribuir','editar'))
    AND coalesce(public.user_can_access_client(p_client_id), false)
$fn$;
REVOKE ALL ON FUNCTION public.client_assignment_pode_ler(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.client_assignment_pode_ler(uuid) TO authenticated;
CREATE POLICY client_assignment_state_read ON public.client_assignment_state FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.client_assignment_pode_ler(client_id));
CREATE POLICY client_assignment_events_read ON public.client_assignment_events FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.client_assignment_pode_ler(client_id));

CREATE FUNCTION private.client_assignment_autorizar(p_client_id uuid, p_escrita boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE u record; v_cliente uuid;
BEGIN
  SELECT id, tenant_id, nome INTO u FROM public.users
   WHERE id = auth.uid() AND tenant_id = public.get_user_tenant_id()
     AND ativo IS TRUE AND perfil <> 'cliente' FOR SHARE;
  IF NOT FOUND OR (p_escrita AND NOT coalesce(public.has_permissao('clientes.atribuir','editar'), false))
    OR (NOT coalesce(public.client_assignment_pode_ler(p_client_id), false) AND NOT (
      p_escrita AND EXISTS (
        -- Só uma operação criada pela RPC, nesta tx/ator/cliente, preserva a
        -- autorização inicial ao transferir a última membership do próprio ator.
        SELECT 1 FROM public.client_assignment_operations op WHERE op.tenant_id = u.tenant_id
          AND op.client_id = p_client_id AND op.ator_id = auth.uid()
          AND op.transacao = txid_current() AND op.resposta IS NULL
      )
    )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'atribuicao_sem_permissao';
  END IF;
  IF p_escrita THEN
    SELECT id INTO v_cliente FROM public.clients WHERE id = p_client_id AND tenant_id = u.tenant_id FOR UPDATE;
  ELSE
    SELECT id INTO v_cliente FROM public.clients WHERE id = p_client_id AND tenant_id = u.tenant_id FOR SHARE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'atribuicao_sem_permissao'; END IF;
  -- A espera pelo mutex pode ter permitido a outro escritor retirar o acesso.
  IF (p_escrita AND NOT coalesce(public.has_permissao('clientes.atribuir','editar'), false))
    OR (NOT coalesce(public.client_assignment_pode_ler(p_client_id), false) AND NOT (
      p_escrita AND EXISTS (SELECT 1 FROM public.client_assignment_operations op
        WHERE op.tenant_id=u.tenant_id AND op.client_id=p_client_id AND op.ator_id=auth.uid()
          AND op.transacao=txid_current() AND op.resposta IS NULL)
    )) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao'; END IF;
  RETURN jsonb_build_object('tenant_id', u.tenant_id, 'ator_id', u.id, 'ator_nome', u.nome);
END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_autorizar(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.client_assignment_elegivel(p_tenant uuid, p_user uuid, p_tipo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  SELECT p_tipo IN ('estrategista','atendimento') AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_user AND u.tenant_id = p_tenant
      AND u.ativo IS TRUE AND u.perfil <> 'cliente'
      AND (u.perfil IN ('admin','gerente')
        OR u.perfil = p_tipo
        OR EXISTS (SELECT 1 FROM public.client_assignments a
          WHERE a.tenant_id = p_tenant AND a.user_id = u.id AND a.tipo = p_tipo AND a.ativo IS TRUE))
  )
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_elegivel(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.client_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_ctx jsonb; v_client uuid; v_tenant uuid; v_user uuid; v_ativo boolean; v_perfil text;
BEGIN
  v_client := CASE WHEN TG_OP = 'DELETE' THEN OLD.client_id ELSE NEW.client_id END;
  v_ctx := private.client_assignment_autorizar(v_client, true);
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'ativo') IS DISTINCT FROM (to_jsonb(OLD) - 'ativo') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'atribuicao_identidade_imutavel';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS DISTINCT FROM v_tenant THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao'; END IF;
    v_user := OLD.user_id;
  ELSE
    IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao';
    END IF;
    NEW.tenant_id := v_tenant;
    IF NEW.ativo IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_use_encerrar';
    END IF;
    IF NEW.tipo NOT IN ('estrategista','atendimento') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_parametros_invalidos';
    END IF;
    IF TG_OP = 'INSERT' THEN NEW.criado_em := clock_timestamp(); END IF;
    v_user := NEW.user_id;
  END IF;
  -- Mantém nome/atividade do alvo estáveis até o commit. Encerrar aceita alvo inativo.
  SELECT ativo, perfil INTO v_ativo, v_perfil FROM public.users
   WHERE id = v_user AND tenant_id = v_tenant FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_retencao_historico'; END IF;
  IF TG_OP <> 'DELETE' THEN
    IF v_ativo IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_destino_inativo'; END IF;
    IF NOT coalesce(private.client_assignment_elegivel(v_tenant, v_user, NEW.tipo), false) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_destino_inelegivel';
    END IF;
  END IF;
  INSERT INTO public.client_assignment_state (client_id, tenant_id) VALUES (v_client, v_tenant) ON CONFLICT (client_id) DO NOTHING;
  PERFORM 1 FROM public.client_assignment_state WHERE client_id = v_client AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_sem_permissao'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER client_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION private.client_assignment_guard();

CREATE FUNCTION private.client_assignment_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE a public.client_assignments%ROWTYPE; v_before jsonb; v_after jsonb; v_nome text;
  v_rev bigint; v_ator_nome text; v_op public.client_assignment_operations%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN a := OLD; ELSE a := NEW; END IF;
  SELECT nome INTO STRICT v_nome FROM public.users WHERE id = a.user_id AND tenant_id = a.tenant_id;
  SELECT nome INTO STRICT v_ator_nome FROM public.users WHERE id = auth.uid() AND tenant_id = a.tenant_id;
  IF TG_OP <> 'INSERT' THEN v_before := jsonb_build_object('id',OLD.id,'client_id',OLD.client_id,
    'user_id',OLD.user_id,'tipo',OLD.tipo,'ativo',OLD.ativo,'criado_em',OLD.criado_em,'usuario_nome',v_nome); END IF;
  IF TG_OP <> 'DELETE' THEN v_after := jsonb_build_object('id',NEW.id,'client_id',NEW.client_id,
    'user_id',NEW.user_id,'tipo',NEW.tipo,'ativo',NEW.ativo,'criado_em',NEW.criado_em,'usuario_nome',v_nome); END IF;
  UPDATE public.client_assignment_state SET revisao = revisao + 1
   WHERE client_id = a.client_id AND tenant_id = a.tenant_id RETURNING revisao INTO STRICT v_rev;
  SELECT * INTO v_op FROM public.client_assignment_operations
   WHERE tenant_id = a.tenant_id AND client_id = a.client_id AND ator_id = auth.uid()
     AND transacao = txid_current() AND resposta IS NULL;
  INSERT INTO public.client_assignment_events
    (tenant_id, client_id, revisao, operacao_id, acao, origem, motivo, ator_id, ator_nome, antes, depois)
  VALUES (a.tenant_id, a.client_id, v_rev, coalesce(v_op.id, gen_random_uuid()),
    coalesce(v_op.acao, CASE WHEN TG_OP = 'DELETE' THEN 'encerrar' ELSE 'adicionar' END),
    coalesce(v_op.origem, 'legado_dml'),
    coalesce(v_op.motivo, 'Alteração direta legada; motivo não informado pelo escritor.'),
    auth.uid(), v_ator_nome, v_before, v_after);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_auditar() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER client_assignment_audit AFTER INSERT OR UPDATE OR DELETE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION private.client_assignment_auditar();

CREATE FUNCTION private.client_assignment_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
BEGIN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='atribuicao_historico_imutavel'; END;
$fn$;
REVOKE ALL ON FUNCTION private.client_assignment_append_only() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER client_assignment_events_immutable BEFORE UPDATE OR DELETE ON public.client_assignment_events
  FOR EACH ROW EXECUTE FUNCTION private.client_assignment_append_only();
CREATE TRIGGER client_assignment_events_no_truncate BEFORE TRUNCATE ON public.client_assignment_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.client_assignment_append_only();
REVOKE TRUNCATE ON public.client_assignments FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS client_assignments_all ON public.client_assignments;
CREATE POLICY client_assignments_insert ON public.client_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_permissao('clientes.atribuir','editar') AND public.client_assignment_pode_ler(client_id));
CREATE POLICY client_assignments_update ON public.client_assignments FOR UPDATE TO authenticated
  USING (public.has_permissao('clientes.atribuir','editar') AND public.client_assignment_pode_ler(client_id))
  WITH CHECK (public.has_permissao('clientes.atribuir','editar') AND public.client_assignment_pode_ler(client_id));
CREATE POLICY client_assignments_delete ON public.client_assignments FOR DELETE TO authenticated
  USING (public.has_permissao('clientes.atribuir','editar') AND public.client_assignment_pode_ler(client_id));

CREATE FUNCTION public.client_assignment_decidir(
  p_client_id uuid, p_acao text, p_tipo text, p_assignment_id uuid, p_user_id uuid,
  p_revisao_esperada bigint, p_idempotencia uuid, p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_ctx jsonb; v_tenant uuid; v_ator uuid; v_pedido jsonb; v_op public.client_assignment_operations%ROWTYPE;
  v_old public.client_assignments%ROWTYPE; v_new public.client_assignments%ROWTYPE; v_rev bigint; v_eventos jsonb; v_resposta jsonb;
BEGIN
  v_ctx := private.client_assignment_autorizar(p_client_id, true);
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_ator := (v_ctx->>'ator_id')::uuid;
  IF p_acao IS NULL OR p_acao NOT IN ('adicionar','trocar','encerrar')
    OR p_tipo IS NULL OR p_tipo NOT IN ('estrategista','atendimento')
    OR p_revisao_esperada IS NULL OR p_revisao_esperada < 0 OR p_idempotencia IS NULL
    OR p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 3 AND 500
    OR (p_acao = 'adicionar' AND (p_assignment_id IS NOT NULL OR p_user_id IS NULL))
    OR (p_acao = 'trocar' AND (p_assignment_id IS NULL OR p_user_id IS NULL))
    OR (p_acao = 'encerrar' AND (p_assignment_id IS NULL OR p_user_id IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_parametros_invalidos';
  END IF;
  v_pedido := jsonb_build_object('acao',p_acao,'tipo',p_tipo,'assignment_id',p_assignment_id,'user_id',p_user_id,
    'revisao_esperada',p_revisao_esperada,'motivo',btrim(p_motivo));
  -- Autorização atual já relida sob o mesmo mutex ANTES de devolver recibo de retry.
  SELECT * INTO v_op FROM public.client_assignment_operations WHERE tenant_id = v_tenant
    AND client_id = p_client_id AND ator_id = v_ator AND idempotencia = p_idempotencia;
  IF FOUND THEN
    IF v_op.pedido IS DISTINCT FROM v_pedido THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_idempotencia_incompativel'; END IF;
    IF v_op.resposta IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='atribuicao_estado_alterado'; END IF;
    RETURN v_op.resposta || jsonb_build_object('repetida',true);
  END IF;
  INSERT INTO public.client_assignment_state (client_id,tenant_id) VALUES (p_client_id,v_tenant) ON CONFLICT (client_id) DO NOTHING;
  SELECT revisao INTO STRICT v_rev FROM public.client_assignment_state WHERE client_id=p_client_id AND tenant_id=v_tenant FOR UPDATE;
  IF v_rev <> p_revisao_esperada THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='atribuicao_estado_alterado'; END IF;
  IF p_assignment_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.client_assignments WHERE id=p_assignment_id AND client_id=p_client_id AND tenant_id=v_tenant FOR UPDATE;
    IF NOT FOUND OR v_old.tipo <> p_tipo THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='atribuicao_estado_alterado'; END IF;
    IF p_acao='trocar' AND v_old.user_id=p_user_id THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_parametros_invalidos'; END IF;
  END IF;
  IF p_user_id IS NOT NULL THEN
    PERFORM 1 FROM public.users WHERE id=p_user_id AND tenant_id=v_tenant AND ativo IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_destino_inativo'; END IF;
    IF NOT coalesce(private.client_assignment_elegivel(v_tenant,p_user_id,p_tipo),false) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_destino_inelegivel';
    END IF;
    SELECT * INTO v_new FROM public.client_assignments WHERE tenant_id=v_tenant AND client_id=p_client_id
      AND user_id=p_user_id AND tipo=p_tipo FOR UPDATE;
    IF FOUND AND v_new.ativo IS TRUE THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='atribuicao_ja_ativa'; END IF;
  END IF;
  INSERT INTO public.client_assignment_operations (tenant_id,client_id,ator_id,idempotencia,pedido,acao,motivo)
    VALUES (v_tenant,p_client_id,v_ator,p_idempotencia,v_pedido,p_acao,btrim(p_motivo)) RETURNING * INTO v_op;
  IF p_assignment_id IS NOT NULL THEN
    DELETE FROM public.client_assignments WHERE id=v_old.id AND tenant_id=v_tenant AND client_id=p_client_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='atribuicao_estado_alterado'; END IF;
  END IF;
  IF p_user_id IS NOT NULL THEN
    IF v_new.id IS NOT NULL THEN
      UPDATE public.client_assignments SET ativo=true WHERE id=v_new.id AND tenant_id=v_tenant AND client_id=p_client_id;
    ELSE
      INSERT INTO public.client_assignments (client_id,user_id,tipo,ativo,tenant_id) VALUES (p_client_id,p_user_id,p_tipo,true,v_tenant);
    END IF;
  END IF;
  SELECT revisao INTO STRICT v_rev FROM public.client_assignment_state WHERE client_id=p_client_id AND tenant_id=v_tenant;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.revisao),'[]'::jsonb) INTO v_eventos
    FROM public.client_assignment_events e WHERE tenant_id=v_tenant AND client_id=p_client_id AND operacao_id=v_op.id;
  v_resposta := jsonb_build_object('ok',true,'operacao_id',v_op.id,'revisao',v_rev,'eventos',v_eventos,'repetida',false);
  UPDATE public.client_assignment_operations SET resposta=v_resposta WHERE id=v_op.id AND tenant_id=v_tenant AND ator_id=v_ator;
  RETURN v_resposta;
END;
$fn$;
REVOKE ALL ON FUNCTION public.client_assignment_decidir(uuid,text,text,uuid,uuid,bigint,uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.client_assignment_decidir(uuid,text,text,uuid,uuid,bigint,uuid,text) TO authenticated;

CREATE FUNCTION public.client_assignment_historico(p_client_id uuid, p_antes_revisao bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_ctx jsonb; v_itens jsonb; v_cursor bigint;
BEGIN
  v_ctx := private.client_assignment_autorizar(p_client_id,false);
  IF p_antes_revisao IS NOT NULL AND p_antes_revisao < 1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='atribuicao_parametros_invalidos';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.revisao DESC),'[]'::jsonb) INTO v_itens FROM (
    SELECT id,revisao,operacao_id,acao,origem,motivo,ator_id,ator_nome,ocorrido_em,antes,depois
      FROM public.client_assignment_events WHERE client_id=p_client_id AND tenant_id=(v_ctx->>'tenant_id')::uuid
        AND (p_antes_revisao IS NULL OR revisao < p_antes_revisao) ORDER BY revisao DESC LIMIT 31
  ) e;
  IF jsonb_array_length(v_itens)>30 THEN v_cursor := (v_itens->29->>'revisao')::bigint; v_itens := v_itens - 30; END IF;
  RETURN jsonb_build_object('eventos',v_itens,'proximo_cursor',v_cursor);
END;
$fn$;
REVOKE ALL ON FUNCTION public.client_assignment_historico(uuid,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.client_assignment_historico(uuid,bigint) TO authenticated;

CREATE FUNCTION public.client_assignment_contexto(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE v_ctx jsonb; v_tenant uuid; v_rev bigint := 0; v_desde timestamptz; v_atuais jsonb; v_inativos jsonb;
  v_elegiveis jsonb := '[]'::jsonb; v_historico jsonb;
BEGIN
  v_ctx := private.client_assignment_autorizar(p_client_id,false); v_tenant := (v_ctx->>'tenant_id')::uuid;
  SELECT revisao,historico_desde INTO v_rev,v_desde FROM public.client_assignment_state WHERE client_id=p_client_id AND tenant_id=v_tenant;
  IF NOT FOUND THEN v_rev:=0; v_desde:=NULL; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.tipo,a.usuario_nome,a.id) FILTER (WHERE a.ativo),'[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.tipo,a.usuario_nome,a.id) FILTER (WHERE NOT a.ativo),'[]'::jsonb)
    INTO v_atuais,v_inativos FROM (
      SELECT a.id,a.client_id,a.user_id,a.tipo,a.ativo,a.criado_em,u.nome AS usuario_nome,u.ativo AS usuario_ativo
       FROM public.client_assignments a JOIN public.users u ON u.id=a.user_id AND u.tenant_id=v_tenant
       WHERE a.client_id=p_client_id AND a.tenant_id=v_tenant
    ) a;
  IF coalesce(public.has_permissao('clientes.atribuir','editar'),false) THEN
    SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.nome,u.id),'[]'::jsonb) INTO v_elegiveis FROM (
      SELECT u.id,u.nome,array_remove(ARRAY[
        CASE WHEN private.client_assignment_elegivel(v_tenant,u.id,'estrategista') THEN 'estrategista' END,
        CASE WHEN private.client_assignment_elegivel(v_tenant,u.id,'atendimento') THEN 'atendimento' END],NULL) AS tipos
       FROM public.users u WHERE u.tenant_id=v_tenant AND u.ativo IS TRUE AND u.perfil<>'cliente'
        AND (private.client_assignment_elegivel(v_tenant,u.id,'estrategista') OR private.client_assignment_elegivel(v_tenant,u.id,'atendimento'))
       ORDER BY u.nome,u.id LIMIT 201
    ) u;
    IF jsonb_array_length(v_elegiveis)>200 THEN RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='atribuicao_lista_limite'; END IF;
  END IF;
  v_historico := public.client_assignment_historico(p_client_id,NULL);
  RETURN jsonb_build_object('client_id',p_client_id,'revisao',v_rev,'historico_desde',v_desde,
    'atuais',coalesce(v_atuais,'[]'::jsonb),'legados_inativos',coalesce(v_inativos,'[]'::jsonb),
    'usuarios_elegiveis',v_elegiveis,'historico',v_historico->'eventos','historico_proximo_cursor',v_historico->'proximo_cursor');
END;
$fn$;
REVOKE ALL ON FUNCTION public.client_assignment_contexto(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.client_assignment_contexto(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
