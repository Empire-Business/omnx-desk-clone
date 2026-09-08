-- Adiciona campos específicos de consultoria de marca na tabela chat_weekly_reports
-- Cada linha continua representando 1 análise por estrategista x cliente
-- Com cron diário, semana_inicio passa a ser a data de execução (snapshot diário dos últimos 7 dias)

alter table public.chat_weekly_reports
  add column if not exists clareza_posicionamento text
    check (clareza_posicionamento in ('baixa', 'media', 'alta')),
  add column if not exists nivel_execucao text
    check (nivel_execucao in ('baixo', 'medio', 'alto')),
  add column if not exists nivel_confianca_cliente text
    check (nivel_confianca_cliente in ('baixo', 'medio', 'alto')),
  add column if not exists risco_abandono text
    check (risco_abandono in ('baixo', 'medio', 'alto')),
  add column if not exists qualidade_consultoria_estrategista smallint
    check (qualidade_consultoria_estrategista between 1 and 5),
  add column if not exists ia_score smallint
    check (ia_score between 0 and 100),
  add column if not exists temas_tratados text[] default '{}'::text[],
  add column if not exists direcionamentos_dados text[] default '{}'::text[],
  add column if not exists entregaveis_pendentes text[] default '{}'::text[],
  add column if not exists bloqueios text[] default '{}'::text[];

comment on column public.chat_weekly_reports.clareza_posicionamento is 'Clareza do cliente sobre seu posicionamento de marca: baixa/media/alta';
comment on column public.chat_weekly_reports.nivel_execucao is 'Nivel de execucao do cliente sobre as orientacoes recebidas: baixo/medio/alto';
comment on column public.chat_weekly_reports.nivel_confianca_cliente is 'Confianca do cliente nas orientacoes do estrategista: baixo/medio/alto';
comment on column public.chat_weekly_reports.risco_abandono is 'Risco de o cliente abandonar a consultoria: baixo/medio/alto';
comment on column public.chat_weekly_reports.qualidade_consultoria_estrategista is 'Qualidade do trabalho do estrategista (1-5)';
comment on column public.chat_weekly_reports.ia_score is 'Score 0-100 atribuido pela IA baseado na leitura qualitativa da conversa';
comment on column public.chat_weekly_reports.temas_tratados is 'Temas de marca debatidos: posicionamento, conteudo, identidade visual, tom de voz, autoridade, etc.';
comment on column public.chat_weekly_reports.direcionamentos_dados is 'Orientacoes concretas que o estrategista deu ao cliente';
comment on column public.chat_weekly_reports.entregaveis_pendentes is 'O que ficou pendente do cliente ou do estrategista';
comment on column public.chat_weekly_reports.bloqueios is 'O que esta travando: inseguranca, indecisao, falta de tempo, conflito interno, etc.';
