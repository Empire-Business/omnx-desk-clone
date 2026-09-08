-- Adiciona peso (probabilidade) por chip no aquecimento.
-- Suporte 1 e Suporte 4 ficam dominantes (pesos 4), demais ficam menores (1).

alter table public.wa_warmup_groups
  add column if not exists pesos jsonb not null default '{}'::jsonb;

update public.wa_warmup_groups
   set pesos = jsonb_build_object(
         'Suporte1',    4,
         'Cami',        1,
         'empire3',     1,
         'Suporte4',    4,
         'Financeiro1', 1
       ),
       intervalo_min_seg = 120,  -- 2 min
       intervalo_max_seg = 300,  -- 5 min
       proxima_mensagem_em = null
 where nome = 'Teste';
