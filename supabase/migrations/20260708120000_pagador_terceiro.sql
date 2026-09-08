-- Pagamento feito por terceiro (contrato no nome de uma pessoa, pago por outra).
--
-- Acontece com frequência (empresa/sócio, cônjuge, familiar pagando por outro).
-- O closer indica isso no formulário público e informa quem pagou. A informação
-- flui do lead (vendas_pendentes) para o contrato e aparece destacada no sistema.

BEGIN;

-- Lead do formulário público
ALTER TABLE public.vendas_pendentes
  ADD COLUMN IF NOT EXISTS pagador_diferente  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagador_nome       TEXT,
  ADD COLUMN IF NOT EXISTS pagador_cpf_cnpj   TEXT,
  ADD COLUMN IF NOT EXISTS pagador_relacao    TEXT,
  ADD COLUMN IF NOT EXISTS pagador_observacao TEXT;

-- Contrato
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS pagador_diferente  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagador_nome       TEXT,
  ADD COLUMN IF NOT EXISTS pagador_cpf_cnpj   TEXT,
  ADD COLUMN IF NOT EXISTS pagador_relacao    TEXT,
  ADD COLUMN IF NOT EXISTS pagador_observacao TEXT;

-- Trigger que cria o contrato a partir do lead: passa a copiar os dados do pagador.
CREATE OR REPLACE FUNCTION public.criar_contrato_de_venda_pendente()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'descartada' THEN
    INSERT INTO public.contratos (
      cliente_nome, cpf_cnpj, email, whatsapp, empresa, instagram, endereco,
      produto_id, produto_nome, valor_total, data_fechamento,
      status, status_secundario, pagamentos, vendedor, venda_pendente_id,
      pagador_diferente, pagador_nome, pagador_cpf_cnpj, pagador_relacao, pagador_observacao
    )
    VALUES (
      NEW.cliente_nome,
      NULLIF(NEW.cliente_cpf_cnpj, ''),
      NULLIF(NEW.cliente_email, ''),
      NULLIF(NEW.cliente_whatsapp, ''),
      NULLIF(NEW.cliente_razao_social, ''),
      NULLIF(NEW.cliente_instagram, ''),
      NULLIF(NEW.cliente_endereco, ''),
      NEW.produto_id,
      NEW.produto_nome,
      COALESCE(NEW.valor_total_venda, 0),
      COALESCE(NEW.criado_em::date, CURRENT_DATE),
      'rascunho',
      'Não iniciado',
      COALESCE(NEW.pagamentos, '[]'::jsonb),
      NULLIF(NEW.closer_nome, ''),
      NEW.id,
      COALESCE(NEW.pagador_diferente, false),
      NULLIF(NEW.pagador_nome, ''),
      NULLIF(NEW.pagador_cpf_cnpj, ''),
      NULLIF(NEW.pagador_relacao, ''),
      NULLIF(NEW.pagador_observacao, '')
    )
    ON CONFLICT (venda_pendente_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
