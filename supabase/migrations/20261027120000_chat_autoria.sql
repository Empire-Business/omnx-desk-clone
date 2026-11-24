-- ============================================================================
-- Chat — AUTORIA DAS MENSAGENS (fase F2 do plano "satisfação e histórico")
-- ============================================================================
-- Problema: o uazapi-webhook só marcava como "equipe" o que saía do próprio
-- número da instância (fromMe). Nos grupos dos clientes a equipe escreve do
-- celular PESSOAL, então tudo virava "Cliente": a análise de satisfação via o
-- cliente "sem resposta" e o gatilho update_aguardando_resposta acendia
-- "aguardando resposta" a cada mensagem da própria equipe no grupo.
--
-- O que esta migration faz:
--   1) chat_messages ganha autor_tipo / autor_user_id / autor_chave / autor_nome /
--      autor_origem (+ índice (tenant_id, conversation_id, criado_em DESC)).
--   2) equipe_identidades: quais WhatsApp são da equipe (telefone e LID).
--      Origens: 'instancia' (números da empresa, sem pessoa), 'membro_agente'
--      (espelho de wa_agente_membros), 'cadastro' (WhatsApp pessoal informado
--      pelo admin na aba Assistente). O LID ("identificador de privacidade" que o
--      WhatsApp usa nos grupos) é APRENDIDO pelo webhook e gravado na própria
--      linha do telefone (lid + lid_aprendido_em) — não vira linha nova: trocar
--      ou apagar o telefone apaga junto o LID aprendido (sem identidade órfã).
--      Por isso não existe origem 'aprendido' (decisão documentada).
--   3) Onde fica o telefone pessoal da equipe: em equipe_identidades (origem
--      'cadastro'), NÃO em users — mexer em users exigiria rever a RLS/GRANTs de
--      uma tabela sensível (perfil, salário, PIX). A tela só lê os 4 últimos
--      dígitos (coluna gerada telefone_fim; telefone_norm e lid não têm GRANT de
--      leitura para o front).
--   4) Gatilhos em chat_messages:
--        - chat_messages_autor_padrao (BEFORE INSERT): quem grava sem autor
--          (uazapi-send-message, wa-agente-responder, ia-bot, nota interna do
--          front) ganha autor pelas flags: enviado_por_ia ⇒ 'ia';
--          enviado_por_agente ⇒ 'equipe' (autor_user_id = quem está logado ou
--          agente_id). Sessão de usuário (front) NUNCA escolhe o autor.
--        - chat_messages_autor_protege (BEFORE UPDATE OF autor_*): sessão de
--          usuário não altera a autoria.
--        - update_aguardando_resposta passa a usar autor_tipo:
--          equipe/ia ⇒ apaga "aguardando"; cliente/desconhecido ⇒ acende;
--          sistema ⇒ não mexe; autor_tipo nulo ⇒ regra antiga (flags).
--          Equipe só pela HEURÍSTICA de nome (autor_origem heuristica_*) não
--          acende nem apaga: nome de perfil é fácil de imitar (auditoria F4).
--      O uazapi-webhook só grava 'equipe' por telefone/LID/nome quando o webhook
--      vem com o token da instância (auditoria F3); sem token, só fromMe conta.
--   5) Espelhos: wa_agente_membros e whatsapp_instances mantêm as linhas
--      'membro_agente' e 'instancia' de equipe_identidades (falha no espelho
--      vira WARNING — nunca bloqueia a tabela de origem).
--   6) Backfill de 90 dias (só linhas com autor_tipo nulo; o TEXTO não é
--      reescrito — o prefixo "[Nome] " continua no conteúdo):
--        a) flags: enviado_por_ia ⇒ 'ia'; enviado_por_agente ⇒ 'equipe'.
--        b) remetente: telefone (sender_pn) / LID / nome (senderName) vêm de
--           _webhook_debug (payload bruto da UAZAPI, desde 05/2026) casando pelo
--           message_id; sem payload, o nome vem do prefixo "[Nome] ".
--        c) telefone ou LID em equipe_identidades ⇒ 'equipe' (origem 'backfill').
--        d) em GRUPO, com telefone do remetente (sender_pn) que não está em
--           equipe_identidades: nome do remetente × nomes da equipe
--           ⇒ 'equipe' com autor_origem 'heuristica_backfill'. REGRA (igual a
--           casarNomeEquipe em supabase/functions/_shared/wa-autoria.ts):
--             chave do nome = minúsculas, sem acento, só [a-z0-9 ], espaços únicos.
--             FORTE (2+ palavras): nome do remetente = nome completo de UMA
--               pessoa da equipe, ou 1º+último nome do remetente = 1º+último
--               nome de UMA pessoa (pessoa com 2+ palavras no cadastro).
--             FRACO (1 palavra só): vale só se esse primeiro nome for de UMA
--               ÚNICA pessoa da equipe E NÃO for primeiro nome de nenhum cliente
--               (clients.nome) nem de nenhum contato privado do Chat com OUTRO
--               telefone (o próprio contato privado da pessoa não conta).
--             TRAVA: telefone do remetente que é de cliente (clients.telefone /
--               whatsapp, contratos.whatsapp, contato privado vinculado) nunca
--               vira equipe por nome.
--             Mais de uma pessoa casando ⇒ não decide (fica cliente).
--             "Equipe" = users do tenant com perfil ≠ 'cliente' (ativos ou não,
--             porque a mensagem antiga pode ser de quem já saiu).
--        e) resto ⇒ 'cliente'; grupo sem telefone, LID nem nome ⇒ 'desconhecido'.
--        f) Conversas com mensagem reclassificada: "aguardando resposta" só é
--           DESLIGADO (nunca ligado) quando a última mensagem que conta para o
--           gatilho é da equipe/IA — mensagens 'heuristica_backfill' são
--           ignoradas, igual ao gatilho (decisão: o backfill reproduz o estado
--           que o gatilho novo produziria; quem ficou só reconhecido por nome
--           precisa cadastrar o WhatsApp na aba Assistente). E
--           ultima_msg_cliente_em passa a ser a última mensagem de cliente.
--        O backfill confia no payload guardado em _webhook_debug (na época, só
--        1 número tinha token): risco aceito por ser histórico e só de rótulo.
--
-- Segurança:
--   * equipe_identidades: RLS + RESTRICTIVE por tenant; leitura/escrita só para
--     admin/gerente (pode_ver_restrito) com automacoes-wa·admin; front só
--     cria/apaga origem 'cadastro'; GRANT por coluna (sem telefone completo nem
--     LID para o front); conferência no banco (pessoa da empresa, não cliente,
--     número que não é da empresa nem de outra pessoa, limites).
--   * Funções auxiliares no schema private (fora da API). Sem regex com
--     contador > 255; tamanhos via length().
--
-- Desempenho / cuidados ao aplicar:
--   * ADD COLUMN sem DEFAULT (não reescreve a tabela). CREATE INDEX simples
--     (~63 mil linhas, segundos) — trava escrita em chat_messages durante a
--     criação; aplicar fora do horário de pico.
--   * O backfill faz UPDATE em ~19 mil mensagens: chat_messages está na
--     publicação supabase_realtime, então sai uma rajada de eventos UPDATE.
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS; o backfill
-- só toca linhas com autor_tipo nulo.
--
-- Reversão (manual):
--   DROP TRIGGER IF EXISTS chat_messages_autor_padrao ON public.chat_messages;
--   DROP TRIGGER IF EXISTS chat_messages_autor_protege ON public.chat_messages;
--   DROP TRIGGER IF EXISTS equipe_identidades_espelho_membro ON public.wa_agente_membros;
--   DROP TRIGGER IF EXISTS equipe_identidades_espelho_instancia ON public.whatsapp_instances;
--   -- update_aguardando_resposta: recriar a versão antiga (só flags), que está
--   --   no comentário da seção 5 abaixo.
--   DROP TABLE IF EXISTS public.equipe_identidades CASCADE;
--   DROP INDEX IF EXISTS public.idx_chat_messages_tenant_conv_criado;
--   ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS autor_tipo, DROP COLUMN IF EXISTS autor_user_id,
--     DROP COLUMN IF EXISTS autor_chave, DROP COLUMN IF EXISTS autor_nome, DROP COLUMN IF EXISTS autor_origem;
--   DROP FUNCTION IF EXISTS private.autoria_chave_nome(text), private.autoria_chave_tel(text),
--     private.autoria_chave_tel8(text);
-- ============================================================================

