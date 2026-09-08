-- Consolida o status de contratos num conjunto interno único:
--   Não iniciado · Ativo · Pausado · Inadimplente · Cancelado · Concluído
-- Remove os status herdados do Notion que saíram (Acompanhamento, Fase de
-- renovação, Trocou de estrategista, Bonificação) e os vazios → todos viram
-- "Ativo" (todos já eram internamente status='ativo').

-- 1) Remapeia os status que saíram para ATIVO
UPDATE public.contratos
SET status_secundario = 'ATIVO', atualizado_em = now()
WHERE status = 'ativo'
  AND (
    status_secundario IS NULL
    OR btrim(status_secundario) = ''
    OR upper(status_secundario) IN ('ACOMPANHAMENTO', 'FASE DE RENOVAÇÃO', 'TROCOU DE ESTRATEGISTA', 'BONIFICAÇÃO')
  );

-- 2) Kanban: remove as colunas dos status que saíram
DELETE FROM public.contratos_kanban_colunas
WHERE upper(status_chave) IN ('ACOMPANHAMENTO', 'FASE DE RENOVAÇÃO', 'TROCOU DE ESTRATEGISTA');

-- 3) Kanban: renomeia / reordena / recolore as colunas restantes (conjunto interno)
UPDATE public.contratos_kanban_colunas SET titulo = 'Onboarding',   ordem = 0                                  WHERE upper(status_chave) = 'NÃO INICIADO';
UPDATE public.contratos_kanban_colunas SET titulo = 'Ativo',        ordem = 1, cor = 'bg-success'              WHERE upper(status_chave) = 'ATIVO';
UPDATE public.contratos_kanban_colunas SET titulo = 'Pausado',      ordem = 2, cor = 'bg-orange-500'           WHERE upper(status_chave) = 'PAUSADO';
UPDATE public.contratos_kanban_colunas SET titulo = 'Inadimplente', ordem = 3, cor = 'bg-danger'               WHERE upper(status_chave) = 'INADIMPLENTE';
UPDATE public.contratos_kanban_colunas SET titulo = 'Cancelado',    ordem = 4, cor = 'bg-muted-foreground'     WHERE upper(status_chave) = 'CANCELADO';
UPDATE public.contratos_kanban_colunas SET titulo = 'Concluído',    ordem = 5, cor = 'bg-emerald-500'          WHERE upper(status_chave) = 'CONCLUÍDO';
