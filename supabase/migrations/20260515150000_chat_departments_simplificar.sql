-- Simplifica os departamentos de chat conforme o fluxo real:
-- Atendimento atribui apenas para Suporte, Financeiro ou Estrategista.
-- Conversa atribuída ao dept "Estrategista" cai no gerente, que redistribui
-- para um estrategista específico via "Atribuir a estrategista".

-- Desativa departamentos legados que estavam aparecendo como pílulas
UPDATE public.chat_departments
   SET ativo = false
 WHERE nome IN ('Aquisição', 'Entregas', 'Operação');

-- Garante que Financeiro continua ativo
UPDATE public.chat_departments
   SET ativo = true
 WHERE nome = 'Financeiro';

-- Cria/reativa "Suporte"
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_departments WHERE nome = 'Suporte') THEN
    UPDATE public.chat_departments SET ativo = true WHERE nome = 'Suporte';
  ELSE
    INSERT INTO public.chat_departments (nome, ativo) VALUES ('Suporte', true);
  END IF;
END $$;

-- Cria/reativa "Estrategista"
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_departments WHERE nome = 'Estrategista') THEN
    UPDATE public.chat_departments SET ativo = true WHERE nome = 'Estrategista';
  ELSE
    INSERT INTO public.chat_departments (nome, ativo) VALUES ('Estrategista', true);
  END IF;
END $$;