BEGIN;
-- Não fica esperando lock em tabela quente do Chat (falha rápido e pode repetir).
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- 0) Funções auxiliares (espelho de supabase/functions/_shared/wa-autoria.ts,
--    wa-telefone.ts e telefone.ts — mudou lá, mude aqui)
-- ---------------------------------------------------------------------------

-- Nome comparável: minúsculas, sem acento, só [a-z0-9 ], espaços únicos, ≤ 80.
CREATE OR REPLACE FUNCTION private.autoria_chave_nome(p text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT left(btrim(regexp_replace(
           regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))),
                          '[^a-z0-9 ]', ' ', 'g'),
           '\s+', ' ', 'g')), 80)
$fn$;

-- Telefone canônico (chaveTelefoneBR): só dígitos; celular BR sem o 9º dígito
-- ganha o 9. Mesma regra de wa_agente_membros.telefone_chave. Vazio ⇒ NULL.
CREATE OR REPLACE FUNCTION private.autoria_chave_tel(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
           WHEN d = '' THEN NULL
           WHEN d ~ '^55[1-9][0-9][6-9][0-9]{7}$' THEN '55' || substr(d, 3, 2) || '9' || substr(d, 5)
           ELSE d
         END
    FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS d) s
$fn$;

-- DDD + 8 últimos dígitos (chaveTelefone de _shared/telefone.ts): compara bases
-- com e sem o 9º dígito. NULL quando não é telefone BR plausível.
CREATE OR REPLACE FUNCTION private.autoria_chave_tel8(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
           WHEN left(d, 2) = '55' AND length(d) IN (12, 13) THEN substr(d, 3, 2) || right(d, 8)
           WHEN length(d) IN (10, 11) THEN substr(d, 1, 2) || right(d, 8)
           ELSE NULL
         END
    FROM (SELECT ltrim(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '0') AS d) s
$fn$;

REVOKE ALL ON FUNCTION private.autoria_chave_nome(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.autoria_chave_tel(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.autoria_chave_tel8(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 1) Colunas de autoria em chat_messages
--    Sem FK em autor_user_id de propósito: não trava users/chat_messages
--    (mesma decisão de wa_agente_pedidos) e apagar usuário não varre o Chat.
-- ---------------------------------------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS autor_tipo    TEXT,
  ADD COLUMN IF NOT EXISTS autor_user_id UUID,
  ADD COLUMN IF NOT EXISTS autor_chave   TEXT,
  ADD COLUMN IF NOT EXISTS autor_nome    TEXT,
  ADD COLUMN IF NOT EXISTS autor_origem  TEXT;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_autor_tipo_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_autor_tipo_check CHECK (
  autor_tipo IS NULL OR autor_tipo IN ('cliente', 'equipe', 'ia', 'sistema', 'desconhecido'));
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_autor_origem_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_autor_origem_check CHECK (
  autor_origem IS NULL OR autor_origem IN ('webhook', 'plataforma', 'backfill', 'heuristica_backfill', 'heuristica_nome'));
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_autor_chave_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_autor_chave_check CHECK (
  autor_chave IS NULL OR length(autor_chave) <= 40);
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_autor_nome_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_autor_nome_check CHECK (
  autor_nome IS NULL OR length(autor_nome) <= 80);

COMMENT ON COLUMN public.chat_messages.autor_tipo IS
  'Quem escreveu: cliente | equipe | ia | sistema | desconhecido. NULL = mensagem antiga (antes de 20261027120000, fora do backfill de 90 dias).';
COMMENT ON COLUMN public.chat_messages.autor_user_id IS 'Pessoa da equipe (users.id) quando conhecida. Sem FK de propósito.';
COMMENT ON COLUMN public.chat_messages.autor_chave IS
  'Remetente: telefone canônico (só dígitos, com o 9º dígito) ou "lid:<n>" quando o WhatsApp só mandou o LID.';
COMMENT ON COLUMN public.chat_messages.autor_nome IS 'Nome de exibição do remetente no WhatsApp (o mesmo do prefixo "[Nome] " dos grupos).';
COMMENT ON COLUMN public.chat_messages.autor_origem IS
  'webhook (resolvido na chegada) | plataforma (flags de quem gravou) | backfill (flags/telefone no backfill) | heuristica_backfill / heuristica_nome (nome igual ao da equipe).';

-- Linha do tempo por conversa (F3) e leituras "últimas N mensagens".
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_conv_criado
  ON public.chat_messages (tenant_id, conversation_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 2) equipe_identidades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipe_identidades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Pessoa da equipe. NULL só para origem 'instancia' (número da empresa).
  user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE,
  -- Só para origem 'instancia'.
  instance_uuid    UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  -- Telefone canônico (private.autoria_chave_tel / chaveTelefoneBR).
  telefone_norm    TEXT,
  telefone_fim     TEXT GENERATED ALWAYS AS (right(telefone_norm, 4)) STORED,
  -- LID (só os dígitos), aprendido pelo uazapi-webhook (sender_lid + sender_pn).
  lid              TEXT,
  lid_aprendido_em TIMESTAMPTZ,
  nome_exibicao    TEXT,
  origem           TEXT NOT NULL DEFAULT 'cadastro',
  ativo            BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT equipe_identidades_origem_check CHECK (origem IN ('cadastro', 'instancia', 'membro_agente')),
  CONSTRAINT equipe_identidades_telefone_check CHECK (
    telefone_norm IS NULL OR (length(telefone_norm) BETWEEN 10 AND 15 AND telefone_norm ~ '^[0-9]+$')),
  CONSTRAINT equipe_identidades_lid_check CHECK (
    lid IS NULL OR (length(lid) BETWEEN 5 AND 30 AND lid ~ '^[0-9]+$')),
  CONSTRAINT equipe_identidades_tem_chave_check CHECK (telefone_norm IS NOT NULL OR lid IS NOT NULL),
  CONSTRAINT equipe_identidades_nome_check CHECK (nome_exibicao IS NULL OR length(nome_exibicao) <= 80),
  CONSTRAINT equipe_identidades_pessoa_check CHECK ((origem = 'instancia') = (user_id IS NULL)),
  CONSTRAINT equipe_identidades_instancia_check CHECK ((origem = 'instancia') = (instance_uuid IS NOT NULL))
);

COMMENT ON TABLE public.equipe_identidades IS
  'WhatsApp da equipe (telefone e LID): números da empresa (instancia), de quem fala com o assistente (membro_agente) e pessoais cadastrados na aba Assistente (cadastro). O uazapi-webhook usa para saber se quem escreveu num grupo é da equipe.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipe_identidades_origem_tel
  ON public.equipe_identidades (tenant_id, origem, telefone_norm) WHERE telefone_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipe_identidades_tel
  ON public.equipe_identidades (tenant_id, telefone_norm) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_equipe_identidades_lid
  ON public.equipe_identidades (tenant_id, lid) WHERE lid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipe_identidades_user ON public.equipe_identidades (user_id);
CREATE INDEX IF NOT EXISTS idx_equipe_identidades_inst ON public.equipe_identidades (instance_uuid);

-- Conferência (SECURITY DEFINER: lê users/instâncias sem depender da RLS).
CREATE OR REPLACE FUNCTION public.equipe_identidades_confere()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sessao BOOLEAN := auth.uid() IS NOT NULL;
  v_tel8   TEXT;
BEGIN
  IF v_sessao THEN
    -- Usuário logado só grava na própria empresa e só o que é dele (cadastro).
    IF NEW.tenant_id IS DISTINCT FROM public.get_user_tenant_id() THEN
      RAISE EXCEPTION 'Registro não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.origem := 'cadastro';
      NEW.instance_uuid := NULL;
      NEW.lid := NULL;
      NEW.lid_aprendido_em := NULL;
      NEW.created_by := auth.uid();
    ELSE
      NEW.origem := OLD.origem;
      NEW.instance_uuid := OLD.instance_uuid;
      NEW.user_id := OLD.user_id;
      NEW.lid := OLD.lid;
      NEW.lid_aprendido_em := OLD.lid_aprendido_em;
    END IF;
  END IF;

  NEW.telefone_norm := private.autoria_chave_tel(NEW.telefone_norm);
  NEW.nome_exibicao := nullif(left(btrim(coalesce(NEW.nome_exibicao, '')), 80), '');
  NEW.updated_at := now();

  -- Trocou o telefone: o LID aprendido era do número antigo.
  IF TG_OP = 'UPDATE' AND NEW.telefone_norm IS DISTINCT FROM OLD.telefone_norm
     AND NEW.lid IS NOT DISTINCT FROM OLD.lid THEN
    NEW.lid := NULL;
    NEW.lid_aprendido_em := NULL;
  END IF;

  -- Pausar nunca é bloqueado.
  IF TG_OP = 'UPDATE' AND NEW.ativo = false
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.telefone_norm IS NOT DISTINCT FROM OLD.telefone_norm THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = NEW.user_id
       AND u.tenant_id = NEW.tenant_id
       AND u.perfil IS DISTINCT FROM 'cliente'
       AND (u.ativo IS TRUE OR NOT v_sessao)
  ) THEN
    RAISE EXCEPTION 'Pessoa não encontrada na equipe desta empresa (ou inativa, ou é cliente).' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.instance_uuid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_instances wi WHERE wi.id = NEW.instance_uuid AND wi.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Número de WhatsApp não encontrado nesta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.origem <> 'instancia' AND NEW.telefone_norm IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.whatsapp_instances wi
     WHERE wi.tenant_id = NEW.tenant_id
       AND private.autoria_chave_tel(wi.numero_whatsapp) = NEW.telefone_norm
  ) THEN
    RAISE EXCEPTION 'Esse é o número de um WhatsApp da empresa (já reconhecido automaticamente).' USING ERRCODE = 'check_violation';
  END IF;

  -- Cadastro pela tela: telefone de CLIENTE nunca vira "equipe" (senão as
  -- mensagens do cliente passariam a apagar o "aguardando resposta").
  -- Compara DDD + 8 últimos dígitos (com ou sem o 9º dígito).
  IF NEW.origem = 'cadastro' AND NEW.telefone_norm IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.telefone_norm IS DISTINCT FROM OLD.telefone_norm OR (NEW.ativo AND NOT OLD.ativo)) THEN
    v_tel8 := private.autoria_chave_tel8(NEW.telefone_norm);
    IF v_tel8 IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.clients cl
               WHERE cl.tenant_id = NEW.tenant_id
                 AND (private.autoria_chave_tel8(cl.telefone) = v_tel8 OR private.autoria_chave_tel8(cl.whatsapp) = v_tel8))
      OR EXISTS (SELECT 1 FROM public.contratos co
                  WHERE co.tenant_id = NEW.tenant_id AND private.autoria_chave_tel8(co.whatsapp) = v_tel8)
      OR EXISTS (SELECT 1 FROM public.chat_contacts ct
                  WHERE ct.tenant_id = NEW.tenant_id
                    AND private.autoria_chave_tel8(ct.numero_whatsapp) = v_tel8
                    AND (ct.client_id IS NOT NULL
                         OR EXISTS (SELECT 1 FROM public.chat_contact_clients cc WHERE cc.contact_id = ct.id)))
    ) THEN
      RAISE EXCEPTION 'Esse WhatsApp está no cadastro de um cliente. Confira o número: o de cliente não pode ser marcado como da equipe.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.telefone_norm IS NOT NULL AND NEW.ativo AND EXISTS (
    SELECT 1 FROM public.equipe_identidades e
     WHERE e.tenant_id = NEW.tenant_id
       AND e.telefone_norm = NEW.telefone_norm
       AND e.ativo
       AND e.id <> NEW.id
       AND e.user_id IS DISTINCT FROM NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Esse WhatsApp já está cadastrado para outra pessoa da equipe.' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('equipe_identidades:' || NEW.tenant_id::text));
    IF (SELECT count(*) FROM public.equipe_identidades WHERE tenant_id = NEW.tenant_id) >= 500 THEN
      RAISE EXCEPTION 'Limite de 500 números da equipe por empresa atingido.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.origem = 'cadastro' AND (
      SELECT count(*) FROM public.equipe_identidades
       WHERE tenant_id = NEW.tenant_id AND user_id = NEW.user_id AND origem = 'cadastro'
    ) >= 3 THEN
      RAISE EXCEPTION 'Cada pessoa pode ter até 3 WhatsApp cadastrados.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.equipe_identidades_confere() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_tenant_id_equipe_identidades ON public.equipe_identidades;
