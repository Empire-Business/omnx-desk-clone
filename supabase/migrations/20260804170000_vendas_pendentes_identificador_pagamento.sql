-- Identificador de pagamento: o nome do titular como ele aparece no extrato bancário.
-- Lido do comprovante por OCR no próprio navegador (tesseract.js) e sempre corrigível
-- à mão no onboarding — o OCR é um palpite, quem manda é o time de atendimento.
alter table public.vendas_pendentes
  add column if not exists identificador_pagamento text;

comment on column public.vendas_pendentes.identificador_pagamento is
  'Nome do titular como aparece no extrato bancário. Preenchido por OCR do comprovante e editável no onboarding.';
