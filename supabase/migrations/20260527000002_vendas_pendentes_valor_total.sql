-- Valor total negociado do produto, informado pelo closer no formulário.
-- Apenas informativo no Desk (dá noção do valor cheio da venda) — NÃO é enviado ao GHL.

ALTER TABLE public.vendas_pendentes
  ADD COLUMN IF NOT EXISTS valor_total_venda NUMERIC;

COMMENT ON COLUMN public.vendas_pendentes.valor_total_venda IS
  'Valor total negociado do produto (informado pelo closer). Apenas informativo no Desk — nao vai para o GHL.';