CREATE TRIGGER set_tenant_id_equipe_identidades
  BEFORE INSERT ON public.equipe_identidades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_id();

-- Depois do carimbo de tenant (set_tenant_id_* < zz_*).
DROP TRIGGER IF EXISTS zz_equipe_identidades_confere ON public.equipe_identidades;
CREATE TRIGGER zz_equipe_identidades_confere
  BEFORE INSERT OR UPDATE ON public.equipe_identidades
  FOR EACH ROW EXECUTE FUNCTION public.equipe_identidades_confere();

ALTER TABLE public.equipe_identidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipe_identidades_tenant_isolation ON public.equipe_identidades;
CREATE POLICY equipe_identidades_tenant_isolation ON public.equipe_identidades
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- Admin/gerente com o app Automações WhatsApp (admin).
DROP POLICY IF EXISTS equipe_identidades_admin ON public.equipe_identidades;
CREATE POLICY equipe_identidades_admin ON public.equipe_identidades
  FOR ALL TO authenticated
  USING ((SELECT public.pode_ver_restrito()) AND (SELECT public.has_permissao('automacoes-wa', 'admin')))
  WITH CHECK ((SELECT public.pode_ver_restrito()) AND (SELECT public.has_permissao('automacoes-wa', 'admin')));

-- Front só cria e apaga o que é dele (cadastro). Números da empresa e do
-- assistente se mantêm sozinhos (espelhos abaixo).
DROP POLICY IF EXISTS equipe_identidades_so_cadastro_insert ON public.equipe_identidades;
CREATE POLICY equipe_identidades_so_cadastro_insert ON public.equipe_identidades
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (origem = 'cadastro');
DROP POLICY IF EXISTS equipe_identidades_so_cadastro_delete ON public.equipe_identidades;
CREATE POLICY equipe_identidades_so_cadastro_delete ON public.equipe_identidades
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (origem = 'cadastro');

