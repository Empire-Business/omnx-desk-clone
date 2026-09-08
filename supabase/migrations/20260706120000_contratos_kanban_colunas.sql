-- Fase 1 do kanban configurável de Contratos.
--
-- Hoje as colunas do kanban são hardcoded no front (ContratosKanbanPage.tsx).
-- Esta migration cria uma tabela para que o ADMIN possa adicionar / editar /
-- reordenar / excluir colunas. Cada coluna representa um valor de
-- `contratos.status_secundario`; mover um cartão entre colunas passa a gravar
-- esse valor no contrato (feito no front).
--
-- RLS: leitura para quem pode gerir contratos; escrita só para admin.

BEGIN;

-- Helper: usuário é admin? (espelha o padrão de public.pode_gerir_contratos())
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND perfil = 'admin'
  );
$$;

-- Tabela de colunas configuráveis
CREATE TABLE IF NOT EXISTS public.contratos_kanban_colunas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,
  status_chave  TEXT NOT NULL,                              -- valor gravado em contratos.status_secundario
  cor           TEXT NOT NULL DEFAULT 'bg-muted-foreground',-- classe Tailwind do "dot" da coluna
  ordem         INT  NOT NULL DEFAULT 0,
  is_onboarding BOOLEAN NOT NULL DEFAULT false,             -- reservado p/ Fase 2 (coluna de leads do formulário)
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada status_secundario aparece em no máximo uma coluna
CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_colunas_status_chave
  ON public.contratos_kanban_colunas (upper(status_chave));

CREATE INDEX IF NOT EXISTS idx_kanban_colunas_ordem
  ON public.contratos_kanban_colunas (ordem);

ALTER TABLE public.contratos_kanban_colunas ENABLE ROW LEVEL SECURITY;

-- Leitura: quem pode gerir contratos vê as colunas
DROP POLICY IF EXISTS "kanban_colunas_read" ON public.contratos_kanban_colunas;
CREATE POLICY "kanban_colunas_read" ON public.contratos_kanban_colunas
  FOR SELECT TO authenticated
  USING (public.pode_gerir_contratos());

-- Escrita (add/editar/reordenar/excluir): só admin
DROP POLICY IF EXISTS "kanban_colunas_admin_write" ON public.contratos_kanban_colunas;
CREATE POLICY "kanban_colunas_admin_write" ON public.contratos_kanban_colunas
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed com as colunas atuais — só se a tabela estiver vazia
INSERT INTO public.contratos_kanban_colunas (titulo, status_chave, cor, ordem)
SELECT v.titulo, v.status_chave, v.cor, v.ordem
FROM (VALUES
  ('Ativo',               'ATIVO',                  'bg-success',          1),
  ('Acompanhamento',      'ACOMPANHAMENTO',         'bg-info',             2),
  ('Renovação',           'FASE DE RENOVAÇÃO',      'bg-warning',          3),
  ('Pausado',             'PAUSADO',                'bg-orange-500',       4),
  ('Inadimplente',        'INADIMPLENTE',           'bg-danger',           5),
  ('Trocou estrategista', 'TROCOU DE ESTRATEGISTA', 'bg-purple-500',       6),
  ('Cancelado',           'CANCELADO',              'bg-muted-foreground', 7),
  ('Concluído',           'CONCLUÍDO',              'bg-emerald-500',      8)
) AS v(titulo, status_chave, cor, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.contratos_kanban_colunas);

COMMIT;
