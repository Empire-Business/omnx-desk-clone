-- Endereço estruturado no formulário público de vendas.
-- Substitui (sem remover) o campo único cliente_endereco por campos separados,
-- necessários para a geração do contrato e para alimentar a vendas_fechamento do GHL.
-- Aditivo e idempotente — cliente_endereco é mantido por retrocompatibilidade.

ALTER TABLE public.vendas_pendentes
  ADD COLUMN IF NOT EXISTS cliente_logradouro  TEXT,
  ADD COLUMN IF NOT EXISTS cliente_numero      TEXT,
  ADD COLUMN IF NOT EXISTS cliente_complemento TEXT,
  ADD COLUMN IF NOT EXISTS cliente_bairro      TEXT,
  ADD COLUMN IF NOT EXISTS cliente_municipio   TEXT,
  ADD COLUMN IF NOT EXISTS cliente_uf          TEXT,
  ADD COLUMN IF NOT EXISTS cliente_cep         TEXT;
