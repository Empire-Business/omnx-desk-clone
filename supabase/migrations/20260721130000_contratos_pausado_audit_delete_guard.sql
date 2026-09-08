-- Mudanças de schema aplicadas em 21/07/2026 (contratos).
-- Idempotente: pode ser reaplicada sem erro.

-- 1) Novo status primário "pausado" (o front já usava o secundário PAUSADO).
alter table public.contratos drop constraint if exists contratos_status_check;
alter table public.contratos add constraint contratos_status_check
  check (status = any (array['rascunho','ativo','pausado','cancelado','concluido']::text[]));

-- 2) Remove a FK do log de auditoria para contratos.
--    O trigger AFTER DELETE inseria um registro de DELETE referenciando o id já apagado,
--    violando a FK (ON DELETE CASCADE) e travando QUALQUER exclusão de contrato.
--    Log de auditoria deve sobreviver à exclusão do pai.
alter table public.contratos_audit_log
  drop constraint if exists contratos_audit_log_contrato_id_fkey;

-- 3) Impede excluir contrato que tenha comissão PAGA (o CASCADE apagaria o histórico pago).
--    Comissões apenas 'prevista' continuam sendo removidas junto (comportamento esperado).
create or replace function public.impedir_delete_contrato_com_comissao_paga()
returns trigger
language plpgsql
as $$
declare
  v_pagas int;
begin
  select count(*) into v_pagas
  from public.comissoes
  where contrato_id = old.id and status = 'paga';

  if v_pagas > 0 then
    raise exception 'Não é possível excluir este contrato: ele tem % comissão(ões) paga(s). Mova ou remova as comissões pagas antes de excluir.', v_pagas
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_impedir_delete_contrato_comissao_paga on public.contratos;
create trigger trg_impedir_delete_contrato_comissao_paga
  before delete on public.contratos
  for each row execute function public.impedir_delete_contrato_com_comissao_paga();
