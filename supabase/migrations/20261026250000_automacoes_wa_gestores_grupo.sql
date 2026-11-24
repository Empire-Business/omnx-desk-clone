-- ============================================================================
-- Automações WhatsApp — relatório diário também em GRUPO INTERNO
-- ============================================================================
-- Pedido do dono: o relatório diário do gestor pode ir para um grupo interno de
-- WhatsApp (gestor + pessoas da entrega), além (ou no lugar) do privado de cada um.
--
-- O que muda em wa_auto_gestores (agora "destinos" do relatório):
--   * tipo        'pessoa' (padrão, como antes) | 'grupo'
--   * grupo_jid   id do grupo no WhatsApp ("…@g.us"), só quando tipo = 'grupo'
--   * grupo_nome  nome do grupo (≤ 120), preenchido pelo banco a partir do Chat
--   * telefone    passa a ser NULL quando tipo = 'grupo' (continua obrigatório e
--                 E.164 para 'pessoa'; UNIQUE (tenant_id, telefone) mantida)
--   * UNIQUE (tenant_id, grupo_jid)
--   * limite de 10 por empresa continua, contando pessoas E grupos.
--
-- Segurança (o relatório tem dado interno: insatisfeito, inadimplente…):
--   * Trigger SECURITY DEFINER wa_auto_confere_grupo_gestor recusa grupo que:
--       - não tem formato real de grupo (mesmo padrão de destinoGrupo,
--         wa-auto-resumo-semanal/regras.ts → JID_GRUPO_REAL);
--       - não existe como conversa de GRUPO (chat_conversations.is_group) do
--         número que envia (wa_auto_config.uazapi_instance_id) desta empresa;
--       - está vinculado a CLIENTE (chat_contacts.client_id ou
--         chat_contact_clients), em qualquer número da empresa;
--       - tem o NOME (grupo_nome, do Chat) igual ao de algum cliente ativo da
--         empresa (sem acento/caixa/espaços extras — mesma chave de chaveNome em
--         _shared/wa-alertas.ts). Usa extensions.unaccent (extensão já instalada,
--         movida para o schema extensions em 20260804213000).
--     "Interno" aqui significa só "sem vínculo com cliente": o banco NÃO sabe quem
--     está no grupo. Por isso a tela exige que o admin confirme que só há pessoas
--     da equipe no grupo.
--   * Usuário logado só grava na própria empresa (recusa genérica antes do RLS).
--     Pausar (ativo = false) nunca é bloqueado. O servidor confere tudo de novo
--     a cada envio (wa-auto-relatorio-diario).
--   * Grupo sai SEMPRE pela UAZAPI (a API oficial não abre conversa de grupo pelo
--     nosso lado) — mesmo caminho do link de reunião em wa-auto-agendar.
--
-- Idempotente: IF NOT EXISTS / DROP … IF EXISTS / CREATE OR REPLACE.
-- Reversível: DELETE dos grupos, DROP das colunas/constraints/trigger e
--   ALTER COLUMN telefone SET NOT NULL.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Colunas novas
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_auto_gestores
  ADD COLUMN IF NOT EXISTS tipo       TEXT NOT NULL DEFAULT 'pessoa',
  ADD COLUMN IF NOT EXISTS grupo_jid  TEXT,
  ADD COLUMN IF NOT EXISTS grupo_nome TEXT;

-- Telefone só é obrigatório para pessoa (o CHECK de formato E.164 da coluna
-- continua valendo: com NULL ele não se aplica).
ALTER TABLE public.wa_auto_gestores ALTER COLUMN telefone DROP NOT NULL;

ALTER TABLE public.wa_auto_gestores DROP CONSTRAINT IF EXISTS wa_auto_gestores_tipo_check;
ALTER TABLE public.wa_auto_gestores
  ADD CONSTRAINT wa_auto_gestores_tipo_check CHECK (tipo IN ('pessoa', 'grupo'));

-- Coerência: pessoa ⇒ telefone (sem grupo); grupo ⇒ grupo_jid (sem telefone).
ALTER TABLE public.wa_auto_gestores DROP CONSTRAINT IF EXISTS wa_auto_gestores_destino_check;
ALTER TABLE public.wa_auto_gestores
  ADD CONSTRAINT wa_auto_gestores_destino_check CHECK (
    (tipo = 'pessoa' AND telefone IS NOT NULL AND grupo_jid IS NULL)
    OR (tipo = 'grupo' AND grupo_jid IS NOT NULL AND telefone IS NULL)
  );

