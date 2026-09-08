-- Fix: get_unread_counts_for_user usa chat_message_reads (per-user)
-- ao invés do campo lida (global) que não era atualizado pelo mark-as-read
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
  left join chat_message_reads r
    on r.conversation_id = m.conversation_id
    and r.user_id = p_user_id
  where
    m.enviado_por_agente = false
    and m.tipo != 'nota_interna'
    and (r.last_read_at is null or m.criado_em > r.last_read_at)
    and (p_instance_ids is null or c.instance_id = any(p_instance_ids))
  group by m.conversation_id
  having count(*) > 0;
$$;

grant execute on function get_unread_counts_for_user(uuid, uuid[]) to authenticated;
