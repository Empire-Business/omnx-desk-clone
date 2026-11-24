-- Alternativa mínima baseada no catálogo LIVE Desk em 2026-11-05.
-- Dependência: 20261105135312_active_account_authorization (gate de atividade).
-- As duas RPCs já negavam ausência de auth.uid; não há caller SQL em produção.
-- aprovar_extrato_mes é chamada pela ação humana useAprovarExtrato;
-- pj_registrar_nota atende ao prestador autenticado dono da entrega.
-- Só a guarda inicial e o tenant do prestador mudam. Corpos/cálculos, assinaturas,
-- owners, grants, triggers, Storage e dados existentes permanecem intocados.
BEGIN;

CREATE OR REPLACE FUNCTION public.aprovar_extrato_mes(p_estrategista_id uuid, p_mes date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  -- GUARDA DE CONTA ATIVA
  IF auth.uid() IS NULL OR public.get_user_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Conta sem acesso ativo' USING ERRCODE = '42501';
  END IF;
  -- FIM DA GUARDA
  select perfil, tenant_id into v_perfil, v_tenant from public.users where id = v_uid;
  if not (coalesce(v_perfil,'') in ('admin','gerente') or public.is_comissoes_gestor()) then
    raise exception 'Sem permissão para fechar extratos de comissão';
  end if;

  select * into u from public.users where id = p_estrategista_id;
  if not found then raise exception 'Estrategista não encontrado'; end if;

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

CREATE OR REPLACE FUNCTION public.pj_registrar_nota(p_entrega_id uuid, p_storage_path text, p_nome text, p_mime text, p_tamanho bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_prestador uuid; v_status text; v_nota_id uuid; v_tenant uuid;
begin
  -- GUARDA DE CONTA ATIVA
  IF auth.uid() IS NULL OR public.get_user_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Conta sem acesso ativo' USING ERRCODE = '42501';
  END IF;
  -- FIM DA GUARDA
  select e.prestador_id, e.status, p.tenant_id
    into v_prestador, v_status, v_tenant
  from public.pj_entregas e join public.pj_prestadores p on p.id = e.prestador_id
  where e.id = p_entrega_id and p.user_id = auth.uid()
    and p.tenant_id = public.get_user_tenant_id();
  if v_prestador is null then raise exception 'Entrega não encontrada ou não pertence a você.'; end if;
  if v_status not in ('aguardando_nota','recusado') then raise exception 'Esta entrega não está aguardando nota.'; end if;
  insert into public.pj_notas (entrega_id, prestador_id, storage_path, nome_original, mime_type, tamanho_bytes, tenant_id)
  values (p_entrega_id, v_prestador, p_storage_path, p_nome, p_mime, p_tamanho, v_tenant) returning id into v_nota_id;
  update public.pj_entregas set status='nota_enviada', motivo_recusa=null, atualizado_em=now() where id=p_entrega_id;
  return v_nota_id;
end $function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
