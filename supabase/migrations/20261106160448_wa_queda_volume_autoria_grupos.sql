-- Corrige apenas a leitura de queda de volume. Sem backfill ou alteração de dados.
-- Preserva assinatura, janela 7/35 dias, limiar, base mínima e ACL service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.wa_auto_queda_volume(
  p_tenant_id uuid,
  p_limiar numeric,
  p_agora timestamptz DEFAULT now()
)
RETURNS TABLE (contact_id uuid, msgs_semana integer, media_semanal numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  WITH canais AS (
    SELECT c.id AS conversation_id, ct.id AS contact_id,
           CASE
             WHEN c.is_group IS TRUE
              AND regexp_replace(btrim(ct.numero_whatsapp), '@g\.us$', '') ~ '^[0-9]{5,30}(-[0-9]{5,20})?$'
             THEN 'grupo:' || regexp_replace(btrim(ct.numero_whatsapp), '@g\.us$', '')
             ELSE 'contato:' || ct.id::text
           END AS canal,
           (
             EXISTS (SELECT 1 FROM public.clients cl
                      WHERE cl.id = ct.client_id AND cl.tenant_id = p_tenant_id)
             OR EXISTS (SELECT 1 FROM public.chat_contact_clients vinculo
                         JOIN public.clients cl ON cl.id = vinculo.client_id AND cl.tenant_id = p_tenant_id
                        WHERE vinculo.contact_id = ct.id AND vinculo.tenant_id = p_tenant_id)
           ) AS vinculado
      FROM public.chat_conversations c
      JOIN public.chat_contacts ct ON ct.id = c.contact_id AND ct.tenant_id = p_tenant_id
     WHERE c.tenant_id = p_tenant_id
       AND p_tenant_id IS NOT NULL
       AND COALESCE(c.arquivada, false) = false
  ), representantes AS (
    -- Pode representar pela origem vinculada mesmo sem mensagem nela nesta janela.
    -- Nenhuma associação é feita por nome, nem entre tenants ou contatos privados.
    SELECT DISTINCT ON (canal) canal, contact_id
      FROM canais
     ORDER BY canal, vinculado DESC, contact_id
  ), eventos AS (
    SELECT c.canal, m.id, m.criado_em,
           CASE WHEN NULLIF(btrim(m.message_id_wpp), '') IS NOT NULL
                THEN 'wpp:' || btrim(m.message_id_wpp)
                ELSE 'linha:' || m.id::text END AS chave_mensagem
      FROM public.chat_messages m
      JOIN canais c ON c.conversation_id = m.conversation_id
     WHERE m.tenant_id = p_tenant_id
       AND m.autor_tipo = 'cliente'
       AND m.criado_em >= p_agora - interval '35 days'
       AND m.criado_em < p_agora
  ), mensagens_unicas AS (
    -- Mesmo evento captado em duas instâncias conta uma vez; sem providerID usa a linha.
    SELECT DISTINCT ON (canal, chave_mensagem) canal, criado_em
      FROM eventos
     ORDER BY canal, chave_mensagem, criado_em, id
  ), por_canal AS (
    SELECT canal,
           count(*) FILTER (WHERE criado_em >= p_agora - interval '7 days') AS atual,
           count(*) FILTER (WHERE criado_em < p_agora - interval '7 days') AS anteriores
      FROM mensagens_unicas
     GROUP BY canal
  )
  SELECT r.contact_id,
         p.atual::integer,
         round(p.anteriores / 4.0, 1)
    FROM por_canal p
    JOIN representantes r ON r.canal = p.canal
   WHERE p.anteriores / 4.0 >= 5
     AND p.atual < (p.anteriores / 4.0) * (1 - LEAST(GREATEST(COALESCE(p_limiar, 50), 0), 100) / 100.0)
   ORDER BY (p.anteriores / 4.0 - p.atual) DESC, r.contact_id
   LIMIT 50;
$fn$;

COMMENT ON FUNCTION public.wa_auto_queda_volume(uuid, numeric, timestamptz) IS
  'Queda de mensagens de autoria cliente por grupo WhatsApp canônico (entre instâncias do mesmo tenant) ou contato privado; deduplicação por providerID e representante vinculado. Só service_role.';
REVOKE ALL ON FUNCTION public.wa_auto_queda_volume(uuid, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_auto_queda_volume(uuid, numeric, timestamptz) TO service_role;
COMMIT;
