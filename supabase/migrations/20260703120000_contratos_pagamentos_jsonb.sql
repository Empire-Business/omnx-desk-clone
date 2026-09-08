-- Lista de pagamentos/parcelas do contrato (mesmo formato da venda do onboarding:
-- data, valor, forma, plataforma, sinal). Preenchida a partir do onboarding
-- (ContactSidePanel na criação, ou "Puxar do onboarding" na tela do contrato);
-- também editável manualmente na tabela de Pagamentos do contrato.
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS pagamentos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contratos.pagamentos IS
  'Lista de parcelas de pagamento [{data,valor,forma,plataforma,sinal}]. Espelha vendas_pendentes.pagamentos.';
