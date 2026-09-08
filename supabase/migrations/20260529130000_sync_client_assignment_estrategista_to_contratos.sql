-- Quando um estrategista é atribuído a um cliente no chat (client_assignments),
-- propaga automaticamente para todos os contratos vinculados ao mesmo cliente.

CREATE OR REPLACE FUNCTION public.sync_estrategista_to_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  -- Só processa atribuições de estrategista
  IF NEW.tipo <> 'estrategista' THEN
    RETURN NEW;
  END IF;

  -- Se foi desativado, não limpa (evita apagar atribuição manual)
  IF NOT COALESCE(NEW.ativo, true) THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_nome FROM public.users WHERE id = NEW.user_id;

  UPDATE public.contratos
  SET
    estrategista_id       = NEW.user_id,
    estrategista_nome_raw = COALESCE(v_nome, estrategista_nome_raw)
  WHERE cliente_id = NEW.client_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_estrategista_contratos ON public.client_assignments;
CREATE TRIGGER trg_sync_estrategista_contratos
  AFTER INSERT OR UPDATE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_estrategista_to_contratos();

-- Backfill: aplica atribuições ativas existentes nos contratos que ainda não têm estrategista
UPDATE public.contratos c
SET
  estrategista_id       = ca.user_id,
  estrategista_nome_raw = COALESCE(u.nome, c.estrategista_nome_raw)
FROM public.client_assignments ca
JOIN public.users u ON u.id = ca.user_id
WHERE ca.tipo    = 'estrategista'
  AND COALESCE(ca.ativo, true) = true
  AND ca.client_id = c.cliente_id
  AND c.estrategista_id IS NULL;
