-- Campos adicionais do cliente no formulário público de vendas
ALTER TABLE public.vendas_pendentes
  ADD COLUMN IF NOT EXISTS cliente_razao_social TEXT,
  ADD COLUMN IF NOT EXISTS cliente_instagram    TEXT,
  ADD COLUMN IF NOT EXISTS cliente_endereco     TEXT;
