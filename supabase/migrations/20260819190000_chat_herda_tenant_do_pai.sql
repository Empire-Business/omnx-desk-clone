-- ============================================================================
-- Chat: herdar tenant_id do registro pai quando o insert não informa
-- ============================================================================
-- O QUE QUEBROU (19/08/2026, envio de mensagens no chat):
--   "null value in column tenant_id of relation chat_messages violates not-null"
--
-- POR QUÊ:
--   O carimbo automático (trigger `set_tenant_id` -> `resolve_tenant_default()`)
--   resolve o tenant assim: tenant do usuário logado; se não houver sessão
--   (service_role / edge function), cai no tenant único do banco. Esse fallback
--   só vale ENQUANTO existe exatamente 1 tenant. Com o provisionamento da 2ª
--   empresa (18/08), `resolve_tenant_default()` passou a devolver NULL para toda
--   escrita feita por edge function — e a coluna é NOT NULL. Resultado: envio de
--   mensagem falha e mensagem recebida pelo webhook não entra.
--
-- A CORREÇÃO DE ORIGEM é a edge function informar o tenant (feito no mesmo
-- commit). Esta migration é a REDE DE SEGURANÇA: quando o insert não trouxer
-- tenant_id, a linha herda o tenant do registro pai — a mensagem herda da
-- conversa, a conversa herda da instância de WhatsApp. Isso é determinístico e
-- não depende de sessão, então vale para qualquer caminho de escrita (edge
-- function, webhook, script de manutenção).
--
-- FICA DE FORA (não tem pai único de onde herdar — precisa ser corrigido na
-- origem, informando o tenant explicitamente): `email_queue` (referencia_id é
-- polimórfico) e `vendas_pendentes` (venda pública, sem registro pai).
--
-- Ordem de disparo: o Postgres dispara triggers BEFORE em ordem alfabética de
-- nome. `zz_herda_tenant_id` roda depois de `set_tenant_id`, mas a ordem é
-- irrelevante aqui — ambos só preenchem quando o valor ainda está NULL.
-- ============================================================================
set search_path = public, pg_catalog;

create or replace function public.tg_herda_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pai_tabela text := tg_argv[0];
  v_pai_coluna text := tg_argv[1];
  v_pai_id     uuid;
  v_tenant     uuid;
begin
  if new.tenant_id is not null then
    return new;
  end if;

  v_pai_id := (to_jsonb(new) ->> v_pai_coluna)::uuid;
  if v_pai_id is null then
    return new;
  end if;

  execute format('select tenant_id from public.%I where id = $1', v_pai_tabela)
    into v_tenant using v_pai_id;

  if v_tenant is not null then
    new.tenant_id := v_tenant;
  end if;

  return new;
end;
$$;

comment on function public.tg_herda_tenant_id() is
'Preenche tenant_id herdando do registro pai (tg_argv: tabela_pai, coluna_fk) quando o insert veio sem tenant. Rede de segurança para escritas sem sessão (service_role/edge functions), onde resolve_tenant_default() devolve NULL com mais de um tenant.';

revoke execute on function public.tg_herda_tenant_id() from public, anon, authenticated;

do $$
declare
  filhos constant text[][] := array[
    -- [tabela filha, tabela pai, coluna FK]
    -- chat (a quebra reportada)
    ['chat_messages',           'chat_conversations',  'conversation_id'],
    ['chat_conversations',      'whatsapp_instances',  'instance_id'],
    ['chat_contacts',           'whatsapp_instances',  'instance_id'],
    ['chat_message_reads',      'chat_conversations',  'conversation_id'],
    ['chat_group_members',      'chat_contacts',       'contact_id'],
    ['chat_csat',               'chat_conversations',  'conversation_id'],
    ['chat_weekly_reports',     'clients',             'client_id'],
    -- demais escritas feitas por edge function com service_role, que sofrem do
    -- mesmo problema e quebrariam do mesmo jeito assim que forem exercitadas
    ['notifications',           'users',               'user_id'],
    ['audit_logs',              'users',               'user_id'],
    ['ia_bot_execution_logs',   'ia_bots',             'bot_id'],
    ['cobranca_sends',          'cobranca_devedores',  'devedor_id'],
    ['wa_warmup_logs',          'wa_warmup_groups',    'group_id'],
    ['webhook_logs',            'webhooks',            'webhook_id'],
    ['social_snapshots',        'clients',             'client_id'],
    ['contrato_pdf_extractions','contratos',           'contrato_id']
  ];
  i int;
begin
  for i in 1 .. array_length(filhos, 1) loop
    -- pula tabela ou coluna inexistente (defensivo entre ambientes)
    if to_regclass('public.' || filhos[i][1]) is null then continue; end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = filhos[i][1]
        and column_name = filhos[i][3]
    ) then continue; end if;

    execute format('drop trigger if exists zz_herda_tenant_id on public.%I', filhos[i][1]);
    execute format(
      'create trigger zz_herda_tenant_id before insert on public.%I
         for each row execute function public.tg_herda_tenant_id(%L, %L)',
      filhos[i][1], filhos[i][2], filhos[i][3]);
  end loop;
end $$;
