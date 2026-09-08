-- ============================================================================
-- Fila de e-mail e venda pública: resolver o tenant sem depender da sessão
-- ============================================================================
-- Continuação de 20260819190000_chat_herda_tenant_do_pai.sql.
--
-- Essas duas tabelas ficaram de fora da herança genérica porque não têm um
-- registro pai único de onde puxar o tenant:
--
--   • email_queue      — a referência é polimórfica (referencia_tipo + referencia_id)
--   • vendas_pendentes — vem de formulário público, sem registro pai
--
-- Ambas são escritas por edge function com service_role (sem sessão), então
-- `resolve_tenant_default()` devolve NULL desde que passou a existir mais de um
-- tenant — e a coluna é NOT NULL. Resultado: e-mail de contrato assinado não
-- entra na fila, e o formulário público de venda falha ao gravar.
--
-- Cada uma ganha um resolvedor próprio, com as âncoras que realmente existem:
--
--   email_queue      1) a referência (contrato / venda), quando for um uuid
--                    2) o destinatário, se for um usuário do sistema
--                    3) fallback: tenant mais antigo
--
--   vendas_pendentes 1) o produto vendido
--                    2) o closer (e-mail de quem preencheu o formulário)
--                    3) fallback: tenant mais antigo
--
-- SOBRE O FALLBACK: é adivinhação, e adivinhação é ruim — mas aqui é o menor
-- dos males. Sem ele, um e-mail transacional deixa de sair e uma venda já
-- preenchida pelo closer se perde; com ele, o pior caso é o registro nascer na
-- empresa errada, o que é visível e corrigível. As duas primeiras âncoras
-- cobrem o caso real de hoje; o fallback só existe para nunca travar.
--
-- A CORREÇÃO DEFINITIVA da venda pública é o formulário dizer de qual empresa
-- ele é (o link já é por empresa) e a edge function repassar o tenant, em vez
-- de o banco deduzir. Enquanto isso não é feito, este resolvedor segura.
-- ============================================================================
set search_path = public, pg_catalog;

-- Vale só como último recurso; ver comentário acima.
create or replace function public.tenant_fallback_mais_antigo()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.tenants order by created_at limit 1
$$;

revoke execute on function public.tenant_fallback_mais_antigo() from public, anon, authenticated;

-- ── fila de e-mail ──────────────────────────────────────────────────────────
create or replace function public.tg_email_queue_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
begin
  if new.tenant_id is not null then
    return new;
  end if;

  -- 1) pela referência, quando ela aponta para um registro de verdade
  if new.referencia_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_ref := new.referencia_id::uuid;

    if new.referencia_tipo = 'contrato' then
      select tenant_id into new.tenant_id from public.contratos where id = v_ref;
    elsif new.referencia_tipo in ('venda', 'vendas_sync', 'venda_pendente') then
      select tenant_id into new.tenant_id from public.vendas_pendentes where id = v_ref;
    elsif new.referencia_tipo = 'cliente' then
      select tenant_id into new.tenant_id from public.clients where id = v_ref;
    end if;
  end if;

  -- 2) pelo destinatário, quando é gente de casa
  if new.tenant_id is null then
    select tenant_id into new.tenant_id
    from public.users
    where lower(email) = lower(new.destinatario_email)
    limit 1;
  end if;

  -- 3) último recurso — e-mail transacional não pode travar
  if new.tenant_id is null then
    new.tenant_id := public.tenant_fallback_mais_antigo();
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_email_queue_tenant() from public, anon, authenticated;

drop trigger if exists zz_resolve_tenant on public.email_queue;
create trigger zz_resolve_tenant before insert on public.email_queue
  for each row execute function public.tg_email_queue_tenant();

-- ── venda vinda do formulário público ───────────────────────────────────────
create or replace function public.tg_vendas_pendentes_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is not null then
    return new;
  end if;

  -- 1) pelo produto vendido
  if new.produto_id is not null then
    select tenant_id into new.tenant_id from public.products where id = new.produto_id;
  end if;

  -- 2) pelo closer que preencheu o formulário
  if new.tenant_id is null and new.closer_email is not null then
    select tenant_id into new.tenant_id
    from public.users
    where lower(email) = lower(new.closer_email)
    limit 1;
  end if;

  -- 3) último recurso — não perder uma venda já preenchida
  if new.tenant_id is null then
    new.tenant_id := public.tenant_fallback_mais_antigo();
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_vendas_pendentes_tenant() from public, anon, authenticated;

drop trigger if exists zz_resolve_tenant on public.vendas_pendentes;
create trigger zz_resolve_tenant before insert on public.vendas_pendentes
  for each row execute function public.tg_vendas_pendentes_tenant();
