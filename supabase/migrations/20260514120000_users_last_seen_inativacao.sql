-- Adiciona telemetria leve em public.users:
--  - last_seen_at: timestamp da última atividade (atualizado pelo client em login)
--  - inativacao_motivo / inativacao_em / inativacao_por: trilha de auditoria
--    quando colaborador é desativado.

alter table public.users
  add column if not exists last_seen_at timestamptz,
  add column if not exists inativacao_motivo text,
  add column if not exists inativacao_em timestamptz,
  add column if not exists inativacao_por uuid references public.users(id) on delete set null;

comment on column public.users.last_seen_at is 'Última vez que o usuário se autenticou. Atualizado pelo client após login.';
comment on column public.users.inativacao_motivo is 'Motivo registrado ao desativar o colaborador.';
comment on column public.users.inativacao_em is 'Quando o colaborador foi desativado.';
comment on column public.users.inativacao_por is 'Quem desativou o colaborador.';
