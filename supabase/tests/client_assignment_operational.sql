-- CENÁRIOS PREPARADOS, NÃO EXECUTADOS. NÃO RODAR EM PRODUÇÃO.
-- Exige ambiente explicitamente autorizado, migration aplicada e fixtures já
-- existentes. Este arquivo NÃO cria banco, schema, auth.users, tenant ou roles.
-- Autenticação real da sessão: admin/gerente fixture com acesso ao cliente.
-- Configurações de fixture (não são claims/autenticação):
--   omnx.fixture.client_id: cliente descartável do tenant da sessão
--   omnx.fixture.assignment_id: membership estrategista ativa de user_a
--   omnx.fixture.user_a / user_b: ativos/elegíveis, sem outra membership no cliente
--   omnx.fixture.user_inativo: mesmo tenant, ativo=false
--   omnx.fixture.user_cliente: mesmo tenant, ativo=true/perfil cliente
--   omnx.fixture.user_outro_tenant: usuário fixture de outro tenant
-- Cliente fixture deve ter contratos/comissões sintéticos para provar isolamento.
-- Nenhum SET ROLE, request.jwt ou substituição de auth.uid() é usado.
BEGIN;
DO $test$
DECLARE
  c uuid := current_setting('omnx.fixture.client_id', true)::uuid;
  a uuid := current_setting('omnx.fixture.assignment_id', true)::uuid;
  ua uuid := current_setting('omnx.fixture.user_a', true)::uuid;
  ub uuid := current_setting('omnx.fixture.user_b', true)::uuid;
  ui uuid := current_setting('omnx.fixture.user_inativo', true)::uuid;
  uc uuid := current_setting('omnx.fixture.user_cliente', true)::uuid;
  ux uuid := current_setting('omnx.fixture.user_outro_tenant', true)::uuid;
  t uuid := public.get_user_tenant_id();
  chave uuid := gen_random_uuid();
  ctx jsonb; r jsonb; rr jsonb; h jsonb; h2 jsonb; ev jsonb; v_rev bigint; v_rev0 bigint;
  nova uuid; v_bad uuid; v_hash_contratos text; v_hash_comissoes text; v_depois text; i int;
