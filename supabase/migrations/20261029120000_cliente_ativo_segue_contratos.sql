-- clients.ativo acompanha o status dos contratos.
--
-- Regra (só age quando um contrato muda; nunca varre a base):
--   * contrato passa a 'ativo' ou 'pausado'           → cliente fica ativo
--   * contrato sai de 'ativo'/'pausado' (concluído,
--     cancelado, rascunho), é excluído ou troca de
--     cliente, e o cliente não tem outro contrato
--     'ativo'/'pausado'                               → cliente fica inativo
--
-- O status continua editável na mão (selo na ficha do cliente). A próxima
-- mudança de contrato daquele cliente reaplica a regra.
-- Idempotente: pode ser reaplicada sem erro.

CREATE OR REPLACE FUNCTION public.sync_cliente_ativo_from_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_vigente boolean := false;
  v_new_vigente boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_vigente := OLD.status IN ('ativo', 'pausado');
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_vigente := NEW.status IN ('ativo', 'pausado');
  END IF;

  -- Cliente atual ganhou um contrato vigente
  IF TG_OP <> 'DELETE' AND NEW.cliente_id IS NOT NULL AND v_new_vigente THEN
    UPDATE public.clients SET ativo = true
     WHERE id = NEW.cliente_id AND ativo IS DISTINCT FROM true;
  END IF;

  -- Cliente anterior perdeu um contrato vigente (mudou status, excluiu ou trocou de cliente)
  IF TG_OP <> 'INSERT' AND OLD.cliente_id IS NOT NULL AND v_old_vigente
     AND (TG_OP = 'DELETE' OR NOT v_new_vigente OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id)
  THEN
    UPDATE public.clients SET ativo = false
     WHERE id = OLD.cliente_id
       AND ativo IS DISTINCT FROM false
       AND NOT EXISTS (
         SELECT 1 FROM public.contratos c
          WHERE c.cliente_id = OLD.cliente_id
            AND c.status IN ('ativo', 'pausado')
       );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cliente_ativo_from_contratos ON public.contratos;
CREATE TRIGGER trg_sync_cliente_ativo_from_contratos
  AFTER INSERT OR DELETE OR UPDATE OF status, cliente_id ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.sync_cliente_ativo_from_contratos();