-- Formato real de grupo do WhatsApp: o atual (120363 + dígitos) ou o antigo
-- (telefone do criador + "-" + carimbo). Igual a JID_GRUPO_REAL (regras.ts).
ALTER TABLE public.wa_auto_gestores DROP CONSTRAINT IF EXISTS wa_auto_gestores_grupo_jid_check;
ALTER TABLE public.wa_auto_gestores
  ADD CONSTRAINT wa_auto_gestores_grupo_jid_check CHECK (
    grupo_jid IS NULL
    OR (length(grupo_jid) <= 60
        AND grupo_jid ~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})@g\.us$')
  );

ALTER TABLE public.wa_auto_gestores DROP CONSTRAINT IF EXISTS wa_auto_gestores_grupo_nome_check;
ALTER TABLE public.wa_auto_gestores
  ADD CONSTRAINT wa_auto_gestores_grupo_nome_check CHECK (grupo_nome IS NULL OR length(grupo_nome) <= 120);

-- O mesmo grupo não entra duas vezes (NULLs não colidem: pessoas ficam de fora).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_auto_gestores_grupo
  ON public.wa_auto_gestores (tenant_id, grupo_jid)
  WHERE grupo_jid IS NOT NULL;

COMMENT ON COLUMN public.wa_auto_gestores.tipo IS
  'pessoa = privado (telefone E.164); grupo = grupo INTERNO de WhatsApp (grupo_jid), nunca grupo de cliente.';
COMMENT ON COLUMN public.wa_auto_gestores.grupo_jid IS
  'Id do grupo no WhatsApp (…@g.us). Conferido pelo trigger wa_auto_confere_grupo_gestor: grupo da instância que envia, sem vínculo com cliente e com nome diferente do de qualquer cliente ativo.';
COMMENT ON COLUMN public.wa_auto_gestores.grupo_nome IS
  'Nome do grupo (do Chat), só para mostrar. Preenchido pelo banco.';
COMMENT ON TABLE public.wa_auto_gestores IS
  'Quem recebe o relatório diário no WhatsApp: pessoas (privado) e grupos internos. Máximo de 10 por empresa, somando os dois (trigger).';

-- ---------------------------------------------------------------------------
-- 2) Limite de 10 por empresa — agora conta pessoas e grupos (mesma regra;
--    só a mensagem muda)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_auto_limita_gestores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Trava por empresa: duas inserções simultâneas não furam o limite.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));
  IF (SELECT count(*) FROM public.wa_auto_gestores WHERE tenant_id = NEW.tenant_id) >= 10 THEN
    RAISE EXCEPTION 'Limite de 10 destinos (pessoas e grupos) por empresa atingido.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3) Grupo: só grupo INTERNO do número que envia
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: lê chat_contacts / chat_conversations / chat_contact_clients
-- independentemente da RLS de quem grava (a conferência não pode depender do
-- que o usuário enxerga). Todas as leituras filtram NEW.tenant_id, que já foi
-- carimbado por set_tenant_id_wa_auto_gestores (roda antes: ordem alfabética) e é
-- travado pela policy RESTRICTIVE de isolamento.
CREATE OR REPLACE FUNCTION public.wa_auto_confere_grupo_gestor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_inst_txt TEXT;
  v_inst     UUID;
  v_base     TEXT;
  v_nome     TEXT;
  v_chave    TEXT;
