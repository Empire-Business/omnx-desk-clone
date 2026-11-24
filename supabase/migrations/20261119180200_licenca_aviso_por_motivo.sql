-- ============================================================================
-- Aviso da licença pelo motivo real (ensaio real de 19/11/2026, gravidade baixa)
-- ============================================================================
-- Com a licença revogada ou suspensa, o aviso dizia "A licença deste app
-- venceu. Renove...", e renovar não resolve nesses casos. Cada motivo pede uma
-- ação diferente (mesmo critério do Sell, PR omnx-sell#64):
--   nao_ativado  ative a licença (código de ativação);
--   expired      venceu: renove na conta HTAI;
--   suspended    pausada pela HTAI: fale com o suporte;
--   revoked      desativada pela HTAI: fale com o suporte;
--   vencida      (motivo calculado no app) passou da folga sem confirmar a
--                licença na central: volta sozinho quando a conexão voltar.
-- Os mesmos textos estão em supabase/functions/_shared/htai-licenca-core.ts
-- (respostas 402 das funções) e em src/lib/licenca.ts (tela).
--
-- Só muda o campo `mensagem` de htai_licenca_situacao(); a decisão (nega,
-- motivo, prazos) é a mesma de 20261109130000. Na produção da empresa (modo off)
-- a função responde "desligada" antes de chegar aqui: nada muda. Idempotente;
-- permissões mantidas pelo CREATE OR REPLACE.
--
-- NO SAAS DA EMPRESA ESTA MIGRAÇÃO NÃO FAZ NADA
-- htai_licenca_situacao() só existe onde a licença HTAI existe (20261109130000).
-- No SaaS da empresa não há htai_licencas, htai_licenca_estado nem
-- htai_licenca_modo() (HTAI_ENTITLEMENTS_MODE off; o único objeto htai* é
-- htai_banco_novo()), então não há aviso de licença a corrigir. Sem este guarda
-- o corpo em plpgsql seria recusado na hora do CREATE (o %ROWTYPE de uma tabela
-- que não existe), e a migração abortava na produção. Aqui ela só registra e sai.
-- ============================================================================

DO $do$
BEGIN
  IF to_regprocedure('public.htai_licenca_modo()') IS NULL
     OR to_regclass('public.htai_licenca_estado') IS NULL THEN
    RAISE NOTICE '180200: sem licença HTAI neste banco (SaaS), nada a fazer';
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.htai_licenca_situacao()
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $fn$
    DECLARE
      v_modo   text := public.htai_licenca_modo();
      e        public.htai_licenca_estado%ROWTYPE;
      v_motivo text;
      v_folga  timestamptz;
    BEGIN
      IF v_modo = 'off' THEN
        RETURN jsonb_build_object('modo', 'off', 'nega', false, 'negaria', false, 'motivo', NULL,
                                  'mensagem', NULL, 'valido_ate', NULL, 'folga_ate', NULL);
      END IF;

      SELECT * INTO e FROM public.htai_licenca_estado WHERE id;
      IF NOT FOUND OR e.status IS NULL OR e.valid_until IS NULL THEN
        v_motivo := 'nao_ativado';
      ELSIF e.status NOT IN ('active', 'grace') THEN
        v_motivo := e.status;
      ELSE
        v_folga := e.valid_until + make_interval(secs => greatest(e.offline_grace_seconds, 0));
        IF now() >= v_folga THEN v_motivo := 'vencida'; END IF;
      END IF;

      RETURN jsonb_build_object(
        'modo', v_modo,
        'nega', v_motivo IS NOT NULL AND v_modo = 'enforce',
        'negaria', v_motivo IS NOT NULL AND v_modo = 'shadow',
        'motivo', v_motivo,
        'mensagem', CASE
          WHEN v_motivo IS NULL THEN NULL
          WHEN v_motivo = 'nao_ativado' THEN 'Ative a licença deste app. Seus dados estão guardados e você pode exportá-los.'
          WHEN v_motivo = 'suspended' THEN 'A licença deste app está suspensa: o uso foi pausado pela HTAI. Fale com o suporte da HTAI para voltar a usar. Seus dados estão guardados e você pode exportá-los.'
          WHEN v_motivo = 'revoked' THEN 'A licença deste app foi desativada pela HTAI. Fale com o suporte da HTAI para saber o motivo. Seus dados estão guardados e você pode exportá-los.'
          WHEN v_motivo = 'vencida' THEN 'Não foi possível confirmar a licença deste app: ele ficou mais tempo que o permitido sem falar com a HTAI. Ele volta a funcionar sozinho quando a conexão voltar; se continuar assim, fale com o suporte da HTAI. Seus dados estão guardados e você pode exportá-los.'
          -- expired (e qualquer outro motivo, como antes)
          ELSE 'A licença deste app venceu. Renove na sua conta HTAI para voltar a usar. Seus dados estão guardados e você pode exportá-los.'
        END,
        'valido_ate', e.valid_until,
        'folga_ate', v_folga
      );
    END
    $fn$;
  $sql$;

  RAISE NOTICE '180200: htai_licenca_situacao refeita com o aviso por motivo';
END
$do$;
