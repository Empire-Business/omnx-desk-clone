-- Fecha as funções SECURITY DEFINER que estavam alcançáveis como endpoint REST.
--
-- Toda função no schema public vira automaticamente uma rota /rest/v1/rpc/<nome> no
-- PostgREST. Como SECURITY DEFINER roda com os privilégios do dono (e ignora RLS),
-- deixar EXECUTE aberto para anon/authenticated é entregar a chave da função a quem
-- só deveria enxergar as tabelas atrás da RLS.
--
-- Três grupos, tratados de formas diferentes de propósito:
--
-- GRUPO A — funções de trigger (retornam `trigger`). Revogamos de PUBLIC, anon e
--   authenticated. O trigger continua disparando normalmente: o Postgres exige
--   EXECUTE na hora de CRIAR o trigger, não a cada disparo (verificado em
--   laboratório antes desta migration — tabela + trigger próprios, EXECUTE revogado,
--   INSERT como authenticated: o trigger rodou).
--
-- GRUPO B — RPCs de negócio que só fazem sentido logado (aprovar extrato, calcular
--   comissão, registrar nota, seeds). Aqui não basta `REVOKE FROM anon`: o EXECUTE
--   dessas funções vinha de um grant a PUBLIC, e revogar de um papel não tira o que
--   ele herda de PUBLIC. Então tiramos de PUBLIC e devolvemos explicitamente a
--   authenticated e service_role — que é o que as edge functions usam.
--
-- GRUPO C — NÃO MEXEMOS. São as funções usadas dentro das próprias policies de RLS
--   (is_admin, has_permissao, get_user_tenant_id, user_can_access_*, tenant_do_*...)
--   e a get_tenant_by_domain, que a tela de login usa deslogada para descobrir a
--   marca do domínio. Várias policies do sistema estão declaradas como `{public}`,
--   ou seja, também são avaliadas para anon: revogar EXECUTE ali faria o acesso
--   anônimo ESTOURAR com "permission denied for function" em vez de simplesmente
--   não retornar linha. Trocaria uma negativa limpa por um erro 500.

-- ── GRUPO A ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t      ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND t.typname = 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.assinatura);
  END LOOP;
END $$;

-- ── GRUPO B ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t      ON t.oid = p.prorettype
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND t.typname <> 'trigger'
      AND p.proname = ANY (ARRAY[
        'aprovar_extrato_mes',
        'auto_match_contacts_to_clients',
        'calcular_comissoes_contrato',
        'get_agent_tma',
        'get_client_last_contact',
        'get_internal_last_messages',
        'get_internal_unread_counts',
        'get_unread_counts_for_user',
        'match_contact_to_client',
        'pj_registrar_nota',
        'seed_app_modules_for_tenant',
        'seed_atendimento_segmento'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;