BEGIN
  -- Usuário logado só grava na própria empresa: recusa já aqui (antes do RLS), com
  -- resposta genérica, para não revelar se um grupo/id existe em outra empresa.
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
    RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tipo IS DISTINCT FROM 'grupo' THEN
    RETURN NEW; -- pessoa: os CHECKs da tabela bastam
  END IF;

  -- Pausar nunca é bloqueado (mesmo que o grupo tenha sido vinculado a cliente depois).
  IF TG_OP = 'UPDATE' AND NEW.ativo = false
     AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
     AND NEW.grupo_jid IS NOT DISTINCT FROM OLD.grupo_jid THEN
    RETURN NEW;
  END IF;

  NEW.grupo_jid := lower(btrim(coalesce(NEW.grupo_jid, '')));
  IF length(NEW.grupo_jid) > 60
     OR NEW.grupo_jid !~ '^(120363[0-9]{9,15}|[1-9][0-9]{9,14}-[0-9]{9,11})@g\.us$' THEN
    RAISE EXCEPTION 'Grupo inválido.' USING ERRCODE = 'check_violation';
  END IF;
  -- O Chat guarda o grupo sem o sufixo; aceitamos as duas formas.
  v_base := left(NEW.grupo_jid, length(NEW.grupo_jid) - length('@g.us'));

  SELECT c.uazapi_instance_id INTO v_inst_txt
    FROM public.wa_auto_config c
   WHERE c.tenant_id = NEW.tenant_id;
  IF v_inst_txt IS NULL THEN
    RAISE EXCEPTION 'Escolha primeiro o número que envia (aba Conexão): o grupo precisa ser desse número.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT wi.id INTO v_inst
    FROM public.whatsapp_instances wi
   WHERE wi.tenant_id = NEW.tenant_id AND wi.instance_id = v_inst_txt;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'O número que envia não foi encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  -- Precisa ser um GRUPO que aparece nas conversas do número que envia.
  IF NOT EXISTS (
    SELECT 1
      FROM public.chat_contacts ct
      JOIN public.chat_conversations cv
        ON cv.contact_id = ct.id AND cv.tenant_id = ct.tenant_id
     WHERE ct.tenant_id = NEW.tenant_id
       AND ct.instance_id = v_inst
       AND cv.instance_id = v_inst
       AND cv.is_group = true
       AND lower(btrim(ct.numero_whatsapp)) IN (v_base, NEW.grupo_jid)
  ) THEN
    RAISE EXCEPTION 'Grupo não encontrado nas conversas do número que envia. O número precisa estar no grupo.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NUNCA grupo de cliente: nenhum contato da empresa com este grupo pode estar
  -- vinculado a cliente (direto ou por chat_contact_clients), em nenhum número.
  IF EXISTS (
    SELECT 1
      FROM public.chat_contacts ct
     WHERE ct.tenant_id = NEW.tenant_id
       AND lower(btrim(ct.numero_whatsapp)) IN (v_base, NEW.grupo_jid)
       AND (
         ct.client_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM public.chat_contact_clients cc
            WHERE cc.tenant_id = NEW.tenant_id AND cc.contact_id = ct.id
         )
       )
  ) THEN
    RAISE EXCEPTION 'Este grupo está vinculado a um cliente. O relatório só pode ir para grupos internos da equipe.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Nome do grupo vem do Chat (não do que a tela mandou).
  SELECT nullif(btrim(ct.nome), '') INTO v_nome
    FROM public.chat_contacts ct
   WHERE ct.tenant_id = NEW.tenant_id
     AND ct.instance_id = v_inst
     AND lower(btrim(ct.numero_whatsapp)) IN (v_base, NEW.grupo_jid)
     AND nullif(btrim(ct.nome), '') IS NOT NULL
   ORDER BY ct.atualizado_em DESC NULLS LAST
   LIMIT 1;
  NEW.grupo_nome := left(coalesce(v_nome, nullif(btrim(NEW.grupo_nome), ''), 'Grupo sem nome'), 120);

  -- Nome do grupo igual ao de um cliente ativo ⇒ provavelmente grupo de cliente
  -- sem vínculo no Chat. Chave: minúsculo, sem acento, espaços colapsados
  -- (mesma de chaveNome no servidor). Cliente ativo = ativo IS DISTINCT FROM false.
  v_chave := btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, NEW.grupo_nome)), '\s+', ' ', 'g'));
  IF v_chave <> '' AND EXISTS (
    SELECT 1
      FROM public.clients cl
     WHERE cl.tenant_id = NEW.tenant_id
       AND cl.ativo IS DISTINCT FROM false
       AND btrim(regexp_replace(
             lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(cl.nome, ''))), '\s+', ' ', 'g'))
           = v_chave
  ) THEN
    RAISE EXCEPTION 'Este grupo tem o mesmo nome de um cliente. O relatório só pode ir para grupos internos da equipe.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF nullif(btrim(NEW.nome), '') IS NULL THEN
    NEW.nome := left(NEW.grupo_nome, 80);
  END IF;
  NEW.telefone := NULL;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.wa_auto_confere_grupo_gestor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wa_auto_confere_grupo_gestor ON public.wa_auto_gestores;
-- Depois do carimbo de tenant (set_tenant_id_* < wa_auto_confere_* < wa_auto_limita_*).
CREATE TRIGGER wa_auto_confere_grupo_gestor
  BEFORE INSERT OR UPDATE OF tipo, grupo_jid, ativo, tenant_id ON public.wa_auto_gestores
  FOR EACH ROW EXECUTE FUNCTION public.wa_auto_confere_grupo_gestor();

COMMIT;

NOTIFY pgrst, 'reload schema';
