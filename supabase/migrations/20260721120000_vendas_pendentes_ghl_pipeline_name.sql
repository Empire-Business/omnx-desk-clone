-- Registra o pipeline do GHL no momento do vínculo da venda, para indicá-lo na lista de onboarding.
alter table public.vendas_pendentes
  add column if not exists ghl_pipeline_name text;

comment on column public.vendas_pendentes.ghl_pipeline_name is
  'Nome do pipeline da oportunidade do GHL registrado no momento do vinculo. Usado para indicar o pipeline na lista de onboarding.';
