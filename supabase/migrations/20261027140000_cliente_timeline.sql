-- ============================================================================
-- LINHA DO TEMPO ÚNICA POR CLIENTE (fase F3 do plano "Íris e satisfação dos
-- clientes: histórico de conversas", 27/10/2026)
-- ============================================================================
-- Problema: a Íris (resumo_conversa_cliente) e a análise de satisfação liam
-- conversas soltas — no máximo 3 conversas, só as vinculadas na LINHA do
-- contato (uma instância). O mesmo grupo existe em 2–3 números da empresa e o
-- histórico fica espalhado entre eles (message_id_wpp é único no banco: cada
-- mensagem fica gravada só na cópia que chegou primeiro).
--
-- O que esta migration cria (só LEITURA — nada é gravado):
--   1) private.cliente_canal_excluido(tenant, tipo, chave): o canal NUNCA entra
--      numa linha do tempo de cliente — decisão 'interno' / 'nao_cliente' em
--      cliente_canais, qualquer contato restrito_admin com a mesma chave, grupo
--      registrado em chat_grupos_restritos, grupo do assistente
--      (wa_agente_grupos), destino do aviso diário (wa_auto_gestores: grupo ou
--      telefone) e WhatsApp da equipe (wa_agente_membros / equipe_identidades).
--   2) private.cliente_canais_do_cliente(tenant, cliente): os canais do cliente
--      com o rótulo estável (G1, G2… para grupos; P1, P2… para privados).
--        * 'confirmado' em cliente_canais (a fonte da verdade);
--        * fallback de TRANSIÇÃO ('vinculo_chat'): contato com
--          chat_contacts.client_id = cliente ou em chat_contact_clients, cuja
--          chave ainda não está confirmada (e não foi rejeitada para o cliente).
--          Contato SEM chave reconhecível (ex.: LID) fica de fora — sem chave
--          não dá para juntar as instâncias nem garantir que não é grupo interno.
--        * Numeração: por tipo, na ordem em que o canal foi confirmado
--          (cliente_canais.criado_em; os de fallback por último) e depois pela
--          chave — estável enquanto os vínculos não mudam; canal novo entra no
--          fim da lista.
--   3) public.cliente_timeline(p_tenant, p_client, p_desde, p_ate, p_limite, p_instancias):
--      mensagens de TODOS os contatos (todas as instâncias) dos canais acima, no
--      intervalo [p_desde, p_ate], as ÚLTIMAS p_limite (1–2000, padrão 400),
--      devolvidas em ordem cronológica (criado_em ASC, id ASC).
--        * Sem duplicata: cada linha de chat_messages pertence a uma única
--          conversa (message_id_wpp é único no banco).
--        * Fora: notas internas do Chat (tipo 'nota_interna' — não são WhatsApp).
--        * autor_tipo = chat_messages.autor_tipo; sem ele (mensagem antiga), as
--          flags: enviado_por_ia ⇒ 'ia', enviado_por_agente ⇒ 'equipe', senão NULL
--          (quem consome trata NULL como lado do cliente).
--        * conteudo: em GRUPO, sem o prefixo "[Nome] " que o webhook põe no texto
--          (regra = semPrefixoAutor de _shared/wa-autoria.ts); o nome do prefixo
--          vira autor_nome quando a coluna está vazia. Privado: texto intacto.
--          Até 2.000 caracteres.
--        * midia_texto = chat_midia_texto.texto com status 'ok' (transcrição do
--          áudio / descrição da imagem; o tipo sai da coluna `tipo` da mensagem).
--        * p_instancias (uuid[], padrão NULL = todas): só contatos dessas
--          instâncias — a mesma regra do Chat (user_can_access_instance:
--          admin/gerente veem todas; demais, só as de user_instance_assignments).
--          Quem chama (Íris) passa as instâncias de quem pergunta; '{}' = nenhuma.
--        * Nunca devolve telefone, JID, id de contato/conversa nem instância.
--   4) public.cliente_canais_resumo(p_tenant, p_client, p_instancias): uma linha por canal
--      (mesmos rótulos) com status 'confirmado' | 'vinculo_chat', data da última
--      mensagem, nº de instâncias e mensagens em 30 dias; e os canais
--      'sugerido' (aguardando revisão na tela Vínculos) SEM rótulo — só para o
--      aviso de cobertura. Com p_instancias, só canais com alguma cópia numa
--      instância permitida (instâncias/mensagens contam só essas).
--
-- Segurança:
--   * As duas funções públicas são SECURITY DEFINER com SET search_path e só
--     service_role executa (REVOKE de PUBLIC, anon, authenticated). A empresa é
--     sempre um parâmetro explícito que o servidor preenche (a Íris usa
--     ctx.escopo.tenantId) e o cliente precisa ser da mesma empresa, senão a
--     função devolve vazio. Toda leitura filtra tenant_id.
--   * As exclusões ficam DENTRO do banco (não só no TS): grupo interno nunca sai
--     daqui, nem por engano de quem chama.
--   * Funções auxiliares no schema private (fora da API), sem GRANT.
--   * Sem regex com contador > 255; tamanhos com left()/length().
--
-- Desempenho: usa os índices existentes chat_contacts (tenant_id, numero_whatsapp),
-- chat_conversations (contact_id), cliente_canais (tenant_id, client_id) e
-- chat_messages (tenant_id, conversation_id, criado_em DESC) — este último criado
-- em 20261027120000. As mensagens são lidas por conversa já limitadas (LATERAL +
-- LIMIT), então o custo não cresce com o tamanho do grupo.
--
-- Depende de: 20261027110000 (cliente_canais, private.canal_*),
--   20261027120000 (colunas autor_* e índice), 20261027130000 (chat_midia_texto).
--
-- Idempotente (CREATE OR REPLACE). Reversão:
--   DROP FUNCTION IF EXISTS public.cliente_timeline(uuid, uuid, timestamptz, timestamptz, integer, uuid[]),
--     public.cliente_canais_resumo(uuid, uuid, uuid[]),
--     private.cliente_canais_do_cliente(uuid, uuid),
--     private.cliente_canal_excluido(uuid, text, text);
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