REVOKE ALL ON public.equipe_identidades FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.equipe_identidades TO service_role;
-- Leitura sem o telefone completo nem o LID (só os 4 últimos dígitos).
GRANT SELECT (id, tenant_id, user_id, instance_uuid, telefone_fim, nome_exibicao, origem, ativo, lid_aprendido_em, created_at, updated_at)
  ON public.equipe_identidades TO authenticated;
GRANT INSERT (id, tenant_id, user_id, telefone_norm, nome_exibicao, ativo) ON public.equipe_identidades TO authenticated;
GRANT UPDATE (ativo, nome_exibicao) ON public.equipe_identidades TO authenticated;
GRANT DELETE ON public.equipe_identidades TO authenticated;
REVOKE TRUNCATE ON public.equipe_identidades FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Espelhos: wa_agente_membros → 'membro_agente'; whatsapp_instances → 'instancia'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equipe_identidades_espelho_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  BEGIN
    IF TG_OP IN ('DELETE', 'UPDATE') THEN
      DELETE FROM public.equipe_identidades e
       WHERE e.tenant_id = OLD.tenant_id AND e.origem = 'membro_agente' AND e.user_id = OLD.user_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      INSERT INTO public.equipe_identidades (tenant_id, user_id, telefone_norm, origem, ativo)
      VALUES (NEW.tenant_id, NEW.user_id, NEW.telefone_chave, 'membro_agente', NEW.ativo)
      ON CONFLICT (tenant_id, origem, telefone_norm) WHERE telefone_norm IS NOT NULL
      DO UPDATE SET user_id = EXCLUDED.user_id, ativo = EXCLUDED.ativo;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Nunca bloqueia a lista do assistente por causa do espelho.
    RAISE WARNING 'equipe_identidades_espelho_membro: não espelhado (%)', SQLSTATE;
  END;
  RETURN NULL; -- AFTER
