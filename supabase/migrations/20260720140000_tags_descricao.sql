-- Descrição opcional para tags (explica o que a tag significa).
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS descricao TEXT;
