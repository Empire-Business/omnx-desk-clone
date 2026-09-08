-- Reduz intervalo entre mensagens do aquecimento para 3-10 min
update public.wa_warmup_groups
   set intervalo_min_seg = 180,
       intervalo_max_seg = 600,
       proxima_mensagem_em = null
 where nome = 'Teste';
