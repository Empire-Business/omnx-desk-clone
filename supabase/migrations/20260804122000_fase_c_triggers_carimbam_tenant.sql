-- Fase C.3 — triggers e funções internas passam a carimbar o tenant explicitamente.
--
-- Contexto: essas 11 funções inseriam em tabelas multi-tenant sem informar o
-- tenant_id, contando com o trigger `set_tenant_id` -> `resolve_tenant_default()`.
-- Esse resolvedor só acerta quando há sessão de usuário OU quando existe
-- exatamente 1 tenant. Com o 2º tenant criado no teste de 04/08/2026, qualquer
-- gravação sem sessão (service_role, edge function, gatilho em cascata) passou a
-- estourar NOT NULL — quebrou na hora ao promover um usuário a admin.
--
-- Além disso, as funções de grupo de departamento liam `users` e
-- `internal_conversations` SEM filtro de tenant: com 2 empresas, admins de uma
-- entrariam nos grupos internos da outra.
--
-- A correção é sempre a mesma: derivar o tenant da própria linha de origem
-- (NEW/OLD, ou a entidade pai), nunca do "contexto".

-- ---------------------------------------------------------------------------
-- comissoes_papeis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comissoes_sync_papel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_papel text := public.comissoes_papel_do_perfil(new.perfil);
begin
  if v_papel is null then
    return new;
  end if;

  insert into public.comissoes_papeis (user_id, papel, tenant_id)
  values (new.id, v_papel, new.tenant_id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- contratos_audit_log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_contratos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID;
  v_campos TEXT[] := ARRAY[
    'cliente_nome','empresa','cpf_cnpj','whatsapp','email','instagram',
    'nicho','faturamento','endereco','posicionamento','resumo',
    'produto_nome','status','status_secundario','data_fechamento','vencimento',
    'plano_dias','semanas','renovacao',
    'valor_total','valor_parcela','num_parcelas','percentual_aplicado',
    'entrada','pg_entrada','forma_pagamento','fat_bruto','bonus','link_clicksign',
    'venda_interna','venda_diretoria',
    'estrategista_id','estrategista_nome_raw','vendedor','treinador',
    'seguidores_inicio','seguidores_fim','crescimento_seguidores',
    'videos_postados','entregas_no_prazo','entregas_totais','nps_vip',
    'observacoes','cliente_id'
  ];
  v_campo TEXT;
  v_old  TEXT;
  v_new  TEXT;
BEGIN
  v_user := COALESCE(auth.uid(), NULL);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por, tenant_id)
    VALUES (NEW.id, 'INSERT', v_user, NEW.tenant_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por, tenant_id)
    VALUES (OLD.id, 'DELETE', v_user, OLD.tenant_id);
    RETURN OLD;
  END IF;

  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_campo, v_campo)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.contratos_audit_log
        (contrato_id, operacao, campo, valor_antigo, valor_novo, alterado_por, tenant_id)
      VALUES (NEW.id, 'UPDATE', v_campo, v_old, v_new, v_user, NEW.tenant_id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grupos internos de departamento — carimbam tenant E filtram por tenant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_add_admins_to_dept_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo = 'department' THEN
    INSERT INTO internal_conversation_members (conversation_id, user_id, role, tenant_id)
    SELECT NEW.id, u.id, 'admin', NEW.tenant_id
    FROM users u
    WHERE u.perfil = 'admin' AND u.ativo = true
      AND u.tenant_id = NEW.tenant_id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_dept_group_members()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  conv_id UUID;
  v_tenant UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
  SELECT id INTO conv_id FROM internal_conversations
  WHERE tipo = 'department'
    AND department_id = COALESCE(NEW.department_id, OLD.department_id)
    AND tenant_id = v_tenant;

  IF conv_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO internal_conversation_members (conversation_id, user_id, role, tenant_id)
    VALUES (conv_id, NEW.user_id, 'member', v_tenant)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM internal_conversation_members
    WHERE conversation_id = conv_id AND user_id = OLD.user_id
      AND user_id NOT IN (
        SELECT id FROM users WHERE perfil = 'admin' AND tenant_id = v_tenant
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_dept_gerente_to_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_conv_id
  FROM internal_conversations
  WHERE tipo = 'department' AND department_id = NEW.id
    AND tenant_id = NEW.tenant_id;

  IF v_conv_id IS NOT NULL THEN
    IF OLD.gerente_id IS NOT NULL AND OLD.gerente_id IS DISTINCT FROM NEW.gerente_id THEN
      DELETE FROM internal_conversation_members
      WHERE conversation_id = v_conv_id AND user_id = OLD.gerente_id
        AND NOT EXISTS (
          SELECT 1 FROM chat_department_agents
          WHERE department_id = NEW.id AND user_id = OLD.gerente_id
        );
    END IF;

    IF NEW.gerente_id IS NOT NULL THEN
      INSERT INTO internal_conversation_members (conversation_id, user_id, role, tenant_id)
      VALUES (v_conv_id, NEW.gerente_id, 'admin', NEW.tenant_id)
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- client_assignments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contrato_estrategista_to_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.estrategista_id IS NOT DISTINCT FROM NEW.estrategista_id THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NULL OR NEW.estrategista_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_assignments (client_id, user_id, tipo, ativo, tenant_id)
  VALUES (NEW.cliente_id, NEW.estrategista_id, 'estrategista', true, NEW.tenant_id)
  ON CONFLICT (client_id, user_id, tipo) DO UPDATE SET ativo = true;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- contratos (a partir de venda pendente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_contrato_de_venda_pendente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'descartada' THEN
    INSERT INTO public.contratos (
      cliente_nome, cpf_cnpj, email, whatsapp, empresa, instagram, endereco,
      produto_id, produto_nome, valor_total, data_fechamento,
      status, status_secundario, pagamentos, vendedor, venda_pendente_id,
      pagador_diferente, pagador_nome, pagador_cpf_cnpj, pagador_relacao, pagador_observacao,
      tenant_id
    )
    VALUES (
      NEW.cliente_nome,
      NULLIF(NEW.cliente_cpf_cnpj, ''),
      NULLIF(NEW.cliente_email, ''),
      NULLIF(NEW.cliente_whatsapp, ''),
      NULLIF(NEW.cliente_razao_social, ''),
      NULLIF(NEW.cliente_instagram, ''),
      NULLIF(NEW.cliente_endereco, ''),
      NEW.produto_id,
      NEW.produto_nome,
      COALESCE(NEW.valor_total_venda, 0),
      COALESCE(NEW.criado_em::date, CURRENT_DATE),
      'rascunho',
      'Não iniciado',
      COALESCE(NEW.pagamentos, '[]'::jsonb),
      NULLIF(NEW.closer_nome, ''),
      NEW.id,
      COALESCE(NEW.pagador_diferente, false),
      NULLIF(NEW.pagador_nome, ''),
      NULLIF(NEW.pagador_cpf_cnpj, ''),
      NULLIF(NEW.pagador_relacao, ''),
      NULLIF(NEW.pagador_observacao, ''),
      NEW.tenant_id
    )
    ON CONFLICT (venda_pendente_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- comissoes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  pc RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  v_mes_bonus DATE;
  i INT;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

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

  IF c.data_fechamento IS NULL OR c.data_fechamento <= DATE '1900-01-01' THEN
    RETURN;
  END IF;

  v_offset := CASE WHEN EXTRACT(DAY FROM c.data_fechamento) <= 15 THEN 1 ELSE 2 END;
  v_primeiro_mes := date_trunc('month', c.data_fechamento + (v_offset || ' months')::interval)::date;

  v_valor_parcela := round(c.valor_total / c.num_parcelas, 2);

  SELECT tipo_comissao, valor_comissao_padrao, percentual_padrao, valor_bonus, bonus_condicional
    INTO pc
    FROM public.produtos_comissao
   WHERE produto_id = c.produto_id
     AND tenant_id = c.tenant_id;

  IF FOUND AND pc.tipo_comissao = 'valor_fixo' THEN
    v_valor_comissao := pc.valor_comissao_padrao;
  ELSIF FOUND AND pc.tipo_comissao = 'valor_total' THEN
    v_valor_comissao := round(pc.valor_comissao_padrao / c.num_parcelas, 2);
  ELSIF FOUND AND pc.tipo_comissao = 'percentual' THEN
    v_valor_comissao := round(v_valor_parcela * (pc.percentual_padrao / 100.0), 2);
  ELSE
    v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);
  END IF;

  FOR i IN 1..c.num_parcelas LOOP
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status, eh_bonus, tenant_id
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      i, c.num_parcelas,
      (v_primeiro_mes + ((i - 1) || ' months')::interval)::date,
      v_valor_comissao, v_valor_comissao, 'prevista', false, c.tenant_id
    );
  END LOOP;

  IF FOUND AND COALESCE(pc.valor_bonus, 0) > 0 THEN
    v_mes_bonus := (v_primeiro_mes + ((c.num_parcelas - 1) || ' months')::interval)::date;
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status, eh_bonus, tenant_id
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      c.num_parcelas + 1, c.num_parcelas, v_mes_bonus,
      pc.valor_bonus, pc.valor_bonus, 'prevista', true, c.tenant_id
    );
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- extratos_mensais
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprovar_extrato_mes(p_estrategista_id uuid, p_mes date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid UUID := auth.uid();
  v_perfil TEXT;
  v_tenant UUID;
  v_extrato_id UUID;
  v_total NUMERIC(12,2);
  v_qtd INTEGER;
  u RECORD;
begin
  select perfil, tenant_id into v_perfil, v_tenant from public.users where id = v_uid;
  if not (coalesce(v_perfil,'') in ('admin','gerente') or public.is_comissoes_gestor()) then
    raise exception 'Sem permissão para fechar extratos de comissão';
  end if;

  select * into u from public.users where id = p_estrategista_id;
  if not found then raise exception 'Estrategista não encontrado'; end if;

  -- não deixa fechar extrato de gente de outra empresa
  if v_tenant is null or u.tenant_id is distinct from v_tenant then
    raise exception 'Estrategista não pertence à sua empresa';
  end if;

  select coalesce(sum(valor_final), 0), count(*)
    into v_total, v_qtd
    from public.comissoes
   where estrategista_id = p_estrategista_id
     and tenant_id = v_tenant
     and mes_referencia = date_trunc('month', p_mes)::date
     and status = 'aprovada'
     and extrato_id is null;

  if v_qtd = 0 then
    raise exception 'Aprove ao menos uma comissão antes de fechar o mês';
  end if;

  insert into public.extratos_mensais (
    estrategista_id, estrategista_nome, estrategista_doc, estrategista_pix,
    mes_referencia, total_bruto, total_liquido,
    status, aprovado_por, aprovado_em, tenant_id
  ) values (
    p_estrategista_id, u.nome, u.cnpj_cpf, u.chave_pix,
    date_trunc('month', p_mes)::date, v_total, v_total,
    'aprovado', v_uid, now(), v_tenant
  )
  on conflict (estrategista_id, mes_referencia) do update
    set total_bruto = EXCLUDED.total_bruto,
        total_liquido = EXCLUDED.total_liquido,
        estrategista_doc = EXCLUDED.estrategista_doc,
        estrategista_pix = EXCLUDED.estrategista_pix,
        status = 'aprovado',
        aprovado_por = v_uid,
        aprovado_em = now()
  returning id into v_extrato_id;

  update public.comissoes
     set extrato_id = v_extrato_id
   where estrategista_id = p_estrategista_id
     and tenant_id = v_tenant
     and mes_referencia = date_trunc('month', p_mes)::date
     and status = 'aprovada'
     and extrato_id is null;

  return v_extrato_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- pj_notas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pj_registrar_nota(
  p_entrega_id uuid, p_storage_path text, p_nome text, p_mime text, p_tamanho bigint
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_prestador uuid; v_status text; v_nota_id uuid; v_tenant uuid;
begin
  select e.prestador_id, e.status, p.tenant_id
    into v_prestador, v_status, v_tenant
  from public.pj_entregas e join public.pj_prestadores p on p.id = e.prestador_id
  where e.id = p_entrega_id and p.user_id = auth.uid();
  if v_prestador is null then raise exception 'Entrega não encontrada ou não pertence a você.'; end if;
  if v_status not in ('aguardando_nota','recusado') then raise exception 'Esta entrega não está aguardando nota.'; end if;
  insert into public.pj_notas (entrega_id, prestador_id, storage_path, nome_original, mime_type, tamanho_bytes, tenant_id)
  values (p_entrega_id, v_prestador, p_storage_path, p_nome, p_mime, p_tamanho, v_tenant) returning id into v_nota_id;
  update public.pj_entregas set status='nota_enviada', motivo_recusa=null, atualizado_em=now() where id=p_entrega_id;
  return v_nota_id;
end $function$;
