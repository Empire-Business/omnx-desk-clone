-- Imitação mínima de um projeto Supabase NOVO, só para ensaiar a cadeia de
-- migrações num Postgres comum (sem Docker). Não é o Supabase de verdade:
-- papéis, auth, storage, vault, pg_cron e pg_net são versões de mentira com as
-- mesmas assinaturas que as migrações usam. Uso: ver ensaiar.mjs.
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','supabase_admin','authenticator','supabase_auth_admin','supabase_storage_admin','dashboard_user','pgsodium_keyiduser'] loop
  if not exists (select 1 from pg_roles where rolname=r) then execute format('create role %I nologin', r); end if; end loop;
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter role supabase_admin superuser;
grant anon, authenticated, service_role to authenticator;
create schema extensions; create schema auth; create schema storage; create schema vault; create schema cron; create schema net; create schema realtime; create schema graphql_public;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
alter database postgres set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, invited_at timestamptz, confirmation_token text, recovery_token text, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb, is_super_admin boolean,
  created_at timestamptz default now(), updated_at timestamptz default now(), phone text, banned_until timestamptz,
  deleted_at timestamptz, is_anonymous boolean default false, confirmed_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), provider text, identity_data jsonb, email text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), created_at timestamptz default now(), updated_at timestamptz, not_after timestamptz, aal text);
create table auth.refresh_tokens (id bigserial primary key, user_id text, session_id uuid, revoked boolean, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '')::text $$;
grant usage on schema auth to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, owner uuid, public boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean default false, owner_id text, type text);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz, metadata jsonb, path_tokens text[] generated always as (string_to_array(name, '/')) stored, version text, user_metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'),1)] $$;
create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name), '.', 1)) $$;
grant usage on schema storage to anon, authenticated, service_role;
-- cofre
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text default '', secret text not null, key_id uuid, nonce bytea, created_at timestamptz default now(), updated_at timestamptz default now());
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, key_id, nonce, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid language plpgsql as $$ declare i uuid; begin insert into vault.secrets(secret,name,description) values (new_secret,new_name,coalesce(new_description,'')) returning id into i; return i; end $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null) returns void language sql as $$ update vault.secrets set secret=coalesce(new_secret,secret), name=coalesce(new_name,name), description=coalesce(new_description,description), updated_at=now() where id=secret_id $$;
-- pg_cron / pg_net
create table cron.job (jobid bigserial primary key, schedule text, command text, nodename text default 'localhost', nodeport int default 5432, database text default 'postgres', username text default 'postgres', active boolean default true, jobname text unique);
create table cron.job_run_details (runid bigserial primary key, jobid bigint, job_pid int, database text, username text, command text, status text, return_message text, start_time timestamptz, end_time timestamptz);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$ declare i bigint; begin insert into cron.job(jobname,schedule,command) values (job_name,schedule,command) on conflict (jobname) do update set schedule=excluded.schedule, command=excluded.command returning jobid into i; return i; end $$;
create function cron.schedule(schedule text, command text) returns bigint language plpgsql as $$ declare i bigint; begin insert into cron.job(schedule,command) values (schedule,command) returning jobid into i; return i; end $$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as $$ begin delete from cron.job where jobname=job_name; if not found then raise exception 'could not find valid entry for job ''%''', job_name; end if; return true; end $$;
create function cron.unschedule(job_id bigint) returns boolean language plpgsql as $$ begin delete from cron.job where jobid=job_id; return found; end $$;
create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null, username text default null, active boolean default null) returns void language sql as $$ update cron.job set schedule=coalesce($2,schedule), command=coalesce($3,command), active=coalesce($6,active) where jobid=$1 $$;
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
create table net._http_response (id bigint, status_code int, content text, created timestamptz default now());
-- realtime
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
