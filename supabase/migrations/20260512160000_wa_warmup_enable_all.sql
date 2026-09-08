-- Liga IA e marca todos os 5 chips como participantes do grupo "Teste"

update public.wa_warmup_groups
   set instance_ids = array['Suporte1','Cami','empire3','Suporte4','Financeiro1'],
       usar_ia = true,
       personalidades = jsonb_build_object(
         'Suporte1',    'Vascaíno veterano, fala com calma e relembra histórias antigas do Vasco da Gama',
         'Cami',        'Vascaíno apaixonado pelo Vasco da Gama, fala muito de futebol e usa emojis ocasionalmente',
         'empire3',     'Vascaíno brincalhão e fanático pelo Vasco, faz piadas sobre o time, usa "kkkk" e linguagem bem informal',
         'Suporte4',    'Vascaíno analítico, comenta jogadas, escalações e estratégia do Vasco da Gama',
         'Financeiro1', 'Vascaíno otimista, sempre confiante numa vitória do Vasco e empolgado com o futuro do clube'
       )
 where nome = 'Teste';