END;
$fn$;
REVOKE ALL ON FUNCTION public.equipe_identidades_espelho_membro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS equipe_identidades_espelho_membro ON public.wa_agente_membros;
CREATE TRIGGER equipe_identidades_espelho_membro
  AFTER INSERT OR DELETE OR UPDATE OF user_id, telefone, ativo, tenant_id ON public.wa_agente_membros
  FOR EACH ROW EXECUTE FUNCTION public.equipe_identidades_espelho_membro();

CREATE OR REPLACE FUNCTION public.equipe_identidades_espelho_instancia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tel TEXT := private.autoria_chave_tel(NEW.numero_whatsapp);
BEGIN
  BEGIN
    DELETE FROM public.equipe_identidades e
     WHERE e.instance_uuid = NEW.id AND e.origem = 'instancia'
       AND (e.telefone_norm IS DISTINCT FROM v_tel OR e.tenant_id IS DISTINCT FROM NEW.tenant_id);
    IF v_tel IS NOT NULL AND length(v_tel) BETWEEN 10 AND 15 AND NEW.tenant_id IS NOT NULL THEN
      INSERT INTO public.equipe_identidades (tenant_id, instance_uuid, telefone_norm, nome_exibicao, origem)
      VALUES (NEW.tenant_id, NEW.id, v_tel, left(NEW.nome, 80), 'instancia')
      ON CONFLICT (tenant_id, origem, telefone_norm) WHERE telefone_norm IS NOT NULL
      DO UPDATE SET nome_exibicao = EXCLUDED.nome_exibicao;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'equipe_identidades_espelho_instancia: não espelhado (%)', SQLSTATE;
  END;
  RETURN NULL; -- AFTER
END;
$fn$;
REVOKE ALL ON FUNCTION public.equipe_identidades_espelho_instancia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS equipe_identidades_espelho_instancia ON public.whatsapp_instances;
CREATE TRIGGER equipe_identidades_espelho_instancia
  AFTER INSERT OR UPDATE OF numero_whatsapp, tenant_id, nome ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.equipe_identidades_espelho_instancia();
-- (DELETE da instância: ON DELETE CASCADE em instance_uuid.)

-- Carga inicial: números das instâncias (com o LID já conhecido) e membros do assistente.
INSERT INTO public.equipe_identidades (tenant_id, instance_uuid, telefone_norm, lid, nome_exibicao, origem)
SELECT wi.tenant_id, wi.id, private.autoria_chave_tel(wi.numero_whatsapp),
       nullif(split_part(t.instancia_lid, '@', 1), ''), left(wi.nome, 80), 'instancia'
  FROM public.whatsapp_instances wi
  LEFT JOIN public.wa_webhook_tokens t ON t.instance_id = wi.id
 WHERE wi.tenant_id IS NOT NULL
   AND length(coalesce(private.autoria_chave_tel(wi.numero_whatsapp), '')) BETWEEN 10 AND 15
ON CONFLICT (tenant_id, origem, telefone_norm) WHERE telefone_norm IS NOT NULL DO NOTHING;

INSERT INTO public.equipe_identidades (tenant_id, user_id, telefone_norm, origem, ativo)
SELECT m.tenant_id, m.user_id, m.telefone_chave, 'membro_agente', m.ativo
  FROM public.wa_agente_membros m
  JOIN public.users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id AND u.perfil IS DISTINCT FROM 'cliente'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.whatsapp_instances wi
    WHERE wi.tenant_id = m.tenant_id AND private.autoria_chave_tel(wi.numero_whatsapp) = m.telefone_chave)
