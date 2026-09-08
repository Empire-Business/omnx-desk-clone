-- Aquecimento com IA: gera mensagens dinâmicas com personalidade por chip,
-- considerando o contexto das últimas mensagens trocadas no grupo.

alter table public.wa_warmup_groups
  add column if not exists usar_ia bool not null default false,
  add column if not exists tema text not null default 'EXCLUSIVAMENTE Clube de Regatas Vasco da Gama (futebol, história, jogadores, jogos, torcida, São Januário, Cruz de Malta) — não fale de outros times nem de outros assuntos',
  add column if not exists personalidades jsonb not null default '{}'::jsonb;

-- Força tema fixo no grupo "Teste"
update public.wa_warmup_groups
   set tema = 'EXCLUSIVAMENTE Clube de Regatas Vasco da Gama (futebol, história, jogadores, jogos, torcida, São Januário, Cruz de Malta) — não fale de outros times nem de outros assuntos'
 where nome = 'Teste';

-- Personalidades padrão (vascaínos com estilos diferentes)
update public.wa_warmup_groups
   set personalidades = jsonb_build_object(
         'Cami',     'Vascaíno apaixonado pelo Vasco da Gama, fala muito de futebol e usa emojis ocasionalmente',
         'empire3',  'Vascaíno brincalhão e fanático pelo Vasco, faz piadas sobre o time, usa "kkkk" e linguagem bem informal',
         'Suporte4', 'Vascaíno analítico, comenta jogadas, escalações e estratégia do Vasco da Gama'
       )
 where nome = 'Teste'
   and personalidades = '{}'::jsonb;
