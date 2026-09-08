-- Adiciona a instância "att1" — usada APENAS para aquecimento, nunca disponível
-- como instância de atendimento para usuários (ativo = false).

insert into public.whatsapp_instances (nome, instance_id, numero_whatsapp, ativo, status)
     values ('Aquecimento 1', 'att1', '5521971617924', false, 'conectado')
on conflict (instance_id) do update
        set numero_whatsapp = excluded.numero_whatsapp,
            ativo = false,
            status = 'conectado';

-- Adiciona att1 ao grupo de aquecimento "Teste" com personalidade pessimista
update public.wa_warmup_groups
   set instance_ids = (
         select array(select distinct unnest(instance_ids || array['att1']))
       ),
       personalidades = personalidades || jsonb_build_object(
         'att1',
         'Vascaíno pessimista crônico: sempre acha que o Vasco vai perder, reclama da diretoria, dos jogadores, das escalações e das arbitragens. Linguagem informal, com tom de quem já desistiu mas continua torcendo. Usa "ah" e "nada feito" frequentemente.'
       ),
       pesos = pesos || jsonb_build_object('att1', 2),
       proxima_mensagem_em = null
 where nome = 'Teste';
