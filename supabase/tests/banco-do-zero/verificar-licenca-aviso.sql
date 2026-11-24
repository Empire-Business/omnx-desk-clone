-- Aviso da licença pelo motivo real (ensaio real de 19/11/2026, migração 20261119180200).
-- Roda depois das migrações (ensaiar.mjs --verificar) numa transação desfeita no fim.
-- Só o texto muda; a decisão (nega, motivo) é conferida em verificar-licenca.sql.

BEGIN;

CREATE FUNCTION pg_temp.aviso() RETURNS text LANGUAGE sql AS $$ SELECT public.htai_licenca_situacao() ->> 'mensagem' $$;

DO $$ BEGIN
  ASSERT pg_temp.aviso() IS NULL, 'produção (modo off): sem aviso';
END $$;

SELECT vault.create_secret('instalacao', 'htai_escopo');
DO $$ BEGIN
  ASSERT pg_temp.aviso() LIKE 'Ative a licença deste app.%', 'não ativada: ative';
END $$;

INSERT INTO public.htai_licenca_estado (id, status, valid_until, renew_after, offline_grace_seconds, versao)
VALUES (true, 'active', now() + interval '1 hour', now() + interval '30 minutes', 259200, 1);
DO $$ BEGIN ASSERT pg_temp.aviso() IS NULL, 'ativa: sem aviso'; END $$;

UPDATE public.htai_licenca_estado SET status = 'revoked';
DO $$ BEGIN
  ASSERT pg_temp.aviso() LIKE 'A licença deste app foi desativada pela HTAI.%', 'revogada: desativada';
  ASSERT pg_temp.aviso() NOT LIKE '%venceu%' AND pg_temp.aviso() NOT LIKE '%Renove%', 'revogada: não manda renovar';
END $$;

UPDATE public.htai_licenca_estado SET status = 'suspended';
DO $$ BEGIN
  ASSERT pg_temp.aviso() LIKE 'A licença deste app está suspensa%', 'suspensa: suspensa';
  ASSERT pg_temp.aviso() NOT LIKE '%venceu%' AND pg_temp.aviso() NOT LIKE '%Renove%', 'suspensa: não manda renovar';
END $$;

UPDATE public.htai_licenca_estado SET status = 'expired';
DO $$ BEGIN ASSERT pg_temp.aviso() LIKE 'A licença deste app venceu. Renove%', 'vencida na central: renove'; END $$;

UPDATE public.htai_licenca_estado SET status = 'active', valid_until = now() - interval '4 days';
DO $$ BEGIN
  ASSERT (public.htai_licenca_situacao() ->> 'motivo') = 'vencida', 'sem confirmar além da folga: motivo vencida';
  ASSERT pg_temp.aviso() LIKE 'Não foi possível confirmar a licença deste app%', 'sem confirmar: volta sozinho';
  ASSERT pg_temp.aviso() NOT LIKE '%Renove%', 'sem confirmar: não manda renovar';
END $$;

\echo 'verificar-licenca-aviso: todos os casos passaram'
ROLLBACK;
