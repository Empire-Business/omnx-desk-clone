-- Vínculo da venda com o lead/oportunidade do CRM (GHL) e status de sincronização.
-- Preenchido quando o atendimento valida a venda e ela é enviada para a vendas_fechamento do GHL.

ALTER TABLE public.vendas_pendentes
  ADD COLUMN IF NOT EXISTS ghl_oportunidade_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_contato_id      TEXT,
  ADD COLUMN IF NOT EXISTS ghl_venda_id        TEXT,
  ADD COLUMN IF NOT EXISTS sincronizado_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sincronizacao_erro  TEXT;

COMMENT ON COLUMN public.vendas_pendentes.ghl_oportunidade_id IS
  'Oportunidade do GHL escolhida no passo de vínculo. NULL = ainda não vinculada (fila de pendência).';
COMMENT ON COLUMN public.vendas_pendentes.sincronizado_em IS
  'Quando a venda foi gravada com sucesso na vendas_fechamento do GHL. NULL = não sincronizada.';

-- Índice para a fila de pendência de vínculo (vendas concluídas ainda sem oportunidade).
CREATE INDEX IF NOT EXISTS idx_vendas_pendentes_sem_vinculo
  ON public.vendas_pendentes (status)
  WHERE ghl_oportunidade_id IS NULL;