ON CONFLICT (tenant_id, origem, telefone_norm) WHERE telefone_norm IS NOT NULL DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Autor padrão e proteção em chat_messages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_messages_autor_padrao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- Sessão de usuário (front): a autoria vem das flags, nunca do navegador.
  IF v_uid IS NOT NULL THEN
    NEW.autor_tipo := NULL;
    NEW.autor_user_id := NULL;
    NEW.autor_chave := NULL;
    NEW.autor_nome := NULL;
    NEW.autor_origem := NULL;
  END IF;
  IF NEW.autor_tipo IS NULL THEN
    IF NEW.enviado_por_ia IS TRUE THEN
      NEW.autor_tipo := 'ia';
      NEW.autor_origem := 'plataforma';
    ELSIF NEW.enviado_por_agente IS TRUE THEN
      NEW.autor_tipo := 'equipe';
      NEW.autor_user_id := coalesce(v_uid, NEW.agente_id);
      NEW.autor_origem := 'plataforma';
    END IF;
    -- Sem flag e sem autor: fica NULL (ex.: webhook antigo) e o gatilho de
    -- "aguardando" usa a regra antiga.
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_messages_autor_padrao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_autor_padrao ON public.chat_messages;
CREATE TRIGGER chat_messages_autor_padrao
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_autor_padrao();

CREATE OR REPLACE FUNCTION public.chat_messages_autor_protege()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.autor_tipo := OLD.autor_tipo;
    NEW.autor_user_id := OLD.autor_user_id;
    NEW.autor_chave := OLD.autor_chave;
    NEW.autor_nome := OLD.autor_nome;
    NEW.autor_origem := OLD.autor_origem;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_messages_autor_protege() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_autor_protege ON public.chat_messages;
CREATE TRIGGER chat_messages_autor_protege
  BEFORE UPDATE OF autor_tipo, autor_user_id, autor_chave, autor_nome, autor_origem ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_autor_protege();

-- ---------------------------------------------------------------------------
-- 5) "Aguardando resposta" pela autoria
--    Versão anterior (para reverter):
--      IF NEW.enviado_por_agente = false AND NEW.enviado_por_ia = false THEN
--        UPDATE chat_conversations SET aguardando_resposta = true,
--               ultima_msg_cliente_em = NEW.criado_em WHERE id = NEW.conversation_id;
--      ELSE
--        UPDATE chat_conversations SET aguardando_resposta = false WHERE id = NEW.conversation_id;
--      END IF;
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_aguardando_resposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tipo TEXT := NEW.autor_tipo;
BEGIN
  IF v_tipo IS NULL THEN
    -- Regra antiga (mensagem gravada sem autor): só as flags.
    v_tipo := CASE WHEN (NEW.enviado_por_agente = false AND NEW.enviado_por_ia = false) IS TRUE
                   THEN 'cliente' ELSE 'equipe' END;
  END IF;

  IF v_tipo IN ('cliente', 'desconhecido') THEN
    -- Cliente (ou remetente que não deu para identificar) → aguardando resposta.
    UPDATE chat_conversations
       SET aguardando_resposta = true,
           ultima_msg_cliente_em = NEW.criado_em
     WHERE id = NEW.conversation_id;
  ELSIF v_tipo IN ('equipe', 'ia') AND coalesce(NEW.autor_origem, '') NOT LIKE 'heuristica%' THEN
    -- Equipe (telefone/LID conhecido, fromMe, plataforma) ou IA → respondido.
    -- Reconhecida só pelo NOME (heuristica_*): não acende nem apaga.
    UPDATE chat_conversations
       SET aguardando_resposta = false
     WHERE id = NEW.conversation_id;
  END IF;
  -- 'sistema' e equipe por heurística de nome: não mexe.
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6) Backfill de 90 dias
-- ---------------------------------------------------------------------------

-- 6a) Remetente pelo payload bruto da UAZAPI (quando a tabela de depuração existe).
CREATE TEMP TABLE _aut_dbg (mid TEXT PRIMARY KEY, pn TEXT, lid TEXT, sn TEXT) ON COMMIT DROP;
DO $do$
BEGIN
  IF to_regclass('public._webhook_debug') IS NOT NULL THEN
    INSERT INTO _aut_dbg (mid, pn, lid, sn)
    SELECT DISTINCT ON (mid) mid, pn, lid, sn
      FROM (
        SELECT coalesce(w.body->'message'->>'messageid', w.body->>'messageid') AS mid,
               coalesce(w.body->'message'->>'sender_pn', w.body->>'sender_pn') AS pn,
               coalesce(w.body->'message'->>'sender_lid', w.body->>'sender_lid') AS lid,
               coalesce(w.body->'message'->>'senderName', w.body->>'senderName') AS sn,
               w.criado_em
          FROM public._webhook_debug w
         WHERE w.criado_em > now() - interval '100 days'
      ) s
     WHERE mid IS NOT NULL AND length(mid) <= 128
     ORDER BY mid, criado_em;
  END IF;
END
$do$;
ANALYZE _aut_dbg;

-- 6b) Mensagens a classificar.
CREATE TEMP TABLE _aut_msg ON COMMIT DROP AS
SELECT cm.id, cm.tenant_id, cm.conversation_id, coalesce(cv.is_group, false) AS grupo,
       cm.enviado_por_agente, cm.enviado_por_ia, cm.agente_id,
       -- telefone: grupo ⇒ sender_pn; privado ⇒ o próprio chat
       CASE
         WHEN coalesce(cv.is_group, false) THEN
           CASE WHEN lower(d.pn) LIKE '%@s.whatsapp.net' OR lower(d.pn) LIKE '%@c.us'
                THEN private.autoria_chave_tel(split_part(split_part(d.pn, '@', 1), ':', 1)) END
         ELSE CASE WHEN ct.numero_whatsapp ~ '^[0-9]+$' AND length(ct.numero_whatsapp) BETWEEN 8 AND 15
                   THEN private.autoria_chave_tel(ct.numero_whatsapp) END
       END AS tel,
       CASE WHEN lower(d.lid) LIKE '%@lid' THEN nullif(split_part(split_part(d.lid, '@', 1), ':', 1), '') END AS lid,
       nullif(left(btrim(regexp_replace(
         coalesce(nullif(btrim(d.sn), ''),
                  CASE WHEN coalesce(cv.is_group, false)
                       THEN substring(cm.conteudo from '^\[([^]]{1,80})\] ') END,
                  ''),
         '[[:cntrl:]]', ' ', 'g')), 80), '') AS nome
  FROM public.chat_messages cm
  JOIN public.chat_conversations cv ON cv.id = cm.conversation_id
  LEFT JOIN public.chat_contacts ct ON ct.id = cv.contact_id
  LEFT JOIN _aut_dbg d ON d.mid = cm.message_id_wpp
 WHERE cm.criado_em > now() - interval '90 days'
   AND cm.autor_tipo IS NULL;

