-- Lookup mínimo para o provisionamento M2M reutilizar uma conta OIDC por e-mail.
-- Apenas service_role executa; auth.users nunca é exposta ao navegador.

begin;

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

comment on function public.get_user_id_by_email(text) is
  'Lookup server-side usado pelo provision-tenant; indisponível para clientes.';

commit;