-- Assinaturas antigas (rascunho sem p_instancias), se existirem.
DROP FUNCTION IF EXISTS public.cliente_timeline(uuid, uuid, timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.cliente_canais_resumo(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 1) Canal que nunca entra na linha do tempo de um cliente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cliente_canal_excluido(p_tenant uuid, p_tipo text, p_chave text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT p_tenant IS NULL OR p_chave IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('grupo', 'privado')
    -- decisão do canal: grupo interno / não é cliente
    OR EXISTS (
      SELECT 1 FROM public.cliente_canais c
       WHERE c.tenant_id = p_tenant AND c.tipo = p_tipo AND c.chave = p_chave
         AND c.client_id IS NULL AND c.status IN ('interno', 'nao_cliente'))
    -- qualquer cópia do canal marcada como restrita (grupo interno) no Chat
    OR EXISTS (
      SELECT 1 FROM public.chat_contacts ct
       WHERE ct.tenant_id = p_tenant AND ct.restrito_admin
         AND ct.numero_whatsapp = ANY (private.canal_formas(p_tipo, p_chave)))
    OR (p_tipo = 'grupo' AND (
         EXISTS (SELECT 1 FROM public.chat_grupos_restritos g
                  WHERE g.tenant_id = p_tenant AND private.canal_chave(g.grupo_base, 1) = p_chave)
         OR EXISTS (SELECT 1 FROM public.wa_agente_grupos g
                     WHERE g.tenant_id = p_tenant AND private.canal_chave(g.grupo_jid, 1) = p_chave)
         OR EXISTS (SELECT 1 FROM public.wa_auto_gestores g
                     WHERE g.tenant_id = p_tenant AND g.grupo_jid IS NOT NULL
                       AND private.canal_chave(g.grupo_jid, 1) = p_chave)))
    OR (p_tipo = 'privado' AND (
         EXISTS (SELECT 1 FROM public.wa_auto_gestores g
                  WHERE g.tenant_id = p_tenant AND g.grupo_jid IS NULL
                    AND private.canal_chave(g.telefone) = p_chave)
         OR EXISTS (SELECT 1 FROM public.wa_agente_membros m
                     WHERE m.tenant_id = p_tenant AND private.canal_chave(m.telefone_chave) = p_chave)
         OR EXISTS (SELECT 1 FROM public.equipe_identidades e
                     WHERE e.tenant_id = p_tenant AND e.ativo AND e.telefone_norm = p_chave)))
$fn$;
REVOKE ALL ON FUNCTION private.cliente_canal_excluido(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Canais do cliente, com rótulo estável
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cliente_canais_do_cliente(p_tenant uuid, p_client uuid)
RETURNS TABLE (tipo text, chave text, rotulo text, status text)
LANGUAGE sql
STABLE
ROWS 10
SET search_path = public, pg_temp
AS $fn$
  WITH conf AS (
    SELECT c.tipo, c.chave, min(c.criado_em) AS desde
      FROM public.cliente_canais c
     WHERE c.tenant_id = p_tenant AND c.client_id = p_client AND c.status = 'confirmado'
     GROUP BY c.tipo, c.chave
  ),
  chat AS (
    SELECT private.canal_tipo(ct.numero_whatsapp, ct.group_size) AS tipo,
           private.canal_chave(ct.numero_whatsapp, ct.group_size) AS chave
      FROM public.chat_contacts ct
     WHERE ct.tenant_id = p_tenant AND ct.client_id = p_client
    UNION
    SELECT private.canal_tipo(ct.numero_whatsapp, ct.group_size),
           private.canal_chave(ct.numero_whatsapp, ct.group_size)
      FROM public.chat_contact_clients cc
      JOIN public.chat_contacts ct ON ct.id = cc.contact_id AND ct.tenant_id = p_tenant
     WHERE cc.tenant_id = p_tenant AND cc.client_id = p_client
  ),
  todos AS (
    SELECT conf.tipo, conf.chave, 'confirmado'::text AS status, conf.desde FROM conf
    UNION ALL
    SELECT chat.tipo, chat.chave, 'vinculo_chat'::text, NULL::timestamptz
      FROM chat
     WHERE chat.tipo IS NOT NULL AND chat.chave IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM conf WHERE conf.tipo = chat.tipo AND conf.chave = chat.chave)
       AND NOT EXISTS (
         SELECT 1 FROM public.cliente_canais r
          WHERE r.tenant_id = p_tenant AND r.tipo = chat.tipo AND r.chave = chat.chave
            AND r.client_id = p_client AND r.status = 'rejeitado')
  )
  SELECT t.tipo, t.chave,
         CASE WHEN t.tipo = 'grupo' THEN 'G' ELSE 'P' END
           || row_number() OVER (PARTITION BY t.tipo ORDER BY t.desde NULLS LAST, t.chave)::text,
         t.status
    FROM todos t
   WHERE p_tenant IS NOT NULL AND p_client IS NOT NULL
     AND NOT private.cliente_canal_excluido(p_tenant, t.tipo, t.chave)
$fn$;
REVOKE ALL ON FUNCTION private.cliente_canais_do_cliente(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Linha do tempo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cliente_timeline(
  p_tenant uuid,
  p_client uuid,
  p_desde timestamptz,
  p_ate timestamptz DEFAULT now(),
  p_limite integer DEFAULT 400,
  p_instancias uuid[] DEFAULT NULL
)
RETURNS TABLE (
  message_id   uuid,
  criado_em    timestamptz,
  canal_rotulo text,
  canal_tipo   text,
  autor_tipo   text,
  autor_nome   text,
  tipo         text,
  conteudo     text,
  midia_texto  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_ate   TIMESTAMPTZ := COALESCE(p_ate, now());
  v_desde TIMESTAMPTZ := COALESCE(p_desde, COALESCE(p_ate, now()) - interval '90 days');
  v_lim   INTEGER := LEAST(GREATEST(COALESCE(p_limite, 400), 1), 2000);
BEGIN
  IF p_tenant IS NULL OR p_client IS NULL OR v_desde > v_ate
     OR NOT EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = p_client AND cl.tenant_id = p_tenant) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH canais AS MATERIALIZED (
    -- formas já calculadas: a busca dos contatos usa o índice (tenant_id, numero_whatsapp).
    SELECT k.tipo, k.rotulo, private.canal_formas(k.tipo, k.chave) AS formas
      FROM private.cliente_canais_do_cliente(p_tenant, p_client) k
  ),
  contatos AS (
    SELECT ct.id AS contact_id, k.tipo, k.rotulo
      FROM canais k
      JOIN public.chat_contacts ct
        ON ct.tenant_id = p_tenant
       AND ct.numero_whatsapp = ANY (k.formas)
     WHERE NOT ct.restrito_admin
       AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = k.tipo
       AND (p_instancias IS NULL OR ct.instance_id = ANY (p_instancias))
  ),
  convs AS (
    SELECT cv.id AS conversation_id, c.tipo, c.rotulo
      FROM contatos c
      JOIN public.chat_conversations cv ON cv.contact_id = c.contact_id AND cv.tenant_id = p_tenant
  ),
  ultimas AS (
    SELECT x.*, cv.tipo AS c_tipo, cv.rotulo AS c_rotulo
      FROM convs cv
      CROSS JOIN LATERAL (
        SELECT m.id, m.criado_em, m.autor_tipo, m.autor_nome, m.enviado_por_agente, m.enviado_por_ia,
               m.tipo AS m_tipo, m.conteudo
          FROM public.chat_messages m
         WHERE m.tenant_id = p_tenant
           AND m.conversation_id = cv.conversation_id
           AND m.criado_em >= v_desde
           AND m.criado_em <= v_ate
           AND COALESCE(m.tipo, '') <> 'nota_interna'
         ORDER BY m.criado_em DESC, m.id DESC
         LIMIT v_lim
      ) x
     ORDER BY x.criado_em DESC, x.id DESC
     LIMIT v_lim
  ),
  prefixo AS (
    SELECT u.*,
           CASE WHEN u.c_tipo = 'grupo'
                THEN substring(u.conteudo FROM '^\[([^]\n]{1,80})\] ') END AS p_nome
      FROM ultimas u
  )
  SELECT p.id,
         p.criado_em,
         p.c_rotulo,
         p.c_tipo,
         COALESCE(p.autor_tipo,
                  CASE WHEN p.enviado_por_ia IS TRUE THEN 'ia'
                       WHEN p.enviado_por_agente IS TRUE THEN 'equipe' END),
         left(COALESCE(NULLIF(btrim(p.autor_nome), ''), NULLIF(btrim(p.p_nome), '')), 80),
         p.m_tipo,
         left(CASE WHEN p.p_nome IS NOT NULL
                   THEN substr(p.conteudo, length(p.p_nome) + 4)
                   ELSE p.conteudo END, 2000),
         (SELECT left(mt.texto, 4000)
            FROM public.chat_midia_texto mt
           WHERE mt.message_id = p.id AND mt.tenant_id = p_tenant AND mt.status = 'ok')
    FROM prefixo p
   ORDER BY p.criado_em ASC, p.id ASC;
END;
$fn$;

COMMENT ON FUNCTION public.cliente_timeline(uuid, uuid, timestamptz, timestamptz, integer, uuid[]) IS
  'Linha do tempo única do cliente: mensagens de todos os grupos e conversas privadas confirmados (cliente_canais; fallback de transição: vínculo do Chat), em todas as instâncias, sem grupo interno. Últimas p_limite do intervalo, em ordem cronológica. Canal só como rótulo (G1/P1). Só service_role.';
REVOKE ALL ON FUNCTION public.cliente_timeline(uuid, uuid, timestamptz, timestamptz, integer, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_timeline(uuid, uuid, timestamptz, timestamptz, integer, uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Resumo dos canais (cobertura)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cliente_canais_resumo(p_tenant uuid, p_client uuid, p_instancias uuid[] DEFAULT NULL)
RETURNS TABLE (
  canal_rotulo text,
  canal_tipo   text,
  status       text,
  ultima_msg   timestamptz,
  instancias   integer,
  msgs_30d     integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_30d TIMESTAMPTZ := now() - interval '30 days';
BEGIN
  IF p_tenant IS NULL OR p_client IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = p_client AND cl.tenant_id = p_tenant) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH canais AS (
    SELECT k.tipo, k.chave, k.rotulo, k.status FROM private.cliente_canais_do_cliente(p_tenant, p_client) k
  ),
  sugeridos AS (
    SELECT DISTINCT c.tipo, c.chave
      FROM public.cliente_canais c
     WHERE c.tenant_id = p_tenant AND c.client_id = p_client AND c.status = 'sugerido'
       AND NOT EXISTS (SELECT 1 FROM canais k WHERE k.tipo = c.tipo AND k.chave = c.chave)
       AND NOT private.cliente_canal_excluido(p_tenant, c.tipo, c.chave)
     LIMIT 50
  ),
  todos AS (
    SELECT k.tipo, k.chave, k.rotulo, k.status FROM canais k
    UNION ALL
    SELECT s.tipo, s.chave, NULL::text, 'sugerido'::text FROM sugeridos s
  )
  SELECT t.rotulo, t.tipo, t.status, a.ult, COALESCE(a.ninst, 0), COALESCE(a.n30, 0)
    FROM todos t
    LEFT JOIN LATERAL (
      SELECT max(mm.ult) AS ult,
             count(DISTINCT ct.instance_id)::int AS ninst,
             COALESCE(sum(mm.n30), 0)::int AS n30
        FROM public.chat_contacts ct
        LEFT JOIN public.chat_conversations cv ON cv.contact_id = ct.id AND cv.tenant_id = p_tenant
        LEFT JOIN LATERAL (
          SELECT (SELECT m.criado_em FROM public.chat_messages m
                   WHERE m.tenant_id = p_tenant AND m.conversation_id = cv.id
                     AND COALESCE(m.tipo, '') <> 'nota_interna'
                   ORDER BY m.criado_em DESC LIMIT 1) AS ult,
                 (SELECT count(*) FROM public.chat_messages m
                   WHERE m.tenant_id = p_tenant AND m.conversation_id = cv.id
                     AND m.criado_em >= v_30d
                     AND COALESCE(m.tipo, '') <> 'nota_interna') AS n30
        ) mm ON cv.id IS NOT NULL
       WHERE ct.tenant_id = p_tenant
         AND ct.numero_whatsapp = ANY (private.canal_formas(t.tipo, t.chave))
         AND NOT ct.restrito_admin
         AND private.canal_tipo(ct.numero_whatsapp, ct.group_size) = t.tipo
         AND (p_instancias IS NULL OR ct.instance_id = ANY (p_instancias))
    ) a ON true
   -- Com instâncias limitadas: só canais com alguma cópia numa instância permitida.
   WHERE p_instancias IS NULL OR COALESCE(a.ninst, 0) > 0
   ORDER BY (t.status = 'sugerido'), t.tipo, length(t.rotulo), t.rotulo, a.ult DESC NULLS LAST;
END;
$fn$;

COMMENT ON FUNCTION public.cliente_canais_resumo(uuid, uuid, uuid[]) IS
  'Canais do cliente para a Íris (cobertura): rótulo G1/P1, status confirmado | vinculo_chat | sugerido (sugerido sem rótulo), última mensagem, instâncias e mensagens em 30 dias. Nunca devolve telefone/JID. Só service_role.';
REVOKE ALL ON FUNCTION public.cliente_canais_resumo(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_canais_resumo(uuid, uuid, uuid[]) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