BEGIN
  IF auth.uid() IS NULL OR c IS NULL OR a IS NULL OR ua IS NULL OR ub IS NULL
     OR ui IS NULL OR uc IS NULL OR ux IS NULL THEN
    RAISE EXCEPTION 'Fixtures/autenticação ausentes: nenhum cenário foi executado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND tenant_id=t AND perfil IN ('admin','gerente') AND ativo IS TRUE) THEN
    RAISE EXCEPTION 'Este roteiro exige ator fixture admin/gerente real';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_assignments WHERE id=a AND client_id=c AND user_id=ua AND tipo='estrategista' AND ativo AND tenant_id=t)
     OR EXISTS (SELECT 1 FROM public.client_assignments WHERE client_id=c AND user_id=ub AND tipo='estrategista' AND tenant_id=t) THEN
    RAISE EXCEPTION 'Estado inicial das fixtures incompatível';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE cliente_id=c AND tenant_id=t)
     OR NOT EXISTS (SELECT 1 FROM public.comissoes co JOIN public.contratos k ON k.id=co.contrato_id WHERE k.cliente_id=c AND k.tenant_id=t AND co.tenant_id=t) THEN
    RAISE EXCEPTION 'Contratos/comissões sintéticos são obrigatórios para testar isolamento';
  END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.id),'[]'::jsonb)::text) INTO v_hash_contratos
    FROM public.contratos k WHERE k.tenant_id=t AND k.cliente_id=c;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(co) ORDER BY co.id),'[]'::jsonb)::text) INTO v_hash_comissoes
    FROM public.comissoes co JOIN public.contratos k ON k.id=co.contrato_id WHERE k.tenant_id=t AND k.cliente_id=c AND co.tenant_id=t;
  ctx := public.client_assignment_contexto(c); v_rev0 := (ctx->>'revisao')::bigint;
  r := public.client_assignment_decidir(c,'trocar','estrategista',a,ub,v_rev0,chave,'Teste fixture: troca operacional');
  v_rev := (r->>'revisao')::bigint;
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR v_rev<>v_rev0+2 OR jsonb_array_length(r->'eventos')<>2 THEN
    RAISE EXCEPTION 'Troca não gerou dois eventos/revisões correlacionados';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_assignments WHERE id=a) THEN RAISE EXCEPTION 'Membership antiga permaneceu'; END IF;
  SELECT id INTO STRICT nova FROM public.client_assignments WHERE client_id=c AND user_id=ub AND tipo='estrategista' AND ativo AND tenant_id=t;
  IF r->'eventos'->0->'antes'->>'id' IS DISTINCT FROM a::text
     OR r->'eventos'->0->'depois' IS DISTINCT FROM 'null'::jsonb
     OR r->'eventos'->1->'depois'->>'id' IS DISTINCT FROM nova::text THEN
    RAISE EXCEPTION 'Snapshots da troca não preservam os IDs antigos/novos';
  END IF;
  FOR ev IN SELECT value FROM jsonb_array_elements(r->'eventos') LOOP
    IF ev->>'operacao_id' IS DISTINCT FROM r->>'operacao_id' OR ev->>'ator_id' IS DISTINCT FROM auth.uid()::text
       OR ev->>'origem' IS DISTINCT FROM 'desk_rpc' OR ev->>'ator_nome' IS NULL THEN RAISE EXCEPTION 'Autoria/correlação inválida'; END IF;
  END LOOP;
  rr := public.client_assignment_decidir(c,'trocar','estrategista',a,ub,v_rev0,chave,'Teste fixture: troca operacional');
  IF (rr->>'repetida')::boolean IS DISTINCT FROM true OR rr->>'operacao_id' IS DISTINCT FROM r->>'operacao_id'
     OR (rr->>'revisao')::bigint<>v_rev THEN RAISE EXCEPTION 'Retry criou nova operação'; END IF;
  BEGIN
    PERFORM public.client_assignment_decidir(c,'trocar','estrategista',a,ub,v_rev0,chave,'Payload alterado');
    RAISE EXCEPTION 'Idempotência incompatível foi aceita';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'atribuicao_idempotencia_incompativel' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.client_assignment_decidir(c,'adicionar','estrategista',NULL,ua,v_rev0,gen_random_uuid(),'Revisão antiga');
    RAISE EXCEPTION 'CAS antigo foi aceito';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    IF SQLERRM<>'atribuicao_estado_alterado' THEN RAISE; END IF;
  END;
  FOREACH v_bad IN ARRAY ARRAY[ui,uc,ux] LOOP
    BEGIN
      PERFORM public.client_assignment_decidir(c,'adicionar','estrategista',NULL,v_bad,v_rev,gen_random_uuid(),'Destino fixture inelegível');
      RAISE EXCEPTION 'Destino inelegível foi aceito';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT IN ('atribuicao_destino_inativo','atribuicao_destino_inelegivel') THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    UPDATE public.client_assignments SET ativo=false WHERE id=nova AND tenant_id=t;
    RAISE EXCEPTION 'Inativação legada ambígua foi aceita';
  EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'atribuicao_use_encerrar' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.client_assignments SET user_id=ua WHERE id=nova AND tenant_id=t;
    RAISE EXCEPTION 'Identidade mutável foi aceita';
  EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM<>'atribuicao_identidade_imutavel' THEN RAISE; END IF;
  END;
  DELETE FROM public.client_assignments WHERE id=nova AND tenant_id=t;
  h := public.client_assignment_historico(c,NULL);
  IF (h->'eventos'->0->>'revisao')::bigint<>v_rev+1 OR h->'eventos'->0->>'origem'<>'legado_dml'
     OR h->'eventos'->0->'antes'->>'id'<>nova::text OR h->'eventos'->0->'depois' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'DELETE legado não preservou evento/snapshot/revisão';
  END IF;
  INSERT INTO public.client_assignments (client_id,user_id,tipo,ativo,tenant_id)
    VALUES (c,ua,'estrategista',true,t) RETURNING id INTO nova;
  ctx := public.client_assignment_contexto(c); v_rev := (ctx->>'revisao')::bigint;
  -- 32 eventos adicionais: valida sentinela/cursor sem carga ou concorrência.
  FOR i IN 1..16 LOOP
    r := public.client_assignment_decidir(c,'encerrar','estrategista',nova,NULL,v_rev,gen_random_uuid(),'Fixture paginação: encerrar');
    v_rev := (r->>'revisao')::bigint;
    r := public.client_assignment_decidir(c,'adicionar','estrategista',NULL,ua,v_rev,gen_random_uuid(),'Fixture paginação: adicionar');
    v_rev := (r->>'revisao')::bigint;
    nova := (r->'eventos'->0->'depois'->>'id')::uuid;
  END LOOP;
  h := public.client_assignment_historico(c,NULL);
  IF jsonb_array_length(h->'eventos')<>30 OR h->>'proximo_cursor' IS NULL THEN RAISE EXCEPTION 'Primeira página incompleta'; END IF;
  h2 := public.client_assignment_historico(c,(h->>'proximo_cursor')::bigint);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(h->'eventos') x JOIN jsonb_array_elements(h2->'eventos') y ON x->>'id'=y->>'id') THEN
    RAISE EXCEPTION 'Páginas se sobrepõem';
  END IF;
  BEGIN
    UPDATE public.client_assignment_events SET motivo='Tentativa de reescrita' WHERE id=(h->'eventos'->0->>'id')::uuid;
    RAISE EXCEPTION 'Histórico mutável foi aceito';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.id),'[]'::jsonb)::text) INTO v_depois
    FROM public.contratos k WHERE k.tenant_id=t AND k.cliente_id=c;
  IF v_depois IS DISTINCT FROM v_hash_contratos THEN RAISE EXCEPTION 'Contrato foi alterado'; END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(co) ORDER BY co.id),'[]'::jsonb)::text) INTO v_depois
    FROM public.comissoes co JOIN public.contratos k ON k.id=co.contrato_id WHERE k.tenant_id=t AND k.cliente_id=c AND co.tenant_id=t;
  IF v_depois IS DISTINCT FROM v_hash_comissoes THEN RAISE EXCEPTION 'Comissão foi alterada'; END IF;
  RAISE NOTICE 'Cenários locais concluídos dentro de transação que será revertida';
END;
$test$;
ROLLBACK;
-- PENDENTES para ambiente autorizado: outras sessões reais (read-only,
-- sem permissão, fora do tenant/cliente, revogação entre retries) e corrida
-- concorrente em duas sessões. Este roteiro não simula essas provas.