ALTER TABLE _aut_msg ADD COLUMN k TEXT, ADD COLUMN nt INT, ADD COLUMN kpu TEXT, ADD COLUMN tel8 TEXT;
UPDATE _aut_msg SET
  k = private.autoria_chave_nome(nome),
  tel8 = private.autoria_chave_tel8(tel);
UPDATE _aut_msg SET
  nt = CASE WHEN coalesce(k, '') = '' THEN 0 ELSE array_length(string_to_array(k, ' '), 1) END,
  kpu = CASE WHEN coalesce(k, '') = '' THEN NULL ELSE split_part(k, ' ', 1) || ' ' || regexp_replace(k, '^.* ', '') END;
CREATE INDEX ON _aut_msg (id);
ANALYZE _aut_msg;

-- 6c) Nomes da equipe (users não-cliente, ativos ou não + nome_exibicao das identidades da pessoa).
CREATE TEMP TABLE _aut_eq ON COMMIT DROP AS
SELECT DISTINCT tenant_id, user_id, chave,
       split_part(chave, ' ', 1) AS primeiro,
       split_part(chave, ' ', 1) || ' ' || regexp_replace(chave, '^.* ', '') AS pu,
       array_length(string_to_array(chave, ' '), 1) AS ntok
  FROM (
    SELECT u.tenant_id, u.id AS user_id, private.autoria_chave_nome(u.nome) AS chave
      FROM public.users u
     WHERE u.perfil IS DISTINCT FROM 'cliente' AND u.tenant_id IS NOT NULL
    UNION ALL
    SELECT e.tenant_id, e.user_id, private.autoria_chave_nome(e.nome_exibicao)
      FROM public.equipe_identidades e
     WHERE e.user_id IS NOT NULL AND e.nome_exibicao IS NOT NULL
  ) s
 WHERE chave <> '';

-- Primeiro nome de UMA ÚNICA pessoa da equipe.
CREATE TEMP TABLE _aut_prim ON COMMIT DROP AS
SELECT tenant_id, primeiro, min(user_id::text)::uuid AS user_id
  FROM _aut_eq
 GROUP BY tenant_id, primeiro
HAVING count(DISTINCT user_id) = 1;

-- Primeiros nomes "de fora": clientes (sempre bloqueiam) e contatos privados (com o telefone).
CREATE TEMP TABLE _aut_ext ON COMMIT DROP AS
SELECT DISTINCT cl.tenant_id, split_part(private.autoria_chave_nome(cl.nome), ' ', 1) AS primeiro, NULL::text AS tel8
  FROM public.clients cl
 WHERE cl.tenant_id IS NOT NULL AND private.autoria_chave_nome(cl.nome) <> ''
UNION
SELECT DISTINCT ct.tenant_id, split_part(private.autoria_chave_nome(ct.nome), ' ', 1),
       private.autoria_chave_tel8(ct.numero_whatsapp)
  FROM public.chat_contacts ct
 WHERE ct.tenant_id IS NOT NULL
   AND private.autoria_chave_nome(ct.nome) <> ''
   AND ct.numero_whatsapp ~ '^[0-9]+$' AND length(ct.numero_whatsapp) BETWEEN 8 AND 15
   AND NOT EXISTS (SELECT 1 FROM public.chat_conversations cv WHERE cv.contact_id = ct.id AND cv.is_group);
CREATE INDEX ON _aut_ext (tenant_id, primeiro);

-- Telefones de cliente (trava: nunca viram equipe por nome).
CREATE TEMP TABLE _aut_cli_tel ON COMMIT DROP AS
SELECT DISTINCT tenant_id, tel8 FROM (
  SELECT cl.tenant_id, private.autoria_chave_tel8(cl.telefone) AS tel8 FROM public.clients cl
  UNION ALL SELECT cl.tenant_id, private.autoria_chave_tel8(cl.whatsapp) FROM public.clients cl
  UNION ALL SELECT co.tenant_id, private.autoria_chave_tel8(co.whatsapp) FROM public.contratos co
  UNION ALL
  SELECT ct.tenant_id, private.autoria_chave_tel8(ct.numero_whatsapp)
    FROM public.chat_contacts ct
   WHERE ct.client_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.chat_contact_clients cc WHERE cc.contact_id = ct.id)
) s
WHERE tel8 IS NOT NULL;
CREATE INDEX ON _aut_cli_tel (tenant_id, tel8);

-- Identidades ativas (pessoa ativa/inativa tanto faz no histórico).
CREATE TEMP TABLE _aut_id ON COMMIT DROP AS
SELECT tenant_id, user_id, telefone_norm, lid FROM public.equipe_identidades WHERE ativo;

ANALYZE _aut_eq; ANALYZE _aut_prim; ANALYZE _aut_ext; ANALYZE _aut_cli_tel; ANALYZE _aut_id;

