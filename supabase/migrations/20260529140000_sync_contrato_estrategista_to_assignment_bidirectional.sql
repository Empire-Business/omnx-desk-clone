-- Trigger reverso: contrato.estrategista_id → client_assignments
-- Evita loop: só dispara quando o valor realmente mudou

CREATE OR REPLACE FUNCTION public.sync_contrato_estrategista_to_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ignora se estrategista não mudou
  IF OLD.estrategista_id IS NOT DISTINCT FROM NEW.estrategista_id THEN
    RETURN NEW;
  END IF;

  -- Sem cliente vinculado ou estrategista foi removido: não faz nada
  IF NEW.cliente_id IS NULL OR NEW.estrategista_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.client_assignments (client_id, user_id, tipo, ativo)
  VALUES (NEW.cliente_id, NEW.estrategista_id, 'estrategista', true)
  ON CONFLICT (client_id, user_id, tipo) DO UPDATE SET ativo = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contrato_estrategista_to_assignment ON public.contratos;
CREATE TRIGGER trg_sync_contrato_estrategista_to_assignment
  AFTER UPDATE OF estrategista_id ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.sync_contrato_estrategista_to_assignment();


-- Otimização anti-loop: só atualiza contratos que ainda não têm o estrategista correto
CREATE OR REPLACE FUNCTION public.sync_estrategista_to_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF NEW.tipo <> 'estrategista' THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.ativo, true) THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_nome FROM public.users WHERE id = NEW.user_id;

  -- WHERE extra: evita UPDATE desnecessário (e quebra o loop)
  UPDATE public.contratos
  SET
    estrategista_id       = NEW.user_id,
    estrategista_nome_raw = COALESCE(v_nome, estrategista_nome_raw)
  WHERE cliente_id = NEW.client_id
    AND estrategista_id IS DISTINCT FROM NEW.user_id;

  RETURN NEW;
END;
$$;
