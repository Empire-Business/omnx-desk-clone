-- RPC: get_unread_counts_for_user
-- Returns unread message count per conversation for a given user,
-- optionally filtered by instance UUIDs.
-- Uses the existing `lida` field on chat_messages (global read state).

create or replace function get_unread_counts_for_user(
  p_user_id uuid,
  p_instance_ids uuid[] default null
)
returns table(conversation_id uuid, unread_count bigint)
language sql
security definer
stable
as $$
  select
    m.conversation_id,
    count(*) as unread_count
  from chat_messages m
  join chat_conversations c on c.id = m.conversation_id
  where
    m.lida = false
    and m.enviado_por_agente = false
    and (p_instance_ids is null or c.instance_id = any(p_instance_ids))
  group by m.conversation_id
  having count(*) > 0;
$$;

grant execute on function get_unread_counts_for_user(uuid, uuid[]) to authenticated;