-- 6d) Classificação.
CREATE TEMP TABLE _aut_res ON COMMIT DROP AS
WITH base AS (
  SELECT m.*,
    -- identidade por telefone (preferida) ou LID; 2+ pessoas ⇒ user_id NULL
    (SELECT CASE WHEN count(DISTINCT i.user_id) = 1 THEN min(i.user_id::text)::uuid END
       FROM _aut_id i
      WHERE i.tenant_id = m.tenant_id
        AND ((m.tel IS NOT NULL AND i.telefone_norm = m.tel) OR (m.lid IS NOT NULL AND i.lid = m.lid))) AS id_user,
    EXISTS (SELECT 1 FROM _aut_id i
             WHERE i.tenant_id = m.tenant_id
               AND ((m.tel IS NOT NULL AND i.telefone_norm = m.tel) OR (m.lid IS NOT NULL AND i.lid = m.lid))) AS id_achou,
    (m.tel8 IS NOT NULL AND EXISTS (SELECT 1 FROM _aut_cli_tel c WHERE c.tenant_id = m.tenant_id AND c.tel8 = m.tel8)) AS tel_de_cliente
  FROM _aut_msg m
), nome AS (
  SELECT b.*,
    CASE
      WHEN NOT b.grupo OR b.tel IS NULL OR b.tel_de_cliente OR coalesce(b.nt, 0) = 0 THEN NULL
      WHEN b.nt >= 2 THEN (
        SELECT CASE WHEN count(DISTINCT e.user_id) = 1 THEN min(e.user_id::text)::uuid END
          FROM _aut_eq e
         WHERE e.tenant_id = b.tenant_id AND e.ntok >= 2 AND (e.chave = b.k OR e.pu = b.kpu))
      ELSE (
        SELECT p.user_id FROM _aut_prim p
         WHERE p.tenant_id = b.tenant_id AND p.primeiro = b.k
           AND NOT EXISTS (
             SELECT 1 FROM _aut_ext x
              WHERE x.tenant_id = b.tenant_id AND x.primeiro = b.k
                AND (x.tel8 IS NULL OR x.tel8 IS DISTINCT FROM b.tel8)))
    END AS nome_user
  FROM base b
)
SELECT id, conversation_id, grupo,
  CASE
    WHEN enviado_por_ia IS TRUE THEN 'ia'
    WHEN enviado_por_agente IS TRUE THEN 'equipe'
    WHEN id_achou THEN 'equipe'
    WHEN nome_user IS NOT NULL THEN 'equipe'
    WHEN grupo AND tel IS NULL AND lid IS NULL AND nome IS NULL THEN 'desconhecido'
    ELSE 'cliente'
  END AS tipo,
  CASE
    WHEN enviado_por_ia IS TRUE THEN NULL
    WHEN enviado_por_agente IS TRUE THEN agente_id
    WHEN id_achou THEN id_user
    ELSE nome_user
  END AS user_id,
  CASE WHEN enviado_por_agente IS TRUE OR enviado_por_ia IS TRUE THEN NULL
       ELSE coalesce(tel, 'lid:' || lid) END AS chave,
  CASE WHEN enviado_por_ia IS TRUE THEN NULL ELSE nome END AS nome,
  CASE
    WHEN enviado_por_ia IS TRUE OR enviado_por_agente IS TRUE OR id_achou THEN 'backfill'
    WHEN nome_user IS NOT NULL THEN 'heuristica_backfill'
    ELSE 'backfill'
  END AS origem
FROM nome;
CREATE INDEX ON _aut_res (id);
ANALYZE _aut_res;

UPDATE public.chat_messages cm
   SET autor_tipo = r.tipo,
       autor_user_id = r.user_id,
       autor_chave = left(r.chave, 40),
       autor_nome = r.nome,
       autor_origem = r.origem
  FROM _aut_res r
 WHERE cm.id = r.id
   AND cm.autor_tipo IS NULL;

-- 6e) Conversas com mensagem reclassificada como equipe (fora das flags).
CREATE TEMP TABLE _aut_conv ON COMMIT DROP AS
SELECT DISTINCT r.conversation_id
  FROM _aut_res r
  JOIN _aut_msg m ON m.id = r.id
 WHERE r.tipo IN ('equipe', 'ia')
   AND m.enviado_por_agente IS NOT TRUE AND m.enviado_por_ia IS NOT TRUE;

-- Última mensagem de cliente de verdade.
UPDATE public.chat_conversations cv
   SET ultima_msg_cliente_em = u.ult
  FROM (
    SELECT cm.conversation_id, max(cm.criado_em) AS ult
      FROM public.chat_messages cm
      JOIN _aut_conv a USING (conversation_id)
     WHERE cm.autor_tipo IN ('cliente', 'desconhecido')
     GROUP BY cm.conversation_id
  ) u
 WHERE cv.id = u.conversation_id
   AND cv.ultima_msg_cliente_em IS DISTINCT FROM u.ult;

-- "Aguardando resposta" só é DESLIGADO (nunca ligado) se a última mensagem que
-- conta para o gatilho (sem 'sistema' e sem equipe por heurística de nome) é da equipe/IA.
UPDATE public.chat_conversations cv
   SET aguardando_resposta = false
  FROM (
    SELECT DISTINCT ON (cm.conversation_id) cm.conversation_id, cm.autor_tipo
      FROM public.chat_messages cm
      JOIN _aut_conv a USING (conversation_id)
     WHERE cm.autor_tipo IS NOT NULL AND cm.autor_tipo <> 'sistema'
       AND coalesce(cm.autor_origem, '') NOT LIKE 'heuristica%'
     ORDER BY cm.conversation_id, cm.criado_em DESC
  ) ult
 WHERE cv.id = ult.conversation_id
   AND cv.aguardando_resposta IS TRUE
   AND ult.autor_tipo IN ('equipe', 'ia');

COMMIT;

NOTIFY pgrst, 'reload schema';
