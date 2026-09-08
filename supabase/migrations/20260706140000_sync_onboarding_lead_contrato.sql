-- Fase 2.1 — sincronização de mão-dupla entre lead do formulário e contrato.
--
-- Regra 1: lead vira 'descartada'  → o contrato ligado (se ainda no Onboarding)
--          vira 'cancelado' e sai da coluna Onboarding.
-- Regra 2: contrato vira 'ATIVO'   → o lead ligado passa a 'concluida'.
--
-- Guardas evitam loop: cada gatilho só age em transições específicas e nunca
-- dispara a condição do outro.

BEGIN;

-- Regra 1 — lead descartado cancela o contrato ainda no Onboarding
CREATE OR REPLACE FUNCTION public.sync_lead_descartado_para_contrato()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'descartada' AND OLD.status IS DISTINCT FROM 'descartada' THEN
    UPDATE public.contratos
      SET status = 'cancelado',
          status_secundario = 'CANCELADO',
          atualizado_em = now()
      WHERE venda_pendente_id = NEW.id
        AND upper(coalesce(status_secundario, '')) = 'NÃO INICIADO';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_descartado ON public.vendas_pendentes;
CREATE TRIGGER trg_lead_descartado
  AFTER UPDATE OF status ON public.vendas_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_descartado_para_contrato();

-- Regra 2 — contrato que vira ATIVO conclui o lead de origem
CREATE OR REPLACE FUNCTION public.sync_contrato_ativo_para_lead()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.venda_pendente_id IS NOT NULL
     AND upper(coalesce(NEW.status_secundario, '')) = 'ATIVO'
     AND upper(coalesce(OLD.status_secundario, '')) IS DISTINCT FROM 'ATIVO' THEN
    UPDATE public.vendas_pendentes
      SET status = 'concluida',
          atualizado_em = now()
      WHERE id = NEW.venda_pendente_id
        AND status <> 'concluida';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_ativo_conclui_lead ON public.contratos;
CREATE TRIGGER trg_contrato_ativo_conclui_lead
  AFTER UPDATE OF status_secundario ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.sync_contrato_ativo_para_lead();

-- Consistência retroativa: se já houver lead descartado com contrato ainda no
-- Onboarding, cancela agora.
UPDATE public.contratos c
  SET status = 'cancelado', status_secundario = 'CANCELADO', atualizado_em = now()
FROM public.vendas_pendentes vp
WHERE c.venda_pendente_id = vp.id
  AND vp.status = 'descartada'
  AND upper(coalesce(c.status_secundario, '')) = 'NÃO INICIADO';

COMMIT;
